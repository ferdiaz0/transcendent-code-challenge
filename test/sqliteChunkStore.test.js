import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteChunkStore } from '../src/store/sqliteChunkStore.js';
import { makeChunk } from './helpers/fixtures.js';

test('stores chunks and reads embeddings back as identical Float32Arrays', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([makeChunk({ id: '10#0', embedding: new Float32Array([0.1, 0.2, 0.3]) })]);

  const [saved] = store.getAllChunks();
  assert.equal(saved.text, 'text of 10#0');
  assert.ok(saved.embedding instanceof Float32Array);
  assert.deepEqual(Array.from(saved.embedding), Array.from(new Float32Array([0.1, 0.2, 0.3])));
  assert.equal(saved.retrievalCount, 0);
});

test('inserting the same id twice keeps one row', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([makeChunk({ id: '10#0' })]);
  store.insertChunks([makeChunk({ id: '10#0' })]);

  assert.equal(store.countChunks(), 1);
  assert.deepEqual(store.getStoredChunkIds(), new Set(['10#0']));
});

test('deletes only chunks older than the given date', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([
    makeChunk({ id: 'old#0', createdAt: '2026-09-01T00:00:00.000Z' }),
    makeChunk({ id: 'new#0', createdAt: '2026-09-15T00:00:00.000Z' }),
  ]);

  const deleted = store.deleteChunksCreatedBefore('2026-09-09T00:00:00.000Z');

  assert.equal(deleted, 1);
  assert.deepEqual(store.getStoredChunkIds(), new Set(['new#0']));
});

test('recordRetrievals increments counters and stamps the time', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([makeChunk({ id: 'a#0' }), makeChunk({ id: 'b#0' })]);

  store.recordRetrievals(['a#0'], '2026-09-16T12:00:00.000Z');
  store.recordRetrievals(['a#0', 'b#0'], '2026-09-16T13:00:00.000Z');

  const byId = Object.fromEntries(store.getAllChunks().map((c) => [c.id, c]));
  assert.equal(byId['a#0'].retrievalCount, 2);
  assert.equal(byId['b#0'].retrievalCount, 1);
  assert.equal(byId['a#0'].lastRetrievedAt, '2026-09-16T13:00:00.000Z');
});

test('getMostRetrievedChunks orders by count, omits never-retrieved chunks and embeddings', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([makeChunk({ id: 'a#0' }), makeChunk({ id: 'b#0' }), makeChunk({ id: 'never#0' })]);
  store.recordRetrievals(['a#0', 'b#0']);
  store.recordRetrievals(['b#0']);

  const top = store.getMostRetrievedChunks(10);

  assert.deepEqual(top.map((c) => c.id), ['b#0', 'a#0']);
  assert.equal(top[0].embedding, undefined);
  assert.deepEqual(store.getRetrievalSummary(), { totalChunks: 3, retrievedChunks: 2, totalRetrievals: 3 });
});

test('getTopStories returns one row per story, most points first', () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([
    makeChunk({ id: '1#0', storyId: '1', kind: 'story', storyTitle: 'Small', storyPoints: 150 }),
    makeChunk({ id: '1#1', storyId: '1', kind: 'story', storyTitle: 'Small', storyPoints: 150 }),
    makeChunk({ id: '2#0', storyId: '2', kind: 'story', storyTitle: 'Big', storyPoints: 900, storyCommentCount: 300 }),
    makeChunk({ id: '3#0', storyId: '2', kind: 'comment', storyTitle: 'Big', storyPoints: 900 }),
  ]);

  const stories = store.getTopStories(10);

  assert.deepEqual(stories.map((s) => [s.title, s.points]), [['Big', 900], ['Small', 150]]);
  assert.equal(stories[0].commentCount, 300);
});
