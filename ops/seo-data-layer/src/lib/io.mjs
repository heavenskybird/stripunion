import fs from 'node:fs/promises';
import path from 'node:path';

export function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function daysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return isoDate(date);
}

export async function writeSnapshot(source, date, payload) {
  const dir = path.join('data', 'raw', date);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${source}.json`);
  await fs.writeFile(target, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${target}`);
  return target;
}
