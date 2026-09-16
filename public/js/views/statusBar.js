import { h, formatNumber } from '../dom.js';
import { renderJobProgress } from './jobProgress.js';

/**
 * The bar under the header: what's in the database, whether Claude is set up,
 * the two action buttons, and a step-by-step checklist of any background job.
 */
export function renderStatusBar(status, { onIngest, onReport, notice, clockOffsetMs }) {
  const { ingest, report } = status.jobs;
  const reportDisabledReason = status.llm.configured ? null : 'Set ANTHROPIC_API_KEY in .env and restart the server';

  return h('div', { class: 'status-inner' },
    h('dl', { class: 'facts' },
      fact('Community', status.community.name),
      fact('Chunks stored (last 7 days)', formatNumber(status.chunkCount)),
      fact('Claude', status.llm.configured ? status.llm.model : 'not configured'),
    ),
    h('div', { class: 'actions' },
      h('button', { type: 'button', onClick: onIngest, disabled: Boolean(ingest?.running) },
        ingest?.running ? 'Refreshing data...' : 'Refresh data'),
      h('button', { type: 'button', class: 'primary', onClick: onReport, disabled: Boolean(report?.running) || !status.llm.configured, title: reportDisabledReason },
        report?.running ? 'Generating...' : 'Generate A/B report'),
    ),
    notice ? h('p', { class: 'notice' }, notice) : null,
    renderJobProgress({ title: 'Data refresh', job: ingest, clockOffsetMs }),
    renderJobProgress({ title: 'A/B report', job: report, clockOffsetMs }),
  );
}

function fact(label, value) {
  return h('div', { class: 'fact' }, h('dt', {}, label), h('dd', {}, value));
}
