const STRIPCASH_MODELS_URL = 'https://go.whitetrafsa.com/app/models-ext/models';
const MIN_UPSTREAM_INTERVAL_MS = 10_000;
const CATALOG_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_MODELS = 500;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const ATTRIBUTION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'private, max-age=5');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
}

function languageCodes(value = '') {
  return String(value)
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((tag) => {
      const primary = tag.split('-')[0];
      return primary && primary !== tag ? [tag, primary] : [tag];
    });
}

export function isModelAllowed(model, geo = {}) {
  const geobans = model?.geobans || {};
  const blockedCountries = normalizeList(geobans.blockedCountries);
  const blockedLanguages = normalizeList(geobans.blockedLanguages);
  const blockedRegions = geobans.blockedRegions && typeof geobans.blockedRegions === 'object'
    ? geobans.blockedRegions
    : {};

  const country = String(geo.country || '').trim().toLowerCase();
  const region = String(geo.region || '').trim().toLowerCase();
  const languages = languageCodes(geo.languages || '');

  if (blockedLanguages.some((blocked) => languages.includes(blocked))) return false;

  if (!country) {
    const hasGeoRestrictions =
      blockedCountries.length > 0 ||
      Object.values(blockedRegions).some((regions) => Array.isArray(regions) && regions.length > 0);
    return !hasGeoRestrictions;
  }

  if (blockedCountries.includes(country)) return false;

  const countryRegions = normalizeList(
    blockedRegions[country] ??
    blockedRegions[country.toUpperCase()] ??
    []
  );

  if (countryRegions.length) {
    if (!region) return false;
    if (countryRegions.includes(region)) return false;
  }

  return true;
}

function publicModel(model) {
  return {
    id: Number(model.id || 0),
    username: String(model.username || ''),
    status: String(model.status || ''),
    gender: String(model.gender || model.broadcastGender || ''),
    broadcastHD: Boolean(model.broadcastHD),
    broadcastVR: Boolean(model.broadcastVR),
    snapshotUrl: String(
      model.popularSnapshotUrl ||
      model.verifiedPopularSnapshotUrl ||
      model.snapshotUrl ||
      model.previewUrlThumbSmall ||
      model.avatarUrl ||
      ''
    ),
    avatarUrl: String(model.avatarUrl || ''),
    tags: Array.isArray(model.tags) ? model.tags.map(String).slice(0, 12) : [],
    languages: Array.isArray(model.languages) ? model.languages.map(String).slice(0, 8) : [],
    modelsCountry: String(model.modelsCountry || ''),
    viewersCount: Number(model.viewersCount || 0),
    favoritedCount: Number(model.favoritedCount || 0),
    geobans: {
      blockedCountries: Array.isArray(model.geobans?.blockedCountries)
        ? model.geobans.blockedCountries.map(String)
        : [],
      blockedRegions: model.geobans?.blockedRegions && typeof model.geobans.blockedRegions === 'object'
        ? model.geobans.blockedRegions
        : {},
      blockedLanguages: Array.isArray(model.geobans?.blockedLanguages)
        ? model.geobans.blockedLanguages.map(String)
        : []
    }
  };
}

export function prepareCatalog(payload) {
  const models = Array.isArray(payload?.models) ? payload.models : [];
  return models
    .filter((model) => String(model?.status || '').toLowerCase() === 'public')
    .map(publicModel)
    .filter((model) => model.id && model.username && model.snapshotUrl)
    .sort((a, b) =>
      b.viewersCount - a.viewersCount ||
      b.favoritedCount - a.favoritedCount ||
      a.id - b.id
    )
    .slice(0, MAX_STORED_MODELS);
}

function filteredModels(catalog, requestUrl, geo) {
  const params = requestUrl.searchParams;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(params.get('limit') || DEFAULT_LIMIT)));
  const gender = String(params.get('gender') || '').trim().toLowerCase();
  const tag = String(params.get('tag') || '').trim().toLowerCase();
  const hd = params.get('hd') === '1';
  const vr = params.get('vr') === '1';

  return catalog
    .filter((model) => isModelAllowed(model, geo))
    .filter((model) => !gender || model.gender.toLowerCase() === gender)
    .filter((model) => !tag || model.tags.some((value) => value.toLowerCase() === tag))
    .filter((model) => !hd || model.broadcastHD)
    .filter((model) => !vr || model.broadcastVR)
    .slice(0, limit)
    .map(({ geobans, ...model }) => model);
}

