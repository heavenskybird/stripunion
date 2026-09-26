import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { googleCredentials } from '../lib/google-auth.mjs';
import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const propertyId = process.env.GA4_PROPERTY_ID || '530171093';
const endDate = process.env.SEO_END_DATE || daysAgo(1);
const startDate = process.env.SEO_START_DATE || daysAgo(8);

const client = new BetaAnalyticsDataClient({
  credentials: googleCredentials()
});

const [response] = await client.runReport({
  property: `properties/${propertyId}`,
  dateRanges: [{ startDate, endDate }],
  dimensions: [
    { name: 'date' },
    { name: 'landingPagePlusQueryString' },
    { name: 'sessionSourceMedium' },
    { name: 'country' },
    { name: 'deviceCategory' }
  ],
  metrics: [
    { name: 'sessions' },
    { name: 'activeUsers' },
    { name: 'engagedSessions' },
    { name: 'keyEvents' },
    { name: 'totalRevenue' }
  ],
  limit: 100000
});

const dimensionNames = response.dimensionHeaders?.map((h) => h.name) || [];
const metricNames = response.metricHeaders?.map((h) => h.name) || [];

const rows = (response.rows || []).map((row) => {
  const item = {};
  dimensionNames.forEach((name, index) => {
    item[name] = row.dimensionValues?.[index]?.value ?? null;
  });
  metricNames.forEach((name, index) => {
    const raw = row.metricValues?.[index]?.value ?? '0';
    item[name] = Number(raw);
  });
  return item;
});

await writeSnapshot('ga4', endDate, {
  source: 'google-analytics-4',
  propertyId,
  startDate,
  endDate,
  collectedAt: new Date().toISOString(),
  rowCount: rows.length,
  rows
});
