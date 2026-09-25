import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'public'];
const textExtensions = new Set(['.astro', '.js', '.mjs', '.css', '.txt', '.svg']);
const forbidden = [
  ['legacy affiliate domain', 'go.mavrtracktor.com'],
  ['Hostinger placeholder', 'Write a short description of this category'],
  ['Hostinger placeholder', 'Write a short text about your service'],
  ['Hostinger placeholder', 'Predict the future'],
  ['fake phone', '123-123-1234'],
  ['fake email', 'info@email.com'],
  ['fake address', '3721 Single Street']
];

const approvedAffiliate =
  'https://go.whitetrafsa.com?userId=103b9c78aec8b8b06d334ded4b9d5ae3c0c8add13eea35b59fc519455ece9fe2';

const files = [];
for (const root of roots) walk(root);

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) walk(path.join(target, name));
    return;
  }
  if (textExtensions.has(path.extname(target))) files.push(target);
}

let failed = false;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const [label, needle] of forbidden) {
    if (content.includes(needle)) {
      failed = true;
      console.error(`FAIL: ${label} found in ${file}: ${needle}`);
    }
  }
}

const siteConfig = fs.readFileSync('src/config/site.js', 'utf8');
if (!siteConfig.includes(approvedAffiliate)) {
  failed = true;
  console.error('FAIL: approved Stripchat affiliate URL is missing from src/config/site.js');
}

if (failed) process.exit(1);
console.log(`Quality gate passed across ${files.length} source/public files.`);