function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = allowedOrigins(env);
  const headers = new Headers({
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'vary': 'Origin'
  });
  if (origin && allowed.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function originAllowed(request, env) {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins(env).has(origin);
}

function browserOriginAllowed(request, env) {
  const origin = request.headers.get('origin');
  return Boolean(origin && allowedOrigins(env).has(origin));
}

function safeText(value, fallback = 'unknown', max = 120) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  return text
    .replace(/[^a-zA-Z0-9_./:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || fallback;
}

function pickAlias(input, aliases) {
  const entries = Object.entries(input || {});
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.toLowerCase() === alias.toLowerCase());
    if (match && match[1] != null && String(match[1]).trim() !== '') return match[1];
  }
  return null;
}

export function normalizeMemberId(value) {
  const memberId = String(value || '').trim().toLowerCase();
  return /^su_[a-z0-9_]{8,80}$/.test(memberId) ? memberId : null;
}

export function normalizeAttributionClick(input = {}) {
  const memberId = normalizeMemberId(input.memberId);
  if (!memberId) return null;

  return {
    memberId,
    occurredAt: Number.isFinite(Number(input.occurredAt)) ? Number(input.occurredAt) : Date.now(),
    pagePath: safeText(input.pagePath, '/', 160),
    affiliateSource: safeText(input.affiliateSource),
    acquisitionSource: safeText(input.acquisitionSource),
    campaignId: safeText(input.campaignId),
    creativeId: safeText(input.creativeId),
    sourceId: safeText(input.sourceId, 'stripunion'),
    p1: safeText(input.p1),
    p2: safeText(input.p2),
    p3: safeText(input.p3),
    experimentId: input.experimentId ? safeText(input.experimentId, 'unknown', 100) : null,
    experimentVariant: input.experimentVariant ? safeText(input.experimentVariant, 'unknown', 40) : null,
    targetDomain: safeText(input.targetDomain, 'avcams.online'),
    destinationPath: safeText(input.destinationPath, '/', 180)
  };
}

export function normalizeExperimentExposure(input = {}) {
  const experimentId = safeText(input.experimentId, '', 100);
  const variant = safeText(input.variant, '', 40);
  const exposureId = safeText(input.exposureId, '', 120);
  if (!experimentId || !variant || !exposureId) return null;

  return {
    experimentId,
    variant,
    exposureId,
    occurredAt: Number.isFinite(Number(input.occurredAt)) ? Number(input.occurredAt) : Date.now(),
    pagePath: safeText(input.pagePath, '/', 160),
    affiliateSource: safeText(input.affiliateSource)
  };
}

function normalizeEventType(value) {
  const text = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (text.includes('first') && text.includes('purchase')) return 'first_purchase';
  if (text.includes('rebill')) return 'rebill';
  if (text.includes('refund')) return 'refund';
  if (text.includes('model') && (text.includes('registration') || text.includes('signup'))) return 'model_registration';
  if (text.includes('member') && (text.includes('registration') || text.includes('signup'))) return 'member_registration';
  if (text.includes('registration') || text.includes('signup')) return 'member_registration';
  if (text.includes('purchase')) return 'purchase';
  return text ? safeText(text, 'unknown', 60) : 'unknown';
}

