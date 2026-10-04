import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const guideFile = process.argv[2];
const distributionState = process.argv[3] || 'distributed';
if (!guideFile) throw new Error('Usage: node scripts/record-astro-publication.mjs <guide-file> [distribution-state]');

const absolute = path.resolve(guideFile);
const module = await import(pathToFileURL(absolute).href);
const guide = module.default;
if (!guide?.slug || !guide?.categorySlug || !guide?.title) throw new Error('Invalid guide module');

const ledgerDir = 'ops/editorial/publication-ledger/astro';
await fs.mkdir(ledgerDir, { recursive: true });
const ledgerPath = path.join(ledgerDir, guide.slug + '.json');
const now = new Date().toISOString();

let existing = null;
try { existing = JSON.parse(await fs.readFile(ledgerPath, 'utf8')); } catch {}

const entry = {
  version: 1,
  slug: guide.slug,
  title: guide.title,
  category: guide.categoryLabel,
  category_slug: guide.categorySlug,
  url: `https://stripunion.com/guides/${guide.slug}`,
  published_at: existing?.published_at || now,
  verified_at: now,
  canonical_expected: `https://stripunion.com/guides/${guide.slug}`,
  indexable_expected: true,
  distribution_state: distributionState,
  source: 'github_editorial'
};

await fs.writeFile(ledgerPath, JSON.stringify(entry, null, 2) + '\n', 'utf8');
console.log(`ASTRO_PUBLICATION_RECORDED ${ledgerPath}`);
