/**
 * Read-only affiliate exit coverage inventory for shared Astro guides.
 * Run after building: node scripts/affiliate-coverage-audit.mjs
 * Source-only fallback is explicitly not a rendered/live audit.
 * Prints only page paths and categories, never tracked URLs or userId values.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootArg = process.argv.find((arg) => arg.startsWith('--root='));
const root = rootArg ? path.resolve(rootArg.slice(7)) : repoRoot;

async function files(dir, suffix) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const children = await Promise.all(entries.map((entry) => {
      const p = path.join(dir, entry.name);
      return entry.isDirectory() ? files(p, suffix) :
        Promise.resolve(entry.isFile() && entry.name.endsWith(suffix) ? [p] : []);
    }));
    return children.flat().sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function classifyCompiled(html) {
  const article = html.match(/<article\b[^>]*class=["'][^"']*guide-body[^"']*["'][^>]*>([\s\S]*?)<\/article>/i);
  if (!article) return 'article_scope_unknown';
  const anchors = article[1].match(/<a\b[^>]*>/gi) || [];
  const paid = anchors.filter((anchor) => {
    if (/data-affiliate-partner\s*=/i.test(anchor)) return true;
    return /href=["']https:\/\/(?:go\.whitetrafsa\.com\/|stripcash\.com\/sign-up\/stripunion(?:[\/?"'])|bongacams4\.com\/track\?)/i.test(anchor);
  });
  return paid.length ? 'contextual_affiliate_present' : 'no_contextual_affiliate';
}

const sourceFiles = await files(path.join(root, 'src/data/guides'), '.js');
const categoryBySlug = new Map();
for (const source of sourceFiles) {
  const data = await fs.readFile(source, 'utf8');
  const slug = data.match(/["']slug["']\s*:\s*["']([^"']+)["']/)?.[1] || path.basename(source, '.js');
  const category = data.match(/["']categorySlug["']\s*:\s*["']([^"']+)["']/)?.[1] || 'unknown';
  categoryBySlug.set(slug, category);
}
const template = await fs.readFile(path.join(root, 'src/components/GuideTemplate.astro'), 'utf8').catch(() => '');
const templateHasDirectCta = /<(?:AffiliateButton|StripCashReferralButton)\b|data-affiliate-partner\s*=/.test(template);
const compiled = (await files(path.join(root, 'dist/guides'), '.html')).filter((f) =>
  path.basename(f) === 'index.html' && path.relative(path.join(root, 'dist/guides'), f).split(path.sep).length > 1
);
const mode = compiled.length ? 'compiled_article_html' : 'source_template_inference';
const rows = [];

if (compiled.length) {
  for (const f of compiled) {
    const slug = path.relative(path.join(root, 'dist/guides'), path.dirname(f)).split(path.sep)[0];
    const html = await fs.readFile(f, 'utf8');
    rows.push({ slug, category: categoryBySlug.get(slug) || 'unknown', state: classifyCompiled(html) });
  }
} else {
  for (const [slug, category] of categoryBySlug) {
    rows.push({ slug, category, state: templateHasDirectCta ? 'dynamic_template_unverified' : 'no_contextual_affiliate_in_shared_template' });
  }
}

const byCategory = new Map();
for (const row of rows) {
  const summary = byCategory.get(row.category) || { category: row.category, total: 0, contextualPaid: 0, missingOrUnknown: 0 };
  summary.total += 1;
  if (row.state === 'contextual_affiliate_present') summary.contextualPaid += 1;
  else summary.missingOrUnknown += 1;
  byCategory.set(row.category, summary);
}

console.log(JSON.stringify({
  schemaVersion: 1,
  source: mode,
  sourceGuideFiles: sourceFiles.length,
  compiledGuidePages: compiled.length,
  sharedGuideTemplateDirectCta: templateHasDirectCta,
  assessed: rows.length,
  contextualAffiliatePresent: rows.filter((r) => r.state === 'contextual_affiliate_present').length,
  missingOrUnknown: rows.filter((r) => r.state !== 'contextual_affiliate_present').length,
  byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)),
  examples: rows.filter((r) => r.state !== 'contextual_affiliate_present').slice(0, 12),
  caveat: 'Audit lead only: many neutral guides should not have unrelated affiliate links. Confirm topical relevance, exact approved partner and commission attribution. Source inference is not a live deployment test.'
}, null, 2));
