import { categories, categoryBySlug } from '../../data/categories.js';

export function getStaticPaths() {
  return categories.map((category) => ({
    params: { category: category.slug }
  }));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET({ params }) {
  const category = categoryBySlug[params.category];
  if (!category) return new Response('Not found', { status: 404 });

  const label = escapeXml(category.name);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="' + label + ' editorial guide cover">' +
    '<defs>' +
      '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16111d"/><stop offset="1" stop-color="#2b2036"/></linearGradient>' +
      '<radialGradient id="r" cx="80%" cy="20%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity=".17"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>' +
    '</defs>' +
    '<rect width="1200" height="630" rx="36" fill="url(#g)"/>' +
    '<rect width="1200" height="630" rx="36" fill="url(#r)"/>' +
    '<circle cx="980" cy="120" r="170" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2"/>' +
    '<circle cx="1020" cy="160" r="105" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="2"/>' +
    '<path d="M90 470 C260 390 370 530 560 440 S850 330 1110 420" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="4"/>' +
    '<text x="90" y="210" fill="#ffffff" font-size="32" font-family="Arial, Helvetica, sans-serif" letter-spacing="3">STRIPUNION EDITORIAL</text>' +
    '<text x="90" y="310" fill="#ffffff" font-size="72" font-weight="700" font-family="Arial, Helvetica, sans-serif">' + label + '</text>' +
    '<text x="90" y="380" fill="#ffffff" fill-opacity=".72" font-size="30" font-family="Arial, Helvetica, sans-serif">Practical decision-support for adults 18+</text>' +
  '</svg>';

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}
