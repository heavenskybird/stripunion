import { journal, deliverOnce, validateCap, providerDayUsage, reserveDelivery } from './social-outbox-safety.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { createBufferPost } from '../ops/seo-data-layer/src/distribution/buffer.mjs';
import { publishTelegramEvent } from '../ops/seo-data-layer/src/distribution/telegram.mjs';
import {buildTelegramText} from '../ops/seo-data-layer/src/distribution/telegram.mjs';
import {REGISTRY_ID,canonicalSocialUrl,contentIdentity,manualEntries,contentConflict,registryEntries,reserveContent,confirmContent,validateTelegramPolicy} from './telegram-autonomy-policy.mjs';
import { socialChannelSwitches } from './social-channel-switches.mjs';

const outboxDir = 'ops/social-outbox/events';
const limit = validateCap(process.env.SOCIAL_OUTBOX_BATCH_SIZE ?? 5, 5);
const channels = socialChannelSwitches();
const sendEnabled = channels.globalEnabled && (channels.x || channels.telegram);
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

const autonomous = process.env.TELEGRAM_AUTONOMY_ENABLED === 'true';
const policy = autonomous ? validateTelegramPolicy(JSON.parse(await fs.readFile(new URL('../ops/social-outbox/telegram-policy.json',import.meta.url),'utf8'))) : null;
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

if (autonomous) telegramUsedToday += policy.manualSuppressions.filter(s=>s.reportedLocalDate===today).length;
const effectiveTelegramCap = autonomous ? Math.min(telegramDailyCap,policy.maxDaily) : telegramDailyCap;
let latestXAttemptMs = rows
  .filter(({ event }) => event.channel === 'x' && ['scheduled', 'delivered', 'reconcile_required'].includes(event.state))
  .map(({ event }) => new Date(event.last_attempt_at || event.updated_at || 0).getTime())
  .filter(Number.isFinite)
  .reduce((max, value) => Math.max(max, value), 0);

const trialKey = String(process.env.SOCIAL_OUTBOX_TRIAL_EVENT_KEY || '').trim();
if (sendEnabled && trialKey && !/^[a-zA-Z0-9:_-]{1,200}$/.test(trialKey)) throw new Error('Invalid exact trial event key.');
const candidates = rows.filter(({ event }) => ready(event) && channels[event.channel] === true &&
  (!autonomous || event.channel !== 'telegram' || event.selection_source === 'official-search-demand') &&
  (!trialKey || event.idempotency_key === trialKey && event.state === 'pending' && Number(event.attempt_count || 0) === 0));
let providerPosts = [];
let xEvidenceAvailable = false;
if (sendEnabled && candidates.some(({event}) => event.channel === 'x') && process.env.BUFFER_API_KEY && process.env.BUFFER_CHANNEL_ID &&
    (!process.env.BUFFER_RECONCILIATION_OUTCOME || process.env.BUFFER_RECONCILIATION_OUTCOME === 'success')) {
  try {
    const snapshot = await readJson(process.env.SOCIAL_OUTBOX_RECONCILIATION_FILE || '/tmp/stripunion-buffer-reconciliation.json');
    const age = Date.now() - Date.parse(snapshot.checked_at);
    if (!Number.isFinite(age) || age < 0 || age > 10 * 60_000 || snapshot.channel_id !== process.env.BUFFER_CHANNEL_ID || !Array.isArray(snapshot.posts)) throw new Error('Invalid reconciliation evidence.');
    providerPosts = snapshot.posts;
    if (providerPosts.some(post => !post.id || post.channelId !== process.env.BUFFER_CHANNEL_ID || !['sent', 'scheduled'].includes(post.status) || !Number.isFinite(Date.parse(post.sentAt || post.dueAt)))) throw new Error('Invalid provider delivery evidence.');
    xEvidenceAvailable = true;
  } catch { console.log('::warning::X delivery held; fresh valid Buffer evidence unavailable. Telegram evaluated independently.'); }
}
candidates.sort((a, b) =>
  String(a.event.desired_at || '').localeCompare(String(b.event.desired_at || '')) ||
  a.file.localeCompare(b.file)
);

if (!sendEnabled) {
  console.log('SOCIAL_OUTBOX_SEND_DISABLED ' + JSON.stringify({ ready: candidates.length }));
  process.exit(0);
}

