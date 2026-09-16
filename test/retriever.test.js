import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Retriever, rankBySimilarity, selectDiverseTop } from '../src/rag/retriever.js';
import { cosineSimilarity } from '../src/rag/vectorMath.js';
import { SqliteChunkStore } from '../src/store/sqliteChunkStore.js';
import { makeChunk } from './helpers/fixtures.js';

test('cosine similarity: same direction 1, perpendicular 0, opposite -1, zero vector 0', () => {
  assert.equal(cosineSimilarity([1, 0], [5, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 3]), 0);
  assert.equal(cosineSimilarity([1, 0], [-2, 0]), -1);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
});

test('rankBySimilarity puts the closest chunk first', () => {
  const chunks = [
    makeChunk({ id: 'far#0', embedding: new Float32Array([0, 1, 0]) }),
    makeChunk({ id: 'near#0', embedding: new Float32Array([0.9, 0.1, 0]) }),
  ];
  const ranked = rankBySimilarity(chunks, [1, 0, 0]);
  assert.deepEqual(ranked.map((r) => r.chunk.id), ['near#0', 'far#0']);
});

test('selectDiverseTop limits results per story and skips excluded ids', () => {
  const ranked = [
    { chunk: makeChunk({ id: 'a#0', storyId: 'big' }), score: 0.9 },
    { chunk: makeChunk({ id: 'b#0', storyId: 'big' }), score: 0.8 },
    { chunk: makeChunk({ id: 'c#0', storyId: 'big' }), score: 0.7 },
    { chunk: makeChunk({ id: 'd#0', storyId: 'small' }), score: 0.6 },
    { chunk: makeChunk({ id: 'e#0', storyId: 'other' }), score: 0.5 },
  ];
  const selected = selectDiverseTop(ranked, { topK: 3, maxChunksPerStory: 2, excludeIds: new Set(['a#0']) });
  assert.deepEqual(selected.map((r) => r.chunk.id), ['b#0', 'c#0', 'd#0']);
});

test('retrieveForQueries never returns a chunk twice and records retrieval stats', async () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([
    makeChunk({ id: 'x#0', storyId: 'x', embedding: new Float32Array([1, 0, 0]) }),
    makeChunk({ id: 'y#0', storyId: 'y', embedding: new Float32Array([0.8, 0.2, 0]) }),
  ]);
  const fakeEmbedder = { embed: async (texts) => texts.map(() => new Float32Array([1, 0, 0])) };
  const retriever = new Retriever({ store, embedder: fakeEmbedder, settings: { topKPerQuery: 1, maxChunksPerStory: 1 } });

  const groups = await retriever.retrieveForQueries(['first query', 'second query']);

  assert.deepEqual(groups.map((g) => g.results.map((r) => r.chunk.id)), [['x#0'], ['y#0']]);
  const counts = Object.fromEntries(store.getAllChunks().map((c) => [c.id, c.retrievalCount]));
  assert.deepEqual(counts, { 'x#0': 1, 'y#0': 1 });
});
