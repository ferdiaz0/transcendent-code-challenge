/**
 * Hacker News returns comment bodies as HTML (e.g. "<p>It&#x27;s great</p>").
 * Embeddings and LLM prompts work best on plain text, so we convert it here.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function htmlToPlainText(html) {
  if (!html) return '';
  const withLineBreaks = html.replace(/<p>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n');
  // Strip tags BEFORE decoding entities, so an escaped "&lt;b&gt;" in a comment stays visible text.
  const withoutTags = withLineBreaks.replace(/<[^>]*>/g, '');
  return normalizeWhitespace(decodeHtmlEntities(withoutTags));
}

export function decodeHtmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function normalizeWhitespace(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
