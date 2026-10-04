import fs from 'node:fs/promises';
import path from 'node:path';

const outputPath = process.argv[2] || 'ops/health/public-health-oracle.json';
const timeoutMs = 15_000;
const retryable = new Set([429, 500, 502, 503, 504, 520, 522, 524]);

const sites = [
  {
    id: 'main',
    origin: 'https://stripunion.com',
    requireCanonicalHost: true,
    requireIndexable: true,
    robotsRequired: true,
    sitemapCandidates: ['/sitemap.xml']
  },
  {
    id: 'blog',
    origin: 'https://blog.stripunion.com',
    requireCanonicalHost: true,
    requireIndexable: true,
    robotsRequired: true,
    sitemapCandidates: ['/sitemap_index.xml', '/wp-sitemap.xml']
  },
  {
    id: 'avcams',
    origin: 'https://avcams.online',
    requireCanonicalHost: false,
    requireIndexable: false,
    robotsRequired: false,
    sitemapCandidates: ['/sitemap.xml', '/sitemap_index.xml']
  }
];

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, accept = 'text/html,*/*') {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept,
          'user-agent': 'StripUnion-Public-Health-Oracle/1.0'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!retryable.has(response.status) || attempt === 5) {
        const body = await response.text();
        return {
          status: response.status,
          final_url: response.url,
          content_type: response.headers.get('content-type') || '',
          body
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt === 5) throw error;
    }
    await sleep(attempt * 1000);
  }
  throw lastError || new Error(`request failed: ${url}`);
}

function canonicalFrom(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*["'][^"']*canonical/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return href;
  }
  return null;
}

function hasNoindex(html) {
  return /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*\bcontent\s*=\s*["'][^"']*noindex/i.test(String(html));
}

function robotsBlocksAll(body) {
  const groups = String(body).split(/\r?\n\s*\r?\n/);
  const wildcard = groups.filter((group) => /^\s*User-agent:\s*\*/im.test(group)).join('\n');
  return /^\s*Disallow:\s*\/\s*$/im.test(wildcard);
}

function validSitemap(body) {
  return /<(?:[\w.-]+:)?(?:sitemapindex|urlset)\b/i.test(String(body));
}

async function checkSite(site) {
  const result = {
    id: site.id,
    origin: site.origin,
    checked_at: new Date().toISOString(),
    required_failures: [],
    warnings: []
  };

  try {
    const home = await request(site.origin + '/');
    result.home = {
      status: home.status,
      final_url: home.final_url,
      canonical: canonicalFrom(home.body),
      noindex: hasNoindex(home.body)
    };

    if (home.status < 200 || home.status >= 400) result.required_failures.push(`homepage_http_${home.status}`);
    if (new URL(home.final_url).hostname !== new URL(site.origin).hostname) result.required_failures.push('unexpected_home_redirect_host');

    if (result.home.canonical) {
      try {
        const canonicalHost = new URL(result.home.canonical, site.origin).hostname;
        if (site.requireCanonicalHost && canonicalHost !== new URL(site.origin).hostname) {
          result.required_failures.push('canonical_host_mismatch');
        }
      } catch {
        result.required_failures.push('invalid_canonical');
      }
    } else if (site.requireCanonicalHost) {
      result.required_failures.push('missing_canonical');
    } else {
      result.warnings.push('canonical_not_observed');
    }

    if (result.home.noindex && site.requireIndexable) result.required_failures.push('homepage_noindex');
    if (result.home.noindex && !site.requireIndexable) result.warnings.push('homepage_noindex_observed');
  } catch (error) {
    result.required_failures.push('homepage_fetch_failed');
    result.home_error = error instanceof Error ? error.message : String(error);
  }

  try {
    const robots = await request(site.origin + '/robots.txt', 'text/plain,*/*');
    result.robots = { status: robots.status, blocks_all: robotsBlocksAll(robots.body) };
    if (site.robotsRequired && robots.status !== 200) result.required_failures.push(`robots_http_${robots.status}`);
    if (site.robotsRequired && result.robots.blocks_all) result.required_failures.push('robots_blocks_all');
    if (!site.robotsRequired && robots.status !== 200) result.warnings.push(`robots_http_${robots.status}`);
  } catch (error) {
    if (site.robotsRequired) result.required_failures.push('robots_fetch_failed');
    else result.warnings.push('robots_fetch_failed');
    result.robots_error = error instanceof Error ? error.message : String(error);
  }

  let sitemapOk = false;
  const sitemapObservations = [];
  for (const candidate of site.sitemapCandidates) {
    try {
      const response = await request(site.origin + candidate, 'application/xml,text/xml,*/*');
      const observation = { path: candidate, status: response.status, valid_xml_root: validSitemap(response.body) };
      sitemapObservations.push(observation);
      if (response.status === 200 && observation.valid_xml_root) {
        sitemapOk = true;
        break;
      }
    } catch (error) {
      sitemapObservations.push({ path: candidate, error: error instanceof Error ? error.message : String(error) });
    }
  }
  result.sitemaps = sitemapObservations;
  if (!sitemapOk && site.id !== 'avcams') result.required_failures.push('sitemap_unavailable');
  if (!sitemapOk && site.id === 'avcams') result.warnings.push('sitemap_not_observed');

  result.ok = result.required_failures.length === 0;
  return result;
}

const report = {
  version: 1,
  generated_at: new Date().toISOString(),
  source: 'github-actions-public-network',
  note: 'This report is the public production-health oracle when chat-level web fetch is unavailable.',
  sites: []
};

for (const site of sites) {
  report.sites.push(await checkSite(site));
}

report.ok = report.sites.every((site) => site.ok);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

for (const site of report.sites) {
  console.log(`${site.ok ? 'PASS' : 'FAIL'} ${site.id} failures=${site.required_failures.join(',') || 'none'} warnings=${site.warnings.join(',') || 'none'}`);
}
console.log(`PUBLIC_HEALTH_ORACLE ${report.ok ? 'PASS' : 'FAIL'} output=${outputPath}`);

if (!report.ok) process.exitCode = 1;
