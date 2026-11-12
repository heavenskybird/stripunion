// Offline evidence only: no network, storage repair, provider callbacks or joins.
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normalizeMemberId } from '../services/live-models-worker/src/index.js';

const DAY = 86_400_000;
const host = value => String(value || '').toLowerCase().replace(/^www\./, '');
const validTime = value => {
  if (value == null || value === '') return null;
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
const sum = (rows, key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);

export function inspectConsentTrace(events = []) {
  let consent = 'denied';
  const violations = [];
  let grantedGaEvents = 0;
  for (const [index, event] of events.entries()) {
    if (event.type === 'consent') consent = event.analyticsStorage === 'granted' ? 'granted' : 'denied';
    // Unknown is fail closed. This evaluates consent-required telemetry, not
    // Google's cookieless Consent Mode ping behavior or a payment authorization.
    if (['first_party_click', 'analytics_storage_write'].includes(event.type) && consent !== 'granted') {
      violations.push({ index, classification: 'CONSENT_REQUIRED_TELEMETRY_BEFORE_GRANT' });
    }
    if (event.type === 'ga_event' && consent === 'granted') grantedGaEvents += 1;
  }
  return { finalConsent: consent, violations, grantedGaEvents,
    productionAcceptance: 'NOT_PROVEN_BY_OFFLINE_TRACE' };
}

export function classifyJoinEvidence(postback, clicks = [], options = {}) {
  const rawId = postback.memberId ?? postback.member_id ?? postback.memberid;
  const memberId = normalizeMemberId(rawId);
  const when = validTime(postback.receivedAt);
  const instrumentationSince = validTime(options.instrumentationSince);
  const diagnosticsSince = validTime(options.diagnosticsSince);
  const currencyValue = postback.currency ?? postback.currencyCode ?? postback.currency_code;
  const currency = typeof currencyValue === 'string' && /^[A-Za-z]{3}$/.test(currencyValue) ? currencyValue.toUpperCase() : 'UNKNOWN';
  let classification;
  if (!rawId && ['subId','subid','clickId','click_id'].some(k => postback[k])) classification = 'UNSUPPORTED_ID_ALIAS_REQUIRES_PROVIDER_CONTRACT';
  else if (!rawId) classification = 'MISSING_MEMBER_ID';
  else if (!memberId) classification = 'INVALID_MEMBER_ID';
  else {
    const matches = clicks.filter(c => normalizeMemberId(c.memberId) === memberId);
    if (matches.length > 1) classification = 'AMBIGUOUS_CLICK_RECORDS';
    else if (matches.length === 1) {
      const clicked = validTime(matches[0].occurredAt);
      classification = when == null || clicked == null ? 'TIME_WINDOW_UNKNOWN'
        : clicked > when ? 'POSTBACK_BEFORE_CLICK'
        : when - clicked > (options.retentionMs ?? 30 * DAY) ? 'OUTSIDE_LOCAL_RETENTION_WINDOW'
        : 'MATCHED_EVIDENCE';
    } else if (when != null && instrumentationSince != null && when < instrumentationSince) classification = 'PRE_INSTRUMENTATION_EVIDENCE';
    else classification = 'CLICK_NOT_FOUND_CAUSE_UNKNOWN';
  }
  return { classification, currency,
    diagnosticCoverage: when == null || diagnosticsSince == null ? 'UNKNOWN' : when < diagnosticsSince ? 'BEFORE_DIAGNOSTIC_WINDOW' : 'IN_DIAGNOSTIC_WINDOW',
    sourcePageAvailable: Boolean(memberId) && clicks.some(c => normalizeMemberId(c.memberId) === memberId && typeof c.pagePath === 'string' && c.pagePath.startsWith('/')),
    transactionIdPresent: Boolean(postback.transactionId ?? postback.transaction_id ?? postback.txid ?? postback.id),
    // Deliberately excludes IDs, raw URL/query, user/device data and payload.
    historicalMutationAllowed: false };
}

export function diagnoseFunnel({ ga4, attribution, tagDeployedAt, ga4TimeZone }) {
  const deployment = validTime(tagDeployedAt);
  // GA4 dates are property-local civil dates. Without its timezone, a whole-day
  // cutoff is conservative: report UNKNOWN for the deployment day itself.
  const endDate = String(ga4.endDate || '');
  let deploymentDate = null;
  if (deployment != null && ga4TimeZone) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: ga4TimeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(deployment);
    const pick = key => parts.find(p=>p.type===key).value;
    deploymentDate = `${pick('year')}-${pick('month')}-${pick('day')}`;
  }
  const coverage = deployment != null && !ga4TimeZone ? 'TIMEZONE_UNKNOWN'
    : !deploymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? 'UNKNOWN'
    : endDate < deploymentDate ? 'PRE_DEPLOYMENT_ONLY'
    : endDate === deploymentDate ? 'DEPLOYMENT_DAY_TIMEZONE_UNRESOLVED' : 'INCLUDES_LATER_REPORTING_DATES';
  const sources = {};
  const hostsAvailable = (ga4.rows || []).some(r => typeof r.hostName === 'string');
  for (const [name, hostname] of [['main','stripunion.com'],['blog','blog.stripunion.com']]) {
    sources[name] = {
      sessions: hostsAvailable ? sum((ga4.rows || []).filter(r => host(r.hostName) === hostname), 'sessions') : null,
      affiliateClicks: Array.isArray(ga4.eventRows) ? sum(ga4.eventRows.filter(r => host(r.hostName) === hostname && r.eventName === 'affiliate_click'), 'eventCount') : null
    };
  }
  const diagnostics = attribution.diagnostics;
  const newUnmatched = diagnostics?.joinStatus ? Object.entries(diagnostics.joinStatus)
    .filter(([key]) => key !== 'matched').reduce((n, [,v]) => n + Number(v || 0), 0) : null;
  return {
    version: 1, readOnly: true,
    ga4: { collectedAt: ga4.collectedAt, startDate: ga4.startDate, endDate: ga4.endDate,
      coverage, propertyTimeZone: ga4TimeZone || 'UNKNOWN', sites: sources,
      hostSegmentationAvailable: hostsAvailable,
      zeroProvesNoClicks: false, consentGrantedProductionTest: 'NOT_PERFORMED' },
    attribution: { collectedAt: attribution.collectedAt, scope: attribution.reportScope || 'UNKNOWN',
      totalClicks: attribution.totalClicks, totalPostbacks: attribution.totalPostbacks,
      matchedPostbacks: attribution.matchedPostbacks, unmatchedPostbacks: attribution.unmatchedPostbacks,
      diagnosticsSince: diagnostics?.since || null, newWindowUnmatched: newUnmatched,
      unmatchedOutsideDiagnosticCoverage: newUnmatched == null ? null : Math.max(0, attribution.unmatchedPostbacks - newUnmatched),
      legacyUnmatchedCause: 'UNKNOWN_WITHOUT_EVENT_LEVEL_EVIDENCE',
      revenueByCurrency: attribution.revenueByCurrency || {},
      comparableToGa4Period: false, note: 'Cumulative first-party AVCams summary is not period-aligned GA4 affiliate_click data.' },
    blockers: [coverage === 'PRE_DEPLOYMENT_ONLY' ? 'NEED_POST_DEPLOYMENT_GA4_WINDOW' : 'NEED_CONSENT_GRANTED_PRODUCTION_TRACE',
      'NEED_PROVIDER_PARAMETER_CONTRACT_AND_REDACTED_EVENT_EVIDENCE'],
    noSyntheticConversions: true
  };
}

async function main() {
  const [gaPath, attributionPath, tagDeployedAt, ga4TimeZone] = process.argv.slice(2);
  if (!gaPath || !attributionPath || validTime(tagDeployedAt) == null) throw new Error('Usage: node scripts/attribution-funnel-diagnostics.mjs GA4.json ATTRIBUTION.json TAG_DEPLOYED_AT');
  const [ga4, attribution] = await Promise.all([gaPath, attributionPath].map(async p => JSON.parse(await fs.readFile(p, 'utf8'))));
  console.log(JSON.stringify(diagnoseFunnel({ga4, attribution, tagDeployedAt, ga4TimeZone}), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
