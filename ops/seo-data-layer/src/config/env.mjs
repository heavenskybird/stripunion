const required = [
  'GSC_SITE_URL',
  'GA4_PROPERTY_ID'
];

const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('SEO data layer environment baseline is valid.');
}
