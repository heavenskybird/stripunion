import fs from 'node:fs/promises';
import path from 'node:path';
import { createBufferPost } from '../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../ops/seo-data-layer/src/distribution/telegram.mjs';

const outboxDir = 'ops/social-outbox/events';
const limit = Number(process.env.SOCIAL_OUTBOX_BATCH_SIZE || 5);
const sendEnabled = String(process.env.SOCIAL_OUTBOX_SEND_ENABLED || 'false').toLowerCase() === 'true';
const timezone = process.env.SOCIAL_OUTBOX_TIMEZONE || 'Asia/Shanghai';
const xDailyCap = Number(process.env.SOCIAL_OUTBOX_X_DAILY_CAP || 20);
const telegramDailyCap = Number(process.env.SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP || 100);
const xMinIntervalMinutes = Number(process.env.SOCIAL_OUTBOX_X_MIN_INTERVAL_MINUTES || 45);

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

function dayKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function write(file, event) {
  event.updated_at = new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(event, null, 2) + '\n', 'utf8');
}

const rows = [];
for (const name of await listJson(outboxDir)) {
  const file = path.join(outboxDir, name);
  const event = await readJson(file);
  rows.push({ file, event });
}

const today = dayKey(new Date().toISOString());
let xUsedToday = rows.filter(({ event }) =>
  event.channel === 'x' &&
  ['scheduled', 'delivered'].includes(event.state) &&
  dayKey(event.provider_due_at || event.last_attempt_at || event.updated_at) === today
).length;

let telegramUsedToday = rows.filter(({ event }) =>
  event.channel === 'telegram' &&
  event.state === 'delivered' &&
  dayKey(event.last_attempt_at || event.updated_at) === today
).length;

let latestXAttemptMs = rows
  .filter(({ event }) => event.channel === 'x' && ['scheduled', 'delivered'].includes(event.state))
  .map(({ event }) => new Date(event.last_attempt_at || event.updated_at || 0).getTime())
  .filter(Number.isFinite)
  .reduce((max, value) => Math.max(max, value), 0);

const candidates = rows.filter(({ event }) => ready(event));
candidates.sort((a, b) =>
  String(a.event.desired_at || '').localeCompare(String(b.event.desired_at || '')) ||
  a.file.localeCompare(b.file)
);

if (!sendEnabled) {
  console.log('SOCIAL_OUTBOX_SEND_DISABLED ' + JSON.stringify({ ready: candidates.length }));
  process.exit(0);
}

let processed = 0;
let delivered = 0;
let scheduled = 0;
let retryable = 0;
let failed = 0;
let deferredByCadence = 0;

for (const { file, event } of candidates) {
  if (processed >= Math.max(0, limit)) break;

  if (event.channel === 'x') {
    const spacingOpen = !latestXAttemptMs ||
      (Date.now() - latestXAttemptMs) >= xMinIntervalMinutes * 60 * 1000;
    if (xUsedToday >= xDailyCap || !spacingOpen) {
      deferredByCadence += 1;
      continue;
    }
  }

  if (event.channel === 'telegram' && telegramUsedToday >= telegramDailyCap) {
    deferredByCadence += 1;
    continue;
  }

  processed += 1;
  event.attempt_count = Number(event.attempt_count || 0) + 1;
  event.last_attempt_at = new Date().toISOString();
  event.last_error = null;

  try {
    if (event.channel === 'x' && event.provider === 'buffer') {
      const post = await createBufferPost({ text: buildXCopy(event), mode: 'addToQueue' });
      event.provider_message_id = post.id || null;
      event.provider_due_at = post.dueAt || null;
      event.state = post.dueAt ? 'scheduled' : 'delivered';
      event.next_attempt_at = null;
      latestXAttemptMs = Date.now();
      xUsedToday += 1;
      if (event.state === 'scheduled') scheduled += 1;
      else delivered += 1;
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
        telegramUsedToday += 1;
        delivered += 1;
      }
    } else {
      event.state = 'failed';
      event.last_error = `Unsupported route ${event.channel}/${event.provider}`;
      event.next_attempt_at = null;
      failed += 1;
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
  processed,
  delivered,
  scheduled,
  retryable,
  failed,
  deferredByCadence,
  xUsedToday,
  xDailyCap,
  telegramUsedToday,
  telegramDailyCap,
  remainingReady: candidates.length - processed
}));
