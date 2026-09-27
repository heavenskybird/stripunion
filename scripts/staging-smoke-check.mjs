import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PRODUCTION_ORIGIN = 'https://stripunion.com';
const REQUIRED_ROUTES = [
  '/stripchat',
  '/stripchat-pricing',
  '/stripchat-vs-chaturbate',
  '/best-live-cam-sites',
];
const GUARD_MARKERS = ['.hostingersite.com', 'su_staging_test', 'stripunion_staging'];
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ROBOTS_DIAGNOSTIC_MAX_CHARS = 2_000;
const ROBOTS_CACHE_HEADERS = [
  'content-type', 'cache-control', 'age', 'etag', 'last-modified', 'x-hcdn-request-id',
  'x-cache', 'cf-cache-status', 'via', 'vary', 'server-timing', 'x-served-by', 'x-cache-hits',
];

export function parseAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

export function hasNoIndexNoFollow(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some((match) => {
    const tag = match[0];
    const attributes = parseAttributes(tag);
    if (attributes.name?.toLowerCase() !== 'robots') return false;
    const directives = attributes.content?.toLowerCase().split(/[\s,]+/).filter(Boolean) ?? [];
    return directives.includes('noindex') && directives.includes('nofollow')
      && !directives.includes('index') && !directives.includes('follow');
  });
}

export function hasPermissiveRobots(html) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some((match) => {
    const attributes = parseAttributes(match[0]);
    if (attributes.name?.toLowerCase() !== 'robots') return false;
    const directives = attributes.content?.toLowerCase().split(/[\s,]+/).filter(Boolean) ?? [];
    return directives.includes('index') || directives.includes('follow');
  });
}

export function canonicalUrl(html) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const attributes = parseAttributes(tag);
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes('canonical') && attributes.href) return attributes.href;
  }
  return null;
}

export function hasStagingUrlReference(html) {
  return /https?:\/\/(?:[a-z0-9-]+\.)*hostingersite\.com\b/i.test(html);
}

export function hasPermissiveCrawlRule(robots) {
  return getWildcardRobotsRules(robots).some((rule) => rule.directive === 'allow');
}

export function hasExpectedStagingWildcardRules(robots) {
  const rules = getWildcardRobotsRules(robots);
  return rules.some((rule) => rule.directive === 'disallow' && rule.value === '/')
    && !rules.some((rule) => rule.directive === 'allow');
}

export function normalizeRobotsBody(robots) {
  return String(robots ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).join('\n').trim();
}

export function getWildcardRobotsRules(robots) {
  return getRobotsGroups(robots).filter((group) => group.agents.includes('*')).flatMap((group) => group.rules);
}

export function getRobotsGroups(robots) {
  const groups = [];
  let agents = [];
  let rules = [];
  let sawRule = false;
  const finish = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
    sawRule = false;
  };

  for (const sourceLine of normalizeRobotsBody(robots).split('\n')) {
    const line = sourceLine.split('#', 1)[0].trim();
    if (!line) continue;
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const directive = match[1].toLowerCase();
    if (directive === 'user-agent') {
      if (sawRule) finish();
      agents.push(match[2].trim().toLowerCase());
      continue;
    }
    if (agents.length) {
      sawRule = true;
      rules.push({ directive, value: match[2].trim() });
    }
  }
  finish();
  return groups;
}

export function validateStagingDomain(value) {
  const host = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.hostingersite\.com$/.test(host)) {
    throw new Error('HOSTINGER_STAGING_DOMAIN must be a hostname under hostingersite.com.');
  }
  return host;
}

async function readBoundedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let byteCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    if (byteCount > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error(`Response body exceeded ${MAX_BODY_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function getStagingText(url, host) {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (current.protocol !== 'https:' || current.hostname !== host || current.port) {
      throw new Error(`Unsafe staging URL or redirect rejected: ${url.pathname}`);
    }
    let response;
    try {
      response = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error(`Request timed out: ${url.pathname}`);
      throw new Error(`Request failed: ${url.pathname}`);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect had no location: ${url.pathname}`);
      let next;
      try { next = new URL(location, current); } catch { throw new Error(`Invalid redirect location: ${url.pathname}`); }
      if (next.protocol !== 'https:' || next.hostname !== host || next.port) throw new Error(`Unsafe staging redirect rejected: ${url.pathname}`);
      if (redirects === MAX_REDIRECTS) throw new Error(`Too many redirects: ${url.pathname}`);
      current = next;
      continue;
    }
    if (response.status !== 200) throw new Error(`Expected HTTP 200 for ${url.pathname}; received ${response.status}.`);
    return await readBoundedText(response);
  }
  throw new Error(`Too many redirects: ${url.pathname}`);
}

