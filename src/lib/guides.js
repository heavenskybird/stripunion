const modules = import.meta.glob('../data/guides/*.js', { eager: true });

export const guides = Object.values(modules)
  .map((module) => module.default)
  .filter(Boolean)
  .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')) || a.title.localeCompare(b.title));

export const guideBySlug = Object.fromEntries(guides.map((guide) => [guide.slug, guide]));

export function guidesByCategory(categorySlug) {
  return guides.filter((guide) => guide.categorySlug === categorySlug);
}
