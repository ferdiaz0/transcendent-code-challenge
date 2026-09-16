import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStepList, applyProgress, completeAllSteps, failCurrentStep } from '../src/utils/stepTracker.js';
import { createConsoleProgress } from '../src/utils/consoleProgress.js';

const STEPS = [
  { id: 'find', label: 'Find stories' },
  { id: 'download', label: 'Download threads' },
  { id: 'save', label: 'Save' },
];

test('a new step list shows every step as pending', () => {
  assert.deepEqual(createStepList(STEPS).map((step) => step.status), ['pending', 'pending', 'pending']);
});

test('moving to a step finishes earlier steps and keeps the original start time on updates', () => {
  const steps = createStepList(STEPS);

  applyProgress(steps, { step: 'find' }, 't0');
  applyProgress(steps, { step: 'download', detail: '0 of 10', current: 0, total: 10 }, 't1');
  applyProgress(steps, { step: 'download', detail: '5 of 10', current: 5, total: 10 }, 't2');

  assert.deepEqual(steps.map((step) => step.status), ['done', 'active', 'pending']);
  assert.deepEqual([steps[0].startedAt, steps[0].finishedAt], ['t0', 't1']);
  assert.equal(steps[1].startedAt, 't1');
  assert.deepEqual([steps[1].detail, steps[1].current, steps[1].total], ['5 of 10', 5, 10]);
});

test('jumping ahead marks skipped steps done instantly', () => {
  const steps = createStepList(STEPS);
  applyProgress(steps, { step: 'save' }, 't5');
  assert.deepEqual(steps.map((step) => [step.status, step.startedAt]), [['done', 't5'], ['done', 't5'], ['active', 't5']]);
});

test('unknown step ids are a programming error', () => {
  assert.throws(() => applyProgress(createStepList(STEPS), { step: 'nope' }), /Unknown progress step "nope"/);
});

test('completeAllSteps finishes everything; a finished progress bar shows full', () => {
  const steps = createStepList(STEPS);
  applyProgress(steps, { step: 'download', current: 9, total: 10 });
  completeAllSteps(steps);
  assert.ok(steps.every((step) => step.status === 'done'));
  assert.equal(steps[1].current, 10);
});

test('failCurrentStep marks the running step, or the first step if none started', () => {
  const running = createStepList(STEPS);
  applyProgress(running, { step: 'download' });
  failCurrentStep(running);
  assert.deepEqual(running.map((step) => step.status), ['done', 'failed', 'pending']);

  const neverStarted = createStepList(STEPS);
  failCurrentStep(neverStarted);
  assert.equal(neverStarted[0].status, 'failed');
});

test('console progress: interactive terminals update the line in place', () => {
  let output = '';
  const onProgress = createConsoleProgress(STEPS, { inline: true, write: (text) => { output += text; } });

  onProgress({ step: 'find' });
  onProgress({ step: 'download', detail: '1 of 2' });
  onProgress({ step: 'download', detail: '2 of 2' });

  assert.equal(output, '[1/3] Find stories\n[2/3] Download threads: 1 of 2\r\x1b[K[2/3] Download threads: 2 of 2');
});

test('console progress: log files only get one line per step', () => {
  const lines = [];
  const onProgress = createConsoleProgress(STEPS, { inline: false, write: (text) => lines.push(text) });

  onProgress({ step: 'download', detail: '1 of 2' });
  onProgress({ step: 'download', detail: '2 of 2' });
  onProgress({ step: 'save' });

  assert.deepEqual(lines, ['[2/3] Download threads: 1 of 2\n', '[3/3] Save\n']);
});
