import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MARKER = 'https://stripunion.com/publication-deployment.json';

export function normalizeUrls(values) {
  const urls = (values || []).map((value) => {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.hostname !== 'stripunion.com' || url.port ||
        url.username || url.password || url.search || url.hash || !/^\/guides\/[a-z0-9-]+$/.test(url.pathname)) {
      throw new Error('Refused non-production publication URL.');
    }
    return url.href;
  });
  if (urls.length !== 5 || new Set(urls).size !== 5) throw new Error('Expected exactly five unique production URLs.');
  return urls;
}

export function classifyStatus(status) {
  if (status === 200) return 'live';
  if (status === 401 || status === 403) return 'access-denied';
  if (status === 404) return 'not-deployed';
  if (status === 429) return 'rate-limited';
  if (status >= 500 && status <= 599) return 'server-error';
  if (status === 0) return 'transport-error';
  if (status >= 300 && status <= 399) return 'redirect';
  return 'unexpected-status';
}

export async function probeUrl(url, timeoutMs = 7_000, fetchImpl = fetch) {
  try {
    const original = new URL(url);
    let current = original;
    const redirects = [];
    // One timeout covers the entire chain, including canonical slash normalization.
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= 2; hop++) {
      const response = await fetchImpl(current.href, {
        method: 'GET', redirect: 'manual',
        headers: { 'User-Agent': 'StripUnion-Publication-Verifier/2.0', 'Cache-Control': 'no-cache' }, signal,
      });
      try { await response.body?.cancel(); } catch {}
      if ([301, 308].includes(response.status) && hop < 2 && response.headers.get('location')) {
        const next = new URL(response.headers.get('location'), current);
        const sameGuide = next.origin === original.origin && !next.username && !next.password &&
          !next.search && !next.hash && next.pathname.replace(/\/$/, '') === original.pathname.replace(/\/$/, '') &&
          next.href !== current.href;
        if (sameGuide) {
          redirects.push({ status: response.status, path: next.pathname });
          current = next;
          continue;
        }
      }
      return { url, finalUrl: current.href, redirects, status: response.status,
        classification: classifyStatus(response.status), ok: response.status === 200 };
    }
  } catch (error) {
    return { url, status: 0, classification: 'transport-error', ok: false,
      error: ['TimeoutError', 'AbortError'].includes(error?.name) ? error.name : 'NetworkError' };
  }
}

export async function probeDeployment(expected, timeoutMs, fetchImpl) {
  try {
    const response = await fetchImpl(MARKER, {
      redirect: 'manual', headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) {
      try { await response.body?.cancel(); } catch {}
      return { ok: false, status: response.status, classification: classifyStatus(response.status) };
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512_000) throw new Error('Oversize marker');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const matched = data.version === 1 && Object.entries(expected).every(([slug, hash]) => data.guides?.[slug] === hash);
    return { ok: matched, status: 200, classification: matched ? 'deployment-matched' : 'deployment-stale' };
  } catch {
    return { ok: false, status: 0, classification: 'deployment-unavailable' };
  }
}

function bounded(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
  return value;
}

export async function waitForAllLive(urls, {
  deadlineMs = 10 * 60_000, intervalMs = 15_000, requestTimeoutMs = 7_000, maxAttempts = 30,
  expectedGuides, fetchImpl = fetch, now = () => Date.now(), sleepImpl = sleep, log = () => {},
} = {}) {
  const normalized = normalizeUrls(urls);
  bounded(deadlineMs, 1, 10 * 60_000, 'deadline');
  bounded(intervalMs, 1, 60_000, 'interval');
  bounded(requestTimeoutMs, 1, 10_000, 'request timeout');
  bounded(maxAttempts, 1, 40, 'attempt limit');
  const slugs = normalized.map((url) => new URL(url).pathname.split('/').pop());
  if (!expectedGuides || Object.keys(expectedGuides).length !== 5 ||
      !slugs.every((slug) => /^[a-f0-9]{64}$/.test(expectedGuides[slug] || ''))) {
    throw new Error('Exactly five expected deployment fingerprints are required.');
  }
  const started = now();
  const deadline = started + deadlineMs;
  const evidence = [];
  let results = [], deployment = null;
  let reason = 'deadline';
  for (let attempt = 1; attempt <= maxAttempts && now() < deadline; attempt++) {
    const timeout = Math.max(1, Math.min(requestTimeoutMs, deadline - now()));
    [results, deployment] = await Promise.all([
      Promise.all(normalized.map((url) => probeUrl(url, timeout, fetchImpl))),
      probeDeployment(expectedGuides, timeout, fetchImpl),
    ]);
    const row = { attempt, elapsedMs: now() - started, results, deployment };
    evidence.push(row);
    log(row);
    if (now() <= deadline && results.every((row) => row.ok) && deployment.ok) {
      return { ok: true, reason: 'verified', results, deployment, evidence };
    }
    const terminal = results.some((row) => ['access-denied', 'redirect', 'unexpected-status'].includes(row.classification)) ||
      ['access-denied', 'redirect', 'unexpected-status'].includes(deployment.classification);
    if (terminal) { reason = 'terminal-http-status'; break; }
    if (attempt === maxAttempts) { reason = 'attempt-limit'; break; }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    const backoff = Math.min(60_000, intervalMs * 2 ** Math.min(attempt - 1, 2));
    await sleepImpl(Math.min(backoff, remaining));
  }
  return { ok: false, reason, results, deployment, evidence };
}

async function main() {
  if (process.argv.includes('--self-test')) {
    assert.equal(classifyStatus(403), 'access-denied');
    assert.equal(classifyStatus(404), 'not-deployed');
    assert.equal(classifyStatus(503), 'server-error');
    assert.throws(() => normalizeUrls(Array(5).fill('https://stripunion.com/guides/a')), /five unique/);
    console.log('Live publication verifier self-test passed.');
    return;
  }
  const urls = JSON.parse(process.env.PUBLICATION_URLS_JSON || 'null');
  const expectedGuides = JSON.parse(process.env.PUBLICATION_EXPECTED_GUIDES_JSON || 'null');
  const result = await waitForAllLive(urls, { expectedGuides,
    log: (row) => console.log('PUBLICATION_PROBE ' + JSON.stringify(row)),
  });
  await fs.mkdir('artifacts/publication-verification', { recursive: true });
  await fs.writeFile('artifacts/publication-verification/result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(result.ok ? 'PUBLICATION_LIVE_CHECK_OK' : 'PUBLICATION_LIVE_CHECK_FAILED');
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
