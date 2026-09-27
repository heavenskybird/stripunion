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
  return robots.split(/\r?\n/).some((line) => /^\s*allow\s*:/i.test(line));
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
  for (const path of paths) documents.set(path, await getStagingText(new URL(path, origin), host));

  const homepage = documents.get('/');
  verify(/\bStripUnion\b/i.test(homepage), 'homepage identifies StripUnion', failures);
  verify(hasNoIndexNoFollow(homepage), 'homepage declares noindex,nofollow', failures);
  verify(canonicalUrl(homepage) === `${PRODUCTION_ORIGIN}/`, 'homepage canonical points to production', failures);
  verify(!hasStagingUrlReference(homepage), 'homepage contains no absolute staging hostname URL', failures);
  verify(!hasPermissiveRobots(homepage), 'homepage has no permissive robots declaration', failures);

  const robots = documents.get('/robots.txt');
  verify(/^\s*User-agent:\s*\*/im.test(robots), 'robots.txt contains User-agent: *', failures);
  verify(/^\s*Disallow:\s*\/\s*$/im.test(robots), 'robots.txt disallows the staging site', failures);
  verify(!hasPermissiveCrawlRule(robots), 'robots.txt has no permissive Allow rule', failures);

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
  console.log(`Staging smoke check passed for ${host}; ${paths.length} GET endpoints verified.`);
}

function selfTest() {
  assert.equal(hasNoIndexNoFollow('<meta content="noindex, nofollow" name="robots">'), true);
  assert.equal(hasNoIndexNoFollow('<meta name="robots" content="index,follow">'), false);
  assert.equal(hasPermissiveRobots('<meta content="index,follow" name="robots">'), true);
  assert.equal(hasPermissiveRobots('<meta name="robots" content="noindex,nofollow">'), false);
  assert.equal(canonicalUrl('<link href="https://stripunion.com/a" rel="canonical">'), 'https://stripunion.com/a');
  assert.equal(hasStagingUrlReference('<script>endsWith(\'.hostingersite.com\')</script>'), false);
  assert.equal(hasStagingUrlReference('<a href=\"https://yellowgreen-duck-244197.hostingersite.com/path\">'), true);
  assert.equal(hasPermissiveCrawlRule('User-agent: *\\nDisallow: /\\n'), false);
  assert.equal(hasPermissiveCrawlRule('User-agent: *\\nDisallow: /\\nAllow: /\\n'), true);
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
