import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const apiKey = process.env.BING_WEBMASTER_API_KEY;
const date = process.env.SEO_END_DATE || daysAgo(1);
const rawSites = process.env.BING_SITE_URLS || '';
const keywordCountry = process.env.BING_KEYWORD_COUNTRY || 'US';
const keywordLanguage = process.env.BING_KEYWORD_LANGUAGE || 'en-US';
const configuredKeywordSeeds = process.env.BING_KEYWORD_SEEDS || '';

if (!apiKey) {
  console.log('Bing collection skipped: BING_WEBMASTER_API_KEY is not configured.');
  process.exit(0);
}

const sites = [...new Set(rawSites.split(/[\n,;]/).map((site) => site.trim()).filter(Boolean))];
if (!sites.length) {
  console.error('Bing collection failed: BING_SITE_URLS is empty.');
  process.exit(1);
}

const endpoint = 'https://ssl.bing.com/webmaster/api.svc/json/';
const timeoutMs = 15_000;

function redact(value) {
  return String(value || '').replaceAll(apiKey, '[redacted]');
}

async function getApi(method, params = {}) {
  const url = new URL(`${endpoint}${method}`);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.ErrorCode || payload?.error) throw new Error('Bing API returned an error');
  return payload?.d ?? payload;
}

async function postApi(method, body = {}) {
  const url = new URL(`${endpoint}${method}`);
  url.searchParams.set('apikey', apiKey);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) return null;
  const payload = JSON.parse(text);
  if (payload?.ErrorCode || payload?.error) throw new Error('Bing API returned an error');
  return payload?.d ?? payload;
}

async function attempt(method, params = {}) {
  try {
    return { status: 'ok', rows: await getApi(method, params) };
  } catch (error) {
    return { status: 'error', error: redact(error?.message || error) };
  }
}

function safeSiteLabel(siteUrl) {
  try { return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return 'configured-site'; }
}

function sameSite(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.hostname.toLowerCase().replace(/^www\./, '') === right.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').replace(/\/$/, '');
  }
}

async function collectLinkCounts(siteUrl, maxPages = 10) {
  try {
    const links = [];
    let totalPages = 1;
    for (let page = 0; page < Math.min(totalPages, maxPages); page += 1) {
      const payload = await getApi('GetLinkCounts', { siteUrl, page });
      totalPages = Math.max(0, Number(payload?.TotalPages ?? 0));
      links.push(...(Array.isArray(payload?.Links) ? payload.Links : []));
      if (totalPages === 0) break;
    }
    return {
      status: 'ok',
      rows: links,
      totalPages,
      truncated: totalPages > maxPages
    };
  } catch (error) {
    return { status: 'error', rows: [], totalPages: 0, truncated: false, error: redact(error?.message || error) };
  }
}

async function collectUrlLinks(siteUrl, targetRows, maxTargets = 5, maxPagesPerTarget = 2) {
  try {
    const targets = [...targetRows]
      .sort((a, b) => Number(b?.Count || 0) - Number(a?.Count || 0))
      .slice(0, maxTargets);
    const details = [];

    for (const target of targets) {
      let totalPages = 1;
      for (let page = 0; page < Math.min(totalPages, maxPagesPerTarget); page += 1) {
        const payload = await getApi('GetUrlLinks', { siteUrl, link: target.Url, page });
        totalPages = Math.max(0, Number(payload?.TotalPages ?? 0));
        for (const row of Array.isArray(payload?.Details) ? payload.Details : []) {
          details.push({
            targetUrl: target.Url,
            targetInboundCount: Number(target.Count || 0),
            sourceUrl: row.Url || null,
            anchorText: row.AnchorText || ''
          });
        }
        if (totalPages === 0) break;
      }
    }

    return { status: 'ok', rows: details, targets: targets.map((row) => row.Url) };
  } catch (error) {
    return { status: 'error', rows: [], targets: [], error: redact(error?.message || error) };
  }
}

