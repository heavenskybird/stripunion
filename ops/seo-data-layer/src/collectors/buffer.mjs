import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const apiKey = process.env.BUFFER_API_KEY;
const date = process.env.SEO_END_DATE || daysAgo(1);
if (!apiKey) {
  console.log('Buffer collection skipped: BUFFER_API_KEY is not configured.');
  process.exit(0);
}

async function graphql(query) {
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
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
for (const organization of organizations) {
  const data = await graphql(`query { channels(input: { organizationId: ${JSON.stringify(organization.id)} }) { id name service } }`);
  const channels = data?.channels || [];
  selected = channels.find((channel) => channelHint && channel.id === channelHint)
    || channels.find((channel) => String(channel.service).toLowerCase().includes('twitter') || String(channel.service).toLowerCase() === 'x');
  if (selected) { selected.organization = organization; break; }
}
if (!selected) throw new Error('No X channel found in accessible Buffer organizations.');

async function getPosts(status, includeMetrics) {
  const posts = [];
  let after = null;
  const filter = status === 'sent'
    ? `createdAt: { start: ${JSON.stringify(since.toISOString())} }`
    : '';
  while (true) {
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
    after = connection.pageInfo.endCursor;
  }
  return posts;
}

const since = new Date(`${daysAgo(Number(process.env.BUFFER_SENT_DAYS || 90))}T00:00:00Z`);
const [sent, scheduled] = await Promise.all([getPosts('sent', true), getPosts('scheduled', false)]);
const normalized = sent.map((post) => {
  const metrics = Object.fromEntries((post.metrics || []).map((metric) => [metric.name || metric.type, Number(metric.value)]));
  return {
    ...post,
    metrics: {
      impressions: metrics.impressions ?? null,
      reach: metrics.reach ?? null,
      reactions: metrics.reactions ?? null,
      comments: metrics.comments ?? null,
      reposts: metrics.reposts ?? metrics.shares ?? null,
      clicks: metrics.clicks ?? null,
      engagementRate: metrics.engagementRate ?? metrics.engagement_rate ?? null,
      raw: post.metrics || []
    }
  };
});

await writeSnapshot('buffer', date, {
  source: 'buffer-graphql',
  collectedAt: new Date().toISOString(),
  organization: { id: selected.organization.id, name: selected.organization.name },
  channel: { id: selected.id, name: selected.name, service: selected.service },
  sentLookbackDays: Number(process.env.BUFFER_SENT_DAYS || 90),
  sentPosts: normalized,
  scheduledPosts: scheduled
});
console.log(`Buffer snapshot: ${normalized.length} sent posts and ${scheduled.length} scheduled posts.`);
