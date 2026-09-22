import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSize, getInput, globToRegExp, hasBypassLabel, isIgnored, parsePatterns } from '../src/index.js';

test('parses newline-separated ignored paths', () => {
  assert.deepEqual(parsePatterns('docs/**\n\n **/*.lock \n'), ['docs/**', '**/*.lock']);
});

test('reads GitHub action inputs with hyphens intact', () => {
  assert.equal(getInput('max-lines', { 'INPUT_MAX-LINES': '800' }), '800');
  assert.equal(getInput('github-token', { 'INPUT_GITHUB-TOKEN': 'token' }), 'token');
});

test('matches familiar GitHub-style path globs', () => {
  assert.match('docs/guide/setup.md', globToRegExp('docs/**'));
  assert.match('nested/dependency.lock', globToRegExp('**/*.lock'));
  assert.match('nested/package-lock.json', globToRegExp('**/package-lock.json'));
  assert.doesNotMatch('src/docs/readme.md', globToRegExp('docs/**'));
  assert.equal(isIgnored('assets/generated/client.ts', ['**/generated/**']), true);
});

test('counts additions and deletions while excluding matching files', () => {
  const result = calculateSize([
    { filename: 'src/app.js', additions: 10, deletions: 3 },
    { filename: 'docs/guide.md', additions: 100, deletions: 20 },
    { filename: 'package-lock.json', additions: 40, deletions: 10 }
  ], { patterns: ['docs/**', '**/package-lock.json'], count: 'additions-and-deletions' });
  assert.deepEqual(result, { countedLines: 13, countedFiles: 1, skippedFiles: 2 });
});

test('can count additions only', () => {
  const result = calculateSize([{ filename: 'src/app.js', additions: 10, deletions: 9 }], { count: 'additions-only' });
  assert.equal(result.countedLines, 10);
});

test('bypass labels match case-insensitively', () => {
  assert.equal(hasBypassLabel([{ name: 'Size-Exempt' }], 'size-exempt'), true);
  assert.equal(hasBypassLabel([{ name: 'other' }], 'size-exempt'), false);
});
