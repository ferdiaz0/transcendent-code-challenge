import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReportMetrics,
  isQuoteInSource,
  measureTopThreadCoverage,
  titleKeywords,
} from '../src/evaluation/reportMetrics.js';
import { makeDocument, makeTheme, makePrediction } from './helpers/fixtures.js';

const sources = {
  S1: { text: 'Honestly, the borrow checker saved me weeks of debugging.' },
  S2: { text: 'E-ink frames are underrated.' },
};

test('counts citations, flags invented source ids, and verifies quotes', () => {
  const document = makeDocument({
    themes: [
      makeTheme({
        sourceIds: ['S1', 'S99'],
        notableVoices: [
          { quote: 'the borrow checker saved me weeks', sourceId: 'S1' },
          { quote: 'Rust is perfect', sourceId: 'S2' },
        ],
      }),
    ],
    predictions: [makePrediction({ sourceIds: ['S2'] })],
  });

  const metrics = computeReportMetrics({ document, sources, topStories: [] });

  assert.equal(metrics.themeCount, 1);
  assert.equal(metrics.predictionCount, 1);
  assert.equal(metrics.citationCount, 5);
  assert.equal(metrics.uniqueSourcesCited, 2);
  assert.equal(metrics.invalidCitationCount, 1);
  assert.equal(metrics.quoteCount, 2);
  assert.equal(metrics.verifiedQuoteCount, 1);
});

test('isQuoteInSource ignores case and punctuation, and matches "..." fragments separately', () => {
  const text = sources.S1.text;
  assert.equal(isQuoteInSource('HONESTLY the borrow-checker saved me', text), true);
  assert.equal(isQuoteInSource('Honestly... saved me weeks', text), true);
  assert.equal(isQuoteInSource('Honestly... saved me months', text), false);
  assert.equal(isQuoteInSource('anything', undefined), false);
});

test('titleKeywords drops short and common words and strips plurals', () => {
  assert.deepEqual(titleKeywords('Show HN: An e-ink frame that hears birds'), ['frame', 'hear', 'bird']);
});

test('a top thread is covered when the document mentions two of its keywords', () => {
  const topStories = [
    { title: 'An e-ink frame that hears birds' },
    { title: 'Postgres 19 released with new vector indexes' },
    { title: 'HN' }, // no usable keywords: excluded from the total
  ];
  const document = makeDocument({ weekSummary: 'People loved a bird-watching e-ink frame.' });

  assert.deepEqual(measureTopThreadCoverage(document, topStories), {
    covered: 1,
    total: 2,
    coveredTitles: ['An e-ink frame that hears birds'],
  });
});
