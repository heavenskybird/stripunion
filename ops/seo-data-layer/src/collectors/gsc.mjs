import { google } from 'googleapis';
import { googleAuth } from '../lib/google-auth.mjs';
import { daysAgo, writeSnapshot } from '../lib/io.mjs';

const siteUrl = process.env.GSC_SITE_URL || 'sc-domain:stripunion.com';
const endDate = process.env.SEO_END_DATE || daysAgo(2);
const startDate = process.env.SEO_START_DATE || daysAgo(32);

const auth = googleAuth(['https://www.googleapis.com/auth/webmasters.readonly']);
const client = google.searchconsole({ version: 'v1', auth });

async function queryRows(dimensions) {
  const rows = [];
  let startRow = 0;
  const rowLimit = 25000;

  while (true) {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
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

  return rows;
}

function normalize(rows, dimensions) {
  return rows.map((row) => {
    const item = {};
    dimensions.forEach((name, index) => {
      item[name] = row.keys?.[index] || null;
    });

    return {
      ...item,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || null
    };
  });
}

// Query multiple granularities. Search Console anonymizes some low-volume queries,
// so avoid one giant query+page+country+device cube that could hide useful totals.
// The separate country/device datasets preserve the official first-party views
// needed for geo, localization, mobile, CTR and market-expansion analysis.
const dailyDimensions = ['date'];
const pageDimensions = ['date', 'page'];
const queryDimensions = ['date', 'query'];
const queryPageDimensions = ['date', 'query', 'page'];
const countryDimensions = ['date', 'country'];
const deviceDimensions = ['date', 'device'];
const queryCountryDimensions = ['date', 'query', 'country'];
const queryDeviceDimensions = ['date', 'query', 'device'];

const [
  dailyRaw,
  pageRaw,
  queryRaw,
  queryPageRaw,
  countryRaw,
  deviceRaw,
  queryCountryRaw,
  queryDeviceRaw
] = await Promise.all([
  queryRows(dailyDimensions),
  queryRows(pageDimensions),
  queryRows(queryDimensions),
  queryRows(queryPageDimensions),
  queryRows(countryDimensions),
  queryRows(deviceDimensions),
  queryRows(queryCountryDimensions),
  queryRows(queryDeviceDimensions)
]);

const dailyRows = normalize(dailyRaw, dailyDimensions);
const pageRows = normalize(pageRaw, pageDimensions);
const queryRowsNormalized = normalize(queryRaw, queryDimensions);
const queryPageRows = normalize(queryPageRaw, queryPageDimensions);
const countryRows = normalize(countryRaw, countryDimensions);
const deviceRows = normalize(deviceRaw, deviceDimensions);
const queryCountryRows = normalize(queryCountryRaw, queryCountryDimensions);
const queryDeviceRows = normalize(queryDeviceRaw, queryDeviceDimensions);

await writeSnapshot('gsc', endDate, {
  source: 'google-search-console',
  siteUrl,
  startDate,
  endDate,
  collectedAt: new Date().toISOString(),
  dailyRowCount: dailyRows.length,
  pageRowCount: pageRows.length,
  queryRowCount: queryRowsNormalized.length,
  queryPageRowCount: queryPageRows.length,
  countryRowCount: countryRows.length,
  deviceRowCount: deviceRows.length,
  queryCountryRowCount: queryCountryRows.length,
  queryDeviceRowCount: queryDeviceRows.length,
  dailyRows,
  pageRows,
  queryRows: queryRowsNormalized,
  queryPageRows,
  countryRows,
  deviceRows,
  queryCountryRows,
  queryDeviceRows
});
