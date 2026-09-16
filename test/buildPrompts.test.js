import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeWeek,
  buildBaselineUserMessage,
  buildRagUserMessage,
  buildRagContext,
} from '../src/generation/buildPrompts.js';
import { makeChunk } from './helpers/fixtures.js';

const week = describeWeek(new Date('2026-09-16T12:00:00Z'), 7);

test('describeWeek gives the 7-day window as dates and a readable label', () => {
  assert.deepEqual(week, { startDate: '2026-09-09', endDate: '2026-09-16', label: 'Sep 9 – Sep 16, 2026' });
});

test('the RAG message is the baseline message plus context (the only A/B difference)', () => {
  const baseline = buildBaselineUserMessage({ communityName: 'Hacker News', week });
  const rag = buildRagUserMessage({ communityName: 'Hacker News', week, contextText: 'CONTEXT' });

  assert.ok(rag.startsWith(baseline));
  assert.ok(rag.endsWith('CONTEXT'));
  assert.ok(!baseline.includes('CONTEXT'));
});

test('buildRagContext numbers sources across queries and keeps a lookup table', () => {
  const topStories = [{ title: 'Big story', points: 500, commentCount: 80, createdAt: '2026-09-14T00:00:00.000Z' }];
  const retrievalGroups = [
    { query: 'debates', results: [{ chunk: makeChunk({ id: '5#0', author: 'alice', text: 'I disagree.' }), score: 0.81234 }] },
    { query: 'empty query', results: [] },
    { query: 'tools', results: [{ chunk: makeChunk({ id: '6#0', kind: 'story', author: 'bob' }), score: 0.7 }] },
  ];

  const { contextText, sources } = buildRagContext({ topStories, retrievalGroups });

  assert.deepEqual(Object.keys(sources), ['S1', 'S2']);
  assert.equal(sources.S1.chunkId, '5#0');
  assert.equal(sources.S1.score, 0.8123);
  assert.ok(contextText.includes('1. "Big story" (500 points, 80 comments, posted 2026-09-14)'));
  assert.ok(contextText.includes('[S1] comment by alice in thread "A story" (2026-09-15)\nI disagree.'));
  assert.ok(contextText.includes('[S2] story posted by bob'));
  assert.ok(!contextText.includes('empty query'));
});
