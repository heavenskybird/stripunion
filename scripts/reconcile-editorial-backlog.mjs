import fs from 'node:fs/promises';
import path from 'node:path';
import { controlPlaneConfig, selectRows } from '../ops/control-plane/client.mjs';

const backlogPath = process.argv[2] || 'ops/editorial/hourly-backlog.json';
const artifactDir = 'ops/editorial/content-artifacts';
const guideDir = 'src/data/guides';
const ledgerDir = 'ops/editorial/publication-ledger/astro';
const modePath = 'ops/control-plane/mode.json';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readJsonOptional(file, fallback) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function jsonFiles(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

function projectDatabaseStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['planned', 'researching', 'ready', 'publishing', 'published', 'blocked', 'dropped'].includes(value)) return value;
  if (['claimed', 'generating', 'qa_pending'].includes(value)) return 'ready';
  if (['qa_passed', 'scheduled'].includes(value)) return 'publishing';
  return null;
}

function monotonicStatus(localStatus, databaseStatus) {
  const db = projectDatabaseStatus(databaseStatus);
  if (!db) return localStatus;
  if (localStatus === 'published') return 'published';
  if (db === 'blocked' || db === 'dropped') return db;
  const rank = { planned: 0, researching: 1, ready: 2, publishing: 3, published: 4 };
  return (rank[db] ?? -1) > (rank[localStatus] ?? -1) ? db : localStatus;
}

const backlog = await readJson(backlogPath);
const mode = await readJsonOptional(modePath, { mode: 'shadow' });
const authoritative = mode.mode === 'authoritative';

let databaseJobs = new Map();
if (authoritative) {
  const config = controlPlaneConfig();
  if (!config.configured) {
    throw new Error('Control Plane is authoritative but Supabase configuration is missing.');
  }
  const rows = await selectRows(config, 'content_jobs', 'select=job_id,status,updated_at&limit=5000');
  databaseJobs = new Map(rows.map((row) => [row.job_id, row]));
}

const artifacts = new Map();
for (const name of await jsonFiles(artifactDir)) {
  try {
    const artifact = await readJson(path.join(artifactDir, name));
    if (artifact?.backlogId && artifact?.slug) artifacts.set(artifact.backlogId, artifact);
  } catch {}
}

const ledgers = new Set((await jsonFiles(ledgerDir)).map((name) => path.basename(name, '.json')));
let changed = false;
let databaseProjected = 0;

for (const item of backlog.queue || []) {
  const artifact = artifacts.get(item.id);
  if (!artifact) continue;

  const guideExists = await fs.access(path.join(guideDir, artifact.slug + '.js')).then(() => true).catch(() => false);
  const localNext = ledgers.has(artifact.slug) ? 'published' : guideExists ? 'publishing' : 'ready';
  const databaseStatus = authoritative ? databaseJobs.get(item.id)?.status : null;
  const next = authoritative ? monotonicStatus(localNext, databaseStatus) : localNext;
  if (databaseStatus) databaseProjected += 1;

  if (item.status !== next) {
    item.status = next;
    changed = true;
  }
}

const today = new Date().toISOString().slice(0, 10);
if (backlog.updated_at !== today) {
  backlog.updated_at = today;
  changed = true;
}

if (changed) {
  await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');
}

const counts = Object.fromEntries(
  [...new Set((backlog.queue || []).map((item) => item.status))].sort().map((status) => [
    status,
    (backlog.queue || []).filter((item) => item.status === status).length
  ])
);

console.log('EDITORIAL_BACKLOG_RECONCILED ' + JSON.stringify({
  changed,
  counts,
  controlPlaneMode: mode.mode || 'shadow',
  databaseProjected
}));
