import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { categories } from '../src/data/categories.js';

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.EDITORIAL_MODEL || 'gpt-6-luna';
const batchSize = Number(process.env.EDITORIAL_BATCH_SIZE || 5);
const artifactDir = 'ops/editorial/content-artifacts';
const guideDir = 'src/data/guides';
const ledgerDir = 'ops/editorial/publication-ledger/astro';
const backlogPath = 'ops/editorial/hourly-backlog.json';

if (!apiKey) throw new Error('OPENAI_API_KEY is required for autonomous editorial generation.');
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 8) {
  throw new Error('EDITORIAL_BATCH_SIZE must be an integer between 1 and 8.');
}

const stopWords = new Set([
  'a','an','and','are','as','at','be','by','for','from','guide','how','in','into','is','it','of','on','or',
  'site','sites','the','to','vs','with','your','adult','platform','platforms'
]);

function tokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function wordCount(value) {
  const text = typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value.map(wordCountSource).join(' ')
      : wordCountSource(value);
  return text.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

function wordCountSource(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(wordCountSource).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(wordCountSource).join(' ');
  return '';
}

async function listFiles(dir, suffix) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith(suffix)).sort();
  } catch {
    return [];
  }
}

async function loadExistingGuides() {
  const rows = [];
  for (const name of await listFiles(guideDir, '.js')) {
    try {
      const module = await import(pathToFileURL(path.resolve(guideDir, name)).href + '?v=' + Date.now());
      const guide = module.default;
      if (!guide?.slug || !guide?.title) continue;
      rows.push({
        slug: guide.slug,
        title: guide.title,
        description: guide.description || '',
        categorySlug: guide.categorySlug || '',
        headings: Array.isArray(guide.sections) ? guide.sections.map((section) => section.heading || '').join(' ') : ''
      });
    } catch {}
  }
  return rows;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function loadLedgerCounts() {
  const counts = Object.fromEntries(categories.map((category) => [category.slug, 0]));
  for (const name of await listFiles(ledgerDir, '.json')) {
    try {
      const row = await readJson(path.join(ledgerDir, name));
      if (row?.category_slug && Object.hasOwn(counts, row.category_slug)) counts[row.category_slug] += 1;
    } catch {}
  }
  return counts;
}

function rotateTie(categorySlug) {
  const key = new Date().toISOString().slice(0, 13) + ':' + categorySlug;
  let hash = 0;
  for (const char of key) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return hash;
}

function extractOutputText(response) {
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function parseJsonText(text) {
  const trimmed = text.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/i, '');
  return JSON.parse(trimmed);
}

function artifactSignature(artifact) {
  const headings = (artifact.sections || []).map((section) => section.heading || '').join(' ');
  return tokens([artifact.title, artifact.description, artifact.excerpt, headings].join(' '));
}

function validateBatch(payload, selectedCategories, existingGuides, existingBacklogIds, existingSlugs) {
  const errors = [];
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : [];
  if (artifacts.length !== selectedCategories.length) {
    errors.push('Expected exactly ' + selectedCategories.length + ' artifacts, received ' + artifacts.length + '.');
    return { errors, artifacts };
  }

  const selected = new Set(selectedCategories.map((category) => category.slug));
  const seenCategories = new Set();
  const seenSlugs = new Set();
  const seenBacklogIds = new Set();
  const existingSignatures = existingGuides.map((guide) => ({
    slug: guide.slug,
    signature: tokens([guide.title, guide.description, guide.headings].join(' '))
  }));

  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== 'object') {
      errors.push('Artifact is not an object.');
      continue;
    }

    if (!selected.has(artifact.categorySlug)) errors.push('Unexpected categorySlug: ' + artifact.categorySlug);
    if (seenCategories.has(artifact.categorySlug)) errors.push('Duplicate category in batch: ' + artifact.categorySlug);
    seenCategories.add(artifact.categorySlug);

    if (!/^[a-z0-9-]+$/.test(artifact.slug || '')) errors.push('Invalid slug: ' + artifact.slug);
    if (!/^[a-z0-9-]+$/.test(artifact.backlogId || '')) errors.push('Invalid backlogId: ' + artifact.backlogId);
    if (existingSlugs.has(artifact.slug) || seenSlugs.has(artifact.slug)) errors.push('Duplicate slug: ' + artifact.slug);
    if (existingBacklogIds.has(artifact.backlogId) || seenBacklogIds.has(artifact.backlogId)) errors.push('Duplicate backlogId: ' + artifact.backlogId);
    seenSlugs.add(artifact.slug);
    seenBacklogIds.add(artifact.backlogId);

    if (!Array.isArray(artifact.keyTakeaways) || artifact.keyTakeaways.length < 4) errors.push(artifact.slug + ': fewer than 4 keyTakeaways.');
    if (!Array.isArray(artifact.sections) || artifact.sections.length < 5) errors.push(artifact.slug + ': fewer than 5 sections.');
    if (!Array.isArray(artifact.faqs) || artifact.faqs.length < 3) errors.push(artifact.slug + ': fewer than 3 FAQs.');
    if (!(artifact.sections || []).some((section) => section.table || (Array.isArray(section.bullets) && section.bullets.length >= 3))) {
      errors.push(artifact.slug + ': requires a table or useful checklist.');
    }

    const substantiveWords = wordCount({
      keyTakeaways: artifact.keyTakeaways,
      sections: artifact.sections,
      faqs: artifact.faqs
    });
    if (substantiveWords < 700) errors.push(artifact.slug + ': only ' + substantiveWords + ' substantive words; require >= 700.');

    const signature = artifactSignature(artifact);
    for (const existing of existingSignatures) {
      const score = jaccard(signature, existing.signature);
      if (score >= 0.42) {
        errors.push(artifact.slug + ': semantic-overlap risk ' + score.toFixed(2) + ' with existing ' + existing.slug);
        break;
      }
    }
  }

  return { errors, artifacts };
}

