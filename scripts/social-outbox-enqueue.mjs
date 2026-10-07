import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const guideFile = process.argv[2];
if (!guideFile) throw new Error('Usage: node scripts/social-outbox-enqueue.mjs <guide-file>');

const absolute = path.resolve(guideFile);
const module = await import(pathToFileURL(absolute).href);
const guide = module.default;
if (!guide?.slug || !guide?.title) throw new Error('Invalid guide module');

const outboxDir = 'ops/social-outbox/events';
await fs.mkdir(outboxDir, { recursive: true });

function eventPath(channel) {
  return path.join(outboxDir, ['astro', guide.slug, channel].join('__') + '.json');
}

function event(channel) {
  const now = new Date().toISOString();
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
    state: 'pending',
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
      enqueued_by: 'editorial_hourly_producer'
    }
  };
}

let created = 0;
let existing = 0;

for (const channel of ['x', 'telegram']) {
  const file = eventPath(channel);
  try {
    await fs.access(file);
    existing += 1;
    continue;
  } catch {}
  await fs.writeFile(file, JSON.stringify(event(channel), null, 2) + '\n', 'utf8');
  created += 1;
}

console.log('SOCIAL_OUTBOX_ENQUEUED ' + JSON.stringify({ slug: guide.slug, created, existing }));
