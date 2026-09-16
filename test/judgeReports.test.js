import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeReports,
  mapVerdictToVariants,
  relabelDocumentNames,
  withReadableJudgeRationale,
} from '../src/evaluation/judgeReports.js';
import { makeDocument, makeTheme, makeFakeLlm } from './helpers/fixtures.js';

const high = { groundedness: 5, specificity: 5, coverage: 5, predictionQuality: 4 };
const low = { groundedness: 2, specificity: 2, coverage: 1, predictionQuality: 3 };
const verdict = { documentOne: high, documentTwo: low, winner: 'documentOne', rationale: 'Document One is grounded; Document Two is not.' };

test('maps "documentOne/Two" back to the right variant for either order, including in the rationale', () => {
  assert.deepEqual(mapVerdictToVariants(verdict, true), {
    scores: { baseline: high, rag: low }, winner: 'baseline', rationale: 'A (no RAG) is grounded; B (RAG) is not.',
  });
  assert.deepEqual(mapVerdictToVariants(verdict, false), {
    scores: { rag: high, baseline: low }, winner: 'rag', rationale: 'B (RAG) is grounded; A (no RAG) is not.',
  });
  assert.equal(mapVerdictToVariants({ ...verdict, winner: 'tie' }, true).winner, 'tie');
});

test('relabelDocumentNames handles any capitalization and is safe to run twice', () => {
  const once = relabelDocumentNames('DOCUMENT ONE beats document two.', false);
  assert.equal(once, 'B (RAG) beats A (no RAG).');
  assert.equal(relabelDocumentNames(once, false), once);
});

test('withReadableJudgeRationale fixes older saved reports and leaves others alone', () => {
  const oldReport = { id: 'x', judge: { rationale: 'Document Two wins.', baselineShownFirst: true } };
  assert.equal(withReadableJudgeRationale(oldReport).judge.rationale, 'B (RAG) wins.');
  assert.equal(oldReport.judge.rationale, 'Document Two wins.', 'the original object is not modified');

  const failedJudge = { id: 'y', judge: { error: 'down' } };
  assert.equal(withReadableJudgeRationale(failedJudge), failedJudge);
});

test('shows documents in random order and hides source ids from the judge', async () => {
  const llm = makeFakeLlm([verdict]);
  const ragDocument = makeDocument({
    title: 'RAG DOC',
    themes: [makeTheme({ sourceIds: ['S1'], notableVoices: [{ quote: 'a real quote', sourceId: 'S1' }] })],
  });

  const result = await judgeReports({
    llm,
    communityName: 'Hacker News',
    week: { label: 'Sep 9 – Sep 16, 2026' },
    topStories: [{ title: 'Big story', points: 10, commentCount: 2 }],
    baselineDocument: makeDocument({ title: 'BASELINE DOC' }),
    ragDocument,
    random: () => 0.9, // >= 0.5 means RAG is shown first
  });

  const message = llm.calls[0].userMessage;
  assert.ok(message.indexOf('RAG DOC') < message.indexOf('BASELINE DOC'));
  assert.ok(!message.includes('S1'));
  assert.ok(message.includes('a real quote'));
  assert.equal(result.winner, 'rag');
  assert.equal(result.baselineShownFirst, false);
});
