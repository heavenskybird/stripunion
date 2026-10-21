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
