import fs from 'node:fs/promises';
import path from 'node:path';

const backlogPath = process.argv[2] || 'ops/editorial/hourly-backlog.json';
const artifactDir = 'ops/editorial/content-artifacts';
const guideDir = 'src/data/guides';
const ledgerDir = 'ops/editorial/publication-ledger/astro';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function jsonFiles(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

const backlog = await readJson(backlogPath);
const artifacts = new Map();
for (const name of await jsonFiles(artifactDir)) {
  try {
    const artifact = await readJson(path.join(artifactDir, name));
    if (artifact?.backlogId && artifact?.slug) artifacts.set(artifact.backlogId, artifact);
  } catch {}
}

const ledgers = new Set((await jsonFiles(ledgerDir)).map((name) => path.basename(name, '.json')));
let changed = false;

for (const item of backlog.queue || []) {
  const artifact = artifacts.get(item.id);
  if (!artifact) continue;

  const guideExists = await fs.access(path.join(guideDir, artifact.slug + '.js')).then(() => true).catch(() => false);
  const next = ledgers.has(artifact.slug) ? 'published' : guideExists ? 'publishing' : 'ready';
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

console.log('EDITORIAL_BACKLOG_RECONCILED ' + JSON.stringify({ changed, counts }));
