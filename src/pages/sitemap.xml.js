import { SITE } from '../config/site.js';
import { categories } from '../data/categories.js';
import { reviews } from '../data/reviews.js';
import { vrReviews } from '../data/reviews-vr.js';

const allReviews = { ...reviews, ...vrReviews };

const staticPaths = [
  '/',
  '/categories',
  '/about',
  '/editorial-policy',
  '/affiliate-disclosure',
  '/privacy-policy',
  '/terms',
  '/disclaimer',
  '/age-verification',
  '/stripchat-vs-chaturbate'
];

export async function GET() {
  const paths = [
    ...staticPaths,
    ...categories.map((item) => `/${item.slug}`),
    ...Object.values(allReviews)
      .filter((item) => item.indexable)
      .map((item) => `/${item.slug}`)
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...new Set(paths)].map((path) => `  <url><loc>${new URL(path, SITE.url).toString()}</loc></url>`).join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
}
