import fs from 'node:fs';

const home = fs.readFileSync('dist/index.html', 'utf8');
const expectedGa4Id = process.env.PUBLIC_GA4_MEASUREMENT_ID || '';
const expectedClarityId = (process.env.PUBLIC_CLARITY_PROJECT_ID || 'ysuowheiiz').toLowerCase();

const checks = [
  ['indexing enabled for production analytics acceptance', process.env.PUBLIC_ALLOW_INDEXING === 'true'],
  ['valid GA4 test measurement id supplied', /^G-[A-Z0-9]{4,20}$/i.test(expectedGa4Id)],
  ['GA4 loader present', home.includes('googletagmanager.com/gtag/js')],
  ['GA4 measurement id present', home.includes(expectedGa4Id)],
  ['GA4 config call present', home.includes(`gtag/js?id=${expectedGa4Id}`) && home.includes("window.gtag('config', ga4MeasurementId)")],
  ['affiliate_click event wiring present', home.includes("'affiliate_click'")],
  ['Google consent defaults denied before analytics choice', home.includes("window.gtag('consent', 'default'") && home.includes("analytics_storage: 'denied'")],
  ['Microsoft Clarity loader present', home.includes('www.clarity.ms/tag/') && home.includes(expectedClarityId)],
  ['Clarity Consent API V2 present', home.includes("window.clarity('consentv2'") && home.includes("analytics_Storage: 'denied'")],
  ['privacy choice control present', home.includes('data-consent-banner') && home.includes('data-consent-choice="granted"') && home.includes('data-consent-choice="denied"')],
  ['advertising storage remains denied', home.includes("ad_Storage: 'denied'") && home.includes("ad_storage: 'denied'")]
];

let failed = false;
for (const [label, ok] of checks) {
  if (!ok) {
    failed = true;
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failed) process.exit(1);
console.log('Production GA4 + Clarity consent-aware analytics artifact acceptance passed.');
