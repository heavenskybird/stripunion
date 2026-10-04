import fs from 'node:fs/promises';
import path from 'node:path';
import { generateEditorialCoverPng } from './wordpress-cover.mjs';

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
const baseHeaders = {
  'Authorization': 'Basic ' + auth,
  'Accept': 'application/json',
  'User-Agent': 'StripUnion-Editorial-Publisher/2.0'
};

async function wp(pathname, options = {}, { allowFailure = false } = {}) {
  const headers = { ...baseHeaders, ...(options.headers || {}) };
  const response = await fetch(siteUrl + pathname, {
    ...options,
    headers,
    signal: AbortSignal.timeout(20000)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok && !allowFailure) {
    throw new Error('WordPress REST failed with HTTP ' + response.status + ': ' + (data?.message || text || 'unknown error'));
  }

  return { ok: response.ok, status: response.status, data, headers: response.headers };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function resolveTerms(type, values = [], createMissing = false) {
  if (!Array.isArray(values) || values.length === 0) return [];

  const endpoint = type === 'category' ? 'categories' : 'tags';
  const ids = [];

  for (const value of values) {
    if (Number.isInteger(value) || /^\d+$/.test(String(value))) {
      ids.push(Number(value));
      continue;
    }

    const name = String(value).trim();
    if (!name) continue;
    const expectedSlug = slugify(name);

    const found = await wp(
      '/wp-json/wp/v2/' + endpoint + '?search=' + encodeURIComponent(name) + '&per_page=100&context=edit'
    );

    const exact = Array.isArray(found.data)
      ? found.data.find((item) =>
          String(item.name || '').toLowerCase() === name.toLowerCase() ||
          String(item.slug || '').toLowerCase() === expectedSlug
        )
      : null;

    if (exact?.id) {
      ids.push(exact.id);
      continue;
    }

    if (!createMissing) {
      throw new Error('WordPress ' + type + ' not found: ' + name + '. Set create_missing_terms=true to allow controlled creation.');
    }

    const created = await wp('/wp-json/wp/v2/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: expectedSlug })
    });

    if (!created.data?.id) {
      throw new Error('Failed to create WordPress ' + type + ': ' + name);
    }
    ids.push(created.data.id);
  }

  return [...new Set(ids)];
}

function ensureCrossSiteLinks(html, links = []) {
  const normalized = Array.isArray(links) ? links.filter((link) => link?.title && link?.url) : [];
  const hasMainLink = /https:\/\/stripunion\.com\//i.test(html);

  if (!normalized.length && hasMainLink) return html;

  const finalLinks = [...normalized];
  if (!hasMainLink && !finalLinks.some((link) => /^https:\/\/stripunion\.com\//i.test(link.url))) {
    finalLinks.push({
      title: 'Explore more StripUnion guides',
      url: 'https://stripunion.com/guides/'
    });
  }

  if (!finalLinks.length) return html;

  const list = finalLinks
    .map((link) => '<li><a href="' + String(link.url).replace(/"/g, '&quot;') + '">' +
      String(link.title).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</a></li>')
    .join('');

  return html + '\n<section class="su-related-guides"><h2>Continue your research</h2><ul>' + list + '</ul></section>';
}

async function uploadFeaturedImage(post, featured) {
  if (!featured || featured === false) return post.featured_media || 0;

  if (post.featured_media && !featured.replace) {
    return post.featured_media;
  }

  let bytes;
  let filename;
  let mime;

  if (featured.repo_path) {
    const filePath = path.resolve(featured.repo_path);
    bytes = await fs.readFile(filePath);
    filename = path.basename(filePath);
    const ext = path.extname(filename).toLowerCase();
    mime = ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  } else if (featured.source_url) {
    const response = await fetch(featured.source_url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Featured image download failed with HTTP ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    const url = new URL(featured.source_url);
    filename = path.basename(url.pathname) || payload.slug + '-featured.png';
    mime = response.headers.get('content-type') || 'image/png';
  } else {
    bytes = generateEditorialCoverPng(payload.slug + '|' + payload.title);
    filename = payload.slug + '-editorial-cover.png';
    mime = 'image/png';
  }

  const media = await wp('/wp-json/wp/v2/media', {
    method: 'POST',
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'attachment; filename="' + filename.replace(/"/g, '') + '"'
    },
    body: bytes
  });

  if (!media.data?.id) {
    throw new Error('WordPress media upload returned no media id');
  }

  const alt = String(featured.alt_text || ('Editorial illustration for ' + payload.title));
  const title = String(featured.title || payload.title);
  await wp('/wp-json/wp/v2/media/' + media.data.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      alt_text: alt,
      title,
      caption: featured.caption || ''
    })
  });

  return media.data.id;
}

async function tryYoastMeta(postId, seo = {}) {
  const title = seo.title || payload.seo_title;
  const description = seo.description || payload.meta_description;
  const focusKeyword = seo.focus_keyword || payload.focus_keyword;

  if (!title && !description && !focusKeyword) {
    return { attempted: false, writable: false, reason: 'not_requested' };
  }

  const meta = {};
  if (title) meta._yoast_wpseo_title = title;
  if (description) meta._yoast_wpseo_metadesc = description;
  if (focusKeyword) meta._yoast_wpseo_focuskw = focusKeyword;

  const result = await wp('/wp-json/wp/v2/posts/' + postId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta })
  }, { allowFailure: true });

  if (!result.ok) {
    return { attempted: true, writable: false, reason: 'rest_meta_not_writable', status: result.status };
  }

  const returned = result.data?.meta || {};
  const writable = Object.keys(meta).some((key) => returned[key] === meta[key]);
  return {
    attempted: true,
    writable,
    reason: writable ? 'updated' : 'not_exposed_by_wordpress_rest'
  };
}

