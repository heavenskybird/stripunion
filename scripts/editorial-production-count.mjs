import fs from 'node:fs/promises';
import path from 'node:path';

const hours = Number(process.argv[2] || 24);
if (!Number.isFinite(hours) || hours <= 0) throw new Error('Window hours must be a positive number.');

const now = Date.now();
const cutoff = now - hours * 60 * 60 * 1000;
const sources = [
  { type: 'astro', dir: 'ops/editorial/publication-ledger/astro' },
  { type: 'wordpress', dir: 'ops/editorial/publication-ledger/wordpress' }
];

async function readJsonFiles(dir) {
  let names = [];
  try { names = await fs.readdir(dir); } catch { return []; }
  const rows = [];
  for (const name of names.filter((name) => name.endsWith('.json'))) {
    try {
      rows.push({ file: path.join(dir, name), data: JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) });
    } catch (error) {
      console.error(`WARN unreadable ledger ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return rows;
}

const events = [];
for (const source of sources) {
  for (const { file, data } of await readJsonFiles(source.dir)) {
    if (source.type === 'wordpress' && data.status !== 'publish') continue;
    const timestamp = source.type === 'astro' ? data.published_at : data.recorded_at;
    const epoch = Date.parse(timestamp || '');
    if (!Number.isFinite(epoch)) continue;
    events.push({
      source: source.type,
      slug: data.slug || path.basename(file, '.json'),
      title: data.title || '',
      url: data.url || '',
      published_at: new Date(epoch).toISOString(),
      in_window: epoch >= cutoff && epoch <= now
    });
  }
}

const inWindow = events.filter((event) => event.in_window).sort((a,b)=>b.published_at.localeCompare(a.published_at));
const bySource = Object.fromEntries(sources.map(({type}) => [type, inWindow.filter((event)=>event.source===type).length]));
const report = {
  generated_at: new Date(now).toISOString(),
  window_hours: hours,
  cutoff: new Date(cutoff).toISOString(),
  count: inWindow.length,
  target_24h: hours === 24 ? 120 : null,
  remaining_to_target: hours === 24 ? Math.max(0, 120 - inWindow.length) : null,
  by_source: bySource,
  publications: inWindow
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
