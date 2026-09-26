import { google } from 'googleapis';
import { googleAuth } from '../lib/google-auth.mjs';
import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const siteUrl = process.env.GSC_SITE_URL || 'sc-domain:stripunion.com';
const endDate = process.env.SEO_END_DATE || daysAgo(2);
const startDate = process.env.SEO_START_DATE || daysAgo(32);

const auth = googleAuth(['https://www.googleapis.com/auth/webmasters.readonly']);
const client = google.searchconsole({ version: 'v1', auth });

const rows = [];
let startRow = 0;
const rowLimit = 25000;

while (true) {
  const response = await client.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['date', 'query', 'page', 'country', 'device'],
      rowLimit,
      startRow,
      dataState: 'final'
    }
  });

  const batch = response.data.rows || [];
  rows.push(...batch);

  if (batch.length < rowLimit) break;
  startRow += rowLimit;
}

const normalized = rows.map((row) => ({
  date: row.keys?.[0] || null,
  query: row.keys?.[1] || null,
  page: row.keys?.[2] || null,
  country: row.keys?.[3] || null,
  device: row.keys?.[4] || null,
  clicks: row.clicks || 0,
  impressions: row.impressions || 0,
  ctr: row.ctr || 0,
  position: row.position || null
}));

await writeSnapshot('gsc', endDate, {
  source: 'google-search-console',
  siteUrl,
  startDate,
  endDate,
  collectedAt: new Date().toISOString(),
  rowCount: normalized.length,
  rows: normalized
});
