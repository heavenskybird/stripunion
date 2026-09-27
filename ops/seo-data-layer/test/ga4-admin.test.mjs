import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStreams, normalizeStreams } from '../src/collectors/ga4-admin.mjs';

const webStream = (id, uri) => ({
  name: `properties/530171093/dataStreams/${id}`,
  displayName: `Stream ${id}`,
  defaultUri: uri,
  createTime: '2026-01-01T00:00:00Z',
  webStreamData: { measurementId: `G-TEST${id}1234` }
});

test('normalizes only public stream metadata fields', () => {
  assert.deepEqual(normalizeStreams([webStream('42', 'https://stripunion.com')])[0], {
    resourceName: 'properties/530171093/dataStreams/42',
    streamId: '42',
    displayName: 'Stream 42',
    defaultUri: 'https://stripunion.com',
    measurementId: 'G-TEST421234',
    createTime: '2026-01-01T00:00:00Z',
    updateTime: null
  });
});

test('classifies the sole Main or Blog stream from its default URI', () => {
  assert.equal(classifyStreams(normalizeStreams([webStream('42', 'https://stripunion.com')])), 'MAIN STREAM');
  assert.equal(classifyStreams(normalizeStreams([webStream('43', 'https://blog.stripunion.com')])), 'BLOG STREAM');
});

test('does not infer a single stream from unrelated or multiple production streams', () => {
  assert.equal(classifyStreams(normalizeStreams([webStream('44', 'https://example.com')])), 'UNKNOWN / MULTIPLE');
  assert.equal(classifyStreams(normalizeStreams([
    webStream('42', 'https://stripunion.com'),
    webStream('43', 'https://blog.stripunion.com')
  ])), 'UNKNOWN / MULTIPLE');
});

