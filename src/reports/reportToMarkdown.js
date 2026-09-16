/**
 * Exports a report as a Markdown file: the shareable "Community Voices Document".
 * The RAG version comes first, then the A/B comparison, then the baseline version.
 */
export function reportToMarkdown(report) {
  const { documents, sources } = report;
  return [
    `# ${documents.rag.title}`,
    `_${report.community.name} · ${report.week.label} · generated ${report.createdAt.slice(0, 10)} with ${report.model}_`,
    renderDocumentBody(documents.rag, sources),
    '---',
    '# A/B comparison: without RAG vs. with RAG',
    renderMetricsTable(report.metrics),
    renderJudge(report.judge),
    '---',
    '# Appendix: the same document written without RAG',
    `## ${documents.baseline.title}`,
    renderDocumentBody(documents.baseline, {}),
  ].join('\n\n') + '\n';
}

function renderDocumentBody(document, sources) {
  return [
    document.weekSummary,
    '## What the community talked about',
    ...document.themes.map((theme) => renderTheme(theme, sources)),
    '## What we expect next week',
    ...document.predictions.map((prediction) => renderPrediction(prediction, sources)),
    '## Caveats',
    document.caveats,
  ].join('\n\n');
}

function renderTheme(theme, sources) {
  const voices = theme.notableVoices.map((voice) => `> "${voice.quote}" ${renderCitations([voice.sourceId], sources)}`);
  return [
    `### ${theme.name} _(${theme.sentiment})_`,
    `${theme.summary} ${renderCitations(theme.sourceIds, sources)}`.trim(),
    ...voices,
  ].join('\n\n');
}

function renderPrediction(prediction, sources) {
  return [
    `### ${prediction.topic} _(confidence: ${prediction.confidence})_`,
    prediction.prediction,
    `**Why:** ${prediction.rationale} ${renderCitations(prediction.sourceIds, sources)}`.trim(),
  ].join('\n\n');
}

/** "[S3](https://news.ycombinator.com/item?id=…)". Unknown ids are kept visible but unlinked. */
export function renderCitations(sourceIds, sources) {
  return sourceIds
    .filter(Boolean)
    .map((id) => (sources[id] ? `[${id}](${sources[id].permalink})` : `[${id}?]`))
    .join(' ');
}

function renderMetricsTable({ baseline, rag }) {
  const rows = [
    ['Themes', baseline.themeCount, rag.themeCount],
    ['Predictions', baseline.predictionCount, rag.predictionCount],
    ['Citations to real sources', baseline.uniqueSourcesCited, rag.uniqueSourcesCited],
    ['Invalid citations', baseline.invalidCitationCount, rag.invalidCitationCount],
    ['Quotes verified in sources', `${baseline.verifiedQuoteCount}/${baseline.quoteCount}`, `${rag.verifiedQuoteCount}/${rag.quoteCount}`],
    ['Top threads covered', formatCoverage(baseline.topThreadCoverage), formatCoverage(rag.topThreadCoverage)],
    ['Input tokens', baseline.inputTokens, rag.inputTokens],
    ['Output tokens', baseline.outputTokens, rag.outputTokens],
    ['Latency', formatSeconds(baseline.latencyMs), formatSeconds(rag.latencyMs)],
  ];
  return [
    '| Metric | A: no RAG | B: RAG |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function renderJudge(judge) {
  if (!judge || judge.error) return `_Blind judge unavailable: ${judge?.error ?? 'not run'}_`;
  const criteria = ['groundedness', 'specificity', 'coverage', 'predictionQuality'];
  const winner = { baseline: 'A: no RAG', rag: 'B: RAG', tie: 'tie' }[judge.winner];
  return [
    '## Blind LLM judge (1–5)',
    '| Criterion | A: no RAG | B: RAG |',
    '| --- | --- | --- |',
    ...criteria.map((name) => `| ${name} | ${judge.scores.baseline[name]} | ${judge.scores.rag[name]} |`),
    '',
    `**Winner:** ${winner}. ${judge.rationale}`,
  ].join('\n');
}

function formatCoverage(coverage) {
  return `${coverage.covered}/${coverage.total}`;
}

function formatSeconds(milliseconds) {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}
