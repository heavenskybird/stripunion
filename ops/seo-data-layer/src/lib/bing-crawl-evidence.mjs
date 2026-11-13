// Provider data dates are independent of the time a snapshot was downloaded.
export function bingDate(value) {
  const match = typeof value === 'string' && /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  const millis = match ? Number(match[1]) : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

export function bingCrawlEvidence(site, collectedAt, observedAt = new Date().toISOString()) {
  const dated = (site.crawlStats || []).map(row => ({ row, date: bingDate(row.Date) })).filter(item => item.date);
  dated.sort((a, b) => b.date.localeCompare(a.date));
  const latest = dated[0];
  const issuesReadable = site.methodStatus?.GetCrawlIssues === 'ok';
  const issueUrls = issuesReadable ? (site.crawlIssues || []).length : null;
  return {
    site: site.site, collectedAt: collectedAt || null,
    providerDataAsOf: latest?.date || null,
    ageDays: latest && Number.isFinite(Date.parse(observedAt)) ? Math.max(0, Math.floor((Date.parse(observedAt) - Date.parse(latest.date)) / 86400000)) : null,
    aggregateCrawlErrors: latest ? Number(latest.row.CrawlErrors || 0) : null,
    indexedPages: latest ? Number(latest.row.InIndex ?? 0) : null,
    http4xx: latest ? Number(latest.row.Code4xx || 0) : null,
    http5xx: latest ? Number(latest.row.Code5xx || 0) : null,
    issueUrls, issueDetailStatus: !issuesReadable ? 'UNKNOWN' : issueUrls ? 'URL_DETAILS_RETURNED' : 'NO_URL_DETAILS_RETURNED',
    note: 'Aggregate crawl errors are historical provider counts, not identified current broken URLs; an empty issue list does not prove errors resolved.'
  };
}
