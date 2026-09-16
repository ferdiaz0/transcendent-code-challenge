import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCommunityDocuments } from '../src/ingest/collectCommunityDocuments.js';
import { mapWithConcurrency } from '../src/utils/mapWithConcurrency.js';

const settings = { lookbackDays: 7, minStoryPoints: 100, maxStories: 10, maxCommentsPerStory: 5, fetchConcurrency: 2 };
const silentLog = () => {};

function makeFakeHackerNews({ failingIds = [] } = {}) {
  const calls = [];
  return {
    calls,
    async fetchPopularStoriesSince(options) {
      calls.push(options);
      return [{ objectID: '1' }, { objectID: '2' }];
    },
    async fetchItemTree(id) {
      if (failingIds.includes(id)) throw new Error('boom');
      return { id: Number(id), title: `Story ${id}`, author: 'a', created_at: '2026-09-15T00:00:00Z', children: [] };
    },
  };
}

test('asks the API for stories from the last `lookbackDays`', async () => {
  const hackerNews = makeFakeHackerNews();
  const now = new Date('2026-09-16T00:00:00Z');

  await collectCommunityDocuments({ hackerNews, settings, now, log: silentLog });

  const expectedSince = Date.parse('2026-09-09T00:00:00Z') / 1000;
  assert.deepEqual(hackerNews.calls[0], { sinceUnixSeconds: expectedSince, minPoints: 100, maxStories: 10 });
});

test('skips stories whose comment tree fails to download', async () => {
  const hackerNews = makeFakeHackerNews({ failingIds: ['2'] });

  const documents = await collectCommunityDocuments({ hackerNews, settings, log: silentLog });

  assert.deepEqual(documents.map((d) => d.id), ['1']);
});

test('mapWithConcurrency keeps order and never exceeds the limit', async () => {
  let running = 0;
  let maxRunning = 0;
  const results = await mapWithConcurrency([30, 10, 20, 5], 2, async (delayMs) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    running--;
    return delayMs * 2;
  });

  assert.deepEqual(results, [60, 20, 40, 10]);
  assert.equal(maxRunning, 2);
});
