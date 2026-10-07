import fs from 'node:fs/promises';
import path from 'node:path';

const ledgerDir = 'ops/editorial/publication-ledger/astro';
const outboxDir = 'ops/social-outbox/events';

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

function eventFile(source, slug, channel) {
  const safe = [source, slug, channel].map((value) => String(value).replace(/[^a-z0-9-]+/gi, '-').toLowerCase());
  return path.join(outboxDir, safe.join('__') + '.json');
}

function buildEvent(ledger, channel) {
  const source = 'astro';
  const provider = channel === 'x' ? 'buffer' : 'telegram';
  const state = 'reconcile_required';
  const now = new Date().toISOString();
  return {
    version: 1,
    event_id: `${source}:${ledger.slug}:${channel}`,
    idempotency_key: `${source}:${ledger.slug}:${channel}`,
    publication_id: `${source}:${ledger.slug}`,
    source,
    slug: ledger.slug,
    title: ledger.title || ledger.slug,
    excerpt: ledger.excerpt || '',
    url: ledger.url,
    channel,
    provider,
    state,
    desired_at: ledger.published_at || now,
    attempt_count: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    last_error: null,
    provider_message_id: null,
    provider_due_at: null,
    created_at: now,
    updated_at: now,
    metadata: {
      imported_from_distribution_state: ledger.distribution_state || null,
      historical_reconciliation_required: true
    }
  };
}

await fs.mkdir(outboxDir, { recursive: true });

let created = 0;
let existing = 0;
let ignored = 0;

for (const name of await listJson(ledgerDir)) {
  const ledger = await readJson(path.join(ledgerDir, name));
  if (!ledger?.slug || !ledger?.url) continue;

  const state = String(ledger.distribution_state || '');
  if (!['distribution_pending', 'distribution_pending_reconciliation'].includes(state)) {
    ignored += 1;
    continue;
  }

  for (const channel of ['x', 'telegram']) {
    const file = eventFile('astro', ledger.slug, channel);
    try {
      await fs.access(file);
      existing += 1;
      continue;
    } catch {}

    await fs.writeFile(file, JSON.stringify(buildEvent(ledger, channel), null, 2) + '\n', 'utf8');
    created += 1;
  }
}

console.log('SOCIAL_OUTBOX_SYNC_OK ' + JSON.stringify({ created, existing, ignored }));
