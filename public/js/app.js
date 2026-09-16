import { api } from './api.js';
import { h } from './dom.js';
import { renderStatusBar } from './views/statusBar.js';
import { updateLiveTimers } from './views/jobProgress.js';
import { renderReportView } from './views/reportView.js';
import { renderMapView } from './views/mapView.js';
import { renderStatsView } from './views/statsView.js';

/**
 * The frontend's entry point:
 *  - a hash router (#report, #map, #stats) that swaps the main view
 *  - a status bar that polls the server, faster while a background job runs
 */

const VIEWS = { report: renderReportView, map: renderMapView, stats: renderStatsView };
const POLL_WHILE_RUNNING_MS = 2000;
const POLL_WHEN_IDLE_MS = 15000;

const viewContainer = document.getElementById('view');
const statusContainer = document.getElementById('status-bar');

let wasJobRunning = false;
let statusTimer = null;
let notice = null;
let clockOffsetMs = 0; // server clock minus browser clock

async function showCurrentView() {
  const name = currentViewName();
  document.querySelectorAll('.tabs a').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${name}`);
  });

  document.getElementById('tooltip').hidden = true;
  window.scrollTo(0, 0);
  viewContainer.replaceChildren(h('p', { class: 'muted' }, 'Loading...'));
  try {
    viewContainer.replaceChildren(await VIEWS[name]());
  } catch (error) {
    viewContainer.replaceChildren(h('p', { class: 'error' }, `Could not load this page: ${error.message}`));
  }
}

function currentViewName() {
  const name = location.hash.slice(1);
  return name in VIEWS ? name : 'report';
}

async function refreshStatus() {
  clearTimeout(statusTimer);
  let isJobRunning = wasJobRunning;
  try {
    const status = await api.getStatus();
    clockOffsetMs = Date.parse(status.serverTime) - Date.now();
    isJobRunning = Boolean(status.jobs.ingest?.running || status.jobs.report?.running);
    statusContainer.replaceChildren(renderStatusBar(status, { onIngest: startIngest, onReport: startReport, notice, clockOffsetMs }));
    // A job just finished, so the data changed: redraw the current page.
    if (wasJobRunning && !isJobRunning) showCurrentView();
  } catch (error) {
    statusContainer.replaceChildren(h('p', { class: 'error' }, `Server unreachable: ${error.message}`));
  }
  wasJobRunning = isJobRunning;
  statusTimer = setTimeout(refreshStatus, isJobRunning ? POLL_WHILE_RUNNING_MS : POLL_WHEN_IDLE_MS);
}

async function startIngest() {
  await startJob(api.startIngest);
}

async function startReport() {
  await startJob(api.startReport);
}

async function startJob(startRequest) {
  const outcome = await startRequest();
  notice = outcome.started ? null : outcome.reason;
  await refreshStatus();
}

window.addEventListener('hashchange', showCurrentView);
showCurrentView();
refreshStatus();
// Step timers tick every second, between the slower status polls.
setInterval(() => updateLiveTimers(clockOffsetMs), 1000);
