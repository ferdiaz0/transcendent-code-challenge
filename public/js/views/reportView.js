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
      h('li', {}, 'Click "Generate A/B report" (about 2 to 3 minutes).'),
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

/**
 * Two panels side by side (objective numbers | the judge's scores), then the
 * judge's written verdict full-width underneath, where it has room to be read.
 */
function renderComparison({ metrics, judge }) {
  return h('section', { class: 'comparison card' },
    h('header', { class: 'comparison-header' },
      h('h3', {}, 'A/B comparison'),
      h('p', { class: 'muted' }, 'Same model, same instructions. The only difference: B also received this week\'s top threads and retrieved excerpts.'),
    ),
    h('div', { class: 'comparison-grid' },
      renderPanel({
        title: 'Measured by code',
        description: 'Counted directly from the two documents, with no AI involved, so anyone can re-check these numbers.',
        body: renderMetricsTable(metrics),
      }),
      renderPanel({
        title: 'Blind LLM judge',
        description: 'A separate Claude call scored both documents from 1 to 5 against the week\'s real top threads, without knowing which one used RAG.',
        body: renderJudgeScores(judge),
      }),
    ),
    renderVerdict(judge),
  );
}

function renderPanel({ title, description, body }) {
  return h('section', { class: 'comparison-panel' },
    h('h4', {}, title),
    h('p', { class: 'panel-description' }, description),
    body,
  );
}

function renderVariantHeaders(firstColumnLabel) {
  return h('thead', {}, h('tr', {},
    h('th', { scope: 'col' }, firstColumnLabel),
    h('th', { scope: 'col' }, h('span', { class: 'variant-chip baseline' }, 'A · no RAG')),
    h('th', { scope: 'col' }, h('span', { class: 'variant-chip rag' }, 'B · RAG')),
  ));
}

// ---------- Panel 1: metrics measured by code ----------

