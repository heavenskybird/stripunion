import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const body = (await readFile(new URL('../dist/robots.txt', import.meta.url), 'utf8'))
  .replace(/\r\n?/g, '\n');
const directives = body.split('\n')
  .map((line) => line.split('#', 1)[0].trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    assert.ok(match, `Unexpected robots.txt line: ${line}`);
    return [match[1].toLowerCase(), match[2].trim()];
  });

assert.deepEqual(directives, [['user-agent', '*'], ['disallow', '/']], 'Staging robots artifact must contain only User-agent: * and Disallow: /.');
assert.equal(directives.some(([name]) => name === 'allow'), false, 'Staging robots artifact must not contain Allow.');
console.log('Staging robots artifact is exactly User-agent: * and Disallow: /.');
