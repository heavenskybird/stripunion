const origin = new URL(process.argv[2] || 'https://stripunion.com');
if (origin.protocol !== 'https:' || !['stripunion.com', 'www.stripunion.com'].includes(origin.hostname)) {
  throw new Error('Main health URL must use the StripUnion production host.');
}
const timeoutMs = 15_000;
const maxBytes = 1_000_000;
const expectedClarityId = (process.env.EXPECTED_CLARITY_PROJECT_ID || 'ysuowheiiz').toLowerCase();

async function get(path) {
  const url = new URL(path, origin);
  const response = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  if (response.url && new URL(response.url).hostname !== origin.hostname) throw new Error(`Unexpected redirect host for ${path}.`);
  const reader = response.body?.getReader();
  const chunks = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error(`Response too large for ${path}.`); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { status: response.status, body: new TextDecoder().decode(bytes), contentType: response.headers.get('content-type') || '' };
}

function verify(ok, message) {
  if (!ok) throw new Error(message);
  console.log(`PASS ${message}`);
}

const [homepage, robots, sitemap] = await Promise.all([get('/'), get('/robots.txt'), get('/sitemap.xml')]);
verify(homepage.status === 200 && /StripUnion/i.test(homepage.body), 'main homepage returns 200 and identifies StripUnion');
verify(robots.status === 200 && !/^\s*Disallow:\s*\/\s*$/im.test(robots.body), 'main robots.txt returns 200 and does not block the full site');
verify(sitemap.status === 200 && /<loc>https:\/\/(?:www\.)?stripunion\.com\//i.test(sitemap.body), 'main sitemap returns 200 and contains StripUnion URLs');
verify(homepage.body.toLowerCase().includes('clarity.ms/tag/') && homepage.body.toLowerCase().includes(expectedClarityId), 'main homepage exposes expected Microsoft Clarity tag');
verify(homepage.body.includes("clarity('consentv2'") || homepage.body.includes("window.clarity('consentv2'"), 'main homepage wires Microsoft Clarity Consent API V2');
verify(homepage.body.includes("analytics_storage") && homepage.body.includes("ad_storage"), 'main homepage wires analytics consent state');
console.log('MAIN_PUBLIC_HEALTH PASS');
