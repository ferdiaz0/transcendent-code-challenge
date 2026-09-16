/**
 * Usage: npm run ingest
 *
 * Collects last week's Hacker News conversation, embeds it locally, and stores it in SQLite.
 * Safe to re-run (e.g. daily from cron): only new comments get embedded.
 */
import { createServices } from '../src/createServices.js';
import { ingestWeek, INGEST_STEPS } from '../src/ingest/ingestWeek.js';
import { createConsoleProgress } from '../src/utils/consoleProgress.js';

const services = createServices();

try {
  const summary = await ingestWeek({ ...services, onProgress: createConsoleProgress(INGEST_STEPS) });
  console.log('\n\nIngest finished:', summary);
} finally {
  services.store.close();
}
