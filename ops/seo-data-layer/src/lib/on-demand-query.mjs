import { createHash } from 'node:crypto';
const DAY = 86400000;
export const PROPERTIES = { domain: 'sc-domain:stripunion.com', blog: 'https://blog.stripunion.com/' };
export const GA4_PROPERTY = '530171093';
const hosts = ['stripunion.com', 'www.stripunion.com', 'blog.stripunion.com'];
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function safeText(value) {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (text.length > 200 || /[<>\x00-\x1f@]|(?:^|[^a-z0-9])(?:\d[ .()+-]?){7,}(?:$|[^a-z0-9])|[a-f0-9]{24,}|(?:token|password|api[_-]?key|gclid|fbclid)\s*[=:]/i.test(text)) return '[REDACTED]';
  return text;
}
export function safePath(value) {
  try {
    const url = new URL(value, 'https://stripunion.com');
    if (!hosts.includes(url.hostname) || url.protocol !== 'https:' || url.username || url.password || /%40|%3d|%3f/i.test(url.pathname)) return '[REDACTED]';
    if (/\/(?:user|users|member|members|account|profile)(?:\/|$)/i.test(url.pathname) || safeText(decodeURIComponent(url.pathname)) === '[REDACTED]') return '[REDACTED]';
    return (String(value).startsWith('https://') ? url.origin : '') + url.pathname;
  } catch { return '[REDACTED]'; }
}
const iso = millis => new Date(millis).toISOString().slice(0, 10);
function date(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || iso(Date.parse(value)) !== value) throw Error('INVALID_DATE'); return Date.parse(value); }
export function parseQuery(raw, now = Date.now()) {
  let q; try { q = JSON.parse(raw || '{}'); } catch { throw Error('INVALID_QUERY_JSON'); }
  if (!q || Array.isArray(q) || typeof q !== 'object') throw Error('INVALID_QUERY_OBJECT');
  const keys = ['sources','property','days','startDate','endDate','keyword','page','countryGsc','countryGa4','device','sourceMedium','campaign','adContent','hostname'];
  if (Object.keys(q).some(k => !keys.includes(k))) throw Error('UNKNOWN_QUERY_FIELD');
  const out = { sources: 'all', property: 'domain', days: 28, ...q };
  if (!['all','gsc','ga4'].includes(out.sources) || !Object.hasOwn(PROPERTIES, out.property)) throw Error('PROPERTY_OR_SOURCE_NOT_ALLOWED');
  if (!Number.isInteger(out.days) || out.days < 1 || out.days > 480) throw Error('DAYS_OUT_OF_BOUNDS');
  const end = out.endDate || iso(now - 3 * DAY);
  const start = out.startDate || iso(date(end) - (out.days - 1) * DAY);
  const length = Math.round((date(end) - date(start)) / DAY) + 1;
  if (length < 1 || length > 480 || date(end) > date(iso(now - DAY))) throw Error('DATE_RANGE_OUT_OF_BOUNDS');
  const earliest = new Date(now); earliest.setUTCMonth(earliest.getUTCMonth() - 16);
  const retentionStart = iso(earliest.getTime());
  if (out.sources !== 'ga4' && start < retentionStart) throw Error('GSC_OUTSIDE_16_MONTH_RETENTION');
  for (const k of ['keyword','sourceMedium','campaign','adContent']) {
    if (out[k] !== undefined && (typeof out[k] !== 'string' || safeText(out[k]) === '[REDACTED]')) throw Error('UNSAFE_FILTER_VALUE');
  }
  if (out.page !== undefined && (typeof out.page !== 'string' || !out.page.startsWith('/') || out.page.startsWith('//') || safePath(out.page) !== out.page || /[?#]/.test(out.page))) throw Error('PAGE_MUST_BE_PUBLIC_PATH_WITHOUT_QUERY');
  if (out.countryGsc && !/^[a-z]{3}$/.test(out.countryGsc)) throw Error('GSC_COUNTRY_REQUIRES_ISO3_LOWERCASE');
  if (out.countryGa4 && !/^[A-Z]{2}$/.test(out.countryGa4)) throw Error('GA4_COUNTRY_REQUIRES_ISO2_UPPERCASE');
  if (out.device && !['desktop','mobile','tablet'].includes(out.device)) throw Error('DEVICE_NOT_ALLOWED');
  if (out.hostname && !hosts.includes(out.hostname)) throw Error('HOST_NOT_ALLOWED');
  if (out.property === 'blog' && out.hostname && out.hostname !== 'blog.stripunion.com') throw Error('BLOG_HOST_CONFLICT');
  const previous = { startDate: iso(date(start) - length * DAY), endDate: iso(date(start) - DAY) };
  return { ...out, startDate: start, endDate: end, days: length, previous,
    gscPreviousAvailable: previous.startDate >= retentionStart, retentionStart,
    gscProperty: PROPERTIES[out.property], ga4Property: GA4_PROPERTY,
    ga4Hosts: out.hostname ? [out.hostname] : out.property === 'blog' ? ['blog.stripunion.com'] : hosts };
}
export function gscFilters(q) {
  const filters = [];
  for (const [key, dimension] of [['keyword','query'],['page','page'],['countryGsc','country'],['device','device']]) if (q[key]) filters.push({ dimension, operator: ['keyword','page'].includes(key) ? 'contains' : 'equals', expression: key === 'device' ? q[key].toUpperCase() : q[key] });
  if (q.hostname) filters.push({ dimension: 'page', operator: 'contains', expression: 'https://' + q.hostname + '/' });
  return filters.length ? { dimensionFilterGroups: [{ groupType: 'and', filters }] } : {};
}
export function ga4Filter(q, affiliate = false) {
  const expressions = [{ filter: { fieldName: 'hostName', inListFilter: { values: q.ga4Hosts, caseSensitive: false } } }];
  for (const [key, fieldName] of [['page','landingPage'],['countryGa4','countryId'],['device','deviceCategory'],['sourceMedium','sessionSourceMedium'],['campaign','sessionCampaignName'],['adContent','sessionManualAdContent']]) if (q[key]) expressions.push({ filter: { fieldName, stringFilter: { matchType: ['page','countryGa4','device'].includes(key) ? 'EXACT' : 'CONTAINS', value: q[key], caseSensitive: false } } });
  if (affiliate) expressions.push({ filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'affiliate_click' } } });
  return { andGroup: { expressions } };
}
export function chunks(window, days = 31) {
  const result = [];
  for (let start = date(window.startDate); start <= date(window.endDate); start += days * DAY) result.push({ startDate: iso(start), endDate: iso(Math.min(date(window.endDate), start + (days - 1) * DAY)) });
  return result;
}
export function aggregateSearch(rows) {
  const clicks = rows.reduce((n,r) => n + Number(r.clicks || 0), 0), impressions = rows.reduce((n,r) => n + Number(r.impressions || 0), 0);
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null, position: impressions ? rows.reduce((n,r) => n + r.position * r.impressions, 0) / impressions : null };
}
export function intent(query) {
  const brand = /stripchat/i.test(query) ? 'stripchat' : /chaturbate/i.test(query) ? 'chaturbate' : /live\s?jasmin/i.test(query) ? 'livejasmin' : /xhamster/i.test(query) ? 'xhamster' : 'other';
  const type = /alternative|\bvs\b|versus|compare/i.test(query) ? 'comparison' : /app|mobile|android|iphone/i.test(query) ? 'mobile' : /token|price|pricing|cost|free|pay/i.test(query) ? 'pricing' : /safe|privacy|discreet/i.test(query) ? 'privacy' : /review/i.test(query) ? 'review' : 'navigation-or-other';
  return { brand, intent: type };
}
export function sanitizeRows(rows) {
  let redacted = 0;
  const clean = rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => {
    const value = k === 'date' && /^\d{8}$/.test(v) ? v : typeof v === 'string' ? ['page','landingPage','pagePath'].includes(k) ? safePath(v) : safeText(v) : v;
    if (value === '[REDACTED]') redacted++;
    return [k, value];
  })));
  return { rows: clean, redactedFields: redacted };
}
export function decisions(gsc, ga4) {
  const actions = [], current = gsc?.current, prior = gsc?.previous;
  const pages = new Map();
  for (const r of current?.detail?.rows || []) { if (r.page === '[REDACTED]' || r.query === '[REDACTED]') continue; const list = pages.get(r.page) || []; list.push(r); pages.set(r.page,list); }
  for (const [url, rows] of pages) {
    const metrics = aggregateSearch(rows), previousRows = (prior?.detail?.rows || []).filter(r => r.page === url);
    const comparable = current.detail.paginationComplete && prior?.detail?.paginationComplete;
    const before = comparable ? aggregateSearch(previousRows) : null;
    const clusters = [...new Set(rows.map(r => { const i = intent(r.query); return i.brand + ':' + i.intent; }))];
    let action = 'OBSERVE', reason = 'Insufficient evidence for an immediate page change.';
    if (metrics.impressions >= 30 && metrics.position >= 4 && metrics.position <= 20 && metrics.ctr < .02) { action = 'UPDATE_EXISTING'; reason = 'Review title and search-intent match for observed high-impression, low-CTR queries. This 2% rule is a triage heuristic, not a position CTR benchmark.'; }
    else if (before?.clicks >= 3 && metrics.clicks < before.clicks * .7) { action = 'AUDIT_EXISTING'; reason = 'Matched query-row clicks declined; inspect the same queries, canonical and indexing before editing.'; }
    actions.push({ url, action, reason, metrics, previous: before, trend: comparable ? 'MATCHED_QUERY_ROW_WINDOWS_TOP_ROWS_ONLY' : 'UNKNOWN', clusters,
      change: before ? {clicks:metrics.clicks-before.clicks,impressions:metrics.impressions-before.impressions,ctrPoints:metrics.ctr!==null&&before.ctr!==null?(metrics.ctr-before.ctr)*100:null,position:metrics.position!==null&&before.position!==null?metrics.position-before.position:null} : null,
      topQueries: [...rows].sort((a,b)=>b.impressions-a.impressions).slice(0,5).map(r=>({query:r.query,country:r.country,device:r.device,impressions:r.impressions,clicks:r.clicks})), priority: metrics.impressions });
  }
  const totals = ga4?.current?.totals?.rows?.[0];
  for (const row of ga4?.current?.pages?.rows || []) {
    if (row.sessions < 10 || row.landingPage === '[REDACTED]') continue;
    if (row.engagedSessions / row.sessions < .3) actions.push({ url: 'https://' + row.hostName + row.landingPage, action: 'REVIEW_LANDING_UX', reason: 'Measured landing cohort has at least 10 sessions and engagement below 30%; review intent, mobile UX and CTA clarity. Cohort evidence is not user-level attribution.', metrics: row, priority: row.sessions });
  }
  if (totals?.sessions > 0 && !(ga4.current.affiliate.rows?.length)) actions.push({action:'CHECK_AFFILIATE_FUNNEL',reason:'Measured sessions exist but no affiliate_click rows in this exact scope; inspect consent-respecting CTA tracking and offer fit without sending test events.',priority:1});
  return actions.sort((a,b)=>b.priority-a.priority).slice(0,30);
}
