import { randomUUID } from 'node:crypto';
import { controlPlaneConfig, upsertRows } from '../ops/control-plane/client.mjs';

const config = controlPlaneConfig();
if (!config.configured) {
  console.log('CONTROL_PLANE_DEAD_LETTER_SKIP Supabase is not configured.');
  process.exit(0);
}

const createdAt = new Date().toISOString();
const jobType = String(process.env.DEAD_LETTER_JOB_TYPE || 'editorial-hourly-producer');
const githubRunId = process.env.GITHUB_RUN_ID || null;
const reason = String(process.env.DEAD_LETTER_REASON || 'GitHub Actions job failed before successful completion.').slice(0, 1200);
const retryable = !['false', '0', 'no'].includes(String(process.env.DEAD_LETTER_RETRYABLE || 'true').toLowerCase());

const row = {
  dead_letter_id: githubRunId ? jobType + ':' + githubRunId : randomUUID(),
  created_at: createdAt,
  job_type: jobType,
  job_id: process.env.DEAD_LETTER_JOB_ID || null,
  reason,
  retryable,
  payload: {
    githubRunId,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    githubSha: process.env.GITHUB_SHA || null,
    githubRepository: process.env.GITHUB_REPOSITORY || null,
    githubWorkflow: process.env.GITHUB_WORKFLOW || null,
    githubServerUrl: process.env.GITHUB_SERVER_URL || null
  },
  resolved_at: null
};

await upsertRows(config, 'dead_letters', [row], 'dead_letter_id');
console.log('CONTROL_PLANE_DEAD_LETTER_OK ' + JSON.stringify({ id: row.dead_letter_id, retryable }));
