import { api } from '../api.js';
import { h, formatNumber, formatDate } from '../dom.js';

/**
 * The Report page: the Community Voices document written with RAG (B) and
 * without it (A), side by side, above the numbers comparing them.
 */
export async function renderReportView() {
  const report = await api.getLatestReport();
  if (!report) return renderEmptyState();

  return h('article', { class: 'report' },
    renderHeader(report),
    renderComparison(report),
    h('section', { class: 'documents' },
      renderDocument({ label: 'B · With RAG', variant: 'rag', document: report.documents.rag, sources: report.sources }),
      renderDocument({ label: 'A · Without RAG', variant: 'baseline', document: report.documents.baseline, sources: {} }),
    ),
    renderRetrievalDetails(report),
  );
}

function renderEmptyState() {
  return h('section', { class: 'empty card' },
    h('h2', {}, 'No report yet'),
    h('ol', {},
      h('li', {}, 'Wait for the data refresh to finish (progress is shown above).'),
      h('li', {}, 'Put your ANTHROPIC_API_KEY in a .env file and restart the server.'),
      h('li', {}, 'Click "Generate A/B report" (about 1 to 3 minutes).'),
    ),
    h('p', { class: 'muted' }, 'Meanwhile, the Embedding map and Retrieval stats pages work without an API key.'),
  );
}

function renderHeader(report) {
  return h('header', { class: 'report-header' },
    report.isSample ? h('p', { class: 'badge' }, 'Sample report: generate your own to see this week') : null,
    h('h2', {}, report.documents.rag.title),
    h('p', { class: 'muted' }, `${report.community.name} · ${report.week.label} · generated ${formatDate(report.createdAt)} with ${report.model}`),
    h('a', { class: 'button', href: api.markdownDownloadUrl }, 'Download as Markdown'),
  );
}

// ---------- A/B comparison ----------

function renderComparison({ metrics, judge }) {
  return h('section', { class: 'comparison card' },
    h('h3', {}, 'A/B comparison'),
    h('p', { class: 'muted' }, 'Same model, same instructions. The only difference: B also received this week\'s top threads and retrieved excerpts.'),
    h('div', { class: 'comparison-grid' },
      renderMetricsTable(metrics),
      renderJudge(judge),
    ),
  );
}

