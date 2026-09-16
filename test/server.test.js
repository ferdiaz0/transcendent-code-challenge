import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequestHandler, parseLimit } from '../src/server/routes.js';
import { resolveInsideDirectory } from '../src/server/staticFiles.js';
import { JobRunner } from '../src/server/jobRunner.js';
import { CommunityVoicesApp } from '../src/server/communityVoicesApp.js';
import { SqliteChunkStore } from '../src/store/sqliteChunkStore.js';
import { makeChunk, silentLog } from './helpers/fixtures.js';

async function startTestServer(app) {
  const publicDirectory = mkdtempSync(join(tmpdir(), 'cv-public-'));
  writeFileSync(join(publicDirectory, 'index.html'), '<h1>hi</h1>');
  const server = createServer(createRequestHandler({ app, publicDirectory }));
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://localhost:${server.address().port}`;
  return { baseUrl, close: () => server.close() };
}

const fakeApp = {
  getStatus: () => ({ chunkCount: 3 }),
  startIngest: () => ({ started: true }),
  startReportGeneration: () => ({ started: false, reason: 'no key' }),
  getLatestReport: () => null,
  getEmbeddingMap: () => ({ points: [] }),
  getRetrievalStats: (limit) => ({ limit }),
};

test('HTTP routes map to app methods with sensible status codes', async (t) => {
  const server = await startTestServer(fakeApp);
  t.after(server.close);

  const status = await fetch(`${server.baseUrl}/api/status`);
  assert.deepEqual(await status.json(), { chunkCount: 3 });

  assert.equal((await fetch(`${server.baseUrl}/api/ingest`, { method: 'POST' })).status, 202);
  assert.equal((await fetch(`${server.baseUrl}/api/reports`, { method: 'POST' })).status, 409);
  assert.equal((await fetch(`${server.baseUrl}/api/reports/latest`)).status, 404);
  assert.deepEqual(await (await fetch(`${server.baseUrl}/api/retrievals/stats?limit=7`)).json(), { limit: 7 });
  assert.equal((await fetch(`${server.baseUrl}/api/nope`)).status, 404);
});

test('serves the frontend from the public folder', async (t) => {
  const server = await startTestServer(fakeApp);
  t.after(server.close);

  const page = await fetch(`${server.baseUrl}/`);
  assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await page.text(), '<h1>hi</h1>');
});

test('static file paths cannot escape the public folder', () => {
  assert.equal(resolveInsideDirectory('/app/public', '/../secret.txt'), null);
  assert.equal(resolveInsideDirectory('/app/public', '/%2e%2e/secret.txt'), null);
  assert.equal(resolveInsideDirectory('/app/public', '/js/app.js'), '/app/public/js/app.js');
});

test('parseLimit falls back to a default and caps large values', () => {
  assert.equal(parseLimit(null), 25);
  assert.equal(parseLimit('-3'), 25);
  assert.equal(parseLimit('10'), 10);
  assert.equal(parseLimit('100000'), 200);
});

const JOB_STEPS = [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }];
const stepStatuses = (status) => status.steps.map((step) => step.status);

test('JobRunner runs one job per name and tracks its steps through to success', async () => {
  const jobs = new JobRunner();
  let release;
  const started = jobs.start('work', (onProgress) => {
    onProgress({ step: 'first', detail: 'halfway' });
    return new Promise((resolve) => { release = resolve; });
  }, { steps: JOB_STEPS });

  assert.equal(started, true);
  assert.equal(jobs.start('work', async () => {}, { steps: JOB_STEPS }), false);
  const running = jobs.getStatus('work');
  assert.equal(running.running, true);
  assert.deepEqual(stepStatuses(running), ['active', 'pending']);
  assert.equal(running.steps[0].detail, 'halfway');

  release({ done: true });
  await jobs.waitFor('work');
  const finished = jobs.getStatus('work');
  assert.deepEqual([finished.running, finished.result, finished.error], [false, { done: true }, null]);
  assert.deepEqual(stepStatuses(finished), ['done', 'done']);
  assert.equal(finished.promise, undefined);
});

test('JobRunner marks the step that was running when a job fails', async () => {
  const jobs = new JobRunner();
  jobs.start('broken', async (onProgress) => {
    onProgress({ step: 'second' });
    throw new Error('boom');
  }, { steps: JOB_STEPS });

  await jobs.waitFor('broken');
  const status = jobs.getStatus('broken');
  assert.equal(status.error, 'boom');
  assert.deepEqual(stepStatuses(status), ['done', 'failed']);
});

function makeApp({ llm = null, chunks = [] } = {}) {
  const store = new SqliteChunkStore(':memory:');
  store.insertChunks(chunks);
  const config = { llm: { model: 'claude-opus-5' }, community: { name: 'HN' }, visualization: { highlightedStoryCount: 2 } };
  return new CommunityVoicesApp({ config, store, llm, jobs: new JobRunner(), log: silentLog, reportRepository: {} });
}

test('report generation is refused without an API key or without data', () => {
  assert.match(makeApp().startReportGeneration().reason, /ANTHROPIC_API_KEY/);
  assert.match(makeApp({ llm: {} }).startReportGeneration().reason, /database is empty/);
});

test('embedding map has one point per stored chunk', () => {
  const app = makeApp({
    chunks: [
      makeChunk({ id: 'a#0', storyId: 'a', embedding: new Float32Array([1, 0, 0]) }),
      makeChunk({ id: 'b#0', storyId: 'b', embedding: new Float32Array([0, 1, 0]) }),
      makeChunk({ id: 'c#0', storyId: 'c', embedding: new Float32Array([0, 0, 1]) }),
    ],
  });

  const map = app.getEmbeddingMap();

  assert.equal(map.points.length, 3);
  assert.ok(map.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
