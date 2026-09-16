import { COMMUNITY_VOICES_SCHEMA } from './reportSchema.js';
import {
  SYSTEM_PROMPT,
  describeWeek,
  buildBaselineUserMessage,
  buildRagUserMessage,
  buildRagContext,
} from './buildPrompts.js';
import { computeReportMetrics } from '../evaluation/reportMetrics.js';
import { judgeReports } from '../evaluation/judgeReports.js';

/**
 * Every step of report generation, in order. The web page shows these as a checklist.
 * The last step ("save") is performed by the caller, which decides where reports go.
 */
export const REPORT_STEPS = [
  { id: 'retrieve', label: 'Search the database for relevant discussions' },
  { id: 'write', label: 'Claude writes both versions (A: no RAG, B: RAG)' },
  { id: 'measure', label: 'Measure both documents' },
  { id: 'judge', label: 'Blind judge compares the two' },
  { id: 'save', label: 'Save the report' },
];

/**
 * Produces one "report": the same Community Voices document written twice.
 *
 *   A = baseline: Claude with no retrieved data
 *   B = RAG:      Claude with the week's top threads + retrieved excerpts
 *
 * Both are then measured (reportMetrics.js) and graded blind (judgeReports.js).
 */
export async function generateComparison({ llm, retriever, store, config, now = new Date(), random = Math.random, onProgress = () => {} }) {
  const communityName = config.community.name;
  const week = describeWeek(now, config.ingest.lookbackDays);

  const topStories = store.getTopStories(config.retrieval.topThreadsInContext);
  if (topStories.length === 0) {
    throw new Error('The database is empty. Run an ingest first (npm run ingest).');
  }

  onProgress({ step: 'retrieve', detail: `${config.retrieval.queries.length} search queries` });
  const retrievalGroups = await retriever.retrieveForQueries(config.retrieval.queries);
  const { contextText, sources } = buildRagContext({ topStories, retrievalGroups });

  const { baseline, rag } = await writeBothDocuments({
    llm,
    baselineMessage: buildBaselineUserMessage({ communityName, week }),
    ragMessage: buildRagUserMessage({ communityName, week, contextText }),
    onProgress,
  });

  onProgress({ step: 'measure' });
  const coverageStories = topStories.slice(0, config.evaluation.topThreadsForCoverage);
  const metrics = {
    baseline: { ...computeReportMetrics({ document: baseline.document, sources: {}, topStories: coverageStories }), ...baseline.cost },
    rag: { ...computeReportMetrics({ document: rag.document, sources, topStories: coverageStories }), ...rag.cost },
  };

  onProgress({ step: 'judge', detail: 'Documents shown in random order, without labels' });
  const judge = await judgeOrExplainFailure({
    llm, communityName, week, topStories, random,
    baselineDocument: baseline.document,
    ragDocument: rag.document,
  });

  return {
    id: now.toISOString().replace(/[:.]/g, '-'),
    createdAt: now.toISOString(),
    community: config.community,
    week,
    model: rag.model,
    documents: { baseline: baseline.document, rag: rag.document },
    metrics,
    judge,
    sources,
    retrieval: summarizeRetrieval(retrievalGroups, sources),
  };
}

/**
 * Writes A and B at the same time and reports each one as it finishes,
 * e.g. "A (no RAG): done in 61s · B (RAG): writing..."
 */
async function writeBothDocuments({ llm, baselineMessage, ragMessage, onProgress }) {
  const state = { baseline: 'writing...', rag: 'writing...' };
  let finishedCount = 0;
  const reportProgress = () =>
    onProgress({ step: 'write', detail: `A (no RAG): ${state.baseline} · B (RAG): ${state.rag}`, current: finishedCount, total: 2 });

  const writeAndTrack = async (variant, userMessage) => {
    const result = await writeDocument(llm, userMessage);
    state[variant] = `done in ${Math.round(result.cost.latencyMs / 1000)}s`;
    finishedCount += 1;
    reportProgress();
    return result;
  };

  reportProgress();
  const [baseline, rag] = await Promise.all([writeAndTrack('baseline', baselineMessage), writeAndTrack('rag', ragMessage)]);
  return { baseline, rag };
}

async function writeDocument(llm, userMessage) {
  const { data, model, usage, latencyMs } = await llm.generateJson({
    system: SYSTEM_PROMPT,
    userMessage,
    schema: COMMUNITY_VOICES_SCHEMA,
  });
  return { document: data, model, cost: { ...usage, latencyMs } };
}

// The judge is a bonus: if it fails, we still keep both documents and the metrics.
async function judgeOrExplainFailure(judgeInput) {
  try {
    return await judgeReports(judgeInput);
  } catch (error) {
    return { error: error.message };
  }
}

function summarizeRetrieval(retrievalGroups, sources) {
  const sourceIdByChunkId = Object.fromEntries(Object.entries(sources).map(([sourceId, source]) => [source.chunkId, sourceId]));
  return retrievalGroups.map((group) => ({
    query: group.query,
    sourceIds: group.results.map((result) => sourceIdByChunkId[result.chunk.id]),
  }));
}
