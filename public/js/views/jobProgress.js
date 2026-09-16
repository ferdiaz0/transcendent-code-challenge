import { h, formatDate } from '../dom.js';

/**
 * Shows a background job as a checklist of ALL its steps, so the user always
 * knows what has happened, what is happening now, and what is still to come:
 *
 *   A/B report · step 2 of 5 · 1:12 elapsed
 *   ✓ Search the database for relevant discussions         <1s
 *   ◌ Claude writes both versions (A: no RAG, B: RAG)      1:11
 *       A (no RAG): done in 61s · B (RAG): writing...
 *       ▓▓▓▓▓▓▓▓░░░░░░░░
 *   ○ Measure both documents
 *   ○ Blind judge compares the two
 *   ○ Save the report
 *
 * Timers tick every second (see updateLiveTimers) even between status polls,
 * so there is always visible movement.
 */
export function renderJobProgress({ title, job, clockOffsetMs }) {
  if (!job) return null;
  if (!job.running && !job.error) return renderFinishedSummary(title, job);

  return h('section', { class: `job-progress ${job.error ? 'failed' : 'running'}` },
    h('header', { class: 'job-header' },
      h('strong', {}, job.error ? `${title} failed` : title),
      job.running
        ? h('span', { class: 'muted' }, `Step ${currentStepNumber(job.steps)} of ${job.steps.length} · `, liveTimer(job.startedAt, clockOffsetMs), ' elapsed')
        : null,
    ),
    h('ol', { class: 'steps' }, job.steps.map((step) => renderStep(step, clockOffsetMs))),
    job.error ? h('p', { class: 'error' }, job.error) : null,
  );
}

function renderStep(step, clockOffsetMs) {
  const showDetail = step.detail && step.status !== 'pending';
  const showBar = step.status === 'active' && step.total > 0;

  return h('li', { class: `step ${step.status}`, 'aria-current': step.status === 'active' ? 'step' : null },
    h('span', { class: 'step-icon', 'aria-hidden': 'true' }, STEP_ICONS[step.status]),
    h('div', { class: 'step-body' },
      h('div', { class: 'step-line' },
        h('span', { class: 'step-label' }, step.label),
        h('span', { class: 'step-time' }, stepTime(step, clockOffsetMs)),
      ),
      showDetail ? h('div', { class: 'step-detail' }, step.detail) : null,
      showBar ? renderProgressBar(step.current, step.total) : null,
    ),
  );
}

// The active step's icon is a CSS spinner; pending steps are an empty circle.
const STEP_ICONS = { done: '✓', failed: '✕', active: '', pending: '' };

function stepTime(step, clockOffsetMs) {
  if (step.status === 'active') return liveTimer(step.startedAt, clockOffsetMs);
  if (step.startedAt && step.finishedAt) return formatDuration(Date.parse(step.finishedAt) - Date.parse(step.startedAt));
  return '';
}

function renderProgressBar(current, total) {
  const percent = Math.round((current / total) * 100);
  return h('div', { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': percent },
    h('div', { class: 'progress-fill', style: `width: ${percent}%` }),
  );
}

function renderFinishedSummary(title, job) {
  const duration = formatDuration(Date.parse(job.finishedAt) - Date.parse(job.startedAt));
  return h('p', { class: 'job-done' },
    h('span', { class: 'step-icon' }, '✓'),
    `${title} finished in ${duration}`,
    h('span', { class: 'muted' }, ` · ${formatDate(job.finishedAt)}`),
  );
}

function currentStepNumber(steps) {
  const activeIndex = steps.findIndex((step) => step.status === 'active');
  return activeIndex === -1 ? 1 : activeIndex + 1;
}

/** An element that app.js refreshes every second via updateLiveTimers. */
function liveTimer(sinceIsoDate, clockOffsetMs) {
  return h('span', { 'data-since': sinceIsoDate }, formatDuration(elapsedSince(sinceIsoDate, clockOffsetMs)));
}

export function updateLiveTimers(clockOffsetMs) {
  document.querySelectorAll('[data-since]').forEach((element) => {
    element.textContent = formatDuration(elapsedSince(element.dataset.since, clockOffsetMs));
  });
}

// clockOffsetMs = server clock minus browser clock, so timers match the server's timestamps.
function elapsedSince(sinceIsoDate, clockOffsetMs) {
  return Date.now() + clockOffsetMs - Date.parse(sinceIsoDate);
}

/** 400 -> "<1s", 12_000 -> "12s", 131_000 -> "2:11" */
export function formatDuration(milliseconds) {
  if (milliseconds < 1000) return '<1s';
  const totalSeconds = Math.round(milliseconds / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
