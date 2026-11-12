import { bufferFetch } from '../../../../scripts/buffer-request-budget.mjs';
const BUFFER_API_URL = 'https://api.buffer.com';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function createBufferPost({ text, mode = 'addToQueue', dueAt }) {
  if (String(process.env.SOCIAL_OUTBOX_SEND_ENABLED).toLowerCase() === 'false') throw new Error('Social sends disabled by operator.');
  if (process.env.SOCIAL_OUTBOX_SINGLE_WRITER_ENABLED === 'true' &&
      (process.env.GITHUB_WORKFLOW !== 'Native social outbox' || process.env.GITHUB_REF !== 'refs/heads/main' || process.env.GITHUB_RUN_ATTEMPT !== '1')) {
    throw new Error('Direct Buffer sends refused after single-writer cutover.');
  }
  const apiKey = required('BUFFER_API_KEY');
  const channelId = required('BUFFER_CHANNEL_ID');

  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
            dueAt
            status
            channelId
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const input = {
    text,
    channelId,
    schedulingType: 'automatic',
    mode
  };

  if (mode === 'customScheduled') {
    if (!dueAt) throw new Error('dueAt is required for customScheduled mode');
    input.dueAt = dueAt;
  }

  const response = await bufferFetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { input } })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Buffer HTTP ${response.status}; provider payload withheld`);
  }

  if (payload.errors?.length) {
    throw new Error('Buffer GraphQL request failed; provider payload withheld');
  }

  const result = payload.data?.createPost;
  if (!result?.post?.id) {
    throw new Error('Buffer acceptance unconfirmed; reconciliation required');
  }

  return result.post;
}
