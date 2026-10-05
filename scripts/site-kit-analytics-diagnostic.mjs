const siteUrl = String(process.env.WP_SITE_URL || 'https://blog.stripunion.com').replace(/\/+$/, '');
const username = String(process.env.WP_USERNAME || '').trim();
const appPassword = String(process.env.WP_APP_PASSWORD || '').trim();

if (!username || !appPassword) {
  throw new Error('WP_USERNAME / WP_APP_PASSWORD are required for Site Kit diagnostics.');
}

const auth = Buffer.from(username + ':' + appPassword).toString('base64');

async function request(path, options = {}) {
  const response = await fetch(siteUrl + '/wp-json/' + path.replace(/^\//, ''), {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: 'Basic ' + auth,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20_000)
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    throw new Error('WordPress REST request failed: HTTP ' + response.status + ' ' + JSON.stringify(body).slice(0, 800));
  }
  return body;
}

function locateSettings(body) {
  const candidates = [
    body,
    body?.data,
    body?.data?.settings,
    body?.settings
  ];
  return candidates.find((value) => value && typeof value === 'object' && !Array.isArray(value) && (
    Object.hasOwn(value, 'measurementID') ||
    Object.hasOwn(value, 'useSnippet') ||
    Object.hasOwn(value, 'propertyID')
  )) || {};
}

const raw = await request('google-site-kit/v1/modules/analytics-4/data/settings');
const settings = locateSettings(raw);

const safe = {
  measurementID: settings.measurementID || null,
  googleTagID: settings.googleTagID || null,
  propertyID: settings.propertyID || null,
  webDataStreamID: settings.webDataStreamID || null,
  useSnippet: settings.useSnippet ?? null,
  canUseSnippet: settings.canUseSnippet ?? null,
  trackingDisabled: settings.trackingDisabled ?? null
};

console.log('SITE_KIT_ANALYTICS_SETTINGS ' + JSON.stringify(safe));

if (process.env.GITHUB_OUTPUT) {
  const output = [
    'measurement_id=' + String(safe.measurementID || ''),
    'google_tag_id=' + String(safe.googleTagID || ''),
    'use_snippet=' + String(safe.useSnippet ?? ''),
    'can_use_snippet=' + String(safe.canUseSnippet ?? ''),
    ''
  ].join('\n');
  await import('node:fs/promises').then(({ appendFile }) => appendFile(process.env.GITHUB_OUTPUT, output, 'utf8'));
}
