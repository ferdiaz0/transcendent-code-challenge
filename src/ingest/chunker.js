/**
 * Splits long text into overlapping pieces ("chunks") that fit the embedding model.
 *
 * Example with maxChars=20, overlapChars=8:
 *   "the quick brown fox jumps over the lazy dog"
 *   -> ["the quick brown fox", "fox jumps over the", "the lazy dog"]
 *
 * Chunks end on a space when possible so words are never cut in half.
 */
export function splitIntoChunks(text, { maxChars, overlapChars }) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = findChunkEnd(trimmed, start, maxChars);
    chunks.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = findNextChunkStart(trimmed, start, end, overlapChars);
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function findChunkEnd(text, start, maxChars) {
  const hardEnd = start + maxChars;
  if (hardEnd >= text.length) return text.length;
  const lastSpace = text.lastIndexOf(' ', hardEnd);
  return lastSpace > start ? lastSpace : hardEnd;
}

function findNextChunkStart(text, previousStart, previousEnd, overlapChars) {
  // Always move forward by at least one character to avoid an infinite loop.
  const overlapStart = Math.max(previousEnd - overlapChars, previousStart + 1);
  const wordBoundary = text.indexOf(' ', overlapStart);
  const boundaryIsInsidePreviousChunk = wordBoundary !== -1 && wordBoundary < previousEnd;
  return boundaryIsInsidePreviousChunk ? wordBoundary + 1 : previousEnd;
}