function renderMetricsTable({ baseline, rag }) {
  const groups = [
    {
      title: 'Content',
      rows: [
        { label: 'Themes found', a: baseline.themeCount, b: rag.themeCount },
        { label: 'Predictions', a: baseline.predictionCount, b: rag.predictionCount },
      ],
    },
    {
      title: 'Grounding in real discussions',
      rows: [
        { label: 'Real sources cited', a: baseline.uniqueSourcesCited, b: rag.uniqueSourcesCited, better: 'higher' },
        { label: 'Invalid citations', a: baseline.invalidCitationCount, b: rag.invalidCitationCount, better: 'lower' },
        { label: 'Quotes verified in source', a: `${baseline.verifiedQuoteCount} / ${baseline.quoteCount}`, b: `${rag.verifiedQuoteCount} / ${rag.quoteCount}`, aValue: baseline.verifiedQuoteCount, bValue: rag.verifiedQuoteCount, better: 'higher' },
        { label: 'Top threads covered', a: coverageText(baseline), b: coverageText(rag), aValue: baseline.topThreadCoverage.covered, bValue: rag.topThreadCoverage.covered, better: 'higher' },
      ],
    },
    {
      title: 'Cost',
      rows: [
        { label: 'Input tokens', a: formatNumber(baseline.inputTokens), b: formatNumber(rag.inputTokens) },
        { label: 'Output tokens', a: formatNumber(baseline.outputTokens), b: formatNumber(rag.outputTokens) },
        { label: 'Time to write', a: seconds(baseline.latencyMs), b: seconds(rag.latencyMs) },
      ],
    },
  ];

  return h('table', { class: 'metrics' },
    renderVariantHeaders('Metric'),
    groups.map((group) => h('tbody', {},
      h('tr', { class: 'group-row' }, h('th', { colspan: 3, scope: 'colgroup' }, group.title)),
      group.rows.map(renderMetricRow),
    )),
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

/** Which column did better, if this row has a "better" direction: 'a', 'b' or null. */
function pickWinner(a, b, better) {
  if (!better || a === b) return null;
  return (better === 'higher') === (a > b) ? 'a' : 'b';
}

// ---------- Panel 2: the judge's scores ----------

const JUDGE_CRITERIA = [
  { key: 'groundedness', label: 'Groundedness' },
  { key: 'specificity', label: 'Specificity' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'predictionQuality', label: 'Predictions' },
];
const MAX_SCORE = 5;

function renderJudgeScores(judge) {
  if (!judge || judge.error) return h('p', { class: 'error' }, `The judge could not run: ${judge?.error ?? 'no result'}`);

  const average = (variant) => JUDGE_CRITERIA.reduce((sum, { key }) => sum + judge.scores[variant][key], 0) / JUDGE_CRITERIA.length;
  const averages = { a: average('baseline'), b: average('rag') };
  const averageWinner = pickWinner(averages.a, averages.b, 'higher');

  return h('table', { class: 'metrics judge-scores' },
    renderVariantHeaders('Criterion (1 to 5)'),
    h('tbody', {},
      JUDGE_CRITERIA.map(({ key, label }) => {
        const a = judge.scores.baseline[key];
        const b = judge.scores.rag[key];
        const winner = pickWinner(a, b, 'higher');
        return h('tr', {},
          h('th', { scope: 'row' }, label),
          renderScoreCell(a, winner === 'a'),
          renderScoreCell(b, winner === 'b'),
        );
      }),
    ),
    h('tfoot', {},
      h('tr', {},
        h('th', { scope: 'row' }, 'Average'),
        h('td', { class: averageWinner === 'a' ? 'winner' : null }, averages.a.toFixed(1)),
        h('td', { class: averageWinner === 'b' ? 'winner' : null }, averages.b.toFixed(1)),
      ),
    ),
  );
}

/** "▮▮▮▯▯ 3": a small meter makes the 1–5 scores comparable at a glance. */
function renderScoreCell(score, isWinner) {
  const blocks = Array.from({ length: MAX_SCORE }, (_, index) => h('span', { class: index < score ? 'pip on' : 'pip' }));
  return h('td', { class: isWinner ? 'winner' : null },
    h('span', { class: 'score-cell' },
      h('span', { class: 'score-meter', 'aria-hidden': 'true' }, blocks),
      h('span', { class: 'score-value' }, score),
    ),
  );
}

// ---------- The judge's written verdict ----------

const VARIANT_NAMES = { rag: 'B · RAG', baseline: 'A · no RAG' };

function renderVerdict(judge) {
  if (!judge || judge.error) return null;
  const badgeText = judge.winner === 'tie' ? 'Tie' : `Winner: ${VARIANT_NAMES[judge.winner]}`;

  return h('section', { class: `verdict ${judge.winner}` },
    h('div', { class: 'verdict-heading' },
      h('span', { class: 'verdict-label' }, 'Judge\'s verdict'),
      h('span', { class: `winner-badge ${judge.winner}` }, badgeText),
    ),
    h('p', { class: 'verdict-text' }, judge.rationale),
    renderJudgeOrderNote(judge),
  );
}

function renderJudgeOrderNote(judge) {
  if (typeof judge.baselineShownFirst !== 'boolean') return null;
  const ragPosition = judge.baselineShownFirst ? 'second' : 'first';
  return h('p', { class: 'verdict-note' },
    `The judge saw the documents unlabeled, as "Document One" and "Document Two" in random order (B · RAG was shown ${ragPosition}). Those names are translated back to A and B above.`);
}

function coverageText(metrics) {
  return `${metrics.topThreadCoverage.covered} / ${metrics.topThreadCoverage.total}`;
}

function seconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

// ---------- The document itself ----------

function renderDocument({ label, variant, document, sources }) {
  const card = h('section', { class: `document card ${variant}` });
  const scrollTo = (element) => element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const backToTop = () => scrollTo(card);

  const themesTitle = renderSectionTitle({ text: 'What the community talked about', count: document.themes.length, backToTop });
  const predictionsTitle = renderSectionTitle({ text: 'What to expect next week', count: document.predictions.length, backToTop });
  const caveatsTitle = renderSectionTitle({ text: 'Caveats', backToTop });

  card.append(
    h('p', { class: 'variant-label' }, label),
    h('h3', { class: 'document-title' }, document.title),
    renderJumpLinks([
      { text: 'Past week', count: document.themes.length, onClick: () => scrollTo(themesTitle) },
      { text: 'Next week', count: document.predictions.length, onClick: () => scrollTo(predictionsTitle) },
      { text: 'Caveats', onClick: () => scrollTo(caveatsTitle) },
    ]),
    h('p', { class: 'lead' }, document.weekSummary),
    themesTitle,
    h('div', { class: 'section-items' }, document.themes.map((theme) => renderTheme(theme, sources))),
    predictionsTitle,
    h('div', { class: 'section-items' }, document.predictions.map((prediction) => renderPrediction(prediction, sources))),
    caveatsTitle,
    h('p', { class: 'caveats' }, document.caveats),
  );
  return card;
}

/**
 * Buttons (not "#anchor" links) because the URL hash already switches pages
 * (#report, #map, #stats); an anchor link would trigger the router.
 */
function renderJumpLinks(links) {
  return h('nav', { class: 'jump-links', 'aria-label': 'Jump to section' },
    h('span', { class: 'jump-label' }, 'Jump to'),
    links.map(({ text, count, onClick }) =>
      h('button', { type: 'button', class: 'jump-link', onClick },
        text,
        count === undefined ? null : h('span', { class: 'count-pill' }, count))),
  );
}

function renderSectionTitle({ text, count, backToTop }) {
  return h('h4', { class: 'section-title' },
    h('span', { class: 'section-title-text' }, text),
    count === undefined ? null : h('span', { class: 'count-pill' }, count),
    h('button', { type: 'button', class: 'to-top', onClick: backToTop, 'aria-label': 'Back to the top of this document' }, '↑ Top'),
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
