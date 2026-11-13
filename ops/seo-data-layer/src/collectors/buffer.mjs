import fs from 'node:fs/promises';
import { collectionPolicy } from '../../../../scripts/buffer-collection-policy.mjs';
import { bufferFetch } from '../../../../scripts/buffer-request-budget.mjs';
import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const cooldown = JSON.parse(await fs.readFile(new URL('../../../social-outbox/buffer-provider-cooldown.json', import.meta.url), 'utf8'));
const last = (await fs.readdir(new URL('../../data/raw/', import.meta.url))).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse();
let lastCollectedAt=null;
for(const date of last){try{const d=JSON.parse(await fs.readFile(new URL('../../data/raw/'+date+'/buffer.json',import.meta.url),'utf8'));lastCollectedAt=d.collectedAt;break;}catch(e){if(e.code!=='ENOENT')throw Error('BUFFER_COLLECTION_CACHE_UNREADABLE');}}
const policy=collectionPolicy({enabled:process.env.BUFFER_ANALYTICS_ENABLED==='true',cooldownUntil:cooldown.until,lastCollectedAt});
if(!policy.allowed)throw new Error(policy.reason+'; no provider request; existing snapshot preserved');
let requestCount=0;

const apiKey = process.env.BUFFER_API_KEY;
const date = process.env.SEO_END_DATE || daysAgo(1);
if (!apiKey) {
  console.log('Buffer collection skipped: BUFFER_API_KEY is not configured.');
  process.exit(0);
}

async function graphql(query) {
  if(++requestCount>policy.maximumRequests)throw Error('BUFFER_COLLECTION_REQUEST_BOUND');
  const response = await bufferFetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  }, { purpose: 'analytics' });
  if (!response.ok) throw new Error(`Buffer HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error('Buffer GraphQL request failed');
  return payload.data;
}

const orgData = await graphql(`query { account { organizations { id name } } }`);
const organizations = orgData?.account?.organizations || [];
if (!organizations.length) throw new Error('Buffer account has no accessible organizations.');

const channelHint = process.env.BUFFER_CHANNEL_ID;
let selected = null;
for (const organization of organizations.slice(0,1)) {
  const data = await graphql(`query { channels(input: { organizationId: ${JSON.stringify(organization.id)} }) { id name service } }`);
  const channels = data?.channels || [];
  selected = channelHint ? channels.find(channel => channel.id === channelHint)
    : channels.find(channel => String(channel.service).toLowerCase().includes('twitter') || String(channel.service).toLowerCase() === 'x');
  if (selected) { selected.organization = organization; break; }
}
if (!selected) throw new Error('No X channel found in accessible Buffer organizations.');

async function getPosts(status, includeMetrics) {
  const posts = [];
  let after = null;
  const filter = status === 'sent'
    ? `createdAt: { start: ${JSON.stringify(since.toISOString())} }`
    : '';
  for(let page=0;page<policy.maxPages;page++) {
    const data = await graphql(`query {
      posts(first: 20${after ? `, after: ${JSON.stringify(after)}` : ''}, input: { organizationId: ${JSON.stringify(selected.organization.id)}, filter: { status: [${status}], channelIds: [${JSON.stringify(selected.id)}]${filter ? `, ${filter}` : ''} } }) {
        edges { node { id text status dueAt createdAt channelId ${includeMetrics ? 'metrics { type name value unit } metricsUpdatedAt' : ''} } }
        pageInfo { hasNextPage endCursor }
      }
    }`);
    const connection = data?.posts;
    posts.push(...(connection?.edges || []).map((edge) => edge.node));
    if (!connection?.pageInfo?.hasNextPage) break;
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === after) throw new Error('Buffer pagination cursor did not advance.');
    if(page===policy.maxPages-1)throw Error('BUFFER_COLLECTION_INCOMPLETE_PRESERVE_PRIOR');
    after = connection.pageInfo.endCursor;
  }
  return posts;
}

const since = new Date(`${daysAgo(policy.lookbackDays)}T00:00:00Z`);
const [sent, scheduled] = await Promise.all([getPosts('sent', false), getPosts('scheduled', false)]);
const normalized = sent.map((post) => {
  const metrics = {};
  for (const metric of post.metrics || []) {
    const value = Number(metric.value);
    if (metric.type) metrics[String(metric.type)] = value;
    if (metric.name) metrics[String(metric.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '')] = value;
  }
  return {
    ...post,
    metrics: {
      impressions: metrics.impressions ?? null,
      reach: metrics.reach ?? null,
      reactions: metrics.reactions ?? null,
      comments: metrics.comments ?? null,
      reposts: metrics.reposts ?? metrics.shares ?? null,
      clicks: metrics.clicks ?? null,
      engagementRate: metrics.engagementRate ?? metrics.engagementrate ?? metrics.engagement_rate ?? null,
      raw: post.metrics || []
    }
  };
});

await writeSnapshot('buffer', date, {
  source: 'buffer-graphql',
  collectedAt: new Date().toISOString(),
  organization: { id: selected.organization.id, name: selected.organization.name },
  channel: { id: selected.id, name: selected.name, service: selected.service },
  sentLookbackDays: policy.lookbackDays,
  collectionRequestCount: requestCount,
  metricsCollected: false,
  sentPosts: normalized,
  scheduledPosts: scheduled
});
console.log(`Buffer snapshot: ${normalized.length} sent posts and ${scheduled.length} scheduled posts.`);