import fs from 'node:fs/promises';
import path from 'node:path';
import { createBufferPost } from '../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../ops/seo-data-layer/src/distribution/telegram.mjs';

const outboxDir = 'ops/social-outbox/events';
const limit = Number(process.env.SOCIAL_OUTBOX_BATCH_SIZE || 5);
const sendEnabled = String(process.env.SOCIAL_OUTBOX_SEND_ENABLED || 'false').toLowerCase() === 'true';

async function listJson(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function trackedUrl(rawUrl, slug) {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', 'x');
  url.searchParams.set('utm_medium', 'social');
  url.searchParams.set('utm_campaign', 'social_outbox');
  url.searchParams.set('utm_content', slug);
  return url.toString();
}

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

function buildXCopy(event) {
  const title = stripHtml(event.title || '');
  const excerpt = stripHtml(event.excerpt || '');
  const url = trackedUrl(event.url, event.slug);
  const lead = 'A practical StripUnion decision-support guide:';
  const source = excerpt || title;
  const max = Math.max(0, 255 - url.length - lead.length - 6);
  const detail = source.length > max ? source.slice(0, Math.max(0, max - 1)).trimEnd() + '…' : source;
  return `${lead} ${detail}\n\n${url}`.trim();
}

function retryAt(minutes = 30) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function ready(event) {
  if (!['pending', 'retryable'].includes(event.state)) return false;
  if (!event.next_attempt_at) return true;
  return new Date(event.next_attempt_at).getTime() <= Date.now();
}

async function write(file, event) {
  event.updated_at = new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(event, null, 2) + '\n', 'utf8');
}

const candidates = [];
for (const name of await listJson(outboxDir)) {
  const file = path.join(outboxDir, name);
  const event = await readJson(file);
  if (ready(event)) candidates.push({ file, event });
}

candidates.sort((a, b) =>
  String(a.event.desired_at || '').localeCompare(String(b.event.desired_at || '')) ||
  a.file.localeCompare(b.file)
);

const selected = candidates.slice(0, Math.max(0, limit));
let delivered = 0;
let retryable = 0;
let skipped = 0;

if (!sendEnabled) {
  console.log('SOCIAL_OUTBOX_SEND_DISABLED ' + JSON.stringify({ ready: selected.length, totalReady: candidates.length }));
  process.exit(0);
}

for (const { file, event } of selected) {
  event.attempt_count = Number(event.attempt_count || 0) + 1;
  event.last_attempt_at = new Date().toISOString();
  event.last_error = null;

  try {
    if (event.channel === 'x' && event.provider === 'buffer') {
      const post = await createBufferPost({ text: buildXCopy(event), mode: 'addToQueue' });
      event.provider_message_id = post.id || null;
      event.provider_due_at = post.dueAt || null;
      event.state = 'delivered';
      event.next_attempt_at = null;
      delivered += 1;
    } else if (event.channel === 'telegram' && event.provider === 'telegram') {
      const result = await publishTelegramEvent({
        title: event.title,
        excerpt: event.excerpt,
        url: event.url,
        post_id: event.publication_id,
        source: 'social_outbox'
      });
      if (result?.skipped) {
        event.state = 'retryable';
        event.next_attempt_at = retryAt(60);
        event.last_error = 'Telegram credentials/channel not configured';
        retryable += 1;
      } else {
        event.provider_message_id = result?.result?.message_id ? String(result.result.message_id) : null;
        event.state = 'delivered';
        event.next_attempt_at = null;
        delivered += 1;
      }
    } else {
      event.state = 'failed';
      event.last_error = `Unsupported route ${event.channel}/${event.provider}`;
      event.next_attempt_at = null;
      skipped += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    event.state = 'retryable';
    event.last_error = message.slice(0, 1200);
    event.next_attempt_at = retryAt(/scheduled posts limit/i.test(message) ? 20 : 45);
    retryable += 1;
  }

  await write(file, event);
}

console.log('SOCIAL_OUTBOX_WORKER_OK ' + JSON.stringify({
  selected: selected.length,
  delivered,
  retryable,
  failedOrSkipped: skipped,
  remainingReady: Math.max(0, candidates.length - selected.length)
}));
