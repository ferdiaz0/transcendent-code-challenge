import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateComparison, REPORT_STEPS } from '../src/generation/generateComparison.js';
import { SYSTEM_PROMPT } from '../src/generation/buildPrompts.js';
import { JUDGE_SYSTEM_PROMPT } from '../src/evaluation/judgeReports.js';
import { makeChunk, makeDocument, makeTheme, makeFakeLlm } from './helpers/fixtures.js';

const config = {
  community: { name: 'Hacker News', url: 'https://news.ycombinator.com' },
  ingest: { lookbackDays: 7 },
  retrieval: { queries: ['q1'], topThreadsInContext: 5 },
  evaluation: { topThreadsForCoverage: 5 },
};
const now = new Date('2026-09-16T00:00:00Z');
const topStory = { title: 'Big story', points: 500, commentCount: 50, createdAt: '2026-09-15T00:00:00.000Z' };

function makeFakes({ judgeFails = false } = {}) {
  const store = { getTopStories: () => [topStory] };
  const retriever = {
    retrieveForQueries: async (queries) => queries.map((query) => ({
      query,
      results: [{ chunk: makeChunk({ id: '7#0', text: 'Quote me on this.' }), score: 0.9 }],
    })),
  };
  const llm = makeFakeLlm((request) => {
    if (request.system === JUDGE_SYSTEM_PROMPT) {
      if (judgeFails) throw new Error('judge down');
      return { documentOne: scores, documentTwo: scores, winner: 'tie', rationale: 'Even.' };
    }
    const hasContext = request.userMessage.includes('[S1]');
    return hasContext
      ? makeDocument({ title: 'RAG', themes: [makeTheme({ sourceIds: ['S1'], notableVoices: [{ quote: 'Quote me', sourceId: 'S1' }] })] })
      : makeDocument({ title: 'BASELINE' });
  });
  return { store, retriever, llm };
}
const scores = { groundedness: 3, specificity: 3, coverage: 3, predictionQuality: 3 };

test('writes the document with and without RAG, measures both, and judges them', async () => {
  const { store, retriever, llm } = makeFakes();

  const report = await generateComparison({ llm, retriever, store, config, now });

  const writerCalls = llm.calls.filter((call) => call.system === SYSTEM_PROMPT);
  assert.equal(writerCalls.length, 2);
  assert.equal(report.documents.baseline.title, 'BASELINE');
  assert.equal(report.documents.rag.title, 'RAG');
  assert.equal(report.metrics.rag.verifiedQuoteCount, 1);
  assert.equal(report.metrics.baseline.uniqueSourcesCited, 0);
  assert.equal(report.metrics.rag.inputTokens, 10);
  assert.equal(report.judge.winner, 'tie');
  assert.equal(report.sources.S1.chunkId, '7#0');
  assert.deepEqual(report.retrieval, [{ query: 'q1', sourceIds: ['S1'] }]);
  assert.equal(report.id, '2026-09-16T00-00-00-000Z');
});

test('a failing judge does not lose the generated documents', async () => {
  const { store, retriever, llm } = makeFakes({ judgeFails: true });

  const report = await generateComparison({ llm, retriever, store, config, now });

  assert.deepEqual(report.judge, { error: 'judge down' });
  assert.equal(report.documents.rag.title, 'RAG');
});

test('refuses to run on an empty database', async () => {
  const { retriever, llm } = makeFakes();
  const emptyStore = { getTopStories: () => [] };

  await assert.rejects(generateComparison({ llm, retriever, store: emptyStore, config, now }), /database is empty/);
});

test('reports each step in order and which of A and B has finished writing', async () => {
  const { store, retriever, llm } = makeFakes();
  const updates = [];

  await generateComparison({ llm, retriever, store, config, now, onProgress: (update) => updates.push(update) });

  const stepOrder = updates.map((update) => update.step).filter((step, index, all) => step !== all[index - 1]);
  const stepsBeforeSave = REPORT_STEPS.map((step) => step.id).filter((id) => id !== 'save');
  assert.deepEqual(stepOrder, stepsBeforeSave);

  const writeUpdates = updates.filter((update) => update.step === 'write');
  assert.deepEqual(writeUpdates.map((update) => update.current), [0, 1, 2]);
  assert.equal(writeUpdates[0].detail, 'A (no RAG): writing... · B (RAG): writing...');
  assert.match(writeUpdates.at(-1).detail, /^A \(no RAG\): done in \d+s · B \(RAG\): done in \d+s$/);
});
