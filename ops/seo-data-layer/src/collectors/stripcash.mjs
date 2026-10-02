import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const API_URL = 'https://api.stripcash.com/external/v1/user/statistics';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const token = process.env.STRIPCASH_STATS_API_TOKEN?.trim();
const snapshotDate = process.env.SEO_END_DATE || daysAgo(1);

const allowedMetricFields = [
  'signup',
  'verifiedSignup',
  'verifiedSignupRate',
  'newCustomersCount',
  'firstPurchasesRate',
  'purchasesCount',
  'purchasesSumAmount',
  'purchaseEarnings',
  'rebillsRate',
  'uniqueSpenders',
  'newUniqueSpenders',
  'returningUniqueSpenders',
  'uniqueRevenueGenerators',
  'subscriptionCount',
  'subscriptionFirstCount',
  'subscriptionRebillsCount',
  'subscriptionSumAmount',
  'subscriptionFirstSumAmount',
  'subscriptionRebillsSumAmount',
  'subscriptionEarnings',
  'refundsCount',
  'refundsSumAmount',
  'refundDeductions',
  'modelsReferralEarnings',
  'webmasterRegistration',
  'webmasterReferralEarnings',
  'schemeEarnings',
  'totalEarnings'
];

async function readConfiguredUserId() {
  const envUserId = process.env.STRIPCASH_USER_ID?.trim();
  if (envUserId) return envUserId;

  const siteConfigPath = path.resolve(packageRoot, '../../src/config/site.js');
  const siteConfig = await fs.readFile(siteConfigPath, 'utf8');
  const match = siteConfig.match(/STRIPCASH_USER_ID\s*=\s*['"]([a-f0-9]{64})['"]/i);
  if (!match) throw new Error('Could not resolve STRIPCASH_USER_ID from environment or src/config/site.js.');
  return match[1];
}

function pickNumericMetrics(row) {
  const metrics = {};
  for (const key of allowedMetricFields) {
    if (!Object.hasOwn(row, key)) continue;
    const value = Number(row[key]);
    if (!Number.isFinite(value)) throw new Error(`StripCash field ${key} was not numeric.`);
    metrics[key] = value;
  }
  return metrics;
}

export function normalizeStripCashPayload(payload) {
  const statistics = payload?.statistics;
  const report = statistics?.data;
  const rows = Array.isArray(report?.data) ? report.data : [];

  if (!statistics || typeof statistics !== 'object') {
    throw new Error('StripCash response is missing statistics.');
  }
  if (!report || typeof report !== 'object') {
    throw new Error('StripCash response is missing statistics.data.');
  }
  if (rows.length !== 1 || !rows[0] || typeof rows[0] !== 'object') {
    throw new Error(`StripCash default report returned ${rows.length} rows; expected exactly one aggregate row.`);
  }

  const metrics = pickNumericMetrics(rows[0]);
  const required = ['signup', 'verifiedSignup', 'purchasesCount', 'purchaseEarnings', 'totalEarnings'];
  const missing = required.filter((key) => !Object.hasOwn(metrics, key));
  if (missing.length) {
    throw new Error(`StripCash aggregate row is missing required fields: ${missing.join(', ')}.`);
  }

  return {
    source: 'stripcash-statistics-api',
    collectedAt: new Date().toISOString(),
    reportScope: 'StripCash API default aggregate scope; date-window semantics are not documented in the supplied API reference.',
    reportStatus: typeof statistics.status === 'string' ? statistics.status : null,
    rowCount: rows.length,
    metrics
  };
}

async function runSelfTest() {
  const normalized = normalizeStripCashPayload({
    statistics: {
      status: 'finished',
      data: {
        data: [{
          signup: 10,
          verifiedSignup: 8,
          purchasesCount: 4,
          purchaseEarnings: 1.25,
          totalEarnings: 2.5,
          modelsReferralEarnings: 0,
          webmasterReferralEarnings: 0
        }]
      }
    }
  });
  if (normalized.metrics.signup !== 10) throw new Error('signup self-test failed');
  if (normalized.metrics.totalEarnings !== 2.5) throw new Error('earnings self-test failed');
  console.log('StripCash statistics collector self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }

  if (!token) {
    console.error('StripCash collection skipped: STRIPCASH_STATS_API_TOKEN is not configured.');
    process.exitCode = 1;
    return;
  }

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
  const normalized = normalizeStripCashPayload(payload);
  await writeSnapshot('stripcash', snapshotDate, normalized);
  console.log(`StripCash aggregate snapshot collected with ${Object.keys(normalized.metrics).length} approved metrics.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
