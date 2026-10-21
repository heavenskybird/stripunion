import { createHash } from 'node:crypto';

// Stable full-topic identity. Hex-truncating the first N UTF-8 bytes made
// unrelated queries sharing a long prefix collide in Postgres upsert batches.
export function opportunityId(source, topicKey) {
  const sourceName = String(source || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const key = String(topicKey || '').trim();
  if (!sourceName || !key) throw new Error('Opportunity source and full topic key are required.');
  return `${sourceName}-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
}
