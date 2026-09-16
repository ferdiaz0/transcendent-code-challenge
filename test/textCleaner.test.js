import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToPlainText, decodeHtmlEntities } from '../src/ingest/textCleaner.js';

test('decodes hex, decimal and named HTML entities', () => {
  assert.equal(decodeHtmlEntities('It&#x27;s &quot;fine&quot; &amp; 5&#62;3'), 'It\'s "fine" & 5>3');
});

test('leaves unknown named entities untouched', () => {
  assert.equal(decodeHtmlEntities('&notarealentity;'), '&notarealentity;');
});

test('turns paragraphs into blank lines and removes tags', () => {
  const html = 'First <i>point</i>.<p>Second <a href="https:&#x2F;&#x2F;x.com">link</a>.';
  assert.equal(htmlToPlainText(html), 'First point.\n\nSecond link.');
});

test('keeps escaped angle brackets written by the commenter as visible text', () => {
  assert.equal(htmlToPlainText('Use &lt;div&gt; here'), 'Use <div> here');
});

test('returns empty string for missing text (deleted comments)', () => {
  assert.equal(htmlToPlainText(null), '');
});