function safeNumber(value) {
  if (value == null || value === '') return 0;
  const number = Number(String(value).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(number) ? number : 0;
}

export function normalizePostback(input = {}) {
  const memberId = normalizeMemberId(pickAlias(input, ['memberId', 'member_id', 'memberid']));
  const eventType = normalizeEventType(
    pickAlias(input, ['type', 'event', 'eventType', 'conversionType', 'postbackType', 'action'])
  );
  let revenue = safeNumber(
    pickAlias(input, ['revenue', 'payout', 'commission', 'earnings', 'amount'])
  );
  const currency = safeText(
    pickAlias(input, ['currency', 'currencyCode', 'currency_code']),
    'unknown',
    12
  ).toUpperCase();
  const transactionId = safeText(
    pickAlias(input, ['transactionId', 'transaction_id', 'txid', 'id']),
    '',
    120
  );

  if (eventType === 'refund' && revenue > 0) revenue = -revenue;

  return {
    memberId,
    eventType,
    revenue,
    currency,
    transactionId,
    occurredAt: Date.now()
  };
}

function emptySummary() {
  return {
    totalClicks: 0,
    totalPostbacks: 0,
    matchedPostbacks: 0,
    unmatchedPostbacks: 0,
    duplicatePostbacks: 0,
    eventCounts: {},
    revenueByCurrency: {},
    byP1: {},
    byAffiliateSource: {},
    byExperiment: {},
    updatedAt: null
  };
}

function incrementNumber(target, key, amount = 1) {
  target[key] = Number(target[key] || 0) + amount;
}

function incrementRevenue(target, currency, amount) {
  if (!amount) return;
  const key = safeText(currency, 'UNKNOWN', 12).toUpperCase();
  target[key] = Number(target[key] || 0) + amount;
}

function bucket(container, key) {
  const safeKey = safeText(key);
  if (!container[safeKey]) {
    container[safeKey] = {
      clicks: 0,
      postbacks: 0,
      matchedPostbacks: 0,
      eventCounts: {},
      revenueByCurrency: {}
    };
  }
  return container[safeKey];
}

function experimentVariantBucket(summary, experimentId, variant) {
  if (!experimentId || !variant) return null;
  const safeExperiment = safeText(experimentId, 'unknown', 100);
  const safeVariant = safeText(variant, 'unknown', 40);
  summary.byExperiment = summary.byExperiment || {};
  if (!summary.byExperiment[safeExperiment]) {
    summary.byExperiment[safeExperiment] = { variants: {} };
  }
  const variants = summary.byExperiment[safeExperiment].variants;
  if (!variants[safeVariant]) {
    variants[safeVariant] = {
      impressions: 0,
      clicks: 0,
      postbacks: 0,
      matchedPostbacks: 0,
      eventCounts: {},
      revenueByCurrency: {}
    };
  }
  return variants[safeVariant];
}

async function fingerprintPostback(postback) {
  const stable = JSON.stringify({
    memberId: postback.memberId,
    eventType: postback.eventType,
    revenue: postback.revenue,
    currency: postback.currency,
    transactionId: postback.transactionId
  });
  const bytes = new TextEncoder().encode(stable);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function requestPayload(request) {
  const url = new URL(request.url);
  const fromQuery = Object.fromEntries(url.searchParams.entries());
  delete fromQuery.token;

  if (request.method === 'GET') return fromQuery;

  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return { ...fromQuery, ...(await request.json()) };
    }
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      return { ...fromQuery, ...Object.fromEntries(form.entries()) };
    }
    const text = await request.text();
    if (!text) return fromQuery;
    try {
      return { ...fromQuery, ...JSON.parse(text) };
    } catch {
      return { ...fromQuery, ...Object.fromEntries(new URLSearchParams(text).entries()) };
    }
  } catch {
    return fromQuery;
  }
}

export class AttributionStore {
  constructor(state) {
    this.state = state;
  }

  async scheduleCleanup() {
    const current = await this.state.storage.getAlarm();
    const desired = Date.now() + ATTRIBUTION_CLEANUP_INTERVAL_MS;
    if (!current || current > desired) await this.state.storage.setAlarm(desired);
  }

