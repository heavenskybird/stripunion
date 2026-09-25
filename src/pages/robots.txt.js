import { SITE } from '../config/site.js';

export async function GET() {
  const body = SITE.allowIndexing
    ? `User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`
    : `User-agent: *
Disallow: /
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
