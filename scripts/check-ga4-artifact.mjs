import fs from 'node:fs';

const home = fs.readFileSync('dist/index.html', 'utf8');
if (!home.includes('G-TEST123456') || !home.includes('gtag/js?id=G-TEST123456') || !home.includes("'affiliate_click'")) {
  console.error('FAIL: production artifact is missing the safe GA4 test tag or affiliate_click event.');
  process.exit(1);
}
console.log('Production GA4 artifact and affiliate_click event wiring passed.');
