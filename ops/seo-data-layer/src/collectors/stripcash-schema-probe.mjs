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

function safeCatalog(payload) {
  const statistics = payload?.statistics;
  const report = statistics?.data;
  const rows = Array.isArray(report?.data) ? report.data : [];
  const metrics = Array.isArray(report?.metrics) ? report.metrics : [];

  return {
    statisticsKeys: statistics && typeof statistics === 'object' ? Object.keys(statistics).sort() : [],
    reportKeys: report && typeof report === 'object' ? Object.keys(report).sort() : [],
    groups: Array.isArray(report?.groups) ? report.groups.map((value) => String(value)) : [],
    metrics: metrics.map((metric) => ({
      id: String(metric?.id ?? ''),
      group: String(metric?.group ?? ''),
      section: String(metric?.section ?? ''),
      type: String(metric?.type ?? '')
    })),
    rowCount: rows.length,
    firstRowShape: rows.length ? shapeOf(rows[0], 0) : null
  };
}

async function runSelfTest() {
  const sample = {
    statistics: {
      data: {
        groups: ['date'],
        metrics: [{ id: 'clicks', group: 'traffic', section: 'traffic', type: 'number' }],
        data: [{ date: '2026-10-02', clicks: 12, revenue: 3.45 }]
      }
    }
  };
  const catalog = safeCatalog(sample);
  if (catalog.metrics[0]?.id !== 'clicks') throw new Error('metric catalog self-test failed');
  if (catalog.firstRowShape?.keys?.clicks !== 'number') throw new Error('row schema self-test failed');
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
  console.log('Only safe API metadata, schema/key names, and value types are shown below; no statistic values are printed.');
  console.log(JSON.stringify(safeCatalog(payload), null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
