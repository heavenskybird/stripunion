import fs from 'node:fs/promises';
import path from 'node:path';

const backlogPath = 'ops/editorial/hourly-backlog.json';
const artifactDir = 'ops/editorial/content-artifacts';
const guideDir = 'src/data/guides';
const manifestPath = '/tmp/stripunion-editorial-batch.json';
const target = Number(process.env.EDITORIAL_BATCH_SIZE || 5);

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function exists(file) {
  return fs.access(file).then(() => true).catch(() => false);
}

async function listJson(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

await fs.rm(manifestPath, { force: true });

const backlog = await readJson(backlogPath);
const artifactByBacklogId = new Map();

for (const name of await listJson(artifactDir)) {
  try {
    const file = path.join(artifactDir, name);
    const data = await readJson(file);
    if (data?.backlogId && data?.slug) artifactByBacklogId.set(data.backlogId, { file, data });
  } catch {}
}

const selected = [];
const skipped = [];

for (const item of backlog.queue || []) {
  if (item.status !== 'publishing') continue;
  const row = artifactByBacklogId.get(item.id);
  if (!row) {
    skipped.push({ backlogId: item.id, reason: 'artifact_missing' });
    continue;
  }

  const guideFile = path.join(guideDir, row.data.slug + '.js');
  if (!(await exists(guideFile))) {
    skipped.push({ backlogId: item.id, reason: 'guide_missing' });
    continue;
  }

  selected.push({
    backlogId: item.id,
    artifactFile: row.file,
    guideFile,
    categorySlug: row.data.categorySlug || null,
    slug: row.data.slug
  });

  if (selected.length >= target) break;
}

if (selected.length < target) {
  console.log('EDITORIAL_RECOVERY_NOT_READY ' + JSON.stringify({
    publishingCount: (backlog.queue || []).filter((item) => item.status === 'publishing').length,
    recoverableCount: selected.length,
    target,
    skipped
  }));
  process.exit(0);
}

const manifest = {
  version: 2,
  mode: 'recovery',
  generatedAt: new Date().toISOString(),
  targetCount: target,
  count: selected.length,
  carryoverCount: selected.length,
  recoveryCount: selected.length,
  generatedCount: 0,
  artifactFiles: selected.map((row) => row.artifactFile),
  guideFiles: selected.map((row) => row.guideFile),
  recoveryGuideFiles: selected.map((row) => row.guideFile),
  categories: selected.map((row) => row.categorySlug),
  backlogIds: selected.map((row) => row.backlogId),
  slugs: selected.map((row) => row.slug),
  skippedCarryover: skipped
};

await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log('EDITORIAL_RECOVERY_BATCH_PLANNED ' + JSON.stringify({
  count: manifest.count,
  recoveryCount: manifest.recoveryCount,
  backlogIds: manifest.backlogIds,
  slugs: manifest.slugs
}));
