// Only editorial dates backed by content; never use build time as lastmod.
export function contentLastmod(item, now = new Date()) {
  for (const candidate of [item.updatedAt, item.publishedAt]) {
    if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) continue;
    const date = new Date(candidate + 'T00:00:00Z');
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === candidate && date <= now) return candidate;
  }
  return null;
}
