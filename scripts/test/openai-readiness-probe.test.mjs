import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOpenAI } from '../openai-readiness-probe.mjs';
test('probe distinguishes credit, scoped quotas, rate and access without copying provider text', () => {
  for (const [http, error, expected] of [
    [429, { code: 'credit_balance_exhausted' }, 'CREDIT_BALANCE_EXHAUSTED'],
    [429, { code: 'project_quota_exceeded' }, 'PROJECT_QUOTA_EXCEEDED'],
    [429, { code: 'organization_quota_exceeded' }, 'ORGANIZATION_QUOTA_EXCEEDED'],
    [429, { type: 'insufficient_quota' }, 'QUOTA_SCOPE_UNDETERMINED'],
    [429, { code: 'rate_limit_exceeded' }, 'RATE_LIMITED'],
    [404, { code: 'model_not_found' }, 'MODEL_ACCESS_DENIED'],
    [401, {}, 'AUTHENTICATION_FAILED'],
    [403, {}, 'ACCOUNT_PROJECT_OR_MODEL_ACCESS_DENIED']
  ]) assert.equal(classifyOpenAI(http, { error: { message: 'private data', ...error } }), expected);
  assert.equal(classifyOpenAI(200, { status: 'completed' }), 'READY');
  assert.equal(classifyOpenAI(200, { status: 'incomplete' }), 'ACCEPTED_OUTPUT_LIMIT');
});