function renderMetricsTable({ baseline, rag }) {
  const rows = [
    { label: 'Themes found', a: baseline.themeCount, b: rag.themeCount },
    { label: 'Predictions', a: baseline.predictionCount, b: rag.predictionCount },
    { label: 'Real sources cited', a: baseline.uniqueSourcesCited, b: rag.uniqueSourcesCited, better: 'higher' },
    { label: 'Invalid citations', a: baseline.invalidCitationCount, b: rag.invalidCitationCount, better: 'lower' },
    { label: 'Quotes verified in source', a: `${baseline.verifiedQuoteCount} / ${baseline.quoteCount}`, b: `${rag.verifiedQuoteCount} / ${rag.quoteCount}` },
    { label: 'Top threads covered', a: coverageText(baseline), b: coverageText(rag), aValue: baseline.topThreadCoverage.covered, bValue: rag.topThreadCoverage.covered, better: 'higher' },
    { label: 'Input tokens', a: formatNumber(baseline.inputTokens), b: formatNumber(rag.inputTokens) },
    { label: 'Output tokens', a: formatNumber(baseline.outputTokens), b: formatNumber(rag.outputTokens) },
    { label: 'Latency', a: seconds(baseline.latencyMs), b: seconds(rag.latencyMs) },
  ];

  return h('table', { class: 'metrics' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Measured by code'), h('th', {}, 'A · no RAG'), h('th', {}, 'B · RAG'))),
    h('tbody', {}, rows.map(renderMetricRow)),
  );
}

function renderMetricRow(row) {
  const winner = pickWinner(row.aValue ?? row.a, row.bValue ?? row.b, row.better);
  return h('tr', {},
    h('th', { scope: 'row' }, row.label),
    h('td', { class: winner === 'a' ? 'winner' : null }, row.a),
    h('td', { class: winner === 'b' ? 'winner' : null }, row.b),
  );
}

function pickWinner(a, b, better) {
  if (!better || a === b) return null;
  return (better === 'higher') === (a > b) ? 'a' : 'b';
}

function renderJudge(judge) {
  if (!judge || judge.error) {
    return h('div', { class: 'judge' }, h('h4', {}, 'Blind LLM judge'), h('p', { class: 'error' }, judge?.error ?? 'Not run.'));
  }
  const criteria = [['groundedness', 'Groundedness'], ['specificity', 'Specificity'], ['coverage', 'Coverage'], ['predictionQuality', 'Predictions']];
  const winnerLabel = { rag: 'B · RAG', baseline: 'A · no RAG', tie: 'Tie' }[judge.winner];

  return h('div', { class: 'judge' },
    h('table', { class: 'metrics' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Blind LLM judge (1 to 5)'), h('th', {}, 'A · no RAG'), h('th', {}, 'B · RAG'))),
      h('tbody', {}, criteria.map(([key, label]) => renderMetricRow({ label, a: judge.scores.baseline[key], b: judge.scores.rag[key], better: 'higher' }))),
    ),
    h('p', {}, h('strong', {}, `Winner: ${winnerLabel}. `), judge.rationale),
  );
}

function coverageText(metrics) {
  return `${metrics.topThreadCoverage.covered} / ${metrics.topThreadCoverage.total}`;
}

function seconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

// ---------- The document itself ----------

function renderDocument({ label, variant, document, sources }) {
  return h('section', { class: `document card ${variant}` },
    h('p', { class: 'variant-label' }, label),
    h('h3', {}, document.title),
    h('p', { class: 'lead' }, document.weekSummary),
    h('h4', {}, 'What the community talked about'),
    document.themes.map((theme) => renderTheme(theme, sources)),
    h('h4', {}, 'What to expect next week'),
    document.predictions.map((prediction) => renderPrediction(prediction, sources)),
    h('h4', {}, 'Caveats'),
    h('p', { class: 'muted' }, document.caveats),
  );
}

function renderTheme(theme, sources) {
  return h('div', { class: 'theme' },
    h('h5', {}, theme.name, ' ', h('span', { class: `pill ${theme.sentiment}` }, theme.sentiment)),
    h('p', {}, theme.summary, ' ', renderCitations(theme.sourceIds, sources)),
    theme.notableVoices.map((voice) =>
      h('blockquote', {}, `"${voice.quote}" `, renderCitations([voice.sourceId], sources))),
  );
}

function renderPrediction(prediction, sources) {
  return h('div', { class: 'prediction' },
    h('h5', {}, prediction.topic, ' ', h('span', { class: `pill confidence-${prediction.confidence}` }, `${prediction.confidence} confidence`)),
    h('p', {}, prediction.prediction),
    h('p', { class: 'rationale' }, h('strong', {}, 'Why: '), prediction.rationale, ' ', renderCitations(prediction.sourceIds, sources)),
  );
}

/** Citation chips link to the original comment; hovering shows the excerpt. */
function renderCitations(sourceIds, sources) {
  return sourceIds.filter(Boolean).map((id) => {
    const source = sources[id];
    if (!source) return h('span', { class: 'cite invalid', title: 'This id was not in the provided sources' }, `${id}?`);
    return h('a', {
      class: 'cite',
      href: source.permalink,
      target: '_blank',
      rel: 'noopener',
      title: `${source.kind} by ${source.author} in "${source.storyTitle}"\n\n${source.text.slice(0, 400)}`,
    }, id);
  });
}

// ---------- What RAG retrieved ----------

function renderRetrievalDetails({ retrieval, sources }) {
  const total = Object.keys(sources).length;
  return h('details', { class: 'card retrieval' },
    h('summary', {}, `What RAG retrieved: ${total} excerpts from ${retrieval.length} search queries`),
    retrieval.map((group) =>
      h('div', { class: 'retrieval-group' },
        h('h5', {}, `"${group.query}"`),
        h('ul', {}, group.sourceIds.map((id) => renderRetrievedSource(id, sources[id]))),
      )),
  );
}

function renderRetrievedSource(id, source) {
  return h('li', {},
    h('a', { class: 'cite', href: source.permalink, target: '_blank', rel: 'noopener' }, id),
    h('span', { class: 'score' }, `similarity ${source.score.toFixed(2)}`),
    h('span', {}, `${source.kind} by ${source.author} in "${source.storyTitle}"`),
    h('p', { class: 'muted snippet' }, source.text.slice(0, 240)),
  );
}