const existingGuides = await loadExistingGuides();
const ledgerCounts = await loadLedgerCounts();
const guideCounts = Object.fromEntries(categories.map((category) => [category.slug, 0]));
for (const guide of existingGuides) {
  if (guide.categorySlug && Object.hasOwn(guideCounts, guide.categorySlug)) guideCounts[guide.categorySlug] += 1;
}

const selectedCategories = [...categories]
  .sort((a, b) => {
    const aScore = (ledgerCounts[a.slug] || 0) * 4 + (guideCounts[a.slug] || 0);
    const bScore = (ledgerCounts[b.slug] || 0) * 4 + (guideCounts[b.slug] || 0);
    return aScore - bScore || rotateTie(a.slug) - rotateTie(b.slug);
  })
  .slice(0, batchSize);

const backlog = await readJson(backlogPath);
const existingBacklogIds = new Set((backlog.queue || []).map((item) => item.id));
const existingSlugs = new Set(existingGuides.map((guide) => guide.slug));
for (const name of await listFiles(artifactDir, '.json')) {
  try {
    const artifact = await readJson(path.join(artifactDir, name));
    if (artifact?.slug) existingSlugs.add(artifact.slug);
    if (artifact?.backlogId) existingBacklogIds.add(artifact.backlogId);
  } catch {}
}

const existingTitleContext = existingGuides
  .slice(-180)
  .map((guide) => ({ slug: guide.slug, categorySlug: guide.categorySlug, title: guide.title }));

const systemPrompt = [
  'You are the non-explicit editorial production worker for StripUnion.',
  'Create useful adult-industry decision-support content, not erotic content.',
  'Never include graphic sexual descriptions, sexual roleplay, explicit arousal-oriented prose, or any content involving minors.',
  'Focus on privacy, safety, payments, device use, discovery, product/platform selection, creator business operations, affiliate/webmaster operations, or practical purchasing decisions.',
  'Do not invent prices, traffic, payout rates, rankings, testimonials, tests, legal guarantees, medical claims, or platform capabilities.',
  'Do not name a specific company, product, performer, creator, or affiliate program unless the prompt explicitly supplies verified facts for it.',
  'For this autonomous batch, use evergreen claims only. Do not make volatile platform-specific claims.',
  'Each article must solve a genuinely distinct search/user job and must not be a near-duplicate of existing content.',
  'Return JSON only. No markdown fences or commentary.'
].join('\n');

