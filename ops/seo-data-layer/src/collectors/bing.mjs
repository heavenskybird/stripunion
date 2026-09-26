import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const apiKey = process.env.BING_WEBMASTER_API_KEY;
const date = process.env.SEO_END_DATE || daysAgo(1);
const rawSites = process.env.BING_SITE_URLS || '';

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

async function call(method, siteUrl, extra = {}) {
  const url = new URL(`${endpoint}${method}`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('siteUrl', siteUrl);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (payload?.ErrorCode || payload?.error) throw new Error('Bing API returned an error');
  return payload?.d ?? payload;
}

async function attempt(method, siteUrl, extra) {
  try {
    return { status: 'ok', rows: await call(method, siteUrl, extra) };
  } catch (error) {
    return { status: 'error', error: String(error.message).replaceAll(apiKey, '[redacted]') };
  }
}

function safeSiteLabel(siteUrl) {
  try { return new URL(siteUrl).hostname; } catch { return 'configured-site'; }
}

const results = await Promise.all(sites.map(async (siteUrl) => {
  const [queries, pages, crawlStats, crawlIssues] = await Promise.all([
    attempt('GetQueryStats', siteUrl),
    attempt('GetPageStats', siteUrl),
    attempt('GetCrawlStats', siteUrl),
    attempt('GetCrawlIssues', siteUrl)
  ]);
  return {
    site: safeSiteLabel(siteUrl),
    queryStats: queries.rows || [],
    pageStats: pages.rows || [],
    crawlStats: crawlStats.rows || [],
    crawlIssues: crawlIssues.rows || [],
    indexedPages: (crawlStats.rows || []).map((row) => ({ date: row.Date, indexed: row.InIndex })),
    methodStatus: {
      GetQueryStats: queries.status,
      GetPageStats: pages.status,
      GetCrawlStats: crawlStats.status,
      GetCrawlIssues: crawlIssues.status
    },
    errors: Object.fromEntries([
      ['GetQueryStats', queries], ['GetPageStats', pages], ['GetCrawlStats', crawlStats], ['GetCrawlIssues', crawlIssues]
    ].filter(([, result]) => result.status === 'error').map(([name, result]) => [name, result.error]))
  };
}));

const allFailed = results.every((site) => Object.values(site.methodStatus).every((status) => status === 'error'));
await writeSnapshot('bing', date, {
  source: 'bing-webmaster-json-http',
  collectedAt: new Date().toISOString(),
  cadence: 'Daily collector; Bing query/page stats update weekly and crawl stats daily.',
  sites: results
});
if (allFailed) {
  console.error('Bing collection failed for every configured site.');
  process.exitCode = 1;
} else {
for (const site of results) console.log(`Bing ${site.site}: ${Object.values(site.methodStatus).filter((status) => status === 'ok').length}/4 methods succeeded.`);
}
