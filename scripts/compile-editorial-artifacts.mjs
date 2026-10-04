import fs from 'node:fs/promises';
import path from 'node:path';
import { categories } from '../src/data/categories.js';

const artifactDir = 'ops/editorial/content-artifacts';
const outputDir = 'src/data/guides';
const checkOnly = process.argv.includes('--check');
const explicitFiles = process.argv.filter((arg) => arg.endsWith('.json'));

function fail(message) {
  throw new Error(message);
}

function words(value) {
  const text = Array.isArray(value)
    ? value.map(wordsSource).join(' ')
    : wordsSource(value);
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

function wordsSource(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(wordsSource).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(wordsSource).join(' ');
  return '';
}

function validateArtifact(artifact, file) {
  const required = ['backlogId','slug','categorySlug','categoryLabel','title','description','excerpt','publishedAt','keyTakeaways','sections'];
  for (const key of required) {
    if (artifact[key] == null || artifact[key] === '') fail(`${file}: missing ${key}`);
  }
  if (!/^[a-z0-9-]+$/.test(artifact.slug)) fail(`${file}: slug must be kebab-case`);
  if (!categories.some((category) => category.slug === artifact.categorySlug)) fail(`${file}: unknown categorySlug ${artifact.categorySlug}`);
  if (!Array.isArray(artifact.keyTakeaways) || artifact.keyTakeaways.length < 4) fail(`${file}: require at least 4 key takeaways`);
  if (!Array.isArray(artifact.sections) || artifact.sections.length < 5) fail(`${file}: require at least 5 sections`);
  if (!artifact.sections.some((section) => section.table || (section.bullets && section.bullets.length >= 3))) fail(`${file}: require a table or useful checklist`);
  if (!Array.isArray(artifact.faqs) || artifact.faqs.length < 3) fail(`${file}: require at least 3 FAQs`);
  const substantiveWords = words({keyTakeaways:artifact.keyTakeaways,sections:artifact.sections,faqs:artifact.faqs});
  if (substantiveWords < 650) fail(`${file}: only ${substantiveWords} substantive words; require >= 650`);

  const evidence = artifact.evidence || {};
  const volatileClaims = Array.isArray(evidence.volatileClaims) ? evidence.volatileClaims : [];
  const officialSources = Array.isArray(evidence.officialSources) ? evidence.officialSources : [];
  if (volatileClaims.length && !officialSources.length) fail(`${file}: volatile claims require officialSources`);

  for (const forbidden of ['best in the world','guaranteed anonymous','guaranteed privacy','number one adult site']) {
    if (wordsSource(artifact).toLowerCase().includes(forbidden)) fail(`${file}: unsupported superlative or guarantee: ${forbidden}`);
  }

  return substantiveWords;
}

async function artifactFiles() {
  if (explicitFiles.length) return explicitFiles;
  let names = [];
  try {
    names = await fs.readdir(artifactDir);
  } catch {
    return [];
  }
  return names.filter((name) => name.endsWith('.json')).sort().map((name) => path.join(artifactDir, name));
}

const files = await artifactFiles();
if (!files.length) {
  console.log('EDITORIAL_ARTIFACTS none');
  process.exit(0);
}

await fs.mkdir(outputDir, { recursive: true });

for (const file of files) {
  const artifact = JSON.parse(await fs.readFile(file, 'utf8'));
  const wordCount = validateArtifact(artifact, file);
  const guide = {
    slug: artifact.slug,
    categorySlug: artifact.categorySlug,
    categoryLabel: artifact.categoryLabel,
    title: artifact.title,
    description: artifact.description,
    excerpt: artifact.excerpt,
    publishedAt: artifact.publishedAt,
    updatedAt: artifact.updatedAt || artifact.publishedAt,
    keyTakeaways: artifact.keyTakeaways,
    sections: artifact.sections,
    faqs: artifact.faqs
  };
  const target = path.join(outputDir, artifact.slug + '.js');
  if (!checkOnly) {
    await fs.writeFile(target, 'export default ' + JSON.stringify(guide, null, 2) + ';\n', 'utf8');
  }
  console.log(`EDITORIAL_ARTIFACT_VALID backlog=${artifact.backlogId} slug=${artifact.slug} words=${wordCount} mode=${checkOnly ? 'check' : 'compile'}`);
}
