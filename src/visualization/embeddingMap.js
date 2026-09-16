const SNIPPET_LENGTH = 220;

/**
 * Builds the data for the embedding map page: one point per chunk, with its
 * 2D position (from PCA), a color group, and details for the hover tooltip.
 *
 * @param {Array<Object>} chunks        chunks from the store
 * @param {Array<[number, number]>} coordinates  PCA output, same order as chunks
 */
export function buildEmbeddingMap(chunks, coordinates, { highlightedStoryCount }) {
  const highlightedStories = pickHighlightedStories(chunks, highlightedStoryCount);
  const colorIndexByStoryId = new Map(highlightedStories.map((story) => [story.storyId, story.colorIndex]));

  const points = chunks.map((chunk, index) => ({
    id: chunk.id,
    x: round(coordinates[index][0]),
    y: round(coordinates[index][1]),
    storyId: chunk.storyId,
    storyTitle: chunk.storyTitle,
    kind: chunk.kind,
    author: chunk.author,
    permalink: chunk.permalink,
    retrievalCount: chunk.retrievalCount,
    snippet: chunk.text.slice(0, SNIPPET_LENGTH),
    colorIndex: colorIndexByStoryId.get(chunk.storyId) ?? -1,
  }));

  return { highlightedStories, points };
}

/** The most-upvoted stories get a color; everything else is drawn in gray. */
export function pickHighlightedStories(chunks, count) {
  const storiesById = new Map();
  for (const chunk of chunks) {
    const story = storiesById.get(chunk.storyId) ?? { storyId: chunk.storyId, storyTitle: chunk.storyTitle, points: chunk.storyPoints, chunkCount: 0 };
    story.chunkCount += 1;
    storiesById.set(chunk.storyId, story);
  }
  return [...storiesById.values()]
    .sort((a, b) => b.points - a.points)
    .slice(0, count)
    .map((story, colorIndex) => ({ ...story, colorIndex }));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}
