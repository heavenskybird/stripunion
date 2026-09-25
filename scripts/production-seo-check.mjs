import fs from 'node:fs';

const requiredFiles = [
  'dist/index.html',
  'dist/robots.txt',
  'dist/sitemap.xml',
  'dist/stripchat/index.html',
  'dist/stripchat-pricing/index.html',
  'dist/stripchat-vs-chaturbate/index.html',
  'dist/best-live-cam-sites/index.html'
];

let failed = false;

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    failed = true;
    console.error(`FAIL: missing production artifact: ${file}`);
  }
}

if (!failed) {
  const home = fs.readFileSync('dist/index.html', 'utf8');
  const robots = fs.readFileSync('dist/robots.txt', 'utf8');
  const sitemap = fs.readFileSync('dist/sitemap.xml', 'utf8');

  const checks = [
    ['homepage is indexable', home.includes('name="robots" content="index,follow"')],
    ['homepage canonical uses production domain', home.includes('rel="canonical" href="https://stripunion.com/"')],
    ['homepage has no staging URL', !/https:\/\/[^"'<>\s]*hostingersite\.com/i.test(home)],
    ['robots allows crawling', robots.includes('Allow: /')],
    ['robots references production sitemap', robots.includes('Sitemap: https://stripunion.com/sitemap.xml')],
    ['robots does not block all crawling', !robots.includes('Disallow: /')],
    ['sitemap uses production domain', sitemap.includes('<loc>https://stripunion.com/')],
    ['sitemap has Stripchat review', sitemap.includes('<loc>https://stripunion.com/stripchat</loc>')],
    ['sitemap has Stripchat pricing', sitemap.includes('<loc>https://stripunion.com/stripchat-pricing</loc>')],
    ['sitemap has comparison page', sitemap.includes('<loc>https://stripunion.com/stripchat-vs-chaturbate</loc>')],
    ['sitemap has no staging URL', !/https:\/\/[^<\s]*hostingersite\.com/i.test(sitemap)],
    ['affiliate disclosure is not in sitemap', !sitemap.includes('/affiliate-disclosure')]
  ];

  for (const [label, ok] of checks) {
    if (!ok) {
      failed = true;
      console.error(`FAIL: ${label}`);
    }
  }

  const priorityPages = [
    'dist/stripchat/index.html',
    'dist/stripchat-pricing/index.html',
    'dist/stripchat-vs-chaturbate/index.html',
    'dist/best-live-cam-sites/index.html'
  ];

  for (const file of priorityPages) {
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('name="robots" content="index,follow"')) {
      failed = true;
      console.error(`FAIL: priority page is not indexable: ${file}`);
    }
    if (/https:\/\/[^"'<>\s]*hostingersite\.com/i.test(html)) {
      failed = true;
      console.error(`FAIL: staging URL leaked into priority page: ${file}`);
    }
  }
}

if (failed) process.exit(1);
console.log('Production SEO acceptance check passed.');
