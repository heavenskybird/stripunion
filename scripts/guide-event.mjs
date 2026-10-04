import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/guide-event.mjs <guide-module>');

const absolute = path.resolve(file);
const module = await import(pathToFileURL(absolute).href);
const guide = module.default;

if (!guide?.slug || !guide?.title || !guide?.excerpt) {
  throw new Error(`Invalid guide module: ${file}`);
}

process.stdout.write(JSON.stringify({
  title: guide.title,
  url: `https://stripunion.com/guides/${guide.slug}`,
  excerpt: guide.excerpt,
  post_id: guide.slug,
  source: 'github_editorial'
}));
