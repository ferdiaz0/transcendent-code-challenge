import { collectCommunityDocuments } from './collectCommunityDocuments.js';
import { documentToChunks } from './storyToDocuments.js';
import { textForEmbedding } from '../embeddings/textForEmbedding.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every step of an ingest, in order. The web page shows these as a checklist. */
export const INGEST_STEPS = [
  { id: 'stories', label: "Find this week's popular stories" },
  { id: 'threads', label: 'Download comment threads' },
  { id: 'chunks', label: 'Clean and split text into chunks' },
  { id: 'embed', label: 'Embed new chunks' },
  { id: 'save', label: 'Save to the database and remove old data' },
];

/**
 * The full ingest pipeline:
 *   collect -> chunk -> skip already-stored -> embed -> save -> prune old chunks
 *
 * Every dependency is passed in, so tests can run it with fakes (no network, no model).
 * Running it twice in a row is cheap: the second run only embeds new comments.
 */
export async function ingestWeek({ hackerNews, embedder, store, config, now = new Date(), log = console.log, onProgress = () => {} }) {
  const documents = await collectCommunityDocuments({ hackerNews, settings: config.ingest, now, log, onProgress });

  onProgress({ step: 'chunks', detail: `${documents.length} posts and comments` });
  const chunks = documents.flatMap((document) => documentToChunks(document, config.chunking));
  const newChunks = keepOnlyNewChunks(chunks, store.getStoredChunkIds());

  const embeddings = await embedNewChunks({ embedder, newChunks, collectedCount: chunks.length, onProgress });

  onProgress({ step: 'save', detail: `${newChunks.length} new chunks` });
  store.insertChunks(newChunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] })));
  const windowStart = new Date(now.getTime() - config.ingest.lookbackDays * MS_PER_DAY).toISOString();
  const prunedCount = store.deleteChunksCreatedBefore(windowStart);

  return { collected: chunks.length, inserted: newChunks.length, pruned: prunedCount, total: store.countChunks() };
}

async function embedNewChunks({ embedder, newChunks, collectedCount, onProgress }) {
  if (newChunks.length === 0) {
    onProgress({ step: 'embed', detail: `All ${collectedCount} chunks are already stored, nothing to embed` });
    return [];
  }
  const reportProgress = (doneCount) =>
    onProgress({ step: 'embed', detail: `${doneCount} of ${newChunks.length} new chunks`, current: doneCount, total: newChunks.length });

  reportProgress(0);
  return embedder.embed(newChunks.map(textForEmbedding), reportProgress);
}

/**
 * Hacker News ids never change, so an id we already stored means the same text:
 * skipping it avoids re-embedding (the slowest step) on every run.
 */
function keepOnlyNewChunks(chunks, storedIds) {
  const seenIds = new Set(storedIds);
  return chunks.filter((chunk) => {
    if (seenIds.has(chunk.id)) return false;
    seenIds.add(chunk.id); // also drops duplicates within this same run
    return true;
  });
}
