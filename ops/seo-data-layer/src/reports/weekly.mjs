import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const rawRoot = path.join(packageRoot, 'data', 'raw');
const reportsRoot = path.join(packageRoot, 'data', 'reports');

async function readRepoJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function latestSnapshot(filename) {
  let dirs = [];
  try { dirs = (await fs.readdir(rawRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse(); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  for (const dir of dirs) {
    try { return { date: dir, data: JSON.parse(await fs.readFile(path.join(rawRoot, dir, filename), 'utf8')) }; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  return null;
}

const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
function aggregate(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) { const key = row[keyField] || '(not set)'; map.set(key, (map.get(key) || 0) + Number(row[valueField] || 0)); }
  return [...map.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const gsc = await latestSnapshot('gsc.json');
const ga4 = await latestSnapshot('ga4.json');
const ga4Admin = await latestSnapshot('ga4-admin.json');
const bing = await latestSnapshot('bing.json');
const buffer = await latestSnapshot('buffer.json');
const stripcash = await latestSnapshot('stripcash.json');
const attribution = await latestSnapshot('attribution.json');
const growthOpportunities = await readRepoJson('ops/growth/opportunities/latest.json');
const contentInventory = await readRepoJson('ops/growth/content-inventory/latest.json');

const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - 7);
const inLastWeek = (value) => {
  if (!value) return true;
  const normalized = String(value).length === 8 ? `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}` : String(value);
  return new Date(`${normalized}T00:00:00Z`) >= cutoff;
};
const landingRows = (ga4?.data?.rows || []).filter((row) => inLastWeek(row.date));
const eventRows = (ga4?.data?.eventRows || []).filter((row) => inLastWeek(row.date));
const events = aggregate(eventRows, 'eventName', 'eventCount');
const affiliateClicks = events.find((item) => item.key === 'affiliate_click')?.value || 0;
const dailyRows = (gsc?.data?.dailyRows || []).filter((row) => inLastWeek(row.date));
const queryRows = gsc?.data?.queryRows || [];
const pageRows = gsc?.data?.pageRows || [];
const gscClicks = sum(dailyRows, 'clicks');
const gscImpressions = sum(dailyRows, 'impressions');
const bingSites = bing?.data?.sites || [];
const bingQueries = bingSites.flatMap((site) => (site.queryStats || []).map((row) => ({ ...row, site: site.site })));
const bingPages = bingSites.flatMap((site) => (site.pageStats || []).map((row) => ({ ...row, site: site.site })));
const bingCrawl = bingSites.flatMap((site) => (site.crawlStats || []).map((row) => ({ ...row, site: site.site })));
const bingErrors = bingSites.flatMap((site) => (site.crawlIssues || []).map((row) => ({ ...row, site: site.site })));
const sentPosts = buffer?.data?.sentPosts || [];
const scheduledPosts = buffer?.data?.scheduledPosts || [];
const stripcashMetrics = stripcash?.data?.metrics || {};
const attributionSummary = attribution?.data || {};
const topAttributionP1 = Object.entries(attributionSummary.byP1 || {})
  .map(([key, value]) => ({ key, ...(value || {}) }))
  .sort((a, b) => Number(b.postbacks || 0) - Number(a.postbacks || 0) || Number(b.clicks || 0) - Number(a.clicks || 0))
  .slice(0, 5);
const hostnameForUrl = (value) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; } };
const siteForHost = (host) => host === 'blog.stripunion.com' ? 'blog' : host === 'stripunion.com' ? 'main' : 'other';
const siteGaRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, landingRows.filter((row) => siteForHost(String(row.hostName || '').toLowerCase().replace(/^www\./, '')) === site)]));
const siteEventRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, eventRows.filter((row) => siteForHost(String(row.hostName || '').toLowerCase().replace(/^www\./, '')) === site)]));
const gaHostSegmentationAvailable = Boolean(ga4 && landingRows.length > 0 && landingRows.every((row) => Object.hasOwn(row, 'hostName')) && eventRows.every((row) => Object.hasOwn(row, 'hostName')));
const gaHostRowsAvailable = Boolean(ga4 && [...landingRows, ...eventRows].every((row) => Object.hasOwn(row, 'hostName')));
const otherHosts = [...new Set([...landingRows, ...eventRows].map((row) => String(row.hostName || '').toLowerCase().replace(/^www\./, '')).filter((host) => host && siteForHost(host) === 'other'))].sort();
const otherHostMetrics = otherHosts.map((host) => ({
  hostname: host,
  sessions: sum(landingRows.filter((row) => String(row.hostName || '').toLowerCase().replace(/^www\./, '') === host), 'sessions'),
  engagedSessions: sum(landingRows.filter((row) => String(row.hostName || '').toLowerCase().replace(/^www\./, '') === host), 'engagedSessions'),
  affiliateClick: sum(eventRows.filter((row) => String(row.hostName || '').toLowerCase().replace(/^www\./, '') === host && row.eventName === 'affiliate_click'), 'eventCount')
}));
const gaSiteMetrics = (site) => ({
  sessions: sum(siteGaRows[site], 'sessions'), engagedSessions: sum(siteGaRows[site], 'engagedSessions'),
  affiliateClick: sum(siteEventRows[site].filter((row) => row.eventName === 'affiliate_click'), 'eventCount'),
  revenue: sum(siteGaRows[site], 'totalRevenue')
});
const gscSiteRows = Object.fromEntries(['main', 'blog', 'other'].map((site) => [site, pageRows.filter((row) => siteForHost(hostnameForUrl(row.page)) === site)]));
const gscHostSegmentationAvailable = Boolean(gsc && pageRows.length > 0 && pageRows.every((row) => Object.hasOwn(row, 'page')));
const gscSiteMetrics = (site) => ({ clicks: sum(gscSiteRows[site], 'clicks'), impressions: sum(gscSiteRows[site], 'impressions') });
const bingSiteCoverage = ['stripunion.com', 'blog.stripunion.com'].map((hostname) => {
  const site = bingSites.find((item) => String(item.site || '').toLowerCase().replace(/^www\./, '') === hostname);
  return { hostname, configured: Boolean(site), methods: site?.methodStatus || null };
});

