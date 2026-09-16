# Community Voices

A web app that writes a weekly **Community Voices Document** for the **Hacker News** community: what people talked about in the past week, and what they will likely talk about next week.

It uses **RAG** (retrieval-augmented generation): it collects the week's discussions, stores them as embeddings, retrieves the most relevant excerpts, and gives those to Claude to write from. To show what RAG adds, every report is an **A/B test**: the same document is also written without any retrieved data, and the two versions are compared with code-based metrics and a blind LLM judge.

- Plain JavaScript on Node.js and in the browser: no framework, no TypeScript, no build step.
- **Two dependencies:** the Anthropic SDK and a local embedding model.
- **No database server:** SQLite is built into Node 22.

---

## Quick start

**Requirements:** Node.js **22.13 or newer** (`node --version`), plus an [Anthropic API key](https://console.anthropic.com/) to generate reports.

```bash
git clone <this repo>
cd community-voices
npm install
cp .env.example .env        # then paste your key after ANTHROPIC_API_KEY=
npm start                   # open http://localhost:3000
```

What happens next:

1. On first start the database is empty, so the server **automatically ingests** last week's Hacker News discussions. This takes about a minute, and the status bar shows progress. The first run also downloads the ~23 MB embedding model.
2. Click **Generate A/B report**. Claude writes both versions and a judge compares them, which takes **about 2.5 minutes** and costs about $0.50 in API usage. See [what to expect](#what-to-expect) for why.
3. Explore the **Report**, **Embedding map** and **Retrieval stats** tabs. The report can be downloaded as Markdown.

The embedding map and retrieval stats work without an API key.

### Command-line alternatives

| Command | What it does |
| --- | --- |
| `npm start` | Web app on port 3000 (override with `PORT`) |
| `npm run ingest` | Collect, embed and store the past week's discussions |
| `npm run report` | Generate an A/B report without the web app (`-- --sample` also saves it to `samples/`) |
| `npm test` | Run the unit tests (no network or API key needed) |

### Docker (if you can't install Node 22)

```bash
docker build -t community-voices .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... -v community-voices-data:/app/data community-voices
```

---

## How it works

```
                          INGEST (automatic: on first start, then every 6 hours)
 ┌────────────────────┐   ┌──────────────┐   ┌───────────┐   ┌─────────────────────┐   ┌──────────────────┐
 │ Hacker News API    │──►│ clean HTML → │──►│ chunk     │──►│ embed locally       │──►│ SQLite           │
 │ top stories of the │   │ documents    │   │ ≤800 chars│   │ MiniLM, 384 numbers │   │ chunks + vectors │
 │ week + comments    │   └──────────────┘   └───────────┘   └─────────────────────┘   │ + retrieval stats│
 └────────────────────┘                                                                └────────┬─────────┘
                                                                                                │
                          REPORT (on click)                                                     │
                          ┌─────────────────────────────────────────────────────────────────────┘
                          ▼
             ┌──────────────────────────┐   11 search queries, cosine similarity,
             │ RETRIEVE                 │   ≤2 chunks per thread, no duplicates
             │ top threads + excerpts   │
             └────────────┬─────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        ▼                                    ▼
 ┌──────────────────┐               ┌──────────────────┐
 │ A: Claude        │               │ B: Claude        │     same model, same system prompt,
 │ task only        │               │ task + context   │     same JSON schema
 └────────┬─────────┘               └────────┬─────────┘
          └───────────────┬──────────────────┘
                          ▼
             ┌──────────────────────────┐
             │ COMPARE                  │   code metrics (citations, verified quotes, coverage…)
             │ metrics + blind judge    │   + a blind, order-randomized LLM judge
             └────────────┬─────────────┘
                          ▼
             Web UI: Report (A vs B) · Embedding map (PCA) · Retrieval stats · Markdown export
```

### How this maps to the challenge

| Challenge item | Where it lives |
| --- | --- |
| 1. A community with frequent discussion | Hacker News: in the week this was built, ~280 stories reached 100+ points; the top 150 plus ~3,000 comments are ingested |
| 2. A Community Voices Document (past week + next week) | `src/generation/`, shown on the Report page and exported as Markdown |
| 3. RAG | `src/rag/retriever.js` + `src/generation/buildPrompts.js` |
| 3a. Vectorized database table | `src/store/sqliteChunkStore.js` (embeddings stored as BLOBs in SQLite) |
| 3b. Flattened visualization of embeddings | `src/visualization/pca.js` + the **Embedding map** tab |
| 3c. Stats on the most-retrieved embeddings | `retrieval_count` column + the **Retrieval stats** tab |
| 4. Automated ingestion | `src/ingest/`: runs on first start, every 6 hours while the server runs, or via `npm run ingest` / cron |
| 4b. Handling too much data | See [Throttles, limits and performance](#throttles-limits-and-performance) |
| 5. A/B test: with vs. without RAG | `src/generation/generateComparison.js` + `src/evaluation/` |

---

## Design decisions and tradeoffs

**Why Hacker News?** It is very active: thousands of comments every week. Its [Algolia API](https://hn.algolia.com/api) is free, needs no key and is reliable, so reviewers can run the project without creating accounts. Reddit was the first idea, but its public JSON endpoints returned `403 Forbidden` without OAuth credentials during development.

**Why SQLite instead of Postgres + pgvector?** Setup simplicity. `node:sqlite` is built into Node 22, so there is no database server or Docker requirement. Similarity search is brute force in JavaScript: every chunk's cosine similarity against the query. For one week of data (~3,400 chunks) a search takes about **35 ms**. That approach stops scaling around hundreds of thousands of chunks; at that point the right move is an approximate-nearest-neighbor index (pgvector's HNSW, or the `sqlite-vec` extension). The storage class is the only place that would change.

**Why local embeddings?** `Xenova/all-MiniLM-L6-v2` runs on the CPU through `@huggingface/transformers`. That means no second API key, no cost per ingest, and identical embeddings on every machine. The tradeoff is quality: a hosted embedding model would retrieve a bit better. MiniLM reads at most ~256 tokens, which is why chunks are capped at 800 characters with a 100-character overlap.

**Why structured JSON output?** Claude returns the document as JSON matching `src/generation/reportSchema.js`, and the API guarantees it matches. That makes the metrics reliable (citations are real fields, not regex matches on prose) and lets both variants render identically.

**Model:** `claude-opus-5` by default (override with `CLAUDE_MODEL`). Requests enable the API's server-side `fallbacks` so a safety decline is retried on a suitable model instead of failing the report.

**Why vanilla JS?** Every piece is readable without framework knowledge. The frontend is a few ES modules served as-is. `public/js/dom.js` is a ~30-line element builder that always inserts text as text, so content from Hacker News or the LLM can't inject HTML.

---

## Throttles, limits and performance

### What to expect

Measured on a MacBook (Apple Silicon) with a typical week of Hacker News data:

| Action | Typical time | Where the time goes |
| --- | --- | --- |
| **First start** (empty database) | ~1 min | Downloading 150 comment threads plus embedding ~3,400 chunks (and a one-time ~23 MB model download) |
| **Refresh data** | ~20–30 s | Almost all network: re-downloading 150 comment threads, 5 at a time. Only new comments are embedded. |
| **Generate A/B report** | **~2.5 min** | Waiting on Claude (breakdown below) |
| Semantic search (all 11 queries) | < 1 s | 35 ms per query, brute-force cosine over ~3,400 vectors |
| Embedding map | ~0.7 s the first time, then instant | PCA over 3,400 × 384 numbers, cached until the data changes |

**Why a report takes a couple of minutes.** One measured run:

| Step | Time | Tokens (input → output) |
| --- | --- | --- |
| Retrieval | < 1 s | none |
| A · no RAG (runs in parallel with B) | 61 s | 1,472 → 3,597 |
| **B · RAG** | **132 s** | **16,448 → 10,238** |
| Blind judge | 11 s | 11,492 → 597 |

A and B run at the same time, so the wait is set by **B**, the slowest call. B reads about 16k tokens of retrieved discussion and writes a long, heavily cited document: about 10k output tokens, including Claude's reasoning before it writes. Language models produce output token by token, so long answers take longer. The API returns the whole JSON document at once when it's finished, which is why the status bar sits on "Writing both documents…" for about two minutes.

**Cost:** that run used ~29k input and ~14k output tokens, **about $0.50 per report** at Claude Opus 5 list prices ($5 / $25 per million tokens). Ingesting data costs nothing: the embeddings run locally.

### Throttles and limits

Every number below lives in `src/config.js` unless noted otherwise.

**Collecting data (be polite to Hacker News, keep volume bounded)**

| Limit | Value | Why |
| --- | --- | --- |
| Concurrent Hacker News requests | 5 (`ingest.fetchConcurrency`) | Avoids firing 150 requests at once at a free public API; implemented in `src/utils/mapWithConcurrency.js` |
| Minimum story points | 100 (`ingest.minStoryPoints`) | Keeps stories the community actually engaged with; filters out thousands of ignored submissions |
| Stories per run | 150 (`ingest.maxStories`) | Hard cap even in unusually busy weeks |
| Comments per story | 20 (`ingest.maxCommentsPerStory`) | Popular threads have 1,000+ comments. Top-level comments are kept before replies, to capture the main reactions. |
| Lookback window | 7 days (`ingest.lookbackDays`) | Chunks older than this are deleted on every ingest, so the database never grows past one week |
| Auto-refresh | every 6 hours (`ingest.autoRefreshHours`) | Keeps data fresh while the server runs, without constant polling |
| Failed threads | skipped, not fatal | One broken download doesn't abort the whole ingest |

**Embedding (bounded CPU and memory)**

| Limit | Value | Why |
| --- | --- | --- |
| Chunk size | 800 chars, 100-char overlap (`chunking`) | MiniLM only reads ~256 tokens; the overlap keeps sentences at chunk borders searchable |
| Batch size | 64 chunks per model call (`embeddings.batchSize`) | Faster than one at a time, without large memory spikes |
| Incremental embedding | only unseen chunk IDs | Re-running an ingest re-embeds nothing that's already stored |
| Model loading | lazy, once per process | Starting the server doesn't pay the model load cost until it's needed |

**Retrieval and LLM context (bounded size and cost per report)**

| Limit | Value | Why |
| --- | --- | --- |
| Search queries | 11 (`retrieval.queries`) | Each looks at the week from a different angle (debates, launches, security…) |
| Results per query | 8 (`retrieval.topKPerQuery`) | Caps the context at 88 excerpts |
| Results per thread, per query | 2 (`retrieval.maxChunksPerStory`) | Stops one giant thread from filling a query's results |
| Duplicates across queries | none | A chunk is used at most once, so no tokens are wasted on repeats |
| Thread index in context | top 30 (`retrieval.topThreadsInContext`) | Gives Claude the week's "table of contents" in a few hundred tokens |
| Resulting context size | ~16k tokens | The same order of size whether the week had 1,000 comments or 10,000 |
| Max output tokens | 16,000 (`llm.maxOutputTokens`) | Room for a long cited document. Values much higher would require streaming requests to avoid HTTP timeouts. |
| Retries | 2 automatic retries (Anthropic SDK default) | Rate limits, server errors and network drops are retried before a report fails |
| Refusal fallback | server-side `fallbacks: "default"` | A safety decline is retried on a suitable model instead of failing the report |

**Server and browser (one job at a time, light polling)**

| Limit | Value | Why |
| --- | --- | --- |
| Concurrent jobs | 1 ingest and 1 report at most (`src/server/jobRunner.js`) | Clicking a button twice doesn't start a second job; the API answers `409` |
| Ingest vs. report | mutually exclusive (`src/server/communityVoicesApp.js`) | A report never retrieves from a half-refreshed database |
| Status polling | every 2 s while a job runs, every 15 s when idle (`public/js/app.js`) | Live progress without flooding the server |
| Embedding map cache | recomputed only after an ingest | PCA runs once per data change, not on every page view |
| Retrieval stats rows | 25 by default, 200 max (`src/server/routes.js`) | The table stays small, whatever the URL asks for |
| Judge failure | report is still saved | The judge is a bonus; a failure there doesn't throw away two finished documents |

### Is it stuck?

When a job starts, the status bar shows **every step up front** as a checklist, so you always know where you are and what's left:

```
A/B report                                                  Step 2 of 5 · 1:12 elapsed
 ✓ Search the database for relevant discussions                                   <1s
 ◌ Claude writes both versions (A: no RAG, B: RAG)                               1:11
     A (no RAG): done in 61s · B (RAG): writing...
     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░
 ○ Measure both documents
 ○ Blind judge compares the two
 ○ Save the report
```

- **Finished steps** get a ✓ and how long they took.
- **The current step** has a spinner and a timer that ticks every second. Where the work can be counted, it also shows a live detail and a progress bar: threads downloaded, chunks embedded, which of A and B has finished.
- **Upcoming steps** are greyed out.
- **If something fails,** the step that broke turns red and the error appears below it.
- **When a job finishes,** the checklist collapses to one line, e.g. "✓ Data refresh finished in 23s".

The terminal running `npm start` prints the same steps as `[2/5] …`, and `npm run ingest` / `npm run report` show them updating in place.

| Job | Normal pace | Look into it if… |
| --- | --- | --- |
| Refresh data | "Download comment threads" counts up to 150 over ~20 s; everything else is near-instant | threads stop counting for over a minute (network) |
| A/B report | "Claude writes both versions" takes ~2 min: A finishes after ~1 min, B after ~2 | it passes ~5 minutes, or a step turns red (usually a bad API key or rate limits) |

The steps live next to the code that performs them (`INGEST_STEPS` in `src/ingest/ingestWeek.js`, `REPORT_STEPS` in `src/generation/generateComparison.js`). Progress state is tracked in `src/utils/stepTracker.js` and drawn by `public/js/views/jobProgress.js`.

### Making it faster

Each option trades something away, so none are the default:

| Change | Effect | Tradeoff |
| --- | --- | --- |
| `CLAUDE_MODEL=claude-sonnet-5` in `.env` | Faster and cheaper reports | Somewhat less sharp writing and analysis |
| Lower `retrieval.topKPerQuery` (e.g. 8 → 5) | Less to read, shorter output | Fewer sources and quotes; lower coverage |
| Lower `ingest.maxStories` / `maxCommentsPerStory` | Faster refresh | Less of the community's conversation is captured |
| Remove the judge call | Saves ~10 s and ~$0.07 | Loses the qualitative A/B verdict |

---

## The A/B test

**The only variable is retrieval.** Both variants use the same model, system prompt, task message and output schema. Variant B's message simply adds the retrieved context: the week's 30 most-engaged threads, plus excerpts labeled `[S1]`, `[S2]`, … that Claude must cite.

**Metrics computed by code** (`src/evaluation/reportMetrics.js`):

| Metric | What it tells you |
| --- | --- |
| Real sources cited | How many distinct retrieved excerpts back the document's claims |
| Invalid citations | Source IDs that don't exist, i.e. made-up references |
| Quotes verified in source | "Community voices" quotes found verbatim in the cited excerpt (case and punctuation ignored) |
| Top threads covered | How many of the week's 15 most-engaged threads the document mentions (keyword heuristic) |
| Tokens and latency | The cost of RAG: more input tokens, a slower response |

**Blind LLM judge** (`src/evaluation/judgeReports.js`): a separate Claude call scores both documents from 1 to 5 on groundedness, specificity, coverage and prediction quality. It uses the real top-thread list as ground truth. It sees "Document One" and "Document Two" in **random order**, with source IDs removed. The recorded order is then used to map the scores back to A and B, and to rewrite "Document One/Two" in the judge's written reasoning as "A (no RAG)" / "B (RAG)", so the verdict reads naturally on the page and in the Markdown export.

**Expected outcome and how to read it:** without RAG, the model has no information about *this* week. It either states that openly in its caveats or falls back on generic, possibly outdated topics, with zero verifiable quotes and low coverage. With RAG it names the actual threads, quotes real commenters, and ties its predictions to concrete signals.

**Known limitations:**
- One run is one sample, and LLM output varies, so generate several reports before drawing strong conclusions.
- The judge is the same model family as the writer.
- The judge can still guess which document had RAG from its specificity and quotes.
- Coverage is a keyword heuristic.

---

## Project structure

```
src/
├── config.js                     every tunable setting, in one place
├── createServices.js             wires the real implementations together
├── ingest/
│   ├── hackerNewsClient.js       the two Hacker News API calls
│   ├── collectCommunityDocuments.js  stories + comments → flat documents (5 requests at a time)
│   ├── storyToDocuments.js       comment tree → documents → chunks
│   ├── textCleaner.js            HTML → plain text
│   ├── chunker.js                overlapping, word-boundary chunks
│   └── ingestWeek.js             the pipeline: collect → chunk → skip known → embed → save → prune
├── embeddings/
│   ├── localEmbedder.js          MiniLM on the CPU, batched
│   └── textForEmbedding.js       comments are embedded with their story title for context
├── store/sqliteChunkStore.js     the vector table, retrieval stats, top stories
├── rag/
│   ├── vectorMath.js             dot product, cosine similarity
│   └── retriever.js              rank, diversify, record retrievals
├── generation/
│   ├── reportSchema.js           JSON schema of a Community Voices document
│   ├── buildPrompts.js           system prompt, A and B messages, context formatting
│   ├── claudeClient.js           the only code that calls the Claude API
│   └── generateComparison.js     retrieve → write A and B in parallel → measure → judge
├── evaluation/
│   ├── reportMetrics.js          code-based A/B metrics
│   └── judgeReports.js           blind, order-randomized LLM judge
├── reports/
│   ├── reportRepository.js       reports saved as JSON files
│   └── reportToMarkdown.js       Markdown export
├── visualization/
│   ├── pca.js                    384 dimensions → 2 with power-iteration PCA
│   └── embeddingMap.js           map points, colors, tooltip data
├── utils/
│   ├── mapWithConcurrency.js     run async work N at a time (the Hacker News throttle)
│   ├── stepTracker.js            step checklist state: pending → active → done / failed
│   └── consoleProgress.js        the same steps printed as "[2/5] …" in the terminal
└── server/
    ├── index.js                  entry point: HTTP server + automatic ingestion
    ├── communityVoicesApp.js     what the app can do, independent of HTTP
    ├── routes.js                 the JSON API
    ├── jobRunner.js              long tasks run in the background, with a step checklist
    └── staticFiles.js            serves public/ (with path-traversal protection)
public/
├── index.html · styles.css
└── js/  app.js (router + status polling) · api.js · dom.js · views/{statusBar,jobProgress,reportView,mapView,statsView}.js
scripts/  ingest.js · generateReport.js
test/     one test file per module, plus helpers/fixtures.js
```

### Suggested reading order

1. `src/config.js`, to learn the knobs.
2. `src/ingest/ingestWeek.js`, then the functions it calls.
3. `src/rag/retriever.js`
4. `src/generation/generateComparison.js`, then `buildPrompts.js` and `claudeClient.js`.
5. `src/evaluation/reportMetrics.js` and `judgeReports.js`.
6. `src/server/communityVoicesApp.js` and `routes.js`.
7. `public/js/app.js`, then the views.

### Design principles used

- **Dependency injection:** functions receive their collaborators (API client, embedder, store, LLM) as arguments, so tests pass in fakes. That's why the tests need no network, model download or API key.
- **One responsibility per module:** e.g. `claudeClient.js` is the only file that knows about the Claude API.
- **Small functions with descriptive names**, and comments that explain *why* rather than *what*.

---

## HTTP API

| Method and path | Description |
| --- | --- |
| `GET /api/status` | Chunk count, whether Claude is configured, background job progress |
| `POST /api/ingest` | Start a data refresh (`202` started, `409` if it can't start now) |
| `POST /api/reports` | Start generating an A/B report |
| `GET /api/reports/latest` | The newest report as JSON |
| `GET /api/reports/latest/markdown` | The newest report as a downloadable Markdown document |
| `GET /api/embeddings/map` | 2D coordinates and metadata for every chunk |
| `GET /api/retrievals/stats?limit=25` | Retrieval summary and the most-retrieved chunks |

## Configuration

Secrets and overrides go in `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Required to generate reports |
| `CLAUDE_MODEL` | `claude-opus-5` | Model for writing and judging |
| `PORT` | `3000` | Web server port |

Everything else is in `src/config.js`: lookback window, volume caps, chunk size, retrieval queries, top-K, and so on.

To ingest on a schedule without keeping the server running, use cron, for example hourly:

```cron
0 * * * * cd /path/to/community-voices && npm run ingest >> data/ingest.log 2>&1
```

## Tests

```bash
npm test
```

Uses Node's built-in test runner. The tests cover text cleaning, chunking, the ingest pipeline, the SQLite store, retrieval ranking and diversity, prompt building, the Claude client (with a fake SDK), the A/B metrics, the judge's order randomization, report generation end to end (with a fake LLM), Markdown export, PCA, and the HTTP layer.

## Limitations and next steps

- **Retrieval quality:** add hybrid search (keyword + vector) and a re-ranking step. The retrieval queries are fixed in config; an agentic step could generate them from the week's top threads.
- **Scale:** replace brute-force search with an ANN index (pgvector HNSW / sqlite-vec) once data grows past a few weeks.
- **Evaluation:** run the A/B test several times and report averages; use a different model family as the judge.
- **Predictions:** store past reports and score last week's predictions against this week's actual threads.

## How this was built

This project was built with Claude Code as a pair programmer. We designed and built it in small steps: probing the real APIs before writing clients, writing tests alongside each module, and checking the UI in a real browser.
