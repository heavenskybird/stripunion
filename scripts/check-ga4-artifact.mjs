import fs from 'node:fs';

const home = fs.readFileSync('dist/index.html', 'utf8');
const expectedId = process.env.PUBLIC_GA4_MEASUREMENT_ID || '';
if (process.env.PUBLIC_ALLOW_INDEXING !== 'true' ||
  !/^G-[A-Z0-9]{4,20}$/i.test(expectedId) ||
  !home.includes('googletagmanager.com/gtag/js') ||
  !home.includes(expectedId) ||
  !home.includes(`gtag/js?id=${expectedId}`) ||
  !home.includes(`window.gtag('config', ga4MeasurementId)`) ||
  !home.includes("'affiliate_click'")) {
  console.error('FAIL: production artifact is missing the safe GA4 test tag or affiliate_click event.');
  process.exit(1);
}
console.log('Production GA4 artifact, config call, and affiliate_click event wiring passed.');

