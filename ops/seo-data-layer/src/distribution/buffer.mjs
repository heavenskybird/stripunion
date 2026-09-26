const BUFFER_API_URL = 'https://api.buffer.com';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function createBufferPost({ text, mode = 'addToQueue', dueAt }) {
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

  const response = await fetch(BUFFER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { input } })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Buffer HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  if (payload.errors?.length) {
    throw new Error(`Buffer GraphQL error: ${JSON.stringify(payload.errors)}`);
  }

  const result = payload.data?.createPost;
  if (!result?.post?.id) {
    throw new Error(`Buffer rejected post: ${JSON.stringify(result)}`);
  }

  return result.post;
}
