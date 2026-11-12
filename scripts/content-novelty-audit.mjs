import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stop = new Set('a an the and or for to of in on with before after from your you is are be it this that as by at not can may should adult platform platforms site sites guide review check practical using use'.split(' '));
const flatten = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(flatten).join(' ') : value && typeof value === 'object' ? Object.values(value).map(flatten).join(' ') : '';
const words = text => String(text).toLowerCase().replace(/<[^>]*>/g, ' ').match(/[a-z]{3,}/g)?.filter(w => !stop.has(w)) || [];
const set = text => new Set(words(text));
const jaccard = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.max(1, a.size + b.size - n); };
// Explicit editorial concepts are explanations, not inferred legal/product facts.
const concepts = {
  age_evidence: /age[- ](?:check|verification|assurance|gate)|identity document|date.of.birth/,
  data_recipient: /who (?:receives|handles)|recipient|third.party|data.*provider/,
  retention_linkage: /retention|how long|stored|storage|account link|linked to/,
  origin_verification: /genuine|verified (?:page|site|address)|verify.*(?:address|site|source)|unexpected link/,
  disclosure_decision: /disclosure|proceed.or.stop|stop.or.go|go.or.no.go|worth.*(?:information|disclos)|decline/,
  account_recovery: /account recovery|recover.*account|password reset|sign.in method/,
  payments: /payment|checkout|billing|refund|renewal/,
  affiliate_reconciliation: /postback|conversion status|attribution|reconciliation/,
  device_access: /headset|device|installation|app permission/,
  audience_language: /multilingual|language|translation/,
  session_lifetime: /session expir|sign.in persistence|session lifetime/,
  creator_business: /creator|earnings|payout|audience/
};
function tags(text) { const s = flatten(text).toLowerCase(); return new Set(Object.entries(concepts).filter(([, r]) => r.test(s)).map(([k]) => k)); }
function vector(text) { const counts = new Map(); for (const w of words(text)) counts.set(w, (counts.get(w) || 0) + 1); counts.norm = Math.sqrt([...counts.values()].reduce((n, c) => n + c * c, 0)); return counts; }
function cosine(a, b) { let dot = 0; for (const [w, count] of a) dot += count * (b.get(w) || 0); return dot / Math.max(1, a.norm * b.norm); }
export function profile(doc) {
  const sections = doc.sections || [];
  const core = doc.keyTakeaways || doc.takeaways || [];
  const intentText = [doc.title, doc.description, core];
  return { slug: doc.slug, category: doc.categorySlug || null, title: doc.title,
    titleWords: set(doc.title), intent: tags(intentText), core: tags(core),
    headings: sections.map(s => ({ heading: s.heading || s.title || '', tags: tags(s) })),
    body: vector(flatten([doc.description, core, sections])), audience: doc.categorySlug || 'unknown' };
}
export function compareNovelty(a, b) {
  const shared = [...a.intent].filter(x => b.intent.has(x));
  const intent = jaccard(a.intent, b.intent);
  const core = jaccard(a.core, b.core);
  const section = a.headings.length && b.headings.length ? a.headings.reduce((n, s) => n + Math.max(0, ...b.headings.map(t => jaccard(s.tags, t.tags))), 0) / a.headings.length : 0;
  const lexical = cosine(a.body, b.body);
  const score = 0.35 * lexical + 0.25 * intent + 0.2 * core + 0.2 * section;
  // A category or slug difference alone never establishes a new reader job.
  const review = shared.length >= 2 && lexical >= 0.42 && score >= 0.65;
  return { left: a.slug, right: b.slug, score: +score.toFixed(4), decision: review ? 'REVIEW_OVERLAP' : 'PASS_HEURISTIC',
    dimensions: { lexicalCosine: +lexical.toFixed(4), intentConceptOverlap: +intent.toFixed(4), corePointOverlap: +core.toFixed(4), sectionTaskAlignment: +section.toFixed(4) },
    sharedIntentConcepts: shared, audiences: [a.audience, b.audience],
    reasons: review ? ['Same editorial tasks recur in intent, takeaways and section content.', ...(a.audience !== b.audience ? ['Different category labels require demonstrated task-specific value; they are not a novelty exemption.'] : [])] : ['No multi-signal overlap threshold reached; this does not prove originality.'],
    reviewAction: review ? 'Review reader job and audience-specific evidence; propose a distinct decision/task or replace the draft. Never automatically rewrite/delete published work.' : null };
}
export function gateCandidate(candidate, corpus) {
  const a = profile(candidate);
  const pairs = corpus.filter(d => d.slug !== candidate.slug).map(d => compareNovelty(a, profile(d))).filter(p => p.decision === 'REVIEW_OVERLAP');
  return { decision: pairs.length ? 'REVIEW_REQUIRED' : 'PASS_HEURISTIC', publishAuthorized: false, pairs };
}
export async function auditCorpus({ root = '.', limit = 500 } = {}) {
  const dir = path.resolve(root, 'src/data/guides');
  const docs = [];
  for (const file of (await fs.readdir(dir)).filter(f => f.endsWith('.js')).sort()) {
    const doc = (await import(pathToFileURL(path.join(dir, file)).href)).default;
    docs.push(profile(doc));
  }
  const flagged = [];
  let reviewed = 0;
  for (let i = 0; i < docs.length; i++) for (let j = i + 1; j < docs.length; j++) {
    const a = docs[i], b = docs[j];
    // All pairs are considered; skip expensive text comparison only when fewer
    // than two explainable task concepts overlap (cannot meet the review rule).
    if ([...a.intent].filter(t => b.intent.has(t)).length < 2) continue;
    reviewed++;
    const pair = compareNovelty(a, b);
    if (pair.decision === 'REVIEW_OVERLAP') flagged.push(pair);
  }
  flagged.sort((a, b) => b.score - a.score || a.left.localeCompare(b.left));
  const incident = flagged.find(p => [p.left, p.right].includes('adult-games-age-check-data-review-before-browsing') && [p.left, p.right].includes('adult-shop-age-check-data-transparency-review'));
  const perGuide = {};
  for (const p of flagged) for (const slug of [p.left, p.right]) perGuide[slug] ??= { counterpart: slug === p.left ? p.right : p.left, score: p.score };
  return { version: 1, corpusSource: 'All canonical src/data/guides modules; not a fresh HTTP acceptance of every URL',
    generatedAt: new Date().toISOString(), guides: docs.length, consideredPairs: docs.length * (docs.length - 1) / 2,
    comparedPairs: reviewed, flaggedPairs: flagged.length, reportedPairs: Math.min(limit, flagged.length),
    reportLimit: limit, truncated: flagged.length > limit, knownIncident: incident || null,
    method: 'Explainable rule-based intent/core-point/section concepts plus lexical cosine; no embeddings or network calls',
    limitations: ['Human triage required; shared safety language may create false positives.', 'English concept dictionary can miss paraphrases and unfamiliar intents.', 'Scores are not Google duplicate-content judgments or proof of semantic equivalence.', 'Different audiences can justify overlap only after reviewing task-specific value.'],
    perGuideHighestRisk: perGuide, pairs: flagged.slice(0, limit) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/content-novelty-audit.mjs REPORT.json (offline only)');
  const report = await auditCorpus();
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ guides: report.guides, consideredPairs: report.consideredPairs, flaggedPairs: report.flaggedPairs, incident: report.knownIncident, report: output }));
}