function writeGithubOutput(values) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const lines = Object.entries(values)
    .map(([key, value]) => key + '=' + String(value ?? '').replace(/\r?\n/g, ' '))
    .join('\n') + '\n';
  return fs.appendFile(target, lines);
}

const createMissingTerms = payload.create_missing_terms === true;
const categories = await resolveTerms('category', payload.categories, createMissingTerms);
const tags = await resolveTerms('tag', payload.tags, createMissingTerms);
const content = ensureCrossSiteLinks(payload.content, payload.related_links);

const existingResponse = await wp('/wp-json/wp/v2/posts?slug=' + encodeURIComponent(payload.slug) + '&context=edit&per_page=1&status=any');
const existing = Array.isArray(existingResponse.data) ? existingResponse.data[0] : null;

const body = {
  title: payload.title,
  slug: payload.slug,
  excerpt: payload.excerpt,
  content,
  status: payload.status || 'publish'
};

if (categories.length) body.categories = categories;
if (tags.length) body.tags = tags;

let post;
if (existing?.id) {
  const updated = await wp('/wp-json/wp/v2/posts/' + existing.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  post = updated.data;
} else {
  const created = await wp('/wp-json/wp/v2/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  post = created.data;
}

if (!post?.id) {
  throw new Error('WordPress REST returned no post id');
}

const featuredMedia = await uploadFeaturedImage(post, payload.featured_image);
if (featuredMedia && featuredMedia !== post.featured_media) {
  const updated = await wp('/wp-json/wp/v2/posts/' + post.id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ featured_media: featuredMedia })
  });
  post = updated.data;
}

const yoast = await tryYoastMeta(post.id, payload.seo || {});

const result = {
  ok: true,
  action: existing?.id ? 'updated' : 'created',
  id: post.id,
  status: post.status,
  link: post.link || '',
  slug: post.slug,
  featured_media: featuredMedia || post.featured_media || 0,
  categories,
  tags,
  yoast,
  sourceFile: contentPath
};

await writeGithubOutput({
  post_id: result.id,
  post_status: result.status,
  post_link: result.link,
  post_slug: result.slug,
  post_action: result.action,
  featured_media: result.featured_media,
  yoast_writable: result.yoast.writable
});

console.log(JSON.stringify(result, null, 2));
