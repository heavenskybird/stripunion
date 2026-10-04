import fs from 'node:fs/promises';
import path from 'node:path';

const sourcePath = process.argv[2];
const resultPath = process.argv[3];

if (!sourcePath || !resultPath) {
  throw new Error('Usage: node scripts/record-wordpress-publication.mjs <source-json> <result-json>');
}

const source = JSON.parse(await fs.readFile(path.resolve(sourcePath), 'utf8'));
const result = JSON.parse(await fs.readFile(path.resolve(resultPath), 'utf8'));

const dir = path.resolve('ops/editorial/publication-ledger/wordpress');
await fs.mkdir(dir, { recursive: true });

const record = {
  recorded_at: new Date().toISOString(),
  source_file: sourcePath,
  title: source.title,
  slug: result.slug || source.slug,
  post_id: result.id,
  status: result.status,
  url: result.link,
  action: result.action,
  categories: result.categories || [],
  tags: result.tags || [],
  featured_media: result.featured_media || 0,
  yoast: result.yoast || null,
  distribution: result.status === 'publish'
    ? 'StripUnion Growth Bridge first-publish hook -> social-distribution.yml -> Buffer/X + Telegram'
    : 'not_triggered_for_non_public_status'
};

const target = path.join(dir, (result.slug || source.slug) + '.json');
await fs.writeFile(target, JSON.stringify(record, null, 2) + '\n', 'utf8');
console.log(target);
