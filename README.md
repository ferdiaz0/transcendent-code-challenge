# Community Voices

A web app that writes a weekly **Community Voices Document** for the **Hacker News** community: what people talked about in the past week, and what they will likely talk about next week.

It uses **RAG** (retrieval-augmented generation): it collects the week's discussions, stores them as embeddings, retrieves the most relevant excerpts, and gives those to Claude to write from. Every report is also an **A/B test**: the same document is written without retrieved data, and the two versions are compared.

Plain JavaScript on Node.js and in the browser, with no framework or build step. Two dependencies: the Anthropic SDK and a local embedding model. The database is SQLite, which is built into Node 22.

---

## Quick start

**Requirements:** Node.js **22.13+** (`node --version`) and an [Anthropic API key](https://console.anthropic.com/) for generating reports.

```bash
git clone <this repo>
cd community-voices
npm install
cp .env.example .env        # then paste your key after ANTHROPIC_API_KEY=
npm start                   # open http://localhost:3000
```

1. The server starts refreshing data in the background right away. The first run takes about a minute and downloads a ~23 MB embedding model.
2. A sample report is shown until you click **Generate A/B report** (~2.5 minutes, ~$0.50 of API usage).
3. The **Embedding map** and **Retrieval stats** tabs work without an API key.

| Command | What it does |
| --- | --- |
| `npm start` | Web app on port 3000 (override with `PORT`) |
| `npm run ingest` | Refresh data once, without the web app |
| `npm run report` | Generate a report without the web app (`-- --sample` also saves it to `samples/`) |
| `npm test` | Unit tests (no network or API key needed) |

---

## How it works

```
 INGEST (on server start, then every 6 hours)
 ┌──────────────────┐   ┌──────────────┐   ┌────────────┐   ┌────────────────────┐   ┌───────────────────┐
 │ Hacker News API  │──►│ clean HTML   │──►│ chunk      │──►│ embed locally      │──►│ SQLite            │
 │ week's top       │   │              │   │ ≤800 chars │   │ MiniLM, 384 numbers│   │ chunks + vectors  │
 │ stories+comments │   └──────────────┘   └────────────┘   └────────────────────┘   │ + retrieval stats │
 └──────────────────┘                                                              └─────────┬─────────┘
 REPORT (on click)                                                                           │
             ┌───────────────────────────────────────────────────────────────────────────────┘
             ▼
 ┌────────────────────────┐   11 search queries, cosine similarity,
 │ RETRIEVE               │   ≤2 chunks per thread, no duplicates
 └───────────┬────────────┘
      ┌──────┴───────────────────┐
      ▼                          ▼
 ┌─────────────┐          ┌──────────────────┐   same model, system prompt and JSON schema
 │ A: Claude   │          │ B: Claude        │
 │ task only   │          │ task + context   │
 └──────┬──────┘          └────────┬─────────┘
        └──────────┬───────────────┘
                   ▼
 ┌────────────────────────┐
 │ COMPARE                │   code metrics + a blind LLM judge
 └───────────┬────────────┘
             ▼
 Web UI: Report (A vs B) · Embedding map · Retrieval stats · Markdown export
```

### Automatic ingestion

Handled by `src/server/index.js`:

- **On every server start**, a data refresh begins in the background. You never see data older than the last time the server ran.
- **Every 6 hours** while the server runs, a timer (`setInterval`) starts another refresh (`ingest.autoRefreshHours`). If a refresh or report is already running, that tick is skipped.
- **Only new comments are embedded.** Hacker News IDs never change, so already-stored chunks are skipped, and a refresh after the first one takes ~20–30 s.
- **Chunks older than 7 days are deleted** on every refresh, so the database always holds a rolling week.

The timer lives inside the server process, so refreshes stop when the server stops. To refresh without the web app, schedule `npm run ingest` with cron:

```cron
0 */6 * * * cd /path/to/community-voices && npm run ingest >> data/ingest.log 2>&1
```

### How this maps to the challenge

| Challenge item | Where it lives |
| --- | --- |
| 1. An active community | Hacker News: ~280 stories reached 100+ points in the week this was built |
| 2. Community Voices Document | `src/generation/`, shown on the Report tab and exported as Markdown |
| 3. RAG | `src/rag/retriever.js`, `src/generation/buildPrompts.js` |
| 3a. Vectorized database table | `src/store/sqliteChunkStore.js` (embeddings stored as BLOBs) |
| 3b. Flattened embedding visualization | `src/visualization/pca.js` + the **Embedding map** tab |
| 3c. Most-retrieved embedding stats | `retrieval_count` column + the **Retrieval stats** tab |
| 4. Automated ingestion | [Automatic ingestion](#automatic-ingestion) |
| 4b. Handling large amounts of data | [Throttles and limits](#throttles-and-limits) |
| 5. A/B test with vs. without RAG | [The A/B test](#the-ab-test) |

---

## Design decisions

**Hacker News:** very active, and its [Algolia API](https://hn.algolia.com/api) is free and needs no key, so reviewers don't need accounts. Reddit was the first idea, but its public JSON endpoints returned `403 Forbidden` without OAuth.

**SQLite instead of Postgres + pgvector:** no database server or Docker needed. Similarity search is brute force in JavaScript; for a week of data (~3,400 chunks) that takes ~35 ms per query. Past hundreds of thousands of chunks it would need an approximate-nearest-neighbor index (pgvector HNSW or `sqlite-vec`), and only the store class would change.

**Local embeddings:** `Xenova/all-MiniLM-L6-v2` runs on the CPU, so there's no second API key and no ingest cost. A hosted embedding model would retrieve somewhat better.

**Structured JSON output:** Claude must return JSON matching `src/generation/reportSchema.js`. Citations are real fields rather than regex matches on prose, which makes the metrics reliable.

**Model:** `claude-opus-5` by default (`CLAUDE_MODEL` overrides it). Server-side `fallbacks` retry a safety decline on another model instead of failing the report.

**Vanilla JS:** readable without framework knowledge. `public/js/dom.js` builds elements and always inserts text as text, so content from Hacker News or the LLM can't inject HTML.

---

## Performance

| Action | Typical time | Where the time goes |
| --- | --- | --- |
| First refresh (empty database) | ~1 min | Downloading 150 threads plus embedding ~3,400 chunks |
| Later refreshes | ~20–30 s | Downloading 150 threads, 5 at a time; few new chunks to embed |
| A/B report | ~2–2.5 min | Waiting on Claude (below) |
| Embedding map | ~0.7 s once, then cached | PCA over 3,400 × 384 numbers |

A measured report run:

| Step | Time | Tokens in → out |
| --- | --- | --- |
| Retrieval | < 1 s | none |
| A · no RAG | 61 s | 1,472 → 3,597 |
| B · RAG (runs in parallel with A) | 132 s | 16,448 → 10,238 |
| Blind judge | 11 s | 11,492 → 597 |

A and B run in parallel, so the wait is set by B. It reads ~16k tokens of retrieved discussion and writes a long, cited document, including Claude's reasoning beforehand. That run cost about **$0.50** at Opus 5 list prices ($5 / $25 per million tokens).

While a job runs, the status bar lists all its steps and highlights the current one, with a live timer and progress counts. **Something is wrong if** a refresh stops counting threads for over a minute (network), or a report passes ~5 minutes or shows a red step (usually a bad API key or rate limits). The terminal shows the same steps.

**To make reports faster**, at some cost in quality: set `CLAUDE_MODEL=claude-sonnet-5`, or lower `retrieval.topKPerQuery` in `src/config.js`, which gives Claude fewer excerpts to read and cite.

### Throttles and limits

All values are in `src/config.js`.

| Limit | Value | Why |
| --- | --- | --- |
| Concurrent Hacker News requests | 5 (`ingest.fetchConcurrency`) | Polite to a free public API |
| Minimum story points | 100 (`ingest.minStoryPoints`) | Skips the thousands of submissions nobody engaged with |
| Stories per refresh | 150 (`ingest.maxStories`) | Hard cap for busy weeks |
| Comments per story | 20 (`ingest.maxCommentsPerStory`) | Popular threads have 1,000+ comments; top-level ones are kept first |
| Lookback window | 7 days (`ingest.lookbackDays`) | Older chunks are deleted on every refresh |
| Chunk size | 800 chars, 100 overlap (`chunking`) | MiniLM reads only ~256 tokens; the overlap keeps sentences at borders searchable |
| Embedding batch | 64 chunks (`embeddings.batchSize`) | Faster than one at a time without memory spikes |
| Retrieval | 11 queries × 8 results, ≤2 per thread (`retrieval`) | Caps context at 88 excerpts (~16k tokens) whatever the week's volume |
| Max output tokens | 16,000 (`llm.maxOutputTokens`) | Room for a long document; much higher would require streaming |
| Background jobs | one refresh and one report at a time, never both | Double clicks don't start duplicates, and reports never read a half-refreshed database |

---

## The A/B test

**The only variable is retrieval.** Both versions use the same model, system prompt, task and output schema. B additionally receives the week's 30 most-engaged threads and excerpts labeled `[S1]`, `[S2]`, … to cite.

**Measured by code** (`src/evaluation/reportMetrics.js`):

| Metric | What it tells you |
| --- | --- |
| Real sources cited | How many distinct retrieved excerpts back the claims |
| Invalid citations | Source IDs that don't exist (made-up references) |
| Quotes verified in source | Quotes found word for word in the cited excerpt |
| Top threads covered | How many of the week's 15 most-engaged threads are mentioned (keyword heuristic) |

**Blind LLM judge** (`src/evaluation/judgeReports.js`): a separate Claude call scores both documents from 1 to 5 on groundedness, specificity, coverage and prediction quality, using the real top-thread list as ground truth. It sees them unlabeled, in random order, with source IDs removed. The order is recorded, so scores and wording ("Document One" → "B (RAG)") are mapped back to A and B.

**Limitations:**
- Each run is a single sample, so generate several reports before drawing firm conclusions.
- The judge is the same model family as the writer, and may infer which document used RAG from its specificity.
- Coverage is a keyword heuristic.

---

## Project structure

```
src/
├── config.js                         every tunable setting
├── createServices.js                 wires the real implementations together
├── ingest/                           Hacker News client, HTML cleaning, chunking, ingestWeek.js pipeline
├── embeddings/                       local MiniLM embedder
├── store/sqliteChunkStore.js         vector table, retrieval stats, top stories
├── rag/                              cosine similarity, retriever
├── generation/                       report schema, prompts, Claude client, generateComparison.js
├── evaluation/                       code metrics, blind judge
├── reports/                          JSON report files, Markdown export
├── visualization/                    PCA, embedding map data
├── utils/                            concurrency limit, step progress tracking
└── server/                           entry point, HTTP routes, app logic, background jobs
public/                               index.html, styles.css, js/ (router, API client, views)
scripts/                              ingest.js, generateReport.js
test/                                 unit tests, one file per module
```

**Suggested reading order:** `src/config.js` → `src/ingest/ingestWeek.js` → `src/rag/retriever.js` → `src/generation/generateComparison.js` → `src/evaluation/` → `src/server/communityVoicesApp.js` → `public/js/app.js`.

Functions receive their dependencies (API client, embedder, store, LLM) as arguments, so tests pass in fakes and need no network, model download or API key.

## HTTP API

| Method and path | Description |
| --- | --- |
| `GET /api/status` | Chunk count, Claude configuration, background job progress |
| `POST /api/ingest` | Start a data refresh (`202` started, `409` can't start now) |
| `POST /api/reports` | Start generating a report |
| `GET /api/reports/latest` | Newest report as JSON (`/markdown` for Markdown) |
| `GET /api/embeddings/map` | 2D coordinates and metadata for every chunk |
| `GET /api/retrievals/stats?limit=25` | Most-retrieved chunks |

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Required to generate reports |
| `CLAUDE_MODEL` | `claude-opus-5` | Model for writing and judging |
| `PORT` | `3000` | Web server port |

## Next steps

- **Retrieval:** hybrid keyword + vector search with re-ranking; generate search queries from the week's top threads instead of a fixed list.
- **Scale:** an ANN index once data spans many weeks.
- **Evaluation:** average several A/B runs; use a different model family as judge.
- **Predictions:** score last week's predictions against this week's actual threads.

---

Built with Claude Code as a pair programmer: probing the real APIs before writing clients, writing tests alongside each module, and checking the UI in a real browser.
