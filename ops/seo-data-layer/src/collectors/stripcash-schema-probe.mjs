import fs from 'node:fs/promises';

const API_URL = 'https://api.stripcash.com/external/v1/user/statistics';

function shapeOf(value, depth = 0) {
  if (depth > 3) return typeof value;

  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      itemShape: value.length ? shapeOf(value[0], depth + 1) : null
    };
  }

  if (value && typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.fromEntries(
        Object.keys(value)
          .sort()
          .slice(0, 100)
          .map((key) => [key, shapeOf(value[key], depth + 1)])
      )
    };
  }

  if (value === null) return 'null';
  return typeof value;
}

async function readConfiguredUserId() {
  const envUserId = process.env.STRIPCASH_USER_ID?.trim();
  if (envUserId) return envUserId;

  const siteConfig = await fs.readFile('src/config/site.js', 'utf8');
  const match = siteConfig.match(/STRIPCASH_USER_ID\s*=\s*['"]([a-f0-9]{64})['"]/i);
  if (!match) throw new Error('Could not resolve STRIPCASH_USER_ID from environment or src/config/site.js');
  return match[1];
}

async function runSelfTest() {
  const sample = {
    totals: { clicks: 12, revenue: 3.45 },
    rows: [{ date: '2026-10-02', campaignId: 'sample', amount: 1 }]
  };
  const shape = shapeOf(sample);
  if (shape?.type !== 'object') throw new Error('shape self-test failed');
  if (shape.keys?.totals?.keys?.clicks !== 'number') throw new Error('numeric shape self-test failed');
  if (shape.keys?.rows?.itemShape?.keys?.campaignId !== 'string') throw new Error('array shape self-test failed');
  console.log('StripCash statistics probe self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  const token = process.env.STRIPCASH_STATS_API_TOKEN?.trim();
  if (!token) throw new Error('STRIPCASH_STATS_API_TOKEN is not configured.');

  const userId = await readConfiguredUserId();
  const url = new URL(API_URL);
  url.searchParams.set('userId', userId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    throw new Error(`StripCash Statistics API returned HTTP ${response.status}. Response body is intentionally not logged.`);
  }

  const payload = await response.json();

  console.log('StripCash Statistics API probe succeeded.');
  console.log('Only schema/key names and value types are shown below; no values are printed.');
  console.log(JSON.stringify(shapeOf(payload), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
