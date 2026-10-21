import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { findUnsupportedEditorialClaim, UNSUPPORTED_EDITORIAL_CLAIMS } from '../editorial-generator-guards.mjs';

test('generator screens all compiler-forbidden claims before writing a five-item batch', async () => {
  const compiler = await fs.readFile(new URL('../compile-editorial-artifacts.mjs', import.meta.url), 'utf8');
  for (const phrase of UNSUPPORTED_EDITORIAL_CLAIMS) {
    assert.ok(compiler.includes(phrase), 'generator and compiler must agree about ' + phrase);
    assert.equal(findUnsupportedEditorialClaim({ title: 'Check', sections: [{ paragraphs: ['Our ' + phrase.toUpperCase() + ' promise'] }] }), phrase);
  }
});

test('non-guaranteed consumer advice is preserved and not sanitized into invented statements', () => {
  assert.equal(findUnsupportedEditorialClaim({
    title: 'Privacy checklist',
    keyTakeaways: ['No service can guarantee user privacy.'],
    sections: [{ paragraphs: ['Compare policies and use your own judgment.'] }]
  }), null);
});

test('nested FAQs and tables cannot bypass the quality gate', () => {
  assert.equal(findUnsupportedEditorialClaim({
    sections: [{ table: { rows: [['claim', 'number one adult site']] } }],
    faqs: [{ answer: 'Another ordinary answer' }]
  }), 'number one adult site');
});