  async alarm() {
    const cutoff = Date.now() - ATTRIBUTION_RETENTION_MS;
    const [clicks, events, seen, exposures] = await Promise.all([
      this.state.storage.list({ prefix: 'click:' }),
      this.state.storage.list({ prefix: 'event:' }),
      this.state.storage.list({ prefix: 'seen:' }),
      this.state.storage.list({ prefix: 'exposure:' })
    ]);

    const deletes = [];
    for (const [key, value] of clicks) {
      if (Number(value?.occurredAt || 0) < cutoff) deletes.push(key);
    }
    for (const [key, value] of events) {
      if (Number(value?.occurredAt || 0) < cutoff) deletes.push(key);
    }
    for (const [key, value] of seen) {
      if (Number(value || 0) < cutoff) deletes.push(key);
    }
    for (const [key, value] of exposures) {
      if (Number(value || 0) < cutoff) deletes.push(key);
    }
    if (deletes.length) await this.state.storage.delete(deletes);
    if (clicks.size || events.size || seen.size || exposures.size) {
      await this.state.storage.setAlarm(Date.now() + ATTRIBUTION_CLEANUP_INTERVAL_MS);
    }
  }

  async recordClick(input) {
    if (input?.test === true) return { ok: true, test: true };

    const click = normalizeAttributionClick(input);
    if (!click) return { ok: false, error: 'invalid_member_id' };

    const key = `click:${click.memberId}`;
    const existing = await this.state.storage.get(key);
    await this.state.storage.put(key, click);

    if (!existing) {
      const summary = (await this.state.storage.get('summary')) || emptySummary();
      summary.totalClicks += 1;
      bucket(summary.byP1, click.p1).clicks += 1;
      bucket(summary.byAffiliateSource, click.affiliateSource).clicks += 1;
      const experiment = experimentVariantBucket(summary, click.experimentId, click.experimentVariant);
      if (experiment) experiment.clicks += 1;
      summary.updatedAt = new Date().toISOString();
      await this.state.storage.put('summary', summary);
    }

    await this.scheduleCleanup();
    return { ok: true };
  }

  async recordExperiment(input) {
    if (input?.test === true) return { ok: true, test: true };

    const exposure = normalizeExperimentExposure(input);
    if (!exposure) return { ok: false, error: 'invalid_experiment_exposure' };

    const seenKey = `exposure:${exposure.exposureId}`;
    if (await this.state.storage.get(seenKey)) {
      return { ok: true, duplicate: true };
    }

    const summary = (await this.state.storage.get('summary')) || emptySummary();
    const variant = experimentVariantBucket(summary, exposure.experimentId, exposure.variant);
    variant.impressions += 1;
    summary.updatedAt = new Date().toISOString();

    await this.state.storage.put({
      summary,
      [seenKey]: exposure.occurredAt
    });
    await this.scheduleCleanup();
    return { ok: true };
  }

  async recordPostback(input) {
    const postback = normalizePostback(input);
    const fingerprint = await fingerprintPostback(postback);
    const seenKey = `seen:${fingerprint}`;

    if (await this.state.storage.get(seenKey)) {
      const summary = (await this.state.storage.get('summary')) || emptySummary();
      summary.duplicatePostbacks += 1;
      summary.updatedAt = new Date().toISOString();
      await this.state.storage.put('summary', summary);
      return { ok: true, duplicate: true };
    }

    const click = postback.memberId
      ? await this.state.storage.get(`click:${postback.memberId}`)
      : null;

    const summary = (await this.state.storage.get('summary')) || emptySummary();
    summary.totalPostbacks += 1;
    if (click) summary.matchedPostbacks += 1;
    else summary.unmatchedPostbacks += 1;
    incrementNumber(summary.eventCounts, postback.eventType);
    incrementRevenue(summary.revenueByCurrency, postback.currency, postback.revenue);

    if (click) {
      for (const group of [
        bucket(summary.byP1, click.p1),
        bucket(summary.byAffiliateSource, click.affiliateSource)
      ]) {
        group.postbacks += 1;
        group.matchedPostbacks += 1;
        incrementNumber(group.eventCounts, postback.eventType);
        incrementRevenue(group.revenueByCurrency, postback.currency, postback.revenue);
      }

      const experiment = experimentVariantBucket(summary, click.experimentId, click.experimentVariant);
      if (experiment) {
        experiment.postbacks += 1;
        experiment.matchedPostbacks += 1;
        incrementNumber(experiment.eventCounts, postback.eventType);
        incrementRevenue(experiment.revenueByCurrency, postback.currency, postback.revenue);
      }
    }

    summary.updatedAt = new Date().toISOString();
    const eventRecord = {
      occurredAt: postback.occurredAt,
      eventType: postback.eventType,
      revenue: postback.revenue,
      currency: postback.currency,
      matched: Boolean(click),
      p1: click?.p1 || null,
      affiliateSource: click?.affiliateSource || null,
      experimentId: click?.experimentId || null,
      experimentVariant: click?.experimentVariant || null
    };

    await this.state.storage.put({
      summary,
      [seenKey]: postback.occurredAt,
      [`event:${postback.occurredAt}:${fingerprint.slice(0, 16)}`]: eventRecord
    });
    await this.scheduleCleanup();

    return { ok: true, matched: Boolean(click), eventType: postback.eventType };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/click' && request.method === 'POST') {
      return json(await this.recordClick(await request.json()), { status: 202 });
    }

