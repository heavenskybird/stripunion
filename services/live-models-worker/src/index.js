const STRIPCASH_MODELS_URL = 'https://go.whitetrafsa.com/app/models-ext/models';
const MIN_UPSTREAM_INTERVAL_MS = 10_000;
const CATALOG_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_STORED_MODELS = 500;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

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
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin'
  });
  if (origin && allowed.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function originAllowed(request, env) {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins(env).has(origin);
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

    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405, headers });

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'stripunion-live-models' }, { headers });
    }

    if (url.pathname !== '/models') return json({ error: 'not_found' }, { status: 404, headers });
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
};
