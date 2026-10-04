const url = process.argv[2];
if (!url) throw new Error('Usage: node scripts/verify-wordpress-live.mjs <url>');

const response = await fetch(url, {
  redirect: 'follow',
  signal: AbortSignal.timeout(20000),
  headers: { 'User-Agent': 'StripUnion-Editorial-Verifier/1.0' }
});

if (!response.ok) {
  throw new Error('Live URL returned HTTP ' + response.status + ': ' + url);
}

const html = await response.text();
const finalUrl = response.url;

const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
  || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
const canonical = canonicalMatch?.[1] || '';

if (!canonical) {
  throw new Error('Published page has no canonical link: ' + finalUrl);
}

const normalize = (value) => String(value).replace(/\/+$/, '');
if (normalize(canonical) !== normalize(finalUrl)) {
  throw new Error('Published page canonical mismatch. live=' + finalUrl + ' canonical=' + canonical);
}

const robotsMeta = [...html.matchAll(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/gi)]
  .map((match) => match[1].toLowerCase())
  .join(',');
if (/noindex/.test(robotsMeta)) {
  throw new Error('Published page is noindex: ' + finalUrl);
}

const site = new URL(finalUrl).origin;
const sitemapCandidates = [
  site + '/post-sitemap.xml',
  site + '/wp-sitemap-posts-post-1.xml',
  site + '/wp-sitemap.xml'
];

let sitemapEvidence = 'not_confirmed';
for (const sitemap of sitemapCandidates) {
  try {
    const res = await fetch(sitemap, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'StripUnion-Editorial-Verifier/1.0' }
    });
    if (!res.ok) continue;
    const body = await res.text();
    if (body.includes(finalUrl) || body.includes(new URL(finalUrl).pathname)) {
      sitemapEvidence = sitemap;
      break;
    }
  } catch {
    // Try the next sitemap form.
  }
}

console.log(JSON.stringify({
  ok: true,
  url: finalUrl,
  canonical,
  robots: robotsMeta || 'default',
  sitemap_evidence: sitemapEvidence
}, null, 2));
