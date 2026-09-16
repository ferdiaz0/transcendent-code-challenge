import { config } from './config.js';
import * as hackerNews from './ingest/hackerNewsClient.js';
import { LocalEmbedder } from './embeddings/localEmbedder.js';
import { SqliteChunkStore } from './store/sqliteChunkStore.js';
import { Retriever } from './rag/retriever.js';
import { ClaudeClient } from './generation/claudeClient.js';
import { ReportRepository } from './reports/reportRepository.js';

/**
 * Builds the real implementations of every dependency, in one place.
 * The server and the CLI scripts share this; tests build fakes instead.
 */
export function createServices() {
  const store = new SqliteChunkStore(config.storage.databasePath);
  const embedder = new LocalEmbedder(config.embeddings);

  return {
    config,
    hackerNews,
    store,
    embedder,
    retriever: new Retriever({ store, embedder, settings: config.retrieval }),
    llm: config.llm.apiKey ? new ClaudeClient(config.llm) : null,
    reportRepository: new ReportRepository(config.storage),
  };
}
