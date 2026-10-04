import fs from 'node:fs/promises';
import path from 'node:path';

const contentPath = process.argv[2];
if (!contentPath) {
  throw new Error('Usage: node scripts/publish-wordpress-json.mjs <content-json>');
}

const siteUrl = String(process.env.WP_SITE_URL || '').replace(/\/+$/, '');
const username = String(process.env.WP_USERNAME || '');
const appPassword = String(process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');

if (!siteUrl || !username || !appPassword) {
  throw new Error('WP_SITE_URL, WP_USERNAME and WP_APP_PASSWORD are required');
}

const absolute = path.resolve(contentPath);
const payload = JSON.parse(await fs.readFile(absolute, 'utf8'));

for (const field of ['title', 'slug', 'content', 'excerpt']) {
  if (!payload[field] || typeof payload[field] !== 'string') {
    throw new Error('WordPress editorial payload missing required string field: ' + field);
  }
}

const auth = Buffer.from(username + ':' + appPassword).toString('base64');
const headers = {
  'Authorization': 'Basic ' + auth,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'User-Agent': 'StripUnion-Editorial-Publisher/1.0'
};

async function wp(pathname, options = {}) {
  const response = await fetch(siteUrl + pathname, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error('WordPress REST failed with HTTP ' + response.status + ': ' + (data?.message || 'unknown error'));
  }
  return data;
}

const existing = await wp('/wp-json/wp/v2/posts?slug=' + encodeURIComponent(payload.slug) + '&context=edit&per_page=1');
const body = {
  title: payload.title,
  slug: payload.slug,
  excerpt: payload.excerpt,
  content: payload.content,
  status: payload.status || 'publish'
};

if (Array.isArray(payload.categories) && payload.categories.length) {
  body.categories = payload.categories;
}
if (Array.isArray(payload.tags) && payload.tags.length) {
  body.tags = payload.tags;
}

let post;
if (Array.isArray(existing) && existing.length) {
  post = await wp('/wp-json/wp/v2/posts/' + existing[0].id, {
    method: 'POST',
    body: JSON.stringify(body)
  });
} else {
  post = await wp('/wp-json/wp/v2/posts', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

if (!post?.id || !post?.link) {
  throw new Error('WordPress REST returned no post id/link');
}

console.log(JSON.stringify({
  ok: true,
  id: post.id,
  status: post.status,
  link: post.link,
  slug: post.slug,
  sourceFile: contentPath
}, null, 2));