const syntheticPromptPattern = /\bcontext\s*:|\bquestion\s*:|do not include|not for language|location\s*:/i;
const cleanQueryRows = queryRows.filter((row) => !syntheticPromptPattern.test(String(row.query || '')));
const ctrOpportunities = cleanQueryRows.filter((row) => Number(row.impressions || 0) >= 2 && Number(row.ctr || 0) < 0.02)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const rankingOpportunities = cleanQueryRows.filter((row) => Number(row.position || 0) >= 4 && Number(row.position || 0) <= 20)
  .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0)).slice(0, 10);
const clusteredOpportunities = growthOpportunities?.opportunities || [];
const bingZeroClickQueries = bingQueries.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const bingZeroClickPages = bingPages.filter((row) => Number(row.Impressions || 0) > 0 && Number(row.Clicks || 0) === 0).slice(0, 10);
const bingCoverageSummary = bingSiteCoverage.map((site) => `- ${site.hostname}: ${site.configured ? `configured; methods ${Object.values(site.methods || {}).filter((status) => status === 'ok').length}/4 succeeded` : 'BLOG BING COVERAGE NOT VERIFIED'}${site.configured && !Object.values(site.methods || {}).every((status) => status === 'ok') ? `; status ${JSON.stringify(site.methods)}` : ''}`);
const highPerformingPosts = sentPosts.map((post) => ({ ...post, _score: Number(post.metrics?.engagementRate || 0) || Number(post.metrics?.clicks || 0) + Number(post.metrics?.reactions || 0) + Number(post.metrics?.comments || 0) + Number(post.metrics?.reposts || 0) }))
  .filter((post) => post.metrics?.impressions != null || post.metrics?.clicks != null || post.metrics?.reactions != null)
  .sort((a, b) => b._score - a._score).slice(0, 10).map(({ _score, ...post }) => post);

