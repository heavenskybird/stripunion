import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { findUnsupportedEditorialClaim, UNSUPPORTED_EDITORIAL_CLAIMS, occupiedEditorialIdentifiers } from '../editorial-generator-guards.mjs';

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

test('occupied identifiers include older backlog, guide and unpublished artifacts beyond prompt tail windows', () => {
  const backlog = { queue: Array.from({ length: 200 }, (_, i) => ({ id: `backlog-${i}`, category: 'Adult Games' })) };
  const existingGuides = [{ slug: 'guide-only', categorySlug: 'adult-games' }, { slug: 'other', categorySlug: 'live-cams' }];
  const allArtifacts = Array.from({ length: 100 }, (_, i) => ({ data: { slug: `artifact-${i}`, backlogId: `artifact-id-${i}`, categorySlug: 'adult-games' } }));
  const ids = occupiedEditorialIdentifiers({ backlog, existingGuides, allArtifacts, selectedCategories: [{ name: 'Adult Games', slug: 'adult-games' }] });
  for (const id of ['backlog-0','backlog-199','guide-only','artifact-0','artifact-id-0']) assert.ok(ids.includes(id));
  assert.equal(ids.includes('other'), false);
  assert.equal(new Set(ids).size, ids.length);
});
