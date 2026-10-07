import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outboxDir = 'ops/social-outbox/events';
const timezone = process.env.SOCIAL_OUTBOX_TIMEZONE || 'Asia/Shanghai';
const xDailyCap = Number(process.env.SOCIAL_OUTBOX_X_DAILY_CAP || 20);
const telegramDailyCap = Number(process.env.SOCIAL_OUTBOX_TELEGRAM_DAILY_CAP || 100);

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

function localHour(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === 'hour')?.value;
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Unable to resolve local hour for timezone ${timezone}`);
  }
  return hour;
}

export function cumulativeAllowance(cap, hour) {
  if (!Number.isFinite(cap) || cap < 0) throw new Error('Daily cap must be a non-negative number.');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Hour must be between 0 and 23.');
  return Math.floor(((hour + 1) * cap) / 24);
}

async function listEvents() {
  let names = [];
  try {
    names = (await fs.readdir(outboxDir)).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const rows = [];
  for (const name of names) {
    try {
      const event = JSON.parse(await fs.readFile(path.join(outboxDir, name), 'utf8'));
      rows.push(event);
    } catch {}
  }
  return rows;
}

function channelPressure(rows, channel, today) {
  const outstanding = rows.filter((event) =>
    event.channel === channel && ['pending', 'retryable'].includes(event.state)
  ).length;

  let usedToday = 0;
  if (channel === 'x') {
    usedToday = rows.filter((event) =>
      event.channel === 'x' &&
      ['scheduled', 'delivered'].includes(event.state) &&
      dayKey(event.provider_due_at || event.last_attempt_at || event.updated_at) === today
    ).length;
  } else if (channel === 'telegram') {
    usedToday = rows.filter((event) =>
      event.channel === 'telegram' &&
      event.state === 'delivered' &&
      dayKey(event.last_attempt_at || event.updated_at) === today
    ).length;
  }

  return { outstanding, usedToday, pressure: outstanding + usedToday };
}

function admissionSnapshot(rows, channel, now) {
  const cap = channel === 'x' ? xDailyCap : telegramDailyCap;
  const hour = localHour(now);
  const today = dayKey(now);
  const allowedByNow = cumulativeAllowance(cap, hour);
  const pressure = channelPressure(rows, channel, today);
  const admitted = pressure.pressure < allowedByNow;

  return {
    admitted,
    cap,
    hour,
    allowedByNow,
    outstanding: pressure.outstanding,
    usedToday: pressure.usedToday,
    pressure: pressure.pressure,
    reason: admitted ? 'within_cumulative_daily_budget' : 'cadence_admission_budget_exhausted'
  };
}

function selfTest() {
  const x = Array.from({ length: 24 }, (_, hour) => cumulativeAllowance(20, hour));
  const tg = Array.from({ length: 24 }, (_, hour) => cumulativeAllowance(100, hour));
  if (x.at(-1) !== 20) throw new Error('X admission self-test failed.');
  if (tg.at(-1) !== 100) throw new Error('Telegram admission self-test failed.');
  if (!x.every((value, i) => i === 0 || value >= x[i - 1])) throw new Error('X allowance must be monotonic.');
  if (!tg.every((value, i) => i === 0 || value >= tg[i - 1])) throw new Error('Telegram allowance must be monotonic.');
  console.log('SOCIAL_OUTBOX_ADMISSION_SELF_TEST_PASS ' + JSON.stringify({
    xFinal: x.at(-1),
    telegramFinal: tg.at(-1)
  }));
}

if (process.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

const guideFile = process.argv[2];
if (!guideFile) throw new Error('Usage: node scripts/social-outbox-enqueue.mjs <guide-file>');

const absolute = path.resolve(guideFile);
const module = await import(pathToFileURL(absolute).href);
const guide = module.default;
if (!guide?.slug || !guide?.title) throw new Error('Invalid guide module');

await fs.mkdir(outboxDir, { recursive: true });

function eventPath(channel) {
  return path.join(outboxDir, ['astro', guide.slug, channel].join('__') + '.json');
}

function buildEvent(channel, admission, now) {
  return {
    version: 1,
    event_id: `astro:${guide.slug}:${channel}`,
    idempotency_key: `astro:${guide.slug}:${channel}`,
    publication_id: `astro:${guide.slug}`,
    source: 'astro',
    slug: guide.slug,
    title: guide.title,
    excerpt: guide.excerpt || guide.description || '',
    url: `https://stripunion.com/guides/${guide.slug}`,
    channel,
    provider: channel === 'x' ? 'buffer' : 'telegram',
    state: admission.admitted ? 'pending' : 'skipped',
    desired_at: now,
    attempt_count: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    last_error: null,
    provider_message_id: null,
    provider_due_at: null,
    created_at: now,
    updated_at: now,
    metadata: {
      historical_reconciliation_required: false,
      enqueued_by: 'editorial_hourly_producer',
      cadence_admitted: admission.admitted,
      cadence_admission_reason: admission.reason,
      cadence_cap: admission.cap,
      cadence_hour: admission.hour,
      cadence_allowed_by_now: admission.allowedByNow,
      cadence_used_today: admission.usedToday,
      cadence_outstanding_before_enqueue: admission.outstanding,
      cadence_pressure_before_enqueue: admission.pressure
    }
  };
}

let created = 0;
let existing = 0;
let admitted = 0;
let skipped = 0;

for (const channel of ['x', 'telegram']) {
  const file = eventPath(channel);
  try {
    await fs.access(file);
    existing += 1;
    continue;
  } catch {}

  const rows = await listEvents();
  const now = new Date().toISOString();
  const admission = admissionSnapshot(rows, channel, now);
  const next = buildEvent(channel, admission, now);
  await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  created += 1;
  if (admission.admitted) admitted += 1;
  else skipped += 1;
}

console.log('SOCIAL_OUTBOX_ENQUEUED ' + JSON.stringify({
  slug: guide.slug,
  created,
  existing,
  admitted,
  skipped
}));
