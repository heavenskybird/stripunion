import { createBufferPost } from './buffer.mjs';

function stripHtml(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    return path.split('/').filter(Boolean).pop() || 'home';
  } catch {
    return 'content';
  }
}

function trackedUrl(rawUrl, slug) {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', 'x');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'wp_publish');
  url.searchParams.set('utm_content', slug);
  return url.toString();
}

function chooseAngle(title, excerpt) {
  const haystack = `${title} ${excerpt}`.toLowerCase();

  if (/privacy|safe|safety|security/.test(haystack)) {
    return 'Safety';
  }
  if (/free|pricing|price|token|cost/.test(haystack)) {
    return 'Value';
  }
  if (/\bvs\b|versus|compare|comparison|alternative/.test(haystack)) {
    return 'Compare';
  }
  if (/mobile|app|phone|android|iphone/.test(haystack)) {
    return 'Mobile';
  }
  return 'Guide';
}

function buildCopy({ title, excerpt, url }) {
  const cleanTitle = stripHtml(title);
  const cleanExcerpt = stripHtml(excerpt);
  const slug = slugFromUrl(url);
  const link = trackedUrl(url, slug);
  const angle = chooseAngle(cleanTitle, cleanExcerpt);

  const leads = {
    Safety: 'Before choosing an adult platform, privacy and account security matter.',
    Value: '“Free” and “paid” can mean very different things across adult platforms.',
    Compare: 'Similar adult platforms can differ sharply in access, usability and paid interaction.',
    Mobile: 'A platform that works on desktop is not always the best mobile experience.',
    Guide: 'Adult platforms are easier to compare when you focus on practical trade-offs.'
  };

  const lead = leads[angle];
  const available = 255 - link.length - lead.length - 6;
  const detailSource = cleanExcerpt || cleanTitle;
  const detail = detailSource.length > available
    ? detailSource.slice(0, Math.max(0, available - 1)).trimEnd() + '…'
    : detailSource;

  return `${lead} ${detail}\n\n${link}`.trim();
}

function readEvent() {
  const raw = process.env.SOCIAL_EVENT_JSON;
  if (!raw) throw new Error('SOCIAL_EVENT_JSON is required');
  const event = JSON.parse(raw);

  for (const field of ['title', 'url']) {
    if (!event[field]) throw new Error(`Event missing ${field}`);
  }

  return event;
}

const event = readEvent();
const text = buildCopy(event);
const post = await createBufferPost({ text, mode: 'addToQueue' });

console.log(JSON.stringify({
  ok: true,
  source: event.source || 'unknown',
  sourceId: event.post_id || event.postId || null,
  bufferPostId: post.id,
  dueAt: post.dueAt,
  channelId: post.channelId
}, null, 2));
