import fs from 'node:fs/promises';

const path = process.argv[2] || 'ops/editorial/hourly-backlog.json';
const allowedBlockers = new Set([
  'WEB_FETCH_LIMITATION',
  'CONNECTOR_PERMISSION_BLOCKER',
  'PLATFORM_SAFETY_BLOCKER',
  'PRODUCTION_FAILURE'
]);
const allowedStatuses = new Set(['planned', 'researching', 'ready', 'publishing', 'published', 'blocked', 'dropped']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const raw = await fs.readFile(path, 'utf8');
const data = JSON.parse(raw);

assert(data.version === 1, 'backlog version must be 1');
assert(data.hourly_target === 5, 'hourly_target must remain 5');
assert(data.rolling_24h_target === 120, 'rolling_24h_target must remain 120');
assert(Array.isArray(data.blocker_taxonomy), 'blocker_taxonomy must be an array');
for (const blocker of data.blocker_taxonomy) {
  assert(allowedBlockers.has(blocker), `unknown blocker type: ${blocker}`);
}
assert(Array.isArray(data.fallback_ladder) && data.fallback_ladder.length >= 2, 'fallback_ladder must contain at least two steps');
assert(Array.isArray(data.queue), 'queue must be an array');

const ids = new Set();
for (const item of data.queue) {
  assert(typeof item.id === 'string' && /^[a-z0-9-]+$/.test(item.id), 'queue item id must be kebab-case');
  assert(!ids.has(item.id), `duplicate queue id: ${item.id}`);
  ids.add(item.id);
  assert(typeof item.category === 'string' && item.category.trim(), `missing category for ${item.id}`);
  assert(typeof item.intent === 'string' && item.intent.trim(), `missing intent for ${item.id}`);
  assert(typeof item.surface === 'string' && item.surface.trim(), `missing surface for ${item.id}`);
  assert(Number.isInteger(item.priority) && item.priority >= 0 && item.priority <= 100, `invalid priority for ${item.id}`);
  assert(allowedStatuses.has(item.status), `invalid status for ${item.id}`);
  assert(Array.isArray(item.source_requirements), `source_requirements must be an array for ${item.id}`);
  assert(typeof item.monetization === 'string' && item.monetization.trim(), `missing monetization for ${item.id}`);
}

console.log(`HOURLY_BACKLOG_VALID queue=${data.queue.length} target=${data.hourly_target} rolling24h=${data.rolling_24h_target}`);
