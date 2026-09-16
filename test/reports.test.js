import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportRepository } from '../src/reports/reportRepository.js';
import { reportToMarkdown, renderCitations } from '../src/reports/reportToMarkdown.js';
import { makeDocument, makeTheme, makePrediction } from './helpers/fixtures.js';

function makeTempDirectory() {
  return mkdtempSync(join(tmpdir(), 'community-voices-test-'));
}

const metricsFor = (coverage) => ({
  themeCount: 1, predictionCount: 1, citationCount: 1, uniqueSourcesCited: 1, invalidCitationCount: 0,
  quoteCount: 1, verifiedQuoteCount: 1, topThreadCoverage: { covered: coverage, total: 5 },
  inputTokens: 100, outputTokens: 50, latencyMs: 1234,
});

function makeReport(id) {
  return {
    id,
    createdAt: '2026-09-16T00:00:00.000Z',
    community: { name: 'Hacker News' },
    week: { label: 'Sep 9 – Sep 16, 2026', endDate: '2026-09-16' },
    model: 'claude-opus-5',
    documents: {
      rag: makeDocument({
        title: 'RAG title',
        themes: [makeTheme({ name: 'Birds', sourceIds: ['S1'], notableVoices: [{ quote: 'Tweet tweet', sourceId: 'S1' }] })],
        predictions: [makePrediction({ topic: 'More birds', sourceIds: ['S1'] })],
      }),
      baseline: makeDocument({ title: 'Baseline title' }),
    },
    sources: { S1: { permalink: 'https://news.ycombinator.com/item?id=1' } },
    metrics: { baseline: metricsFor(1), rag: metricsFor(4) },
    judge: {
      scores: {
        baseline: { groundedness: 2, specificity: 2, coverage: 1, predictionQuality: 2 },
        rag: { groundedness: 5, specificity: 4, coverage: 5, predictionQuality: 4 },
      },
      winner: 'rag',
      rationale: 'B cites real threads.',
    },
  };
}

test('loadLatest returns the newest saved report', () => {
  const directory = makeTempDirectory();
  const repository = new ReportRepository({ reportsDirectory: directory, sampleReportPath: null });

  repository.save(makeReport('2026-09-15T10-00-00-000Z'));
  repository.save(makeReport('2026-09-16T10-00-00-000Z'));

  assert.equal(repository.loadLatest().id, '2026-09-16T10-00-00-000Z');
});

test('loadLatest falls back to the sample report, then to null', () => {
  const directory = makeTempDirectory();
  const samplePath = join(directory, 'sample.json');
  const missingReports = join(directory, 'none');

  assert.equal(new ReportRepository({ reportsDirectory: missingReports, sampleReportPath: samplePath }).loadLatest(), null);

  writeFileSync(samplePath, JSON.stringify(makeReport('sample')));
  const loaded = new ReportRepository({ reportsDirectory: missingReports, sampleReportPath: samplePath }).loadLatest();
  assert.equal(loaded.id, 'sample');
  assert.equal(loaded.isSample, true);
});

test('markdown export has the RAG document, linked citations, metrics, judge and baseline', () => {
  const markdown = reportToMarkdown(makeReport('x'));

  assert.ok(markdown.startsWith('# RAG title'));
  assert.ok(markdown.includes('### Birds _(mixed)_'));
  assert.ok(markdown.includes('> "Tweet tweet" [S1](https://news.ycombinator.com/item?id=1)'));
  assert.ok(markdown.includes('| Top threads covered | 1/5 | 4/5 |'));
  assert.ok(markdown.includes('| groundedness | 2 | 5 |'));
  assert.ok(markdown.includes('**Winner:** B: RAG.'));
  assert.ok(markdown.includes('## Baseline title'));
});

test('renderCitations marks ids that do not exist', () => {
  assert.equal(renderCitations(['S1', 'S9', ''], { S1: { permalink: 'p' } }), '[S1](p) [S9?]');
});
