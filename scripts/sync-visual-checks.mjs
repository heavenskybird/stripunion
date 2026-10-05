import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { controlPlaneConfig, upsertRows } from '../ops/control-plane/client.mjs';

const reportPath = process.env.VISUAL_REPORT_PATH || 'artifacts/visual-qa-hourly/visual-report.json';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function stableId(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}

let report;
try {
  report = await readJson(reportPath);
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('CONTROL_PLANE_VISUAL_SKIP visual report not found: ' + reportPath);
    process.exit(0);
  }
  throw error;
}

const config = controlPlaneConfig();
if (!config.configured) {
  console.log('CONTROL_PLANE_VISUAL_SKIP Supabase is not configured.');
  process.exit(0);
}

const failures = report.failures || [];
const warnings = report.warnings || [];
const checkedAt = report.generated_at || new Date().toISOString();
const rows = (report.pages || []).map((page) => {
  const failureCount = failures.filter((item) =>
    item.viewport === page.viewport && item.url === page.url
  ).length;
  const warningCount = warnings.filter((item) =>
    item.viewport === page.viewport && item.url === page.url
  ).length;

  return {
    visual_check_id: stableId([checkedAt, page.viewport || '', page.url || page.target || '']),
    checked_at: checkedAt,
    target: page.url || page.target || 'unknown',
    viewport: page.viewport || 'unknown',
    status: failureCount ? 'failed' : warningCount ? 'warning' : 'passed',
    failure_count: failureCount,
    warning_count: warningCount,
    payload: page
  };
});

await upsertRows(config, 'visual_checks', rows, 'visual_check_id');
console.log('CONTROL_PLANE_VISUAL_SYNC_OK ' + JSON.stringify({
  checks: rows.length,
  failures: failures.length,
  warnings: warnings.length
}));
