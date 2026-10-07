import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.BUFFER_API_KEY;
const channelId = process.env.BUFFER_CHANNEL_ID;
const apiUrl = 'https://api.buffer.com';
const outboxDir = 'ops/social-outbox/events';

async function gql(query, variables) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    throw new Error(`Buffer query failed: ${response.status} ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload.data;
}

function extractSlugs(text = '') {
  const slugs = new Set();
  const urls = String(text).match(/https?:\/\/[^\s]+/g) || [];
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      const utm = url.searchParams.get('utm_content');
      if (utm) slugs.add(utm);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length) slugs.add(parts.at(-1));
    } catch {}
  }
  return [...slugs];
}

async function listJson(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function selfTest() {
  const slugs = extractSlugs('x https://stripunion.com/guides/example-guide?utm_source=x&utm_content=example-guide');
  if (!slugs.includes('example-guide')) throw new Error('Buffer reconciler slug extraction self-test failed.');
  console.log('SOCIAL_OUTBOX_BUFFER_RECONCILE_SELF_TEST_PASS');
}

if (process.argv.includes('--self-test')) {
  await selfTest();
  process.exit(0);
}

if (!apiKey || !channelId) {
  console.log('SOCIAL_OUTBOX_BUFFER_RECONCILE_SKIP missing BUFFER_API_KEY or BUFFER_CHANNEL_ID');
  process.exit(0);
}

const channelQuery = `
  query Channel($input: ChannelInput!) {
    channel(input: $input) { id organizationId }
  }
`;
const channelData = await gql(channelQuery, { input: { id: channelId } });
const organizationId = channelData?.channel?.organizationId;
if (!organizationId) throw new Error('Unable to resolve Buffer organizationId from channel.');

const postsQuery = `
  query Posts($input: PostsInput!, $first: Int, $after: String) {
    posts(input: $input, first: $first, after: $after) {
      edges {
        node { id text status dueAt sentAt channelId createdAt }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

const postsBySlug = new Map();
let after = null;
for (let page = 0; page < 12; page += 1) {
  const data = await gql(postsQuery, {
    input: {
      organizationId,
      filter: {
        channelIds: [channelId],
        status: ['scheduled', 'sent']
      },
      sort: [{ field: 'createdAt', direction: 'desc' }]
    },
    first: 100,
    after
  });

  const result = data?.posts;
  for (const edge of result?.edges || []) {
    const post = edge?.node;
    if (!post?.id) continue;
    for (const slug of extractSlugs(post.text || '')) {
      const rows = postsBySlug.get(slug) || [];
      rows.push(post);
      postsBySlug.set(slug, rows);
    }
  }

  if (!result?.pageInfo?.hasNextPage || !result.pageInfo.endCursor) break;
  after = result.pageInfo.endCursor;
}

let matched = 0;
let unmatched = 0;

for (const name of await listJson(outboxDir)) {
  const file = path.join(outboxDir, name);
  const event = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!['reconcile_required', 'scheduled'].includes(event.state) || event.channel !== 'x' || event.provider !== 'buffer') continue;

  const matches = postsBySlug.get(event.slug) || [];
  if (!matches.length) {
    unmatched += 1;
    continue;
  }

  const post = matches[0];
  event.state = post.status === 'sent' ? 'delivered' : 'scheduled';
  event.provider_message_id = post.id;
  event.provider_due_at = post.dueAt || post.sentAt || null;
  event.last_error = null;
  event.next_attempt_at = null;
  event.updated_at = new Date().toISOString();
  event.metadata = {
    ...(event.metadata || {}),
    historical_reconciliation_required: false,
    reconciled_by: 'buffer_posts_query',
    buffer_status: post.status || null,
    buffer_match_count: matches.length
  };
  await fs.writeFile(file, JSON.stringify(event, null, 2) + '\n', 'utf8');
  matched += 1;
}

console.log('SOCIAL_OUTBOX_BUFFER_RECONCILE_OK ' + JSON.stringify({
  indexedSlugs: postsBySlug.size,
  matched,
  unmatched
}));
