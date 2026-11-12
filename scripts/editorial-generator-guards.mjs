// Mirror the compiler's unsupported-claim guard before accepting a model batch.
// Reject rather than silently rewriting copy or weakening publication quality gates.
export const UNSUPPORTED_EDITORIAL_CLAIMS = Object.freeze([
  'best in the world',
  'guaranteed anonymous',
  'guaranteed privacy',
  'number one adult site'
]);

function textParts(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textParts).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(textParts).join(' ');
  return '';
}

export function findUnsupportedEditorialClaim(artifact) {
  const text = textParts(artifact).toLowerCase();
  return UNSUPPORTED_EDITORIAL_CLAIMS.find((phrase) => text.includes(phrase)) || null;
}

export function occupiedEditorialIdentifiers({ backlog, existingGuides, allArtifacts, selectedCategories }) {
  const labels = new Set(selectedCategories.map(c => c.name));
  const slugs = new Set(selectedCategories.map(c => c.slug));
  return [...new Set([
    ...(backlog.queue || []).filter(item => labels.has(item.category)).map(item => item.id),
    ...existingGuides.filter(guide => slugs.has(guide.categorySlug)).map(guide => guide.slug),
    ...allArtifacts.filter(row => slugs.has(row.data.categorySlug)).flatMap(row => [row.data.slug, row.data.backlogId])
  ].filter(Boolean))].sort();
}
