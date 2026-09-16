/**
 * Usage: npm start   then open http://localhost:3000
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServices } from '../createServices.js';
import { CommunityVoicesApp } from './communityVoicesApp.js';
import { createRequestHandler } from './routes.js';

const HOUR_MS = 60 * 60 * 1000;
const publicDirectory = fileURLToPath(new URL('../../public', import.meta.url));

const services = createServices();
const app = new CommunityVoicesApp(services);
const { config } = services;

createServer(createRequestHandler({ app, publicDirectory })).listen(config.server.port, () => {
  console.log(`Community Voices is running at http://localhost:${config.server.port}`);
  if (!services.llm) console.log('Note: ANTHROPIC_API_KEY is not set, so report generation is disabled.');
});

// Automated ingestion: fill the database on first start, then keep it fresh.
if (services.store.countChunks() === 0) {
  console.log('The database is empty, so the first ingest is starting now (about a minute)...');
  app.startIngest();
}
setInterval(() => app.startIngest(), config.ingest.autoRefreshHours * HOUR_MS).unref();