let registry=null, historicalContent=[];
if (autonomous && channels.telegram) {
 registry=await journal({idempotency_key:REGISTRY_ID});
 historicalContent=rows.filter(r=>r.event.channel==='telegram'&&['delivered','reconcile_required'].includes(r.event.state)).map(r=>contentIdentity(r.event));
 historicalContent.push(...manualEntries(policy),...registryEntries(registry));
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
    if (!xEvidenceAvailable) { deferredByCadence += 1; continue; }
    const spacingOpen = !latestXAttemptMs ||
      (Date.now() - latestXAttemptMs) >= xMinIntervalMinutes * 60 * 1000;
    const dueDay = dayKey(new Date(Date.now() + 10 * 60_000).toISOString());
    const reserved = providerDayUsage(providerPosts, rows.map(row => row.event), dueDay, dayKey);
    if (xUsedToday >= xDailyCap || reserved >= xDailyCap || !spacingOpen) {
      deferredByCadence += 1;
      continue;
    }
  }

  if (event.channel === 'telegram' && telegramUsedToday >= effectiveTelegramCap) {
    deferredByCadence += 1;
    continue;
  }

  let identity=null;
  if (autonomous && event.channel==='telegram') {
    identity=contentIdentity(event);
    const age=Date.now()-Date.parse(event.selection_checked_at);
    if (!Number.isFinite(age)||age<0||age>policy.selectionMaxAgeHours*3600000||contentConflict(identity,historicalContent)) {deferredByCadence++;continue;}
    const target=await fetch(event.url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
    const targetHtml=await target.text();const targetCanonical=targetHtml.match(/rel="canonical" href="([^"]+)"/)?.[1];
    if(target.status!==200||!targetCanonical||canonicalSocialUrl(targetCanonical)!==identity.url||/noindex/i.test(target.headers.get('x-robots-tag')||'')||/name="robots" content="[^"]*noindex/.test(targetHtml)){deferredByCadence++;continue;}
    const priorBudget=await journal({idempotency_key:'social-delivery-budget:telegram'});
    const old=priorBudget.state;
    if(old && ((old.days?.[today]||0)>=effectiveTelegramCap || Date.now()-old.lastAttemptedAt<policy.minIntervalMinutes*60000)){deferredByCadence++;continue;}
  }
  processed += 1;
  event.last_attempt_at = new Date().toISOString();
  event.last_error = null;

  // An isolated CAS journal survives runner loss and failed main-state persistence.
  // Unknown provider acceptance is held for reconciliation, never retried blindly.
  if (event.channel === 'x' && (!process.env.BUFFER_API_KEY || !process.env.BUFFER_CHANNEL_ID)) throw new Error('Missing Buffer configuration; no provider attempt made.');
  if (event.channel === 'telegram' && (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID)) throw new Error('Missing Telegram configuration; no provider attempt made.');
  if(identity){const utm=trackedUrl(event.url,event.slug,'telegram');event.expected_delivery_evidence={content_hash:identity.contentHash,message_text_sha256:createHash('sha256').update(buildTelegramText({title:event.title,excerpt:event.excerpt,url:utm})).digest('hex'),canonical_url:identity.url,utm_url:utm,topic_key:identity.topic,channel:'@StripUnion'};}
  const store = await journal(event);
  const outcome = await deliverOnce(event, async () => {
    const budgetIdentity = `social-delivery-budget:${event.channel}`;
    const deliveryBudget = await journal({ idempotency_key: budgetIdentity });
    const dueDay = event.channel === 'x' ? dayKey(new Date(Date.now() + 10 * 60_000).toISOString()) : today;
    const baseline = { [today]: event.channel === 'x' ? xUsedToday : telegramUsedToday };
    if (event.channel === 'x') baseline[dueDay] = Math.max(baseline[dueDay] || 0, providerDayUsage(providerPosts, rows.map(row => row.event), dueDay, dayKey));
    await reserveDelivery(deliveryBudget, { identity: budgetIdentity, days: [today, dueDay], baseline,
      cap: event.channel === 'x' ? xDailyCap : effectiveTelegramCap,
      spacingMs: event.channel === 'x' ? xMinIntervalMinutes * 60_000 : autonomous ? policy.minIntervalMinutes*60000 : 0 });
    if(identity)await reserveContent(registry,identity,policy);
    event.attempt_count = Number(event.attempt_count || 0) + 1;
    if (event.channel === 'x' && event.provider === 'buffer') {
      const post = await createBufferPost({ text: buildXCopy(event), mode: 'customScheduled', dueAt: new Date(Date.now() + 10 * 60_000).toISOString() });
      return { id: post.id, dueAt: post.dueAt, state: post.dueAt ? 'scheduled' : post.status === 'sent' ? 'delivered' : null };
    }
    if (event.channel === 'telegram' && event.provider === 'telegram') {
      const result = await publishTelegramEvent({ title: event.title, excerpt: event.excerpt,
        url: trackedUrl(event.url, event.slug, 'telegram'), post_id: event.publication_id, source: 'social_outbox' });
      const id=result?.result?.message_id;
      const providerUrl=String(result?.result?.chat?.username||'').toLowerCase()==='stripunion' && Number.isSafeInteger(id) ? 'https://t.me/StripUnion/'+id : null;
      if(autonomous && !providerUrl)throw Error('TELEGRAM_RESULT_CHANNEL_UNPROVEN');
      if(identity)await confirmContent(registry,identity,id,providerUrl);
      return { id, state: result?.skipped === false ? 'delivered' : null,
        evidence:identity?{...event.expected_delivery_evidence,provider_message_url:providerUrl}:null };
    }
    throw new Error('Unsupported social route.');
  }, store);
  const receipt = outcome.receipt;
  event.state = ['scheduled', 'delivered'].includes(receipt?.status) ? receipt.status : 'reconcile_required';
  event.provider_message_id = receipt?.provider_message_id || event.provider_message_id || null;
  if(receipt?.evidence){event.delivery_evidence=receipt.evidence;}
  event.provider_due_at = receipt?.provider_due_at || event.provider_due_at || null;
  event.last_attempt_at = receipt?.attempted_at || event.last_attempt_at;
  event.next_attempt_at = null;
  event.last_error = ['scheduled', 'delivered'].includes(event.state) ? null : 'Provider acceptance requires reconciliation; automatic replay prohibited.';
  if (event.channel === 'x') { xUsedToday += 1; latestXAttemptMs = Date.now(); }
  else if (event.channel === 'telegram') {telegramUsedToday += 1;if(identity)historicalContent.push(identity);}
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
  xEvidenceAvailable,
  remainingReady: candidates.length - processed
}));
