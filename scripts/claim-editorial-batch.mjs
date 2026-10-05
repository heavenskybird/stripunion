import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlPlaneConfig, upsertRows } from '../ops/control-plane/client.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = process.env.EDITORIAL_BATCH_MANIFEST || '/tmp/stripunion-editorial-batch.json';
const backlogPath = path.join(root, 'ops/editorial/hourly-backlog.json');
const modePath = path.join(root, 'ops/control-plane/mode.json');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

const [manifest, backlog, mode] = await Promise.all([
  readJson(manifestPath, null),
  readJson(backlogPath, { queue: [] }),
  readJson(modePath, { mode: 'shadow' })
]);

if (!manifest?.backlogIds?.length) {
  console.log('CONTROL_PLANE_CLAIM_SKIP no batch backlog IDs');
  process.exit(0);
}

const config = controlPlaneConfig();
const required = mode.mode === 'authoritative';
if (!config.configured) {
  if (required) throw new Error('Control Plane is authoritative but Supabase configuration is missing.');
  console.log('CONTROL_PLANE_CLAIM_SKIP Supabase not configured in shadow mode');
  process.exit(0);
}

const byId = new Map((backlog.queue || []).map((item) => [item.id, item]));
const claimedAt = new Date().toISOString();
const leaseExpiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
const runId = process.env.GITHUB_RUN_ID || 'local';

const rows = manifest.backlogIds
  .map((id) => byId.get(id))
  .filter(Boolean)
  .map((item) => ({
    job_id: item.id,
    intent: item.intent || null,
    category: item.category || null,
    surface: item.surface || null,
    priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : null,
    status: 'qa_pending',
    artifact_path: 'ops/editorial/content-artifacts/' + item.id + '.json',
    updated_at: claimedAt,
    payload: {
      ...item,
      controlPlane: {
        state: 'qa_pending',
        claimedAt,
        leaseExpiresAt,
        githubRunId: runId
      }
    }
  }));

try {
  await upsertRows(config, 'content_jobs', rows, 'job_id');
  console.log('CONTROL_PLANE_BATCH_CLAIM_OK ' + JSON.stringify({ jobs: rows.length, leaseExpiresAt, mode: mode.mode }));
} catch (error) {
  if (required) throw error;
  console.warn('CONTROL_PLANE_BATCH_CLAIM_WARN ' + (error instanceof Error ? error.message : String(error)));
}
