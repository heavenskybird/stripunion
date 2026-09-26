import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const API_ORIGIN = 'https://developers.hostinger.com';
const API_PATH_PREFIX = '/api/hosting/v1/';
const MAX_PAGES = 30;
const PAGE_SIZE = 100;

export function exactWebsiteMatch(websites, domain) {
  return websites.find((website) => String(website?.domain ?? '').toLowerCase() === domain.toLowerCase()) ?? null;
}

export function getRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export function newestFirst(records) {
  return [...records].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at ?? left?.started_at ?? left?.createdAt ?? '') || 0;
    const rightTime = Date.parse(right?.created_at ?? right?.started_at ?? right?.createdAt ?? '') || 0;
    return rightTime - leftTime;
  });
}

export function inspectIndexingGuard(environmentVariables) {
  const guard = environmentVariables.find((item) => (item?.name ?? item?.key) === 'PUBLIC_ALLOW_INDEXING');
  if (!guard) return { exists: false, state: 'missing' };
  const value = guard.value ?? guard.current_value;
  if (value === false || value === 'false') return { exists: true, state: 'valid' };
  if (value === true || value === 'true') return { exists: true, state: 'incorrect' };
  // Hostinger's documented response masks values; presence alone cannot prove the guard value.
  return { exists: true, state: 'unverifiable' };
}

