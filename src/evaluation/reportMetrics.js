/**
 * Objective, repeatable numbers for the A/B comparison. No LLM involved:
 * every metric is computed by plain code, so anyone can check it.
 *
 *  - citations / invalid citations: does the document point at real evidence?
 *  - verified quotes: do "community voices" quotes actually appear in the source text?
 *  - top-thread coverage: does the document mention the week's most-engaged threads?
 */

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'from', 'have', 'into', 'just', 'like', 'make',
  'more', 'most', 'much', 'only', 'over', 'show', 'some', 'than', 'that', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'using', 'what', 'when', 'which', 'while', 'will', 'with',
  'without', 'your', 'yours', 'does', 'doesn', 'here', 'where', 'were', 'been', 'being', 'should',
  'would', 'could', 'other', 'every', 'first', 'year', 'years', 'people',
]);

/**
 * @param {Object} input
 * @param {Object} input.document    a Community Voices document (see reportSchema.js)
 * @param {Object} input.sources     source id -> source (empty for the baseline)
 * @param {Array}  input.topStories  the week's most-engaged threads (ground truth)
 */
export function computeReportMetrics({ document, sources, topStories }) {
  const citedIds = collectCitedSourceIds(document);
  const quotes = collectQuotes(document);

  return {
    themeCount: document.themes.length,
    predictionCount: document.predictions.length,
    citationCount: citedIds.length,
    uniqueSourcesCited: new Set(citedIds.filter((id) => id in sources)).size,
    invalidCitationCount: citedIds.filter((id) => !(id in sources)).length,
    quoteCount: quotes.length,
    verifiedQuoteCount: quotes.filter((quote) => isQuoteInSource(quote.quote, sources[quote.sourceId]?.text)).length,
    topThreadCoverage: measureTopThreadCoverage(document, topStories),
  };
}

export function collectCitedSourceIds(document) {
  return [
    ...document.themes.flatMap((theme) => [...theme.sourceIds, ...theme.notableVoices.map((voice) => voice.sourceId)]),
    ...document.predictions.flatMap((prediction) => prediction.sourceIds),
  ].filter((id) => id !== '');
}

function collectQuotes(document) {
  return document.themes.flatMap((theme) => theme.notableVoices);
}

/**
 * True when the quote appears in the source text, ignoring case, spacing and
 * punctuation. Quotes shortened with "..." must match piece by piece.
 */
export function isQuoteInSource(quote, sourceText) {
  if (!sourceText) return false;
  const normalizedSource = normalizeForMatching(sourceText);
  const fragments = quote
    .split(/\.\.\.|…/)
    .map(normalizeForMatching)
    .filter((fragment) => fragment.length > 0);
  return fragments.length > 0 && fragments.every((fragment) => normalizedSource.includes(fragment));
}

/**
 * A thread counts as "covered" if the document mentions at least two of the
 * distinctive words from its title (or the only one, for one-keyword titles).
 * It is a heuristic, applied identically to both variants.
 */
export function measureTopThreadCoverage(document, topStories) {
  const documentWords = new Set(tokenize(documentToPlainText(document)));
  const coverable = topStories
    .map((story) => ({ story, keywords: titleKeywords(story.title) }))
    .filter(({ keywords }) => keywords.length > 0);

  const coveredTitles = coverable
    .filter(({ keywords }) => {
      const matches = keywords.filter((keyword) => documentWords.has(keyword)).length;
      return matches >= Math.min(2, keywords.length);
    })
    .map(({ story }) => story.title);

  return { covered: coveredTitles.length, total: coverable.length, coveredTitles };
}

export function titleKeywords(title) {
  return [...new Set(tokenize(title).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)))];
}

function documentToPlainText(document) {
  const themeText = document.themes.map((theme) => `${theme.name} ${theme.summary}`);
  const predictionText = document.predictions.map((p) => `${p.topic} ${p.prediction} ${p.rationale}`);
  return [document.title, document.weekSummary, ...themeText, ...predictionText].join(' ');
}

/** Lowercase words with a naive plural strip, so "birds" matches "bird". */
function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word));
}

function normalizeForMatching(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