    if (url.pathname === '/experiment' && request.method === 'POST') {
      return json(await this.recordExperiment(await request.json()), { status: 202 });
    }

    if (url.pathname === '/postback' && request.method === 'POST') {
      return json(await this.recordPostback(await request.json()), { status: 200 });
    }

    if (url.pathname === '/summary' && request.method === 'GET') {
      return json({
        ok: true,
        summary: (await this.state.storage.get('summary')) || emptySummary()
      });
    }

    return json({ error: 'not_found' }, { status: 404 });
  }
}

export class ModelsCatalog {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.refreshPromise = null;
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }

  async refreshCatalog(existingCatalog, existingFetchedAt) {
    const token = String(this.env.STRIPCASH_MODELS_API_KEY || '').trim();
    const userId = String(this.env.STRIPCASH_USER_ID || '').trim();
    if (!token || !userId) throw new Error('StripCash Models API worker is not configured.');

    const attemptedAt = Date.now();
    await this.state.storage.put('attemptedAt', attemptedAt);

    const url = new URL(STRIPCASH_MODELS_URL);
    url.searchParams.set('userId', userId);

    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          origin: 'https://stripunion.com',
          referer: 'https://stripunion.com/',
          'user-agent': 'StripUnion-LiveModels/1.0'
        }
      });

      if (!response.ok) {
        const diagnostic = `upstream_http_${response.status}`;
        console.error(`StripCash Models API diagnostic: ${diagnostic}`);
        if (Array.isArray(existingCatalog)) {
          return { catalog: existingCatalog, fetchedAt: existingFetchedAt, stale: true };
        }
        const error = new Error('StripCash Models API upstream request failed.');
        error.code = diagnostic;
        throw error;
      }

      const payload = await response.json();
      const prepared = prepareCatalog(payload);
      const refreshedAt = Date.now();

      await this.state.storage.put({
        catalog: prepared,
        fetchedAt: refreshedAt,
        attemptedAt: refreshedAt
      });
      await this.state.storage.setAlarm(refreshedAt + CATALOG_RETENTION_MS);

      return { catalog: prepared, fetchedAt: refreshedAt, stale: false };
    } catch (error) {
      if (Array.isArray(existingCatalog)) {
        return { catalog: existingCatalog, fetchedAt: existingFetchedAt, stale: true };
      }
      if (!error?.code) {
        error.code = 'upstream_fetch_error';
        console.error('StripCash Models API diagnostic: upstream_fetch_error');
      }
      throw error;
    }
  }

  async loadCatalog() {
    const now = Date.now();
    const stored = await this.state.storage.get(['catalog', 'fetchedAt', 'attemptedAt']);
    const catalog = stored.get('catalog');
    const fetchedAt = Number(stored.get('fetchedAt') || 0);
    const attemptedAt = Number(stored.get('attemptedAt') || 0);
    const newestAttempt = Math.max(fetchedAt, attemptedAt);

    if (Array.isArray(catalog) && now - fetchedAt < MIN_UPSTREAM_INTERVAL_MS) {
      return { catalog, fetchedAt, stale: false };
    }

    if (now - newestAttempt < MIN_UPSTREAM_INTERVAL_MS) {
      if (Array.isArray(catalog)) return { catalog, fetchedAt, stale: true };
      throw new Error('StripCash Models API refresh is cooling down.');
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refreshCatalog(catalog, fetchedAt)
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/models') return json({ error: 'not_found' }, { status: 404 });

    try {
      const { catalog, fetchedAt, stale = false } = await this.loadCatalog();
      const geo = {
        country: request.headers.get('x-su-country') || '',
        region: request.headers.get('x-su-region') || '',
        languages: request.headers.get('x-su-languages') || ''
      };
      const models = filteredModels(catalog, url, geo);
      return json({
        ok: true,
        refreshedAt: new Date(fetchedAt).toISOString(),
        stale,
        count: models.length,
        models
      });
    } catch {
      return json({ ok: false, error: 'models_unavailable' }, { status: 503 });
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'stripunion-live-models' }, { headers });
    }

    if (url.pathname === '/models') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405, headers });
      if (!originAllowed(request, env)) return json({ error: 'origin_not_allowed' }, { status: 403, headers });

      const id = env.CATALOG.idFromName('global');
      const stub = env.CATALOG.get(id);
      const internal = new Request(`https://catalog.internal/models${url.search}`, {
        headers: {
          'x-su-country': String(request.cf?.country || ''),
          'x-su-region': String(request.cf?.regionCode || ''),
          'x-su-languages': request.headers.get('accept-language') || ''
        }
      });
      const response = await stub.fetch(internal);
      const outgoing = new Response(response.body, response);
      headers.forEach((value, key) => outgoing.headers.set(key, value));
      return outgoing;
    }

    if (url.pathname === '/events/click' || url.pathname === '/events/experiment') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405, headers });
      if (!browserOriginAllowed(request, env)) return json({ error: 'origin_not_allowed' }, { status: 403, headers });

      const payload = await requestPayload(request);
      const id = env.ATTRIBUTION.idFromName('global');
      const stub = env.ATTRIBUTION.get(id);
      const internalPath = url.pathname === '/events/experiment' ? '/experiment' : '/click';
      const response = await stub.fetch(new Request('https://attribution.internal' + internalPath, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }));
      const outgoing = new Response(response.body, response);
      headers.forEach((value, key) => outgoing.headers.set(key, value));
      return outgoing;
    }

    if (url.pathname === '/postback/stripcash') {
      if (!['GET', 'POST'].includes(request.method)) {
        return json({ error: 'method_not_allowed' }, { status: 405 });
      }

      const secret = String(env.STRIPCASH_POSTBACK_SECRET || '').trim();
      if (!secret) return json({ error: 'postback_not_configured' }, { status: 503 });

      const supplied =
        url.searchParams.get('token') ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        '';

      if (!constantTimeEqual(secret, supplied)) {
        return json({ error: 'unauthorized' }, { status: 401 });
      }

      const payload = await requestPayload(request);
      if (String(payload.test || '').toLowerCase() === 'true' || String(payload.test || '') === '1') {
        return json({ ok: true, test: true });
      }

      const id = env.ATTRIBUTION.idFromName('global');
      const stub = env.ATTRIBUTION.get(id);
      return stub.fetch(new Request('https://attribution.internal/postback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }));
    }

    if (url.pathname === '/analytics/summary') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405 });

      const secret = String(env.STRIPCASH_POSTBACK_SECRET || '').trim();
      const supplied =
        request.headers.get('x-stripunion-attribution-token') ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        '';
      if (!secret) return json({ error: 'analytics_not_configured' }, { status: 503 });
      if (!constantTimeEqual(secret, supplied)) return json({ error: 'unauthorized' }, { status: 401 });

      const id = env.ATTRIBUTION.idFromName('global');
      const stub = env.ATTRIBUTION.get(id);
      return stub.fetch(new Request('https://attribution.internal/summary'));
    }

    return json({ error: 'not_found' }, { status: 404, headers });
  }
};
