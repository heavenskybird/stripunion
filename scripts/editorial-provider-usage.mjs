import fs from 'node:fs/promises';

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function providerUsage({ attempt, httpStatus = null, payload = null, inputCharacters }) {
  return {
    attempt, httpStatus, inputCharacters,
    inputTokens: count(payload?.usage?.input_tokens),
    outputTokens: count(payload?.usage?.output_tokens),
    totalTokens: count(payload?.usage?.total_tokens),
    responseStatus: ['completed', 'incomplete', 'failed'].includes(payload?.status) ? payload.status : null,
    maxOutputTokens: 20_000,
    costUsd: null, costStatus: 'NOT_RETURNED_BY_API',
    balanceStatus: 'NOT_EXPOSED_TO_PROJECT_KEY'
  };
}
export async function recordProviderUsage(record) {
  const file = 'artifacts/publication-verification/provider-usage.json';
  await fs.mkdir('artifacts/publication-verification', { recursive: true });
  let records = [];
  try { records = JSON.parse(await fs.readFile(file, 'utf8')).requests; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  records.push(record);
  await fs.writeFile(file, JSON.stringify({ runId: process.env.GITHUB_RUN_ID || null,
    maxRequestsPerGeneration: 3, maxOutputTokensPerGeneration: 60_000,
    requests: records }, null, 2) + '\n');
  console.log('EDITORIAL_PROVIDER_USAGE ' + JSON.stringify(record));
}
