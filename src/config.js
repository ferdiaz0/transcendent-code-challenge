/**
 * All tunable settings live here so the rest of the code has no "magic numbers".
 * Secrets (the API key) come from environment variables, never from this file.
 */
export const config = {
  community: {
    name: 'Hacker News',
    url: 'https://news.ycombinator.com',
  },

  server: {
    port: Number(process.env.PORT) || 3000,
  },

  ingest: {
    // How far back we look when collecting "last week's" conversation.
    lookbackDays: 7,
    // Volume control #1: only stories the community actually engaged with.
    minStoryPoints: 100,
    // Volume control #2: hard cap on stories per ingest run.
    maxStories: 150,
    // Volume control #3: popular threads can have 1000+ comments; keep the first N.
    maxCommentsPerStory: 20,
    // How many Hacker News API requests we run at the same time.
    fetchConcurrency: 5,
    // While the server runs, re-ingest this often so the data stays fresh.
    autoRefreshHours: 6,
  },

  chunking: {
    // Small embedding models only "see" ~256 tokens (~1000 chars), so we stay under that.
    maxChars: 800,
    // Overlap keeps a sentence that straddles two chunks findable from either side.
    overlapChars: 100,
  },

  embeddings: {
    // Small (~23 MB quantized) sentence model that runs locally: no API key, no cost.
    modelName: 'Xenova/all-MiniLM-L6-v2',
    // Chunks embedded per model call; bigger is faster but uses more memory.
    batchSize: 64,
  },

  storage: {
    databasePath: 'data/community-voices.db',
    reportsDirectory: 'data/reports',
    // Committed example so the report page has something to show before you generate one.
    sampleReportPath: 'samples/sample-report.json',
  },

  retrieval: {
    // Each query is one "angle" on the week. Results from all queries form the LLM's context.
    queries: [
      'New tools, products, open source libraries and Show HN projects people shared',
      'Heated debates and strong disagreements in the comments',
      'Opinions about AI, large language models and coding agents',
      'Security breaches, vulnerabilities, privacy and surveillance',
      'Startups, big tech companies, business news, layoffs and careers',
      'Programming languages, software engineering practices and developer experience',
      'Science, space, hardware and energy',
      'Government policy, regulation, courts and laws affecting technology',
      'Things people are excited or optimistic about',
      'Frustrations, complaints and things people think are getting worse',
      'Upcoming releases, events, deadlines or announcements expected soon',
    ],
    // How many chunks each query contributes.
    topKPerQuery: 8,
    // Stops one giant thread from filling a query's results.
    maxChunksPerStory: 2,
    // The most-engaged threads are listed in the context as a "table of contents".
    topThreadsInContext: 30,
  },

  llm: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-opus-5',
    maxOutputTokens: 16000,
  },

  evaluation: {
    // "Did the report mention the week's N most-engaged threads?"
    topThreadsForCoverage: 15,
  },

  visualization: {
    // The N most-upvoted stories get their own color on the embedding map.
    highlightedStoryCount: 10,
  },
};
