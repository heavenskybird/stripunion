import fs from 'node:fs/promises';
import path from 'node:path';

const dir = 'ops/social-outbox/events';
const counts = {};
const byChannel = {};

let names = [];
try {
  names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

for (const name of names) {
  const row = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
  const state = row.state || 'unknown';
  const channel = row.channel || 'unknown';
  counts[state] = (counts[state] || 0) + 1;
  byChannel[channel] ||= {};
  byChannel[channel][state] = (byChannel[channel][state] || 0) + 1;
}

console.log(JSON.stringify({ total: names.length, counts, byChannel }, null, 2));