async function discoverSitemap(siteUrl) {
  let origin;
  try { origin = new URL(siteUrl); } catch { return null; }
  const hostname = origin.hostname.toLowerCase().replace(/^www\./, '');
  const candidates = hostname === 'blog.stripunion.com'
    ? ['/sitemap_index.xml', '/wp-sitemap.xml']
    : ['/sitemap.xml'];

  for (const pathname of candidates) {
    try {
      const url = new URL(pathname, origin);
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { Accept: 'application/xml,text/xml,*/*', 'User-Agent': 'StripUnion-Bing-Collector/2.0' },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) continue;
      const body = await response.text();
      if (/<(?:[\w.-]+:)?(?:sitemapindex|urlset)\b/i.test(body)) return url.toString();
    } catch {}
  }
  return null;
}

async function ensureFeed(siteUrl, verified, initialFeeds) {
  const sitemapUrl = await discoverSitemap(siteUrl);
  const feeds = Array.isArray(initialFeeds) ? initialFeeds : [];

  if (!sitemapUrl) {
    return { status: 'no_public_sitemap', sitemapUrl: null, submitted: false, feeds };
  }

  if (feeds.some((feed) => normalizeUrl(feed?.Url) === normalizeUrl(sitemapUrl))) {
    return { status: 'already_present', sitemapUrl, submitted: false, feeds };
  }

  if (!verified) {
    return { status: 'skipped_unverified', sitemapUrl, submitted: false, feeds };
  }

  try {
    await postApi('SubmitFeed', { siteUrl, feedUrl: sitemapUrl });
    const refreshed = await getApi('GetFeeds', { siteUrl });
    return {
      status: 'submitted',
      sitemapUrl,
      submitted: true,
      feeds: Array.isArray(refreshed) ? refreshed : []
    };
  } catch (error) {
    return {
      status: 'error',
      sitemapUrl,
      submitted: false,
      feeds,
      error: redact(error?.message || error)
    };
  }
}

