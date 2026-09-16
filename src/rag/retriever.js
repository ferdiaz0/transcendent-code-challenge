import { cosineSimilarity } from './vectorMath.js';

/**
 * The "R" in RAG: given questions, find the stored chunks whose meaning is closest.
 *
 * How a search works:
 *   1. embed the question with the same model used for the chunks
 *   2. score every chunk with cosine similarity (brute force: fine for a few thousand rows)
 *   3. keep the best-scoring chunks, limiting how many come from one thread
 *   4. bump each returned chunk's retrieval counter (for the stats page)
 */
export class Retriever {
  constructor({ store, embedder, settings }) {
    this.store = store;
    this.embedder = embedder;
    this.settings = settings;
  }

  /**
   * Runs several searches and groups the results per query.
   * A chunk is only returned once across all queries, so the LLM never reads duplicates.
   *
   * @returns {Promise<Array<{query: string, results: Array<{chunk: Object, score: number}>}>>}
   */
  async retrieveForQueries(queries) {
    const chunks = this.store.getAllChunks();
    const queryVectors = await this.embedder.embed(queries);
    const selectedIds = new Set();

    const groups = queries.map((query, index) => {
      const ranked = rankBySimilarity(chunks, queryVectors[index]);
      const results = selectDiverseTop(ranked, {
        topK: this.settings.topKPerQuery,
        maxChunksPerStory: this.settings.maxChunksPerStory,
        excludeIds: selectedIds,
      });
      results.forEach((result) => selectedIds.add(result.chunk.id));
      return { query, results };
    });

    this.store.recordRetrievals([...selectedIds]);
    return groups;
  }
}

export function rankBySimilarity(chunks, queryVector) {
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(chunk.embedding, queryVector) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Walks the ranked list from best to worst and keeps a result unless it was
 * already picked or its thread already has `maxChunksPerStory` results.
 * Without this, one 500-comment thread could take over every query.
 */
export function selectDiverseTop(ranked, { topK, maxChunksPerStory, excludeIds = new Set() }) {
  const selected = [];
  const countPerStory = new Map();

  for (const result of ranked) {
    if (selected.length >= topK) break;
    const { id, storyId } = result.chunk;
    const storyCount = countPerStory.get(storyId) ?? 0;
    if (excludeIds.has(id) || storyCount >= maxChunksPerStory) continue;

    countPerStory.set(storyId, storyCount + 1);
    selected.push(result);
  }
  return selected;
}