const schemaHint = {
  artifacts: [
    {
      backlogId: 'kebab-case-id',
      slug: 'kebab-case-canonical-slug',
      categorySlug: 'one selected category slug',
      categoryLabel: 'selected category label',
      title: 'SEO/editorial title',
      description: 'SEO meta description',
      excerpt: 'short editorial excerpt',
      keyTakeaways: ['at least 4 useful takeaways'],
      sections: [
        {
          heading: 'H2-style heading',
          paragraphs: ['two or more substantive paragraphs'],
          bullets: ['optional checklist items'],
          table: {
            caption: 'optional useful comparison table',
            headers: ['Column A', 'Column B'],
            rows: [['value', 'value']]
          }
        }
      ],
      faqs: [{ question: 'question', answer: 'answer' }]
    }
  ]
};

let lastErrors = [];
let accepted = null;

for (let attempt = 1; attempt <= 3; attempt += 1) {
  const userPrompt = [
    'Generate exactly ' + selectedCategories.length + ' original editorial artifacts, one for each selected category below.',
    '',
    'Selected categories:',
    JSON.stringify(selectedCategories.map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      factors: category.factors
    })), null, 2),
    '',
    'Existing published/current titles to avoid cannibalizing:',
    JSON.stringify(existingTitleContext, null, 2),
    '',
    'Required JSON shape:',
    JSON.stringify(schemaHint, null, 2),
    '',
    'Quality requirements:',
    '- At least 700 substantive words per artifact across takeaways, sections and FAQs.',
    '- At least 5 substantive sections.',
    '- At least one genuinely useful table or checklist.',
    '- At least 3 FAQs.',
    '- Mobile-scannable paragraphs and headings.',
    '- Distinct search intent for every article.',
    '- No generic filler such as merely saying users should research a topic.',
    '- No affiliate payout, price, popularity, performance or capability claims.',
    '- No explicit sexual prose.',
    '',
    lastErrors.length ? 'Previous attempt failed these checks; fix them:\n' + lastErrors.join('\n') : ''
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      instructions: systemPrompt,
      input: userPrompt,
      max_output_tokens: 20000,
      store: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error('OpenAI Responses API failed: ' + response.status + ' ' + body.slice(0, 1200));
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  if (!outputText) {
    lastErrors = ['Model returned no output text.'];
    continue;
  }

  let payload;
  try {
    payload = parseJsonText(outputText);
  } catch (error) {
    lastErrors = ['Invalid JSON: ' + error.message];
    continue;
  }

  const validation = validateBatch(payload, selectedCategories, existingGuides, existingBacklogIds, existingSlugs);
  if (!validation.errors.length) {
    accepted = validation.artifacts;
    break;
  }
  lastErrors = validation.errors.slice(0, 16);
}

if (!accepted) {
  throw new Error('Unable to generate a valid non-cannibalizing editorial batch after retries:\n' + lastErrors.join('\n'));
}

await fs.mkdir(artifactDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const selectedBySlug = new Map(selectedCategories.map((category) => [category.slug, category]));

for (const raw of accepted) {
  const category = selectedBySlug.get(raw.categorySlug);
  const artifact = {
    ...raw,
    categoryLabel: category.name,
    publishedAt: today,
    updatedAt: today,
    evidence: {
      class: 'evergreen_nonexplicit_editorial_framework',
      volatileClaims: [],
      officialSources: [],
      notes: 'Autonomous producer is restricted to evergreen, non-platform-specific claims in this batch.'
    }
  };

  const file = path.join(artifactDir, artifact.backlogId + '.json');
  await fs.writeFile(file, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

  backlog.queue.push({
    id: artifact.backlogId,
    category: category.name,
    intent: artifact.title,
    surface: 'main',
    priority: 95,
    status: 'ready',
    source_requirements: [
      'evergreen claims only; official/stable sources required before adding future volatile platform-specific claims'
    ],
    monetization: 'contextual_or_approved_offers_only',
    notes: 'Generated by the first-party hourly producer; must pass compiler, build and visual QA before production.'
  });
}

backlog.updated_at = today;
await fs.writeFile(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');

console.log('EDITORIAL_BATCH_GENERATED ' + JSON.stringify({
  model,
  count: accepted.length,
  categories: selectedCategories.map((category) => category.slug),
  artifacts: accepted.map((artifact) => artifact.backlogId)
}));