export function sanitizeLogLine(input, token = '') {
  let line = String(input ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  if (token) line = line.split(token).join('[REDACTED]');
  return line
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(?:api[_-]?(?:key|token)|access[_-]?token|refresh[_-]?token|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\b(?:sk|gh[pousr])[-_][A-Za-z0-9_-]{12,}\b/g, '[REDACTED_TOKEN]')
    .slice(0, 320);
}

export function summarizeLogs(payload, token = '') {
  const rawLogs = payload?.logs ?? payload?.log ?? payload?.output ?? payload?.lines_text ?? '';
  const lines = Array.isArray(rawLogs) ? rawLogs.map((entry) => typeof entry === 'string' ? entry : entry?.message ?? JSON.stringify(entry)) : String(rawLogs).split(/\r?\n/);
  const warnings = lines.filter((line) => /\bwarn(?:ing)?\b/i.test(line));
  const errors = lines.filter((line) => /\berror\b|\bfatal\b|\bfailed\b|\bexception\b/i.test(line));
  return {
    lineCount: Number.isFinite(payload?.lines) ? payload.lines : lines.filter(Boolean).length,
    warningCount: warnings.length,
    errorCount: errors.length,
    warnings: warnings.slice(-5).map((line) => sanitizeLogLine(line, token)),
    errors: errors.slice(-8).map((line) => sanitizeLogLine(line, token)),
  };
}

function listFromEnvelope(payload) {
  return getRecords(payload);
}

function findNamedField(value, candidateNames, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (candidateNames.includes(key.toLowerCase()) && (typeof child === 'string' || typeof child === 'number')) return String(child);
  }
  for (const child of Object.values(value)) {
    const found = findNamedField(child, candidateNames, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function safeCommitSha(...objects) {
  return objects.map((item) => findNamedField(item, ['commit_sha', 'commit_hash', 'sha', 'commit'])?.match(/^[0-9a-f]{7,40}$/i)?.[0] ?? null).find(Boolean) ?? null;
}

function safeRepo(settings) {
  const source = settings?.repository ?? settings?.repo ?? settings?.source_options ?? settings?.sourceOptions;
  const owner = settings?.owner ?? source?.owner ?? source?.repository_owner ?? source?.repositoryOwner;
  if (typeof source === 'string') return owner ? `${owner}/${source}` : source;
  const name = source?.name ?? source?.repository ?? source?.repository_name ?? source?.repositoryName;
  const resolvedName = name ?? settings?.repository_name ?? settings?.repositoryName;
  return owner && resolvedName ? `${owner}/${resolvedName}` : (source?.url ?? source?.repository_url ?? settings?.repository_url ?? null);
}

function makeApiClient(token, fetchImpl = fetch) {
  async function get(path, query = {}) {
    if (!path.startsWith(API_PATH_PREFIX) || path.includes('..')) throw new Error('Refused a request outside the documented Hostinger hosting API.');
    const url = new URL(path, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new Error('Hostinger API request failed before a response was received.');
    }
    if (response.status === 401 || response.status === 403) throw new Error('Hostinger API authentication failed or access was denied.');
    if (!response.ok) throw new Error(`Hostinger API returned HTTP ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new Error('Hostinger API returned an invalid JSON response.');
    }
  }

  return { get };
}

async function getAllPages(api, path) {
  const records = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await api.get(path, { page, per_page: PAGE_SIZE });
    const batch = listFromEnvelope(payload);
    records.push(...batch);
    const meta = payload?.meta ?? payload?.data?.meta ?? {};
    const lastPage = Number(meta.last_page ?? meta.lastPage ?? meta.total_pages ?? meta.totalPages ?? 0);
    if (batch.length < PAGE_SIZE || (lastPage && page >= lastPage)) return records;
  }
  throw new Error(`Hostinger API pagination exceeded ${MAX_PAGES} pages.`);
}

function summarizeWebsiteStatus(website) {
  if (typeof website?.is_enabled === 'boolean') return website.is_enabled ? 'enabled' : 'disabled';
  if (typeof website?.isEnabled === 'boolean') return website.isEnabled ? 'enabled' : 'disabled';
  return website?.status ?? 'not exposed';
}

async function runObservability(token, domain) {
  const api = makeApiClient(token);
  const websites = await getAllPages(api, `${API_PATH_PREFIX}websites`);
  const website = exactWebsiteMatch(websites, domain);
  if (!website) throw new Error(`Staging website was not found by exact domain match: ${domain}`);
  const username = website.username;
  if (typeof username !== 'string' || !username) throw new Error('Hostinger website response did not expose the account username required for Node.js reads.');

  const accountPath = `${API_PATH_PREFIX}accounts/${encodeURIComponent(username)}/websites/${encodeURIComponent(domain)}`;
  const [settingsResult, buildsResult, envResult, gitResult] = await Promise.allSettled([
    api.get(`${accountPath}/nodejs/builds/settings`),
    getAllPages(api, `${accountPath}/nodejs/builds`),
    api.get(`${accountPath}/nodejs/builds/settings/env`),
    api.get(`${accountPath}/git/auto-deployments/settings`),
  ]);
  const settings = settingsResult.status === 'fulfilled' ? settingsResult.value?.data ?? settingsResult.value : {};
  const builds = buildsResult.status === 'fulfilled' ? listFromEnvelope(buildsResult.value) : [];
  const envVariables = envResult.status === 'fulfilled' ? listFromEnvelope(envResult.value) : [];
  const gitSettings = gitResult.status === 'fulfilled' ? gitResult.value?.data ?? gitResult.value : {};
  const latest = newestFirst(builds)[0] ?? null;

  let details = null;
  let logs = { lineCount: 0, warningCount: 0, errorCount: 0, warnings: [], errors: [] };
  const buildUuid = latest?.uuid ?? latest?.id ?? null;
  if (latest && buildUuid) {
    const [detailResult, logsResult] = await Promise.allSettled([
      api.get(`${accountPath}/nodejs/builds/${encodeURIComponent(buildUuid)}`),
      api.get(`${accountPath}/nodejs/builds/${encodeURIComponent(buildUuid)}/logs`, { from_line: 0 }),
    ]);
    details = detailResult.status === 'fulfilled' ? detailResult.value?.data ?? detailResult.value : null;
    logs = logsResult.status === 'fulfilled'
      ? summarizeLogs(logsResult.value?.data ?? logsResult.value, token)
      : { ...logs, fetchError: 'Build logs could not be read.' };
  }

  const guard = inspectIndexingGuard(envVariables);
  const buildState = details?.state ?? details?.status ?? latest?.state ?? latest?.status ?? 'not available';
  const report = {
    domain,
    websiteStatus: summarizeWebsiteStatus(website),
    framework: settings.app_type ?? settings.appType ?? settings.framework ?? details?.options?.app_type ?? details?.options?.appType ?? null,
    nodeVersion: settings.node_version ?? settings.nodeVersion ?? details?.options?.node_version ?? details?.options?.nodeVersion ?? null,
    buildConfiguration: {
      rootDirectory: settings.root_directory ?? settings.rootDirectory ?? null,
      outputDirectory: settings.output_directory ?? settings.outputDirectory ?? null,
      buildScript: settings.build_script ?? settings.buildScript ?? null,
      entryFile: settings.entry_file ?? settings.entryFile ?? null,
      packageManager: settings.package_manager ?? settings.packageManager ?? null,
    },
    gitRepository: safeRepo(gitSettings),
    branch: gitSettings.branch ?? gitSettings.branch_name ?? gitSettings.branchName ?? null,
    autoDeploymentEnabled: typeof gitSettings.is_enabled === 'boolean' ? gitSettings.is_enabled : typeof gitSettings.isEnabled === 'boolean' ? gitSettings.isEnabled : null,
    latestBuild: latest ? {
      uuid: buildUuid,
      state: buildState,
      createdAt: details?.created_at ?? details?.createdAt ?? latest.created_at ?? latest.createdAt ?? null,
      startedAt: details?.started_at ?? details?.startedAt ?? latest.started_at ?? latest.startedAt ?? null,
      completedAt: details?.completed_at ?? details?.completedAt ?? latest.completed_at ?? latest.completedAt ?? null,
      updatedAt: details?.updated_at ?? details?.updatedAt ?? latest.updated_at ?? latest.updatedAt ?? null,
      commitSha: safeCommitSha(details, latest),
    } : null,
    logs,
    publicAllowIndexing: guard,
    environmentVariableNames: envVariables.map((item) => item?.name ?? item?.key).filter((name) => typeof name === 'string'),
    readErrors: [settingsResult, buildsResult, envResult, gitResult].flatMap((result, index) => result.status === 'rejected' ? [['build settings', 'build list', 'environment-variable names', 'Git deployment settings'][index]] : []),
  };

  console.log(JSON.stringify(report, null, 2));
  const failed = [];
  if (!latest) failed.push('No Node.js builds were returned.');
  if (String(buildState).toLowerCase() === 'failed') failed.push('The latest deployment/build failed.');
  if (guard.state !== 'valid') failed.push(`PUBLIC_ALLOW_INDEXING guard is ${guard.state}; the API must expose the exact value false to accept staging.`);
  if (report.readErrors.length) failed.push(`Some optional metadata reads failed: ${report.readErrors.join(', ')}.`);
  if (logs.fetchError) failed.push(logs.fetchError);
  if (logs.errorCount) failed.push('Latest build logs contain error/fatal/failure lines.');
  if (failed.length) throw new Error(failed.join(' '));
}

function selfTest() {
  assert.equal(exactWebsiteMatch([{ domain: 'not-yellowgreen-duck-244197.hostingersite.com' }, { domain: 'yellowgreen-duck-244197.hostingersite.com' }], 'yellowgreen-duck-244197.hostingersite.com')?.domain, 'yellowgreen-duck-244197.hostingersite.com');
  assert.equal(exactWebsiteMatch([{ domain: 'yellowgreen-duck-244197.hostingersite.com.evil' }], 'yellowgreen-duck-244197.hostingersite.com'), null);
  assert.deepEqual(getRecords({ data: [{ id: 1 }] }), [{ id: 1 }]);
  assert.equal(newestFirst([{ created_at: '2026-01-01' }, { created_at: '2026-02-01' }])[0].created_at, '2026-02-01');
  assert.equal(inspectIndexingGuard([{ name: 'PUBLIC_ALLOW_INDEXING', value: 'false' }]).state, 'valid');
  assert.equal(inspectIndexingGuard([{ name: 'PUBLIC_ALLOW_INDEXING', value: 'true' }]).state, 'incorrect');
  assert.equal(inspectIndexingGuard([{ name: 'PUBLIC_ALLOW_INDEXING', value: '********' }]).state, 'unverifiable');
  const scrubbed = sanitizeLogLine('Authorization: Bearer abc123 HOSTINGER_API_TOKEN=supersecret gho_abcdefghijklmnopqrstu', 'abc123');
  assert.doesNotMatch(scrubbed, /abc123|supersecret|gho_abcdefghijklmnopqrstu/);
  assert.match(scrubbed, /REDACTED/);
  assert.equal(summarizeLogs({ logs: ['warning: be careful', 'ERROR: build failed'] }).errorCount, 1);
  console.log('Hostinger read-only checker self-test passed.');
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    const token = process.env.HOSTINGER_API_TOKEN;
    const domain = process.env.HOSTINGER_STAGING_DOMAIN;
    if (!token || !domain) {
      console.error('Missing required HOSTINGER_API_TOKEN or HOSTINGER_STAGING_DOMAIN environment variable. No Hostinger API request was made.');
      process.exitCode = 1;
    } else {
      runObservability(token, domain).catch((error) => {
        console.error(`Hostinger read-only acceptance failed: ${error.message}`);
        process.exitCode = 1;
      });
    }
  }
}
