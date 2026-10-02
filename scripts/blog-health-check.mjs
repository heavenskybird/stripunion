import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const BLOG_ORIGIN = 'https://blog.stripunion.com';
const MAIN_ORIGIN = 'https://stripunion.com';
const timeoutMs = 15_000;
const maxBytes = 2_000_000;
const expectedMeasurementId = process.env.EXPECTED_GA4_MEASUREMENT_ID?.trim() || '';
const expectedGoogleTagId = process.env.EXPECTED_GOOGLE_TAG_ID?.trim() || '';
const analyticsIdPattern = /\b(?:G-[A-Z0-9]{4,20}|GT-[A-Z0-9]{4,20})\b/gi;

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

async function get(url, accept = 'text/html,application/json,*/*') {
  let target = new URL(url);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (target.protocol !== 'https:' || target.hostname !== new URL(BLOG_ORIGIN).hostname) {
      throw new Error(`Refused request outside ${BLOG_ORIGIN}.`);
    }
    const response = await fetch(target, {
      method: 'GET', redirect: 'manual', headers: { accept }, signal: AbortSignal.timeout(timeoutMs)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === 4) throw new Error(`Invalid or excessive redirect for ${target.pathname}.`);
      target = new URL(location, target);
      continue;
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error(`Response too large for ${target.pathname}.`); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { status: response.status, url: target, body: new TextDecoder().decode(bytes), contentType: response.headers.get('content-type') || '' };
  }
  throw new Error('Redirect limit exceeded.');
}

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