function normalizeKeyword(value) {
  return String(value || '')
    .replace(/#[rn]#/gi, ' ')
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordKey(value) {
  return normalizeKeyword(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function topObservedSeeds(siteResults, limit = 5) {
  const map = new Map();
  for (const site of siteResults) {
    for (const row of site.queryStats || []) {
      const query = normalizeKeyword(row.Query);
      const key = keywordKey(query);
      if (!key || /\bcontext\s*:|\bquestion\s*:|do not include|not for language|location\s*:/i.test(query)) continue;
      const current = map.get(key) || { query, impressions: 0 };
      current.impressions += Number(row.Impressions || 0);
      if (query.length < current.query.length) current.query = query;
      map.set(key, current);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
    .slice(0, limit)
    .map((row) => row.query);
}

async function collectKeywordResearch(siteResults) {
  const configured = configuredKeywordSeeds.split(/[\n;]/).map(normalizeKeyword).filter(Boolean);
  const observed = topObservedSeeds(siteResults, 5);
  const strategicFallback = [
    'live cam sites',
    'chaturbate alternatives',
    'adult affiliate program',
    'adult games',
    'vr adult content'
  ];

  const seen = new Set();
  const seeds = [];
  for (const seed of [...configured, ...observed, ...strategicFallback]) {
    const key = keywordKey(seed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    seeds.push(seed);
    if (seeds.length >= 8) break;
  }

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const startDate = start.toISOString();
  const endDate = end.toISOString();
  const bySeed = [];

  for (const seed of seeds) {
    const stats = await attempt('GetKeywordStats', { q: seed, country: keywordCountry, language: keywordLanguage });
    const related = await attempt('GetRelatedKeywords', {
      q: seed,
      country: keywordCountry,
      language: keywordLanguage,
      startDate,
      endDate
    });
    bySeed.push({
      seed,
      stats: stats.rows || [],
      related: Array.isArray(related.rows) ? related.rows.slice(0, 50) : [],
      methodStatus: {
        GetKeywordStats: stats.status,
        GetRelatedKeywords: related.status
      },
      errors: Object.fromEntries([
        ['GetKeywordStats', stats],
        ['GetRelatedKeywords', related]
      ].filter(([, result]) => result.status === 'error').map(([name, result]) => [name, result.error]))
    });
  }

  return {
    country: keywordCountry,
    language: keywordLanguage,
    period: { startDate, endDate },
    seeds,
    bySeed
  };
}

let userSites = [];
let userSitesStatus = 'ok';
let userSitesError = null;
try {
  const payload = await getApi('GetUserSites');
  userSites = Array.isArray(payload) ? payload : [];
} catch (error) {
  userSitesStatus = 'error';
  userSitesError = redact(error?.message || error);
}

const results = [];
for (const siteUrl of sites) {
  const siteVerification = userSites.find((row) => sameSite(row?.Url, siteUrl));
  const verified = siteVerification?.IsVerified === true;

  const [queries, pages, crawlStats, crawlIssues, feeds, linkCounts] = await Promise.all([
    attempt('GetQueryStats', { siteUrl }),
    attempt('GetPageStats', { siteUrl }),
    attempt('GetCrawlStats', { siteUrl }),
    attempt('GetCrawlIssues', { siteUrl }),
    attempt('GetFeeds', { siteUrl }),
    collectLinkCounts(siteUrl)
  ]);

  const linkDetails = await collectUrlLinks(siteUrl, linkCounts.rows || []);
  const feedState = await ensureFeed(siteUrl, verified, feeds.rows || []);

  results.push({
    site: safeSiteLabel(siteUrl),
    siteUrl,
    verified,
    queryStats: queries.rows || [],
    pageStats: pages.rows || [],
    crawlStats: crawlStats.rows || [],
    crawlIssues: crawlIssues.rows || [],
    feeds: feedState.feeds || [],
    feedState: {
      status: feedState.status,
      sitemapUrl: feedState.sitemapUrl,
      submitted: feedState.submitted,
      error: feedState.error || null
    },
    backlinkPages: linkCounts.rows || [],
    backlinkDetails: linkDetails.rows || [],
    backlinkMeta: {
      totalPages: linkCounts.totalPages ?? 0,
      truncated: linkCounts.truncated === true,
      inspectedTargets: linkDetails.targets || []
    },
    indexedPages: (crawlStats.rows || []).map((row) => ({ date: row.Date, indexed: row.InIndex })),
    methodStatus: {
      GetQueryStats: queries.status,
      GetPageStats: pages.status,
      GetCrawlStats: crawlStats.status,
      GetCrawlIssues: crawlIssues.status,
      GetFeeds: feeds.status,
      GetLinkCounts: linkCounts.status,
      GetUrlLinks: linkDetails.status
    },
    errors: Object.fromEntries([
      ['GetQueryStats', queries],
      ['GetPageStats', pages],
      ['GetCrawlStats', crawlStats],
      ['GetCrawlIssues', crawlIssues],
      ['GetFeeds', feeds],
      ['GetLinkCounts', linkCounts],
      ['GetUrlLinks', linkDetails]
    ].filter(([, result]) => result.status === 'error').map(([name, result]) => [name, result.error]))
  });
}

const keywordResearch = await collectKeywordResearch(results);

const coreMethods = ['GetQueryStats', 'GetPageStats', 'GetCrawlStats', 'GetCrawlIssues'];
const allFailed = results.every((site) => coreMethods.every((method) => site.methodStatus[method] === 'error'));

await writeSnapshot('bing', date, {
  source: 'bing-webmaster-json-http',
  collectedAt: new Date().toISOString(),
  cadence: 'Daily collector; Bing query/page stats update weekly and crawl stats daily.',
  account: {
    GetUserSites: userSitesStatus,
    error: userSitesError,
    sites: userSites.map((row) => ({
      site: safeSiteLabel(row?.Url),
      url: row?.Url || null,
      verified: row?.IsVerified === true
    }))
  },
  sites: results,
  keywordResearch
});

if (allFailed) {
  console.error('Bing collection failed for every configured site.');
  process.exitCode = 1;
} else {
  for (const site of results) {
    const statuses = Object.values(site.methodStatus);
    console.log(
      `Bing ${site.site}: verified=${site.verified}; ${statuses.filter((status) => status === 'ok').length}/${statuses.length} site methods succeeded; backlinks=${site.backlinkDetails.length}; feed=${site.feedState.status}.`
    );
  }
  const keywordOk = keywordResearch.bySeed.filter((row) => Object.values(row.methodStatus).some((status) => status === 'ok')).length;
  console.log(`Bing keyword research: ${keywordOk}/${keywordResearch.bySeed.length} seeds returned at least one successful method.`);
}
