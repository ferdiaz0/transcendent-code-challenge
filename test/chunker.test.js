import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoChunks } from '../src/ingest/chunker.js';

test('short text stays a single chunk', () => {
  assert.deepEqual(splitIntoChunks('hello world', { maxChars: 50, overlapChars: 10 }), ['hello world']);
});

test('empty text produces no chunks', () => {
  assert.deepEqual(splitIntoChunks('   ', { maxChars: 50, overlapChars: 10 }), []);
});

test('long text is split on word boundaries with overlap', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  const chunks = splitIntoChunks(text, { maxChars: 20, overlapChars: 8 });

  assert.deepEqual(chunks, ['the quick brown fox', 'fox jumps over the', 'the lazy dog']);
  chunks.forEach((chunk) => assert.ok(chunk.length <= 20));
});

test('a single word longer than maxChars is hard-split instead of looping forever', () => {
  const chunks = splitIntoChunks('a'.repeat(25), { maxChars: 10, overlapChars: 3 });
  assert.ok(chunks.length >= 3);
  chunks.forEach((chunk) => assert.ok(chunk.length <= 10));
});
