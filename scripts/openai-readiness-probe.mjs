import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function classifyOpenAI(status, payload) {
  const error = payload?.error || {};
  const code = String(error.code || '');
  const type = String(error.type || '');
  const message = String(error.message || '').toLowerCase(); // inspect in memory only
  if (code === 'credit_balance_exhausted') return 'CREDIT_BALANCE_EXHAUSTED';
  if (/project.*(?:quota|limit)|(?:quota|limit).*project/.test(code)) return 'PROJECT_QUOTA_EXCEEDED';
  if (/organi[sz]ation.*(?:quota|limit)|(?:quota|limit).*organi[sz]ation/.test(code)) return 'ORGANIZATION_QUOTA_EXCEEDED';
  if (type === 'insufficient_quota' || code === 'insufficient_quota') {
    const project = /project.*(?:quota|budget|limit)/.test(message);
    const org = /organi[sz]ation.*(?:quota|budget|limit)/.test(message);
    return project && !org ? 'PROJECT_QUOTA_EXCEEDED' : org && !project ? 'ORGANIZATION_QUOTA_EXCEEDED' : 'QUOTA_SCOPE_UNDETERMINED';
  }
  if (status === 401) return 'AUTHENTICATION_FAILED';
  if (code === 'model_not_found' || code === 'model_access_denied') return 'MODEL_ACCESS_DENIED';
  if (status === 403) return 'ACCOUNT_PROJECT_OR_MODEL_ACCESS_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 200 && payload?.status === 'completed') return 'READY';
  if (status === 200 && payload?.status === 'incomplete') return 'ACCEPTED_OUTPUT_LIMIT';
  return 'REQUEST_FAILED';
}

async function main() {
  const authorized = (process.env.GITHUB_REF === 'refs/heads/codex/recovery-integration-20261111' && process.env.GITHUB_WORKFLOW === 'Recovery OpenAI readiness') ||
    (process.env.GITHUB_REF === 'refs/heads/codex/recovery-production-acceptance-20261112' && process.env.GITHUB_WORKFLOW === 'Recovery funded credential verification');
  if (process.env.GITHUB_REPOSITORY !== 'heavenskybird/stripunion' || !authorized ||
      process.env.GITHUB_RUN_ATTEMPT !== '1') throw new Error('Readiness probe authorization refused.');
  const model = process.env.EDITORIAL_MODEL || 'gpt-6-luna';
  const report = { version: 1, runId: process.env.GITHUB_RUN_ID, checkedAt: new Date().toISOString(),
    model: /^[a-zA-Z0-9_.:-]{1,100}$/.test(model) ? model : 'invalid', requests: 0, httpStatus: 0,
    classification: 'MISSING_CREDENTIAL', maxOutputTokens: 128, store: false };
  if (report.model === 'invalid') report.classification = 'INVALID_MODEL_CONFIGURATION';
  else if (process.env.OPENAI_API_KEY) {
    try {
      report.requests = 1;
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: 'Reply with OK only.', max_output_tokens: 128, store: false })
      });
      report.httpStatus = response.status;
      const payload = await response.json().catch(() => null);
      report.classification = classifyOpenAI(response.status, payload);
      report.effectiveAccountAccess = response.status === 200 && ['completed', 'incomplete'].includes(payload?.status);
      report.organizationHeaderPresent = Boolean(response.headers.get('openai-organization'));
      report.projectHeaderPresent = Boolean(response.headers.get('openai-project'));
      report.responseStatus = ['completed', 'incomplete', 'failed'].includes(payload?.status) ? payload.status : null;
      report.inputTokens = Number.isInteger(payload?.usage?.input_tokens) ? payload.usage.input_tokens : null;
      report.outputTokens = Number.isInteger(payload?.usage?.output_tokens) ? payload.usage.output_tokens : null;
    } catch { report.classification = report.httpStatus ? 'RESPONSE_READ_FAILED' : 'TRANSPORT_ERROR'; }
  }
  const file = 'work/recovery/openai-readiness.json';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
  console.log('OPENAI_READINESS ' + JSON.stringify(report));
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `OpenAI readiness: HTTP ${report.httpStatus}, ${report.classification}, requests=${report.requests}, model=${report.model}. No response content retained.\n`);
  if (report.classification !== 'READY') process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