async function getRobotsDiagnostic(url, host, requestHeaders = {}) {
  let current = url;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (current.protocol !== 'https:' || current.hostname !== host || current.port) {
      throw new Error('Unsafe staging URL or redirect rejected: /robots.txt');
    }
    let response;
    try {
      response = await fetch(current, {
        method: 'GET', redirect: 'manual', headers: requestHeaders,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('Request timed out: /robots.txt');
      throw new Error('Request failed: /robots.txt');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Robots redirect had no location.');
      let next;
      try { next = new URL(location, current); } catch { throw new Error('Robots redirect location was invalid.'); }
      if (next.protocol !== 'https:' || next.hostname !== host || next.port) throw new Error('Unsafe staging redirect rejected: /robots.txt');
      if (redirects === MAX_REDIRECTS) throw new Error('Too many redirects: /robots.txt');
      current = next;
      continue;
    }
    const body = normalizeRobotsBody(await readBoundedText(response));
    const headers = Object.fromEntries(ROBOTS_CACHE_HEADERS.flatMap((name) => {
      const value = response.headers.get(name);
      return value === null ? [] : [[name, value.slice(0, 300)]];
    }));
    const diagnostic = {
      status: response.status,
      finalUrl: current.href,
      body: body.slice(0, ROBOTS_DIAGNOSTIC_MAX_CHARS),
      bodyTruncated: body.length > ROBOTS_DIAGNOSTIC_MAX_CHARS,
      headers,
    };
    console.log(`ROBOTS_DIAGNOSTIC ${JSON.stringify(diagnostic)}`);
    return { ...diagnostic, body };
  }
  throw new Error('Too many redirects: /robots.txt');
}

async function getDeployedRobotsFile(token, domain) {
  if (!token) {
    console.log('DEPLOYED_ROBOTS_FILE unavailable: HOSTINGER_API_TOKEN was not provided.');
    return null;
  }
  const apiOrigin = 'https://developers.hostinger.com';
  const apiPrefix = '/api/hosting/v1/';
  const request = async (path, query = {}) => {
    if (!path.startsWith(apiPrefix) || path.includes('..')) throw new Error('Refused a request outside the documented Hostinger hosting API.');
    const target = new URL(path, apiOrigin);
    for (const [key, value] of Object.entries(query)) target.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetch(target, {
        method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new Error('Hostinger file-content API request failed before a response was received.');
    }
    if (!response.ok) throw new Error(`Hostinger file-content API returned HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw new Error('Hostinger file-content API returned invalid JSON.'); }
  };
  try {
    const sites = [];
    for (let page = 1; page <= 30; page += 1) {
      const sitesResponse = await request(`${apiPrefix}websites`, { page, per_page: 100 });
      const batch = Array.isArray(sitesResponse?.data) ? sitesResponse.data
        : Array.isArray(sitesResponse?.data?.items) ? sitesResponse.data.items
          : Array.isArray(sitesResponse?.items) ? sitesResponse.items
            : Array.isArray(sitesResponse) ? sitesResponse : [];
      sites.push(...batch);
      const meta = sitesResponse?.meta ?? sitesResponse?.data?.meta ?? {};
      const lastPage = Number(meta.last_page ?? meta.lastPage ?? meta.total_pages ?? meta.totalPages ?? 0);
      if (batch.length < 100 || (lastPage && page >= lastPage)) break;
      if (page === 30) throw new Error('Hostinger website list exceeded the 30-page diagnostic bound.');
    }
    const website = sites.find((item) => String(item?.domain ?? '').toLowerCase() === domain.toLowerCase());
    if (!website?.username) throw new Error('Exact Hostinger website/account match did not expose a username.');
    const path = `${apiPrefix}accounts/${encodeURIComponent(website.username)}/domains/${encodeURIComponent(domain)}/files/content`;
    const payload = await request(path, { path: 'robots.txt', from_line: 0, max_lines: 100 });
    const content = payload?.data?.content ?? payload?.content;
    if (typeof content !== 'string') throw new Error('Hostinger file response did not expose textual content.');
    const normalized = normalizeRobotsBody(content);
    const diagnostic = {
      path: payload?.data?.path ?? payload?.path ?? 'robots.txt',
      body: normalized.slice(0, ROBOTS_DIAGNOSTIC_MAX_CHARS),
      bodyTruncated: normalized.length > ROBOTS_DIAGNOSTIC_MAX_CHARS,
    };
    console.log(`DEPLOYED_ROBOTS_FILE ${JSON.stringify(diagnostic)}`);
    return normalized;
  } catch (error) {
    console.log(`DEPLOYED_ROBOTS_FILE unavailable: ${error.message}`);
    return null;
  }
}

function verify(condition, label, failures) {
  if (condition) console.log(`PASS ${label}`);
  else { console.error(`FAIL ${label}`); failures.push(label); }
}

async function main() {
  const host = validateStagingDomain(process.env.HOSTINGER_STAGING_DOMAIN);
  const origin = new URL(`https://${host}`);
  const failures = [];
  const documents = new Map();
  const paths = ['/', '/robots.txt', ...REQUIRED_ROUTES, '/sitemap.xml'];
  for (const path of paths) {
    if (path !== '/robots.txt') documents.set(path, await getStagingText(new URL(path, origin), host));
  }

  const deployedRobots = await getDeployedRobotsFile(process.env.HOSTINGER_API_TOKEN, host);
  const normalRobots = await getRobotsDiagnostic(new URL('/robots.txt', origin), host);
  const cacheBustedUrl = new URL('/robots.txt', origin);
  cacheBustedUrl.searchParams.set('su_cache_probe', String(Date.now()));
  const cacheBustedRobots = await getRobotsDiagnostic(cacheBustedUrl, host);
  const noCacheRobots = await getRobotsDiagnostic(new URL('/robots.txt', origin), host, {
    'Cache-Control': 'no-cache', Pragma: 'no-cache',
  });
  documents.set('/robots.txt', normalRobots.body);
  console.log(`ROBOTS_COMPARISON ${JSON.stringify({
    deployedFileMatchesNormal: deployedRobots === null ? null : deployedRobots === normalRobots.body,
    normalMatchesCacheBusted: normalRobots.body === cacheBustedRobots.body,
    normalMatchesNoCache: normalRobots.body === noCacheRobots.body,
    staleCacheEvidence: deployedRobots !== null && hasExpectedStagingWildcardRules(deployedRobots)
      && hasPermissiveCrawlRule(normalRobots.body)
      && ([cacheBustedRobots, noCacheRobots].some((result) => result.status === 200 && hasExpectedStagingWildcardRules(result.body))),
  })}`);
  console.log(`ROBOTS_GROUPS ${JSON.stringify({
    normal: getRobotsGroups(normalRobots.body),
    cacheBusted: getRobotsGroups(cacheBustedRobots.body),
    noCache: getRobotsGroups(noCacheRobots.body),
  })}`);
  if ([normalRobots, cacheBustedRobots, noCacheRobots].some((result) => result.status !== 200)) {
    failures.push('robots.txt returned a non-200 status for one or more cache diagnostic requests');
  }

  const homepage = documents.get('/');
  verify(/\bStripUnion\b/i.test(homepage), 'homepage identifies StripUnion', failures);
  verify(hasNoIndexNoFollow(homepage), 'homepage declares noindex,nofollow', failures);
  verify(canonicalUrl(homepage) === `${PRODUCTION_ORIGIN}/`, 'homepage canonical points to production', failures);
  verify(!hasStagingUrlReference(homepage), 'homepage contains no absolute staging hostname URL', failures);
  verify(!hasPermissiveRobots(homepage), 'homepage has no permissive robots declaration', failures);

  const robots = documents.get('/robots.txt');
  const wildcardRules = getWildcardRobotsRules(robots);
  verify(/^\s*User-agent:\s*\*/im.test(robots), 'robots.txt contains User-agent: *', failures);
  verify(wildcardRules.some((rule) => rule.directive === 'disallow' && rule.value === '/'), 'robots.txt wildcard group disallows the staging site', failures);
  verify(!hasPermissiveCrawlRule(robots), 'robots.txt wildcard group has no permissive Allow rule', failures);

  for (const path of REQUIRED_ROUTES) {
    const html = documents.get(path);
    verify(hasNoIndexNoFollow(html), `${path} declares noindex,nofollow`, failures);
    verify(canonicalUrl(html) === `${PRODUCTION_ORIGIN}${path}`, `${path} canonical points to production`, failures);
    verify(!hasStagingUrlReference(html), `${path} contains no absolute staging hostname URL`, failures);
  }

  const sitemap = documents.get('/sitemap.xml');
  const sitemapLocs = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(([, loc]) => loc.trim());
  verify(sitemapLocs.length > 0, 'sitemap contains URLs', failures);
  verify(sitemapLocs.every((url) => url.startsWith(`${PRODUCTION_ORIGIN}/`)), 'sitemap URLs use production origin only', failures);
  verify(!hasStagingUrlReference(sitemap), 'sitemap contains no absolute staging hostname URL', failures);

  const deployedFiles = [...documents.values()];
  const scripts = [...deployedFiles.join('\n').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(([, script]) => script);
  const deployableText = [...deployedFiles, ...scripts];
  for (const marker of GUARD_MARKERS) verify(deployableText.some((body) => body.includes(marker)), `deployed output contains affiliate staging guard marker ${marker}`, failures);

  if (failures.length) throw new Error(`${failures.length} staging smoke assertion(s) failed.`);
  console.log(`Staging smoke check passed for ${host}; ${paths.length} site endpoints and three robots cache variants verified.`);
}

function selfTest() {
  assert.equal(hasNoIndexNoFollow('<meta content="noindex, nofollow" name="robots">'), true);
  assert.equal(hasNoIndexNoFollow('<meta name="robots" content="index,follow">'), false);
  assert.equal(hasPermissiveRobots('<meta content="index,follow" name="robots">'), true);
  assert.equal(hasPermissiveRobots('<meta name="robots" content="noindex,nofollow">'), false);
  assert.equal(canonicalUrl('<link href="https://stripunion.com/a" rel="canonical">'), 'https://stripunion.com/a');
  assert.equal(hasStagingUrlReference('<script>endsWith(\'.hostingersite.com\')</script>'), false);
  assert.equal(hasStagingUrlReference('<a href=\"https://yellowgreen-duck-244197.hostingersite.com/path\">'), true);
  assert.equal(hasPermissiveCrawlRule(`User-agent: *\nDisallow: /\n`), false);
  assert.equal(hasPermissiveCrawlRule(`User-agent: *\nDisallow: /\nAllow: /\n`), true);
  assert.equal(hasPermissiveCrawlRule(`User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n`), false);
  assert.equal(hasExpectedStagingWildcardRules(`User-agent: *\nDisallow: /\n`), true);
  assert.equal(hasExpectedStagingWildcardRules(`User-agent: *\nAllow: /\n`), false);
  assert.deepEqual(getRobotsGroups('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /'), [
    { agents: ['*'], rules: [{ directive: 'disallow', value: '/' }] },
    { agents: ['googlebot'], rules: [{ directive: 'allow', value: '/' }] },
  ]);
  assert.equal(normalizeRobotsBody('User-agent: *\r\nDisallow: /\r\n'), 'User-agent: *\nDisallow: /');
  assert.equal(validateStagingDomain('yellowgreen-duck-244197.hostingersite.com'), 'yellowgreen-duck-244197.hostingersite.com');
  assert.throws(() => validateStagingDomain('evil.example'), /hostingersite\.com/);
  console.log('Staging smoke checker self-test passed.');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main().catch((error) => {
      console.error(`Staging smoke check failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