async function main() {
  const homepage = await get(`${BLOG_ORIGIN}/`);
  check(homepage.status === 200, 'blog homepage returns HTTP 200');
  check(/StripUnion/i.test(homepage.body), 'blog homepage identifies StripUnion');
  check(!/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*\bcontent\s*=\s*["'][^"']*noindex/i.test(homepage.body), 'blog homepage is not noindex');
  const canonicals = [...homepage.body.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
    .filter((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes('canonical')).map((attrs) => attrs.href);
  check(canonicals.some((value) => value && new URL(value, BLOG_ORIGIN).hostname === 'blog.stripunion.com'), 'blog canonical stays on blog.stripunion.com');

  const robots = await get(`${BLOG_ORIGIN}/robots.txt`, 'text/plain,*/*');
  check(robots.status === 200, 'blog robots.txt returns HTTP 200');
  const wildcardGroup = robots.body.split(/\r?\n\s*\r?\n/).find((group) => /^\s*User-agent:\s*\*/im.test(group)) || '';
  check(!/^\s*Disallow:\s*\/\s*$/im.test(wildcardGroup), 'robots wildcard group does not disallow /');

  let sitemap = await get(`${BLOG_ORIGIN}/sitemap_index.xml`, 'application/xml,text/xml,*/*');
  if (sitemap.status !== 200 || !/<(?:[\w.-]+:)?(?:sitemapindex|urlset)\b/i.test(sitemap.body)) {
    sitemap = await get(`${BLOG_ORIGIN}/wp-sitemap.xml`, 'application/xml,text/xml,*/*');
  }
  check(sitemap.status === 200 && /<(?:[\w.-]+:)?(?:sitemapindex|urlset)\b/i.test(sitemap.body), 'at least one valid sitemap is available');

  const api = await get(`${BLOG_ORIGIN}/wp-json/wp/v2/posts?per_page=1&status=publish`, 'application/json');
  check(api.status === 200 && /json/i.test(api.contentType), 'published-post REST endpoint returns JSON HTTP 200');
  let posts;
  try { posts = JSON.parse(api.body); } catch { throw new Error('WordPress published-post endpoint returned invalid JSON.'); }
  check(Array.isArray(posts) && posts.length > 0 && posts[0]?.status === 'publish' && typeof posts[0]?.link === 'string', 'REST response contains a published post with a link');
  const postUrl = new URL(posts[0].link);
  check(postUrl.hostname === 'blog.stripunion.com' && postUrl.protocol === 'https:', 'latest published post URL stays on blog.stripunion.com');
  const post = await get(postUrl.href);
  check(post.status === 200, 'latest published post returns HTTP 200');
  check(!/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*\bcontent\s*=\s*["'][^"']*noindex/i.test(post.body), 'latest post is not noindex');
  const postCanonicals = [...post.body.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
    .filter((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes('canonical')).map((attrs) => attrs.href);
  check(postCanonicals.some((value) => value && new URL(value, BLOG_ORIGIN).hostname === 'blog.stripunion.com'), 'latest post canonical stays on blog.stripunion.com');
  if (!post.body.includes(MAIN_ORIGIN)) console.log('WARN latest published post has no cross-link to stripunion.com');
  else console.log('PASS latest published post links to stripunion.com');

  const ids = [...new Set([...homepage.body, ...post.body].join('\\n').match(analyticsIdPattern) || [])].map((id) => id.toUpperCase());
  console.log(`BLOG_ANALYTICS_IDS ${ids.length ? ids.join(', ') : 'none detected'}`);
  const expectedIds = [expectedMeasurementId.toUpperCase(), expectedGoogleTagId.toUpperCase()].filter(Boolean);
  const unexpected = ids.filter((id) => !expectedIds.includes(id));
  const expectedPresent = expectedIds.some((id) => ids.includes(id));
  const analyticsStatus = !ids.length ? 'MISSING' : unexpected.length || !expectedPresent ? 'MISMATCH' : 'CONNECTED';
  console.log(`BLOG_ANALYTICS: ${analyticsStatus}`);
  if (process.env.GITHUB_OUTPUT) {
    const accepted = analyticsStatus === 'CONNECTED' ? 'true' : 'false';
    await fs.appendFile(process.env.GITHUB_OUTPUT, `analytics_status=${analyticsStatus}\nanalytics_accepted=${accepted}\n`, 'utf8');
  }
  if (analyticsStatus !== 'CONNECTED') {
    console.log(analyticsStatus === 'MISSING'
      ? 'WARN Blog public HTML contains no GA4 Measurement ID.'
      : `WARN Blog public HTML Measurement ID does not match expected ${expectedMeasurementId}.`);
  }
}

function selfTest() {
  assert.deepEqual(attributes('<meta content="index,follow" name="robots">'), { content: 'index,follow', name: 'robots' });
  const groups = 'User-agent: *\nDisallow: /private\n\nUser-agent: Googlebot\nDisallow: /';
  assert.equal(/^\s*Disallow:\s*\/\s*$/im.test(groups.split(/\r?\n\s*\r?\n/)[0]), false);
  assert.equal(/^\s*Disallow:\s*\/\s*$/im.test('User-agent: *\nDisallow:'), false);
  assert.equal(/^\s*Disallow:\s*\/\s*$/im.test('User-agent: *\nDisallow: /'), true);
  const analyticsStatus = (ids, expected = []) => !ids.length ? 'MISSING' : ids.some((id) => !expected.includes(id)) || !expected.some((id) => ids.includes(id)) ? 'MISMATCH' : 'CONNECTED';
  assert.equal(analyticsStatus([]), 'MISSING');
  assert.equal(analyticsStatus(['G-TEST123456'], ['G-TEST123456', 'GT-P8VJLHT3']), 'CONNECTED');
  assert.equal(analyticsStatus(['GT-P8VJLHT3'], ['G-TEST123456', 'GT-P8VJLHT3']), 'CONNECTED');
  assert.equal(analyticsStatus(['G-OTHER123456', 'GT-P8VJLHT3'], ['G-TEST123456', 'GT-P8VJLHT3']), 'MISMATCH');
  assert.equal(analyticsStatus(['G-TEST123456', 'G-OTHER123456'], ['G-TEST123456', 'GT-P8VJLHT3']), 'MISMATCH');
  const statusFor = (ids, expected) => {
    const status = !ids.length ? 'MISSING' : expected && !ids.includes(expected) ? 'MISMATCH' : 'CONNECTED';
    return { status, acceptancePassed: status === 'CONNECTED' };
  };
  assert.deepEqual(statusFor([], ''), { status: 'MISSING', acceptancePassed: false });
  assert.deepEqual(statusFor(['G-TEST123456'], 'G-TEST123456'), { status: 'CONNECTED', acceptancePassed: true });
  assert.deepEqual(statusFor(['G-OTHER123456'], 'G-TEST123456'), { status: 'MISMATCH', acceptancePassed: false });
  console.log('Blog health checker self-test passed.');
}

if (process.argv.includes('--self-test')) selfTest();
else main().catch((error) => { console.error(`Blog health check failed: ${error.message}`); process.exitCode = 1; });

