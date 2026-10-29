import { journal, deliverOnce, validateCap, providerDayUsage } from './social-outbox-safety.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBufferPost } from '../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../ops/seo-data-layer/src/distribution/telegram.mjs';

const outboxDir = 'ops/social-outbox/events';
const limit = validateCap(process.env.SOCIAL_OUTBOX_BATCH_SIZE ?? 5, 5);
const sendEnabled = String(process.env.SOCIAL_OUTBOX_SEND_ENABLED || 'false').toLowerCase() === 'true';
const timezone = process.env.SOCIAL_OUTBOX_TIMEZONE || 'Asia/Shanghai';
const xDailyCap = validateCap(process.env.SOCIAL_OUTBOX_X_DAILY_CAP ?? 20, 20);
const telegramDailyCap = validateCap(process.env.SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP ?? 100, 100);
const xMinIntervalMinutes = Number(process.env.SOCIAL_OUTBOX_X_MIN_INTERVAL_MINUTES ?? 45);
if (!Number.isFinite(xMinIntervalMinutes) || xMinIntervalMinutes < 45) throw new Error('X spacing must be at least 45 minutes.');

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

function trackedUrl(rawUrl, slug, source = 'x') {
  const url = new URL(rawUrl);
  url.searchParams.set('utm_source', source);
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

if (sendEnabled && process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED !== 'true') throw new Error('Single-writer cutover has not been accepted.');
if (sendEnabled && (process.env.GITHUB_WORKFLOW !== 'Native social outbox' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1')) throw new Error('Sends require a fresh canonical single-writer workflow.');

const rows = [];
for (const name of await listJson(outboxDir)) {
  const file = path.join(outboxDir, name);
  const event = await readJson(file);
  rows.push({ file, event });
}

const today = dayKey(new Date().toISOString());
let xUsedToday = rows.filter(({ event }) =>
  event.channel === 'x' &&
  ['scheduled', 'delivered', 'reconcile_required'].includes(event.state) &&
  (dayKey(event.provider_due_at) === today || dayKey(event.last_attempt_at) === today)
).length;

let telegramUsedToday = rows.filter(({ event }) =>
  event.channel === 'telegram' &&
  ['delivered', 'reconcile_required'].includes(event.state) &&
  dayKey(event.last_attempt_at || event.updated_at) === today
).length;

let latestXAttemptMs = rows
  .filter(({ event }) => event.channel === 'x' && ['scheduled', 'delivered', 'reconcile_required'].includes(event.state))
  .map(({ event }) => new Date(event.last_attempt_at || event.updated_at || 0).getTime())
  .filter(Number.isFinite)
  .reduce((max, value) => Math.max(max, value), 0);

let providerPosts = [];
if (sendEnabled && process.env.BUFFER_API_KEY && process.env.BUFFER_CHANNEL_ID) {
  const snapshot = await readJson(process.env.SOCIAL_OUTBOX_RECONCILIATION_FILE || '/tmp/stripunion-buffer-reconciliation.json');
  const age = Date.now() - Date.parse(snapshot.checked_at);
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60_000 || snapshot.channel_id !== process.env.BUFFER_CHANNEL_ID || !Array.isArray(snapshot.posts)) throw new Error('Fresh provider reconciliation required.');
  providerPosts = snapshot.posts;
  if (providerPosts.some(post => !Number.isFinite(Date.parse(post.sentAt || post.dueAt)))) throw new Error('Unknown provider delivery date; cap enforcement fails closed.');
}
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
    const dueDay = dayKey(new Date(Date.now() + 10 * 60_000).toISOString());
    const reserved = providerDayUsage(providerPosts, rows.map(row => row.event), dueDay, dayKey);
    if (xUsedToday >= xDailyCap || reserved >= xDailyCap || !spacingOpen) {
      deferredByCadence += 1;
      continue;
    }
  }

  if (event.channel === 'telegram' && telegramUsedToday >= telegramDailyCap) {
    deferredByCadence += 1;
    continue;
  }

  processed += 1;
  event.last_attempt_at = new Date().toISOString();
  event.last_error = null;

  // An isolated CAS journal survives runner loss and failed main-state persistence.
  // Unknown provider acceptance is held for reconciliation, never retried blindly.
  if (event.channel === 'x' && (!process.env.BUFFER_API_KEY || !process.env.BUFFER_CHANNEL_ID)) throw new Error('Missing Buffer configuration; no provider attempt made.');
  if (event.channel === 'telegram' && (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID)) throw new Error('Missing Telegram configuration; no provider attempt made.');
  const store = await journal(event);
  const outcome = await deliverOnce(event, async () => {
    event.attempt_count = Number(event.attempt_count || 0) + 1;
    if (event.channel === 'x' && event.provider === 'buffer') {
      const post = await createBufferPost({ text: buildXCopy(event), mode: 'customScheduled', dueAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      return { id: post.id, dueAt: post.dueAt, state: post.dueAt ? 'scheduled' : post.status === 'sent' ? 'delivered' : null };
    }
    if (event.channel === 'telegram' && event.provider === 'telegram') {
      const result = await publishTelegramEvent({ title: event.title, excerpt: event.excerpt,
        url: trackedUrl(event.url, event.slug, 'telegram'), post_id: event.publication_id, source: 'social_outbox' });
      return { id: result?.result?.message_id, state: result?.skipped === false ? 'delivered' : null };
    }
    throw new Error('Unsupported social route.');
  }, store);
  const receipt = outcome.receipt;
  event.state = ['scheduled', 'delivered'].includes(receipt?.status) ? receipt.status : 'reconcile_required';
  event.provider_message_id = receipt?.provider_message_id || event.provider_message_id || null;
  event.provider_due_at = receipt?.provider_due_at || event.provider_due_at || null;
  event.last_attempt_at = receipt?.attempted_at || event.last_attempt_at;
  event.next_attempt_at = null;
  event.last_error = outcome.held ? 'Provider acceptance requires reconciliation; automatic replay prohibited.' : null;
  if (event.channel === 'x') { xUsedToday += 1; latestXAttemptMs = Date.now(); }
  else if (event.channel === 'telegram') telegramUsedToday += 1;
  if (event.state === 'delivered') delivered += 1;
  if (event.state === 'scheduled') scheduled += 1;

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
