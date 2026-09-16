/**
 * Tracks progress through a fixed list of steps, so a user can see the whole
 * plan up front and where the task currently is:
 *
 *   ✓ Find this week's popular stories        1s
 *   ● Download comment threads                12s   87 of 150 threads
 *   ○ Clean and split text into chunks
 *
 * A pipeline reports progress with `{ step, detail, current, total }`.
 * Moving to a step marks every earlier step as done.
 */

export function createStepList(stepDefinitions) {
  return stepDefinitions.map(({ id, label }) => ({
    id,
    label,
    status: 'pending', // 'pending' | 'active' | 'done' | 'failed'
    startedAt: null,
    finishedAt: null,
    detail: null,
    current: null,
    total: null,
  }));
}

export function applyProgress(steps, { step, detail = null, current = null, total = null }, now = new Date().toISOString()) {
  const activeIndex = steps.findIndex((candidate) => candidate.id === step);
  if (activeIndex === -1) throw new Error(`Unknown progress step "${step}"`);

  steps.slice(0, activeIndex).forEach((earlierStep) => finishStep(earlierStep, now));

  const activeStep = steps[activeIndex];
  if (activeStep.status !== 'active') {
    activeStep.status = 'active';
    activeStep.startedAt = now;
  }
  Object.assign(activeStep, { detail, current, total });
}

export function completeAllSteps(steps, now = new Date().toISOString()) {
  steps.forEach((step) => finishStep(step, now));
}

/** Marks the step that was running (or the first one, if none started) as failed. */
export function failCurrentStep(steps, now = new Date().toISOString()) {
  const failedStep = steps.find((step) => step.status === 'active') ?? steps.find((step) => step.status === 'pending');
  if (!failedStep) return;
  failedStep.status = 'failed';
  failedStep.startedAt ??= now;
  failedStep.finishedAt = now;
}

function finishStep(step, now) {
  if (step.status === 'done') return;
  step.status = 'done';
  step.startedAt ??= now; // a step that was skipped over finishes instantly
  step.finishedAt = now;
  step.current = step.total ?? step.current;
}
