import assert from 'node:assert/strict';

const DEFAULT_DEADLINE_MS = 10 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 7_000;
const DEFAULT_INTERVAL_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeUrls(values) {
  const urls = [];
  for (const value of values || []) {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.hostname !== 'stripunion.com') {
      throw new Error(`Refused non-production publication URL: ${url.href}`);
    }
    urls.push(url.href);
  }
  if (urls.length !== 5) throw new Error(`Expected exactly five production URLs; got ${urls.length}.`);
  return urls;
}

export async function probeUrl(url, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'StripUnion-Publication-Verifier/1.0',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    try { await response.body?.cancel(); } catch {}
    return {
      url,
      status: response.status,
      ok: response.status === 200,
      error: null,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: {
        name: error?.name || 'Error',
        message: String(error?.message || error),
        code: error?.cause?.code || null,
      },
    };
  }
}

export async function waitForAllLive(urls, {
  deadlineMs = DEFAULT_DEADLINE_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
  now = () => Date.now(),
  sleepImpl = sleep,
} = {}) {
  const normalized = normalizeUrls(urls);
  const deadline = now() + deadlineMs;
  let results = [];

  while (now() < deadline) {
    results = await Promise.all(normalized.map((url) => probeUrl(url, requestTimeoutMs, fetchImpl)));
    if (results.every((row) => row.ok)) return { ok: true, results };

    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleepImpl(Math.min(intervalMs, remaining));
  }

  return { ok: false, results };
}

function selfTest() {
  const urls = [
    'https://stripunion.com/guides/a',
    'https://stripunion.com/guides/b',
    'https://stripunion.com/guides/c',
    'https://stripunion.com/guides/d',
    'https://stripunion.com/guides/e',
  ];
  assert.equal(normalizeUrls(urls).length, 5);
  assert.throws(() => normalizeUrls(urls.slice(0, 4)), /exactly five/);
  assert.throws(() => normalizeUrls([...urls.slice(0, 4), 'https://example.com/x']), /Refused/);
  console.log('Live publication verifier self-test passed.');
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const raw = process.env.PUBLICATION_URLS_JSON;
if (!raw) {
  console.error('PUBLICATION_URLS_JSON is required.');
  process.exit(1);
}

let urls;
try {
  urls = JSON.parse(raw);
} catch {
  console.error('PUBLICATION_URLS_JSON must be valid JSON.');
  process.exit(1);
}

const result = await waitForAllLive(urls);
if (!result.ok) {
  console.error('PUBLICATION_LIVE_CHECK_FAILED');
  for (const row of result.results) {
    const suffix = row.error
      ? ` error=${row.error.name}:${row.error.code || 'no-code'}:${row.error.message}`
      : '';
    console.error(`HTTP ${row.status} ${row.url}${suffix}`);
  }
  process.exit(1);
}

console.log('PUBLICATION_LIVE_CHECK_OK');
for (const row of result.results) console.log(`HTTP ${row.status} ${row.url}`);
