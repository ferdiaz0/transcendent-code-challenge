import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestWeek, INGEST_STEPS } from '../src/ingest/ingestWeek.js';
import { SqliteChunkStore } from '../src/store/sqliteChunkStore.js';
import { textForEmbedding } from '../src/embeddings/textForEmbedding.js';

const config = {
  ingest: { lookbackDays: 7, minStoryPoints: 1, maxStories: 10, maxCommentsPerStory: 10, fetchConcurrency: 2 },
  chunking: { maxChars: 800, overlapChars: 100 },
};
const now = new Date('2026-09-16T00:00:00Z');
const silentLog = () => {};

const fakeHackerNews = {
  async fetchPopularStoriesSince() {
    return [{ objectID: '1' }];
  },
  async fetchItemTree() {
    return {
      id: 1,
      title: 'Story one',
      author: 'op',
      created_at: '2026-09-15T00:00:00Z',
      children: [{ id: 2, text: 'A comment', author: 'c', created_at: '2026-09-15T01:00:00Z', children: [] }],
    };
  },
};

function makeFakeEmbedder() {
  const embeddedTexts = [];
  return {
    embeddedTexts,
    async embed(texts) {
      embeddedTexts.push(...texts);
      return texts.map(() => new Float32Array([1, 0, 0]));
    },
  };
}

test('collects, embeds and stores new chunks', async () => {
  const store = new SqliteChunkStore(':memory:');
  const embedder = makeFakeEmbedder();

  const summary = await ingestWeek({ hackerNews: fakeHackerNews, embedder, store, config, now, log: silentLog });

  assert.deepEqual(summary, { collected: 2, inserted: 2, pruned: 0, total: 2 });
  assert.deepEqual(embedder.embeddedTexts, ['Story one', 'Story one\n\nA comment']);
});

test('a second run does not re-embed chunks already in the store', async () => {
  const store = new SqliteChunkStore(':memory:');
  await ingestWeek({ hackerNews: fakeHackerNews, embedder: makeFakeEmbedder(), store, config, now, log: silentLog });

  const secondEmbedder = makeFakeEmbedder();
  const summary = await ingestWeek({ hackerNews: fakeHackerNews, embedder: secondEmbedder, store, config, now, log: silentLog });

  assert.equal(summary.inserted, 0);
  assert.deepEqual(secondEmbedder.embeddedTexts, []);
});

test('prunes chunks that fell out of the lookback window', async () => {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks([{
    id: 'old#0', documentId: 'old', storyId: 'old', storyTitle: 'Old', kind: 'story', author: 'x',
    createdAt: '2026-08-01T00:00:00.000Z', permalink: 'p', text: 'old', embedding: new Float32Array([0, 1, 0]),
  }]);

  const summary = await ingestWeek({ hackerNews: fakeHackerNews, embedder: makeFakeEmbedder(), store, config, now, log: silentLog });

  assert.equal(summary.pruned, 1);
  assert.equal(store.getStoredChunkIds().has('old#0'), false);
});

test('reports every ingest step in order, with thread and embedding counts', async () => {
  const updates = [];
  const store = new SqliteChunkStore(':memory:');

  await ingestWeek({ hackerNews: fakeHackerNews, embedder: makeFakeEmbedder(), store, config, now, log: silentLog, onProgress: (update) => updates.push(update) });

  const stepOrder = updates.map((update) => update.step).filter((step, index, all) => step !== all[index - 1]);
  assert.deepEqual(stepOrder, INGEST_STEPS.map((step) => step.id));
  assert.deepEqual(updates.filter((u) => u.step === 'threads').map((u) => u.detail), ['0 of 1 threads', '1 of 1 threads']);
  assert.deepEqual(updates.find((u) => u.step === 'embed'), { step: 'embed', detail: '0 of 2 new chunks', current: 0, total: 2 });
});

test('when nothing is new, the embed step says so instead of showing a progress bar', async () => {
  const store = new SqliteChunkStore(':memory:');
  await ingestWeek({ hackerNews: fakeHackerNews, embedder: makeFakeEmbedder(), store, config, now, log: silentLog });

  const updates = [];
  await ingestWeek({ hackerNews: fakeHackerNews, embedder: makeFakeEmbedder(), store, config, now, log: silentLog, onProgress: (update) => updates.push(update) });

  assert.deepEqual(updates.find((u) => u.step === 'embed'), { step: 'embed', detail: 'All 2 chunks are already stored, nothing to embed' });
});

test('comments are embedded with their story title for context', () => {
  assert.equal(textForEmbedding({ kind: 'comment', storyTitle: 'Rust 2.0', text: 'Finally!' }), 'Rust 2.0\n\nFinally!');
  assert.equal(textForEmbedding({ kind: 'story', storyTitle: 'Rust 2.0', text: 'Rust 2.0' }), 'Rust 2.0');
});
