import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Our "vector database": one SQLite table where each row is a chunk of community
 * text plus its embedding and retrieval stats.
 *
 * Embeddings are stored as BLOBs (raw bytes of a Float32Array: 384 x 4 bytes = 1.5 KB each).
 * Similarity search happens in JavaScript (see src/rag/retriever.js). For a week of data
 * (a few thousand rows) that takes milliseconds, so no vector extension is needed.
 */

// Bump this when the table layout changes. The database only holds public data we can
// re-download, so an outdated database is simply rebuilt instead of migrated.
const SCHEMA_VERSION = 2;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS chunks (
    id                  TEXT PRIMARY KEY,   -- "<hn item id>#<chunk index>"
    document_id         TEXT NOT NULL,
    story_id            TEXT NOT NULL,
    story_title         TEXT NOT NULL,
    story_points        INTEGER NOT NULL DEFAULT 0,
    story_comment_count INTEGER NOT NULL DEFAULT 0,
    kind                TEXT NOT NULL,      -- 'story' | 'comment'
    author              TEXT,
    created_at          TEXT NOT NULL,      -- ISO date, so string comparison == date comparison
    permalink           TEXT NOT NULL,
    text                TEXT NOT NULL,
    embedding           BLOB NOT NULL,
    retrieval_count     INTEGER NOT NULL DEFAULT 0,
    last_retrieved_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks (created_at);
  CREATE INDEX IF NOT EXISTS idx_chunks_retrieval_count ON chunks (retrieval_count);
`;

export class SqliteChunkStore {
  /** @param {string} databasePath a file path, or ':memory:' for tests */
  constructor(databasePath) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.createOrRebuildSchema();
  }

  createOrRebuildSchema() {
    const { user_version: currentVersion } = this.db.prepare('PRAGMA user_version').get();
    if (currentVersion !== SCHEMA_VERSION) {
      this.db.exec('DROP TABLE IF EXISTS chunks');
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
    this.db.exec(SCHEMA);
  }

  getStoredChunkIds() {
    const rows = this.db.prepare('SELECT id FROM chunks').all();
    return new Set(rows.map((row) => row.id));
  }

  /** @param {Array<Object>} chunks chunks that each have an `embedding` Float32Array */
  insertChunks(chunks) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO chunks
        (id, document_id, story_id, story_title, story_points, story_comment_count,
         kind, author, created_at, permalink, text, embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.inTransaction(() => {
      for (const chunk of chunks) {
        insert.run(
          chunk.id, chunk.documentId, chunk.storyId, chunk.storyTitle,
          chunk.storyPoints ?? 0, chunk.storyCommentCount ?? 0,
          chunk.kind, chunk.author ?? null, chunk.createdAt, chunk.permalink, chunk.text,
          vectorToBytes(chunk.embedding)
        );
      }
    });
  }

  /** Keeps the store to a rolling window, so old weeks don't pile up forever. */
  deleteChunksCreatedBefore(isoDate) {
    return this.db.prepare('DELETE FROM chunks WHERE created_at < ?').run(isoDate).changes;
  }

  /** Every chunk with its embedding decoded back into a Float32Array, in a stable order. */
  getAllChunks() {
    return this.db.prepare('SELECT * FROM chunks ORDER BY id').all().map(rowToChunk);
  }

  /** The week's most-upvoted threads: the "table of contents" of the conversation. */
  getTopStories(limit) {
    const rows = this.db.prepare(`
      SELECT story_id, story_title, story_points, story_comment_count, created_at, permalink
      FROM chunks
      WHERE kind = 'story' AND id = story_id || '#0'
      ORDER BY story_points DESC
      LIMIT ?
    `).all(limit);
    return rows.map((row) => ({
      storyId: row.story_id,
      title: row.story_title,
      points: row.story_points,
      commentCount: row.story_comment_count,
      createdAt: row.created_at,
      permalink: row.permalink,
    }));
  }

  recordRetrievals(chunkIds, retrievedAt = new Date().toISOString()) {
    const update = this.db.prepare(`
      UPDATE chunks SET retrieval_count = retrieval_count + 1, last_retrieved_at = ? WHERE id = ?
    `);
    this.inTransaction(() => chunkIds.forEach((id) => update.run(retrievedAt, id)));
  }

  getMostRetrievedChunks(limit) {
    return this.db.prepare(`
      SELECT * FROM chunks WHERE retrieval_count > 0
      ORDER BY retrieval_count DESC, last_retrieved_at DESC
      LIMIT ?
    `).all(limit).map((row) => withoutEmbedding(rowToChunk(row)));
  }

  getRetrievalSummary() {
    const row = this.db.prepare(`
      SELECT COUNT(*)                              AS totalChunks,
             COALESCE(SUM(retrieval_count > 0), 0) AS retrievedChunks,
             COALESCE(SUM(retrieval_count), 0)     AS totalRetrievals
      FROM chunks
    `).get();
    return { ...row }; // SQLite rows have no prototype; return a regular object
  }

  countChunks() {
    return this.db.prepare('SELECT COUNT(*) AS total FROM chunks').get().total;
  }

  close() {
    this.db.close();
  }

  // Thousands of inserts are ~100x faster inside one transaction than one-by-one.
  inTransaction(work) {
    this.db.exec('BEGIN');
    try {
      work();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function vectorToBytes(vector) {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

function bytesToVector(bytes) {
  // Copy into a fresh buffer: Float32Array needs its bytes aligned to a multiple of 4.
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(copy);
}

function rowToChunk(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    storyId: row.story_id,
    storyTitle: row.story_title,
    storyPoints: row.story_points,
    storyCommentCount: row.story_comment_count,
    kind: row.kind,
    author: row.author,
    createdAt: row.created_at,
    permalink: row.permalink,
    text: row.text,
    embedding: bytesToVector(row.embedding),
    retrievalCount: row.retrieval_count,
    lastRetrievedAt: row.last_retrieved_at,
  };
}

function withoutEmbedding(chunk) {
  const { embedding, ...rest } = chunk;
  return rest;
}
