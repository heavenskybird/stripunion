import { selectSearchOpportunityGsc } from '../growth/gsc-scope.mjs';
import { opportunityId } from '../growth/opportunity-identity.mjs';

export function normalizeKeyword(value) {
  if (typeof value !== 'string') throw new TypeError('Keyword must be a string.');
  return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const rank = (v) => number(v) > 0 ? v : null;
const unknowns = {
  search_intent: null, topic_cluster: null, category: null,
  estimated_monthly_search_volume: null, volume_history: null, volume_trend: null,
  volume_source: null, data_confidence: null, competitor_domains: null,
  competitor_rankings: null, seo_difficulty_estimate: null, backlinks: null,
  referring_domains: null, content_gap: null, cannibalization_risk: null,
  affiliate_relevance: null, opportunity_score: null,
};
function base(keyword, snapshot, engine, property, limitations, period) {
  if (!Number.isFinite(Date.parse(snapshot.collectedAt))) throw new Error('Missing snapshot observation date.');
  if (typeof snapshot.source !== 'string' || !snapshot.source || typeof property !== 'string' || !property) {
    throw new Error('Missing source/property provenance.');
  }
  return {
    ...unknowns, keyword, normalized_keyword: normalizeKeyword(keyword),
    language: null, country: null, search_engine: engine, property,
    our_rank: null, our_ranking_url: null, impressions: null, clicks: null, ctr: null,
    observed_at: snapshot.collectedAt, source_updated_at: null,
    evidence: [{ source: snapshot.source, property, observed_at: snapshot.collectedAt,
      source_updated_at: null, country: null, language: null, period,
      kind: 'first_party_measured', limitations }],
  };
}
/** Keep dates/pages separate; callers must not add queryRows or country/device cubes. */
export function adaptGsc(snapshot) {
  if (!['sc-domain:stripunion.com', 'https://blog.stripunion.com/', 'sc-domain:avcams.online'].includes(snapshot.siteUrl)) {
    throw new Error('Unsupported GSC property.');
  }
  return (snapshot.queryPageRows ?? []).map(row => {
    const record = base(row.query, snapshot, 'google', snapshot.siteUrl,
      ['GSC impression-weighted average position, not a current SERP rank.',
        'Query anonymization/row limits omit some demand; country and language unknown.',
        'Date is measurement date; provider update timestamp is unavailable.'],
      { start: row.date ?? null, end: row.date ?? null });
    return { ...record, our_rank: rank(row.position), our_ranking_url: row.page ?? null,
      clicks: number(row.clicks), impressions: number(row.impressions),
      ctr: number(row.impressions) > 0 && number(row.clicks) !== null ? row.clicks / row.impressions : null };
  });
}
export function adaptBing(snapshot) {
  return (snapshot.sites ?? []).flatMap(site => {
    if (site.methodStatus?.GetQueryStats !== 'ok') return [];
    return (site.queryStats ?? []).map(row => {
      const ms = /^\/Date\((\d+)\)\/$/.exec(row.Date ?? '')?.[1];
      const date = ms && Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString().slice(0, 10) : null;
      const record = base(row.Query, snapshot, 'bing', site.siteUrl,
        ['Query-level observation has no query-to-page join; page is UNKNOWN.',
          'Bing average impression position; weekly source cadence; locale unknown.',
          'Research impressions are not monthly search volume.'], { start: date, end: date });
      return { ...record, our_rank: rank(row.AvgImpressionPosition), clicks: number(row.Clicks),
        impressions: number(row.Impressions),
        ctr: number(row.Impressions) > 0 && number(row.Clicks) !== null ? row.Clicks / row.Impressions : null };
    });
  });
}
/** One canonical Google scope for analysis; Blog remains separately inspectable. */
export function canonicalGscRecords(domain, blog, avcams) {
  const chosen = selectSearchOpportunityGsc(domain, blog).snapshot;
  return [...(chosen ? adaptGsc(chosen) : []), ...(avcams ? adaptGsc(avcams) : [])];
}
export function observationKey(row) {
  return opportunityId('keyword', JSON.stringify([row.normalized_keyword, row.language, row.country,
    row.search_engine, row.property, row.our_ranking_url, row.evidence[0].period]));
}
/** Newest collection replaces the SAME dated observation; overlapping windows are never summed. */
export function deduplicate(records) {
  const map = new Map();
  for (const row of records) {
    if (!row.normalized_keyword) continue;
    const key = observationKey(row), previous = map.get(key);
    if (!previous || Date.parse(row.observed_at) > Date.parse(previous.observed_at)) map.set(key, row);
    else if (row.observed_at === previous.observed_at && JSON.stringify(row) !== JSON.stringify(previous)) {
      throw new Error('Conflicting observations at the same collection time.');
    }
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}
export const DEFAULT_WEIGHTS = Object.freeze({ demand: .2, trend: .1, ranking: .2,
  difficulty: .1, commercial: .15, coverage: .15, intent: .1 });
/** Inputs are explicit evidence-backed [0,1] planning signals, never factual SEO metrics. */
export function scoreOpportunity(signals, { weights = DEFAULT_WEIGHTS, confidence = 0, freshness = 0 } = {}) {
  for (const value of [confidence, freshness]) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid confidence/freshness.');
  let total = 0, available = 0, raw = 0;
  const contributions = {};
  for (const [key, weight] of Object.entries(weights)) {
    if (!(key in DEFAULT_WEIGHTS) || !Number.isFinite(weight) || weight < 0) throw new Error('Invalid weight.');
    const value = signals[key] ?? null;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid planning signal.');
    total += weight;
    if (value !== null) { available += weight; raw += value * weight; }
    contributions[key] = { value, weight, contribution: value === null ? 0 : value * weight };
  }
  if (!total) throw new Error('At least one positive weight required.');
  return { score: available ? Math.round(10000 * raw / total * confidence * freshness) / 100 : null,
    coverage: available / total, confidence, contributions, label: 'model-derived prioritization' };
}
export const providers = Object.freeze({ gsc: { id: 'gsc-snapshot', adapt: adaptGsc },
  bing: { id: 'bing-snapshot', adapt: adaptBing } });
