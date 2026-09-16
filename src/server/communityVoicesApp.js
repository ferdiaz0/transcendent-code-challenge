import { JobRunner } from './jobRunner.js';
import { ingestWeek, INGEST_STEPS } from '../ingest/ingestWeek.js';
import { generateComparison, REPORT_STEPS } from '../generation/generateComparison.js';
import { projectTo2D } from '../visualization/pca.js';
import { buildEmbeddingMap } from '../visualization/embeddingMap.js';
import { createConsoleProgress } from '../utils/consoleProgress.js';

/**
 * Everything the web app can do, independent of HTTP. The HTTP layer
 * (routes.js) only translates requests into calls on this class, which keeps
 * both sides small and lets tests use either one with fakes.
 */
export class CommunityVoicesApp {
  constructor({ config, store, embedder, hackerNews, retriever, llm, reportRepository, jobs = new JobRunner(), log = console.log }) {
    Object.assign(this, { config, store, embedder, hackerNews, retriever, llm, reportRepository, jobs, log });
    this.mapCache = { key: null, coordinates: null };
    this.dataVersion = 0;
  }

  getStatus() {
    return {
      // Lets the browser correct for clock differences when showing live timers.
      serverTime: new Date().toISOString(),
      community: this.config.community,
      chunkCount: this.store.countChunks(),
      llm: { configured: this.llm !== null, model: this.config.llm.model },
      jobs: { ingest: this.jobs.getStatus('ingest'), report: this.jobs.getStatus('report') },
    };
  }

  startIngest() {
    if (this.jobs.isRunning('report')) return refused('Wait for the report to finish before refreshing data.');

    const started = this.jobs.start('ingest', async (onProgress) => {
      const summary = await ingestWeek({
        ...this.dependencies(),
        config: this.config,
        log: this.log,
        onProgress: this.alsoLogSteps('Data refresh', INGEST_STEPS, onProgress),
      });
      this.dataVersion += 1;
      return summary;
    }, { steps: INGEST_STEPS });

    return started ? { started: true } : refused('An ingest is already running.');
  }

  startReportGeneration() {
    if (!this.llm) return refused('Set ANTHROPIC_API_KEY in your .env file and restart the server to generate reports.');
    if (this.jobs.isRunning('ingest')) return refused('Wait for the data refresh to finish first.');
    if (this.store.countChunks() === 0) return refused('The database is empty. Refresh the data first.');

    const started = this.jobs.start('report', async (onProgress) => {
      const reportProgress = this.alsoLogSteps('Report', REPORT_STEPS, onProgress);
      const report = await generateComparison({ ...this.dependencies(), config: this.config, onProgress: reportProgress });
      reportProgress({ step: 'save' });
      this.reportRepository.save(report);
      return { id: report.id };
    }, { steps: REPORT_STEPS });

    return started ? { started: true } : refused('A report is already being generated.');
  }

  getLatestReport() {
    return this.reportRepository.loadLatest();
  }

  /**
   * PCA is the slowest read (under a second), so its coordinates are cached until
   * the data changes. Retrieval counts are always read fresh.
   */
  getEmbeddingMap() {
    const chunks = this.store.getAllChunks();
    const cacheKey = `${this.dataVersion}:${chunks.length}`;
    if (this.mapCache.key !== cacheKey) {
      this.mapCache = { key: cacheKey, coordinates: projectTo2D(chunks.map((chunk) => chunk.embedding)) };
    }
    return buildEmbeddingMap(chunks, this.mapCache.coordinates, this.config.visualization);
  }

  getRetrievalStats(limit) {
    return {
      summary: this.store.getRetrievalSummary(),
      topChunks: this.store.getMostRetrievedChunks(limit),
    };
  }

  dependencies() {
    const { store, embedder, hackerNews, retriever, llm } = this;
    return { store, embedder, hackerNews, retriever, llm };
  }

  // Progress goes to the job status (for the page) and, one line per step, to the server console.
  alsoLogSteps(jobLabel, steps, onProgress) {
    const logStepChange = createConsoleProgress(steps, { inline: false, write: (text) => this.log(`${jobLabel} ${text.trimEnd()}`) });
    return (update) => {
      onProgress(update);
      logStepChange(update);
    };
  }
}

function refused(reason) {
  return { started: false, reason };
}