let previousBing = null;
if (bing) {
  const dirs = (await fs.readdir(rawRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const dir of dirs) {
    if (dir >= bing.date) continue;
    try { previousBing = { date: dir, data: JSON.parse(await fs.readFile(path.join(rawRoot, dir, 'bing.json'), 'utf8')) }; break; }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
}
const indexTotals = (snapshot) => (snapshot?.data?.sites || []).map((site) => {
  const latest = (site.indexedPages || []).filter((row) => row.indexed != null).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return { site: site.site, indexed: latest ? Number(latest.indexed) : null };
});
const currentIndex = indexTotals(bing);
const previousIndex = new Map(indexTotals(previousBing).map((item) => [item.site, item.indexed]));
const indexChanges = currentIndex.map((item) => ({ ...item, previousIndexed: previousIndex.get(item.site) ?? null, change: previousIndex.has(item.site) ? item.indexed - previousIndex.get(item.site) : null }));
const channelSessions = { organic: 0, social: 0, communityReferral: 0, paid: 0, unclassified: 0 };
for (const row of landingRows) {
  const sourceMedium = String(row.sessionSourceMedium || '').toLowerCase();
  const sessions = Number(row.sessions || 0);
  const key = /organic/.test(sourceMedium) ? 'organic'
    : /social|facebook|instagram|tiktok|pinterest|youtube/.test(sourceMedium) ? 'social'
      : /cpc|ppc|paid|display|retarget/.test(sourceMedium) ? 'paid'
        : /referral|community/.test(sourceMedium) ? 'communityReferral' : 'unclassified';
  channelSessions[key] += sessions;
}
const indexedPages = currentIndex.reduce((total, item) => total + Number(item.indexed || 0), 0);
const astroPages = await fs.readdir(path.resolve(packageRoot, '../../src/pages')).then((files) => files.filter((name) => name.endsWith('.astro') && !['404.astro', 'affiliate-disclosure.astro', 'age-verification.astro', 'contact.astro', 'disclaimer.astro', 'editorial-policy.astro', 'privacy-policy.astro', 'terms.astro'].includes(name)).length).catch(() => null);

const reportDate = new Date().toISOString().slice(0, 10);
await fs.mkdir(reportsRoot, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  sourceDates: { gsc: gsc?.date || null, ga4: ga4?.date || null, bing: bing?.date || null, buffer: buffer?.date || null, stripcash: stripcash?.date || null, attribution: attribution?.date || null },
  sources: { gsc: Boolean(gsc), ga4: Boolean(ga4), bing: Boolean(bing), buffer: Boolean(buffer), stripcash: Boolean(stripcash), attribution: Boolean(attribution) },
  ga4Admin: ga4Admin ? { date: ga4Admin.date, propertyId: ga4Admin.data.propertyId || null, topology: ga4Admin.data.topology || 'UNKNOWN / MULTIPLE', unifiedFunnelCandidate: ga4Admin.data.unifiedFunnelCandidate || null, streams: ga4Admin.data.streams || [] } : null,
  google: {
    clicks: gscClicks, impressions: gscImpressions, ctr: gscImpressions ? gscClicks / gscImpressions : 0,
    averagePosition: gscImpressions ? dailyRows.reduce((total, row) => total + Number(row.position || 0) * Number(row.impressions || 0), 0) / gscImpressions : null,
    siteSegmentationAvailable: gscHostSegmentationAvailable,
    sites: gscHostSegmentationAvailable ? { main: gscSiteMetrics('main'), blog: gscSiteMetrics('blog'), other: gscSiteMetrics('other') } : null,
    rankingOpportunities, highImpressionWeakCtr: ctrOpportunities,
    topPagesByImpressions: aggregate(pageRows, 'page', 'impressions').slice(0, 10)
  },
  bing: {
    clicks: sum(bingQueries, 'Clicks'), impressions: sum(bingQueries, 'Impressions'),
    siteCoverage: bingSiteCoverage,
    highImpressionZeroClickQueries: bingZeroClickQueries, highImpressionZeroClickPages: bingZeroClickPages,
    crawlErrors: bingCrawl.map((row) => ({ site: row.site, date: row.Date, errors: Number(row.CrawlErrors || 0), http4xx: Number(row.Code4xx || 0), http5xx: Number(row.Code5xx || 0) })),
    crawlIssues: bingErrors, indexChanges
  },
  ga4: {
    sessions: sum(landingRows, 'sessions'), engagedSessions: sum(landingRows, 'engagedSessions'),
    siteSegmentationAvailable: gaHostSegmentationAvailable,
    sites: gaHostSegmentationAvailable ? { main: gaSiteMetrics('main'), blog: gaSiteMetrics('blog'), other: gaSiteMetrics('other') } : null,
    otherHosts: gaHostRowsAvailable ? otherHostMetrics : [],
    engagementRate: sum(landingRows, 'sessions') ? sum(landingRows, 'engagedSessions') / sum(landingRows, 'sessions') : 0,
    acquisitionSources: aggregate(landingRows, 'sessionSourceMedium', 'sessions').slice(0, 8),
    landingPages: aggregate(landingRows, 'landingPagePlusQueryString', 'sessions').slice(0, 10),
    affiliateClick: affiliateClicks, conversions: null, revenue: sum(landingRows, 'totalRevenue'), events: events.slice(0, 12)
  },
  buffer: {
    channel: buffer?.data?.channel || null, sentPostCount: sentPosts.length, scheduledPostCount: scheduledPosts.length,
    impressions: sum(sentPosts.map((post) => post.metrics || {}), 'impressions'), clicks: sum(sentPosts.map((post) => post.metrics || {}), 'clicks'),
    engagement: { reactions: sum(sentPosts.map((post) => post.metrics || {}), 'reactions'), comments: sum(sentPosts.map((post) => post.metrics || {}), 'comments'), reposts: sum(sentPosts.map((post) => post.metrics || {}), 'reposts'), reach: sum(sentPosts.map((post) => post.metrics || {}), 'reach') },
    metricsUpdatedAt: sentPosts.map((post) => post.metricsUpdatedAt).filter(Boolean).sort().at(-1) || null,
    highestPerformingPosts: highPerformingPosts.slice(0, 3).map((post) => ({ id: post.id || null, sentAt: post.sentAt || null, metrics: post.metrics || {} }))
  },
  stripcash: stripcash ? {
    reportScope: stripcash.data.reportScope || null,
    reportStatus: stripcash.data.reportStatus || null,
    metrics: stripcashMetrics
  } : null,
  attribution: attribution ? {
    reportScope: attributionSummary.reportScope || null,
    totalClicks: Number(attributionSummary.totalClicks || 0),
    totalPostbacks: Number(attributionSummary.totalPostbacks || 0),
    matchedPostbacks: Number(attributionSummary.matchedPostbacks || 0),
    unmatchedPostbacks: Number(attributionSummary.unmatchedPostbacks || 0),
    duplicatePostbacks: Number(attributionSummary.duplicatePostbacks || 0),
    eventCounts: attributionSummary.eventCounts || {},
    revenueByCurrency: attributionSummary.revenueByCurrency || {},
    topP1: topAttributionP1
  } : null
};

summary.trafficControlPlane = {
  acquisitionSessions: { organic: channelSessions.organic, social: channelSessions.social, communityReferral: channelSessions.communityReferral, paid: channelSessions.paid, total: sum(landingRows, 'sessions'), unclassified: channelSessions.unclassified },
  qualifiedSessions: sum(landingRows, 'engagedSessions'),
  outboundAffiliateCtr: sum(landingRows, 'sessions') ? affiliateClicks / sum(landingRows, 'sessions') : null,
  organicImpressions: gscImpressions, organicClicks: gscClicks, indexedPages: bing ? indexedPages : null,
  publishedContentCount: {
    astroCommercialPages: astroPages,
    trackedMainSitePages: contentInventory?.inventorySize ?? null,
    astroPagesTracked: contentInventory?.inventoryBreakdown?.astroPages ?? null,
    dataDrivenReviewsTracked: contentInventory?.inventoryBreakdown?.dataDrivenReviews ?? null,
    wordpressPublishedPosts: null,
    wordpressDraftInventory: 'unavailable'
  },
  contentFreshness: { status: 'not-measured', reason: 'CMS publication dates are not part of the current GA4, GSC, or Bing snapshots.' },
  topAcquisitionLandingPages: summary.ga4.landingPages,
  stripcash: stripcash ? {
    signups: Number(stripcashMetrics.signup || 0),
    verifiedSignups: Number(stripcashMetrics.verifiedSignup || 0),
    newCustomers: Number(stripcashMetrics.newCustomersCount || 0),
    purchases: Number(stripcashMetrics.purchasesCount || 0),
    purchaseEarnings: Number(stripcashMetrics.purchaseEarnings || 0),
    totalEarnings: Number(stripcashMetrics.totalEarnings || 0),
    modelReferralEarnings: Number(stripcashMetrics.modelsReferralEarnings || 0),
    webmasterRegistrations: Number(stripcashMetrics.webmasterRegistration || 0),
    webmasterReferralEarnings: Number(stripcashMetrics.webmasterReferralEarnings || 0)
  } : null,
  firstPartyAttribution: attribution ? {
    clicks: Number(attributionSummary.totalClicks || 0),
    postbacks: Number(attributionSummary.totalPostbacks || 0),
    matchedPostbacks: Number(attributionSummary.matchedPostbacks || 0),
    unmatchedPostbacks: Number(attributionSummary.unmatchedPostbacks || 0),
    eventCounts: attributionSummary.eventCounts || {},
    revenueByCurrency: attributionSummary.revenueByCurrency || {}
  } : null
};

const md = [
  `# StripUnion Growth Report — ${reportDate}`, '',
  `Sources: GSC ${gsc ? `(${gsc.date})` : 'missing'} · GA4 ${ga4 ? `(${ga4.date})` : 'missing'} · Bing ${bing ? `(${bing.date})` : 'missing'} · Buffer ${buffer ? `(${buffer.date})` : 'missing'} · StripCash ${stripcash ? `(${stripcash.date})` : 'missing'} · Attribution ${attribution ? `(${attribution.date})` : 'pending'}.`, '',
  '## Main Site', `- GA4: ${summary.ga4.siteSegmentationAvailable ? `**${summary.ga4.sites.main.sessions}** sessions · **${summary.ga4.sites.main.engagedSessions}** engaged · **${summary.ga4.sites.main.affiliateClick}** affiliate_click · revenue ${summary.ga4.sites.main.revenue ? `**${summary.ga4.sites.main.revenue}**` : 'REVENUE DATA NOT CONNECTED'}` : 'hostname segmentation unavailable in the latest snapshot; rerun GA4 collection.'}`, `- GSC page rows: ${summary.google.siteSegmentationAvailable ? `**${summary.google.sites.main.clicks}** clicks · **${summary.google.sites.main.impressions}** impressions` : 'page-level hostname segmentation unavailable; see combined domain totals below.'}`, '',
  '## Blog', `- GA4: ${summary.ga4.siteSegmentationAvailable ? `**${summary.ga4.sites.blog.sessions}** sessions · **${summary.ga4.sites.blog.engagedSessions}** engaged · **${summary.ga4.sites.blog.affiliateClick}** affiliate_click · revenue ${summary.ga4.sites.blog.revenue ? `**${summary.ga4.sites.blog.revenue}**` : 'REVENUE DATA NOT CONNECTED'}` : 'hostname segmentation unavailable in the latest snapshot; rerun GA4 collection.'}`, `- GSC page rows: ${summary.google.siteSegmentationAvailable ? `**${summary.google.sites.blog.clicks}** clicks · **${summary.google.sites.blog.impressions}** impressions` : 'page-level hostname segmentation unavailable; see combined domain totals below.'}`, '',
  '## GA4 Host Segmentation', `- MAIN: **${summary.ga4.sites?.main.sessions ?? 'unavailable'}** sessions · **${summary.ga4.sites?.main.engagedSessions ?? 'unavailable'}** engaged.`, `- BLOG: **${summary.ga4.sites?.blog.sessions ?? 'unavailable'}** sessions · **${summary.ga4.sites?.blog.engagedSessions ?? 'unavailable'}** engaged.`, ...(summary.ga4.otherHosts.length ? summary.ga4.otherHosts.map((host) => `- OTHER ${host.hostname}: ${host.sessions} sessions · ${host.engagedSessions} engaged.`) : [gaHostRowsAvailable ? '- OTHER: no other hostnames in the latest GA4 rows.' : '- OTHER: hostname segmentation unavailable in the latest snapshot.']), `- TOTAL: **${summary.ga4.sessions}** sessions · **${summary.ga4.engagedSessions}** engaged sessions · **${affiliateClicks}** affiliate_click · ${summary.ga4.revenue ? `**${summary.ga4.revenue}** revenue` : 'REVENUE DATA NOT CONNECTED'}.`, `- Stream topology: ${ga4Admin?.data?.topology || 'UNKNOWN / MULTIPLE'}.`, `- Unified-funnel Measurement ID candidate: ${ga4Admin?.data?.unifiedFunnelCandidate || 'not established'}.`, '',
  '## Combined Funnel', `- GA4 property total: **${summary.ga4.sessions}** sessions · **${summary.ga4.engagedSessions}** engaged sessions · **${affiliateClicks}** affiliate_click · ${summary.ga4.revenue ? `**${summary.ga4.revenue}** revenue` : 'REVENUE DATA NOT CONNECTED'}`, `- GSC domain property: **${gscClicks}** clicks · **${gscImpressions}** impressions; page totals are classified by hostname and other hosts remain separate.`, '',
  '## Search Opportunities',
  ...(clusteredOpportunities.length
    ? clusteredOpportunities.slice(0, 5).map((row) =>
        `- ${row.targetKeyword}: ${row.ourEvidence?.impressions ?? 0} clustered impressions across ${row.ourEvidence?.queryVariants ?? 1} variant(s), best position ${row.ourEvidence?.bestPosition ?? 'n/a'} → ${row.recommendedAction}`
      )
    : rankingOpportunities.length
      ? rankingOpportunities.slice(0, 5).map((row) => `- ${row.query}: position ${Number(row.position).toFixed(1)}, ${row.impressions} impressions`)
      : ['- No current query rows available.']),
  '',
  '## Distribution', `- Buffer: ${sentPosts.length} sent posts · ${scheduledPosts.length} scheduled · ${summary.buffer.impressions} impressions · ${summary.buffer.clicks} clicks.`, '',
  '## Revenue / Affiliate Attribution',
  `- ${summary.ga4.siteSegmentationAvailable ? `Main affiliate_click: ${summary.ga4.sites.main.affiliateClick}; Blog affiliate_click: ${summary.ga4.sites.blog.affiliateClick}.` : 'Site-level affiliate_click attribution needs a fresh host-segmented GA4 snapshot.'}`,
  `- ${stripcash ? `StripCash aggregate scope: signups **${stripcashMetrics.signup || 0}** · verified **${stripcashMetrics.verifiedSignup || 0}** · new customers **${stripcashMetrics.newCustomersCount || 0}** · purchases **${stripcashMetrics.purchasesCount || 0}** · purchase earnings **${stripcashMetrics.purchaseEarnings || 0}** · total earnings **${stripcashMetrics.totalEarnings || 0}**.` : 'STRIPCASH AGGREGATE REVENUE NOT CONNECTED.'}`,
  `- ${attribution ? `First-party attribution: clicks **${attributionSummary.totalClicks || 0}** · postbacks **${attributionSummary.totalPostbacks || 0}** · matched **${attributionSummary.matchedPostbacks || 0}** · unmatched **${attributionSummary.unmatchedPostbacks || 0}** · events ${JSON.stringify(attributionSummary.eventCounts || {})} · revenue by currency ${JSON.stringify(attributionSummary.revenueByCurrency || {})}.` : 'First-party click storage is deployed; StripCash postback secret/setup is still pending.'}`,
  ...topAttributionP1.map((row) => `- Attribution ${row.key}: ${row.clicks || 0} clicks · ${row.postbacks || 0} postbacks · events ${JSON.stringify(row.eventCounts || {})}.`),
  `- ${stripcash ? (attribution ? 'Aggregate StripCash statistics and first-party attribution are both connected.' : 'Aggregate StripCash statistics are connected; postback joining is the remaining attribution step.') : 'Postback and Statistics attribution remain disconnected.'}`, '',
  '## Warnings / Missing Data',
  ...(!ga4 ? ['- GA4 snapshot missing.'] : []), ...(!gsc ? ['- GSC snapshot missing.'] : []), ...(!bing ? ['- Bing snapshot missing.'] : []), ...(!stripcash ? ['- StripCash aggregate snapshot missing.'] : []),
  ...(ga4 && !gaHostSegmentationAvailable ? ['- GA4 hostname segmentation unavailable for legacy rows; rerun the GA4 collector to populate site totals.'] : []),
  ...(gsc && !gscHostSegmentationAvailable ? ['- GSC hostname segmentation unavailable: page data has no usable page rows. Daily GSC totals are still available for the domain property.'] : []),
  ...bingSiteCoverage.filter((site) => !site.configured).map((site) => `- BLOG BING COVERAGE NOT VERIFIED: ${site.hostname} is not present in the latest configured/returned Bing sites. Add it to verified Bing Webmaster sites and BING_SITE_URLS.`),
  ...bingSiteCoverage.filter((site) => site.configured && (!site.methods || Object.values(site.methods).some((status) => status !== 'ok'))).map((site) => `- Bing partial/error coverage for ${site.hostname}: ${JSON.stringify(site.methods)}.`), '',
  '## Search Detail', `- Combined GSC: **${gscClicks}** clicks · **${gscImpressions}** impressions · **${pct(summary.google.ctr)}** CTR.`,
  ...(ctrOpportunities.length ? ctrOpportunities.slice(0, 5).map((row) => `- Weak CTR: ${row.query} — ${row.impressions} impressions, ${pct(Number(row.ctr || 0))} CTR`) : []), '',
  '## Bing', `- Combined: **${summary.bing.clicks}** clicks · **${summary.bing.impressions}** impressions · ${bingErrors.length} crawl issue URLs.`,
  ...bingCoverageSummary,
  ...Object.values(bingCrawl.reduce((latest, row) => {
    const date = String(row.Date || '');
    if (!latest[row.site] || date > String(latest[row.site].Date || '')) latest[row.site] = row;
    return latest;
  }, {})).map((row) => `- ${row.site}: latest ${row.CrawlErrors || 0} crawl errors; ${row.InIndex ?? 'unknown'} indexed`), '',
  '## Acquisition Snapshot', `- GA4 combined: **${summary.ga4.sessions}** sessions · **${summary.ga4.engagedSessions}** engaged (${pct(summary.ga4.engagementRate)}) · affiliate_click **${affiliateClicks}** · revenue ${summary.ga4.revenue || 'not connected'}.`, '',
  '## Distribution Detail', `- Buffer/X: ${sentPosts.length} sent · ${scheduledPosts.length} scheduled · ${summary.buffer.impressions} impressions · ${summary.buffer.clicks} clicks.`,
  ...highPerformingPosts.slice(0, 3).map((post) => `- Post ${post.id || '(unknown id)'}: ${post.metrics?.impressions ?? 'n/a'} impressions, ${post.metrics?.clicks ?? 'n/a'} clicks`), ''
];

md.push(
  '',
  '## Traffic control plane',
  `- Acquisition sessions — Organic: ${summary.trafficControlPlane.acquisitionSessions.organic} · Social: ${summary.trafficControlPlane.acquisitionSessions.social} · Community/Referral: ${summary.trafficControlPlane.acquisitionSessions.communityReferral} · Paid: ${summary.trafficControlPlane.acquisitionSessions.paid} · Total: ${summary.trafficControlPlane.acquisitionSessions.total} (unclassified: ${summary.trafficControlPlane.acquisitionSessions.unclassified}).`,
  `- Qualified sessions (GA4 engaged sessions): ${summary.trafficControlPlane.qualifiedSessions}.`,
  `- Outbound affiliate CTR: ${summary.trafficControlPlane.outboundAffiliateCtr == null ? 'unavailable' : pct(summary.trafficControlPlane.outboundAffiliateCtr)} of sessions.`,
  `- Organic impressions/clicks: ${summary.trafficControlPlane.organicImpressions}/${summary.trafficControlPlane.organicClicks}; indexed pages: ${summary.trafficControlPlane.indexedPages} (Bing-reported index signal).`,
  `- Published content count: ${contentInventory?.inventorySize ?? astroPages ?? 'unavailable'} tracked main-site pages (${contentInventory?.inventoryBreakdown?.astroPages ?? astroPages ?? 'n/a'} Astro + ${contentInventory?.inventoryBreakdown?.dataDrivenReviews ?? 'n/a'} data-driven reviews); WordPress published count unavailable.`,
  '- Content freshness: not measured in available source snapshots.',
`- ${stripcash ? `StripCash aggregate connected: ${summary.trafficControlPlane.stripcash.signups} signups · ${summary.trafficControlPlane.stripcash.verifiedSignups} verified · ${summary.trafficControlPlane.stripcash.newCustomers} new customers · ${summary.trafficControlPlane.stripcash.purchases} purchases · ${summary.trafficControlPlane.stripcash.totalEarnings} total earnings (API default scope).` : 'STRIPCASH AGGREGATE REVENUE NOT YET CONNECTED.'}`,
  `- ${attribution ? `First-party attribution connected: ${summary.trafficControlPlane.firstPartyAttribution.clicks} clicks · ${summary.trafficControlPlane.firstPartyAttribution.postbacks} postbacks · ${summary.trafficControlPlane.firstPartyAttribution.matchedPostbacks} matched.` : 'First-party clicks are being emitted; StripCash postback joining is not yet connected.'}`,
  '',
  '### Top acquisition landing pages',
  ...summary.trafficControlPlane.topAcquisitionLandingPages.map((row) => `- ${row.key}: ${row.value} sessions`)
);

await fs.writeFile(path.join(reportsRoot, `${reportDate}.json`), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(reportsRoot, `${reportDate}.md`), md.join('\n') + '\n');
console.log(md);
