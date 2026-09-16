import { serveStaticFile } from './staticFiles.js';
import { reportToMarkdown } from '../reports/reportToMarkdown.js';

const DEFAULT_STATS_LIMIT = 25;
const MAX_STATS_LIMIT = 200;

/**
 * The HTTP API. Each route is "METHOD /path" -> handler(context).
 * Handlers stay one-liners by delegating to CommunityVoicesApp.
 */
export function buildRoutes(app) {
  return {
    'GET /api/status': ({ response }) => sendJson(response, 200, app.getStatus()),

    'POST /api/ingest': ({ response }) => sendJobStart(response, app.startIngest()),

    'POST /api/reports': ({ response }) => sendJobStart(response, app.startReportGeneration()),

    'GET /api/reports/latest': ({ response }) => sendReport(response, app.getLatestReport()),

    'GET /api/reports/latest/markdown': ({ response }) => sendMarkdown(response, app.getLatestReport()),

    'GET /api/embeddings/map': ({ response }) => sendJson(response, 200, app.getEmbeddingMap()),

    'GET /api/retrievals/stats': ({ response, url }) =>
      sendJson(response, 200, app.getRetrievalStats(parseLimit(url.searchParams.get('limit')))),
  };
}

/** Node's http server calls this for every request. */
export function createRequestHandler({ app, publicDirectory }) {
  const routes = buildRoutes(app);

  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const route = routes[`${request.method} ${url.pathname}`];
    try {
      if (route) return await route({ request, response, url });
      if (request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return await serveStaticFile(response, publicDirectory, url.pathname);
      }
      sendJson(response, 404, { error: `No route for ${request.method} ${url.pathname}` });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: error.message });
    }
  };
}

export function parseLimit(rawLimit) {
  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_STATS_LIMIT;
  return Math.min(limit, MAX_STATS_LIMIT);
}

function sendJobStart(response, outcome) {
  // 202 Accepted = "started, not finished". 409 Conflict = "can't start right now".
  sendJson(response, outcome.started ? 202 : 409, outcome);
}

function sendReport(response, report) {
  if (!report) return sendJson(response, 404, { error: 'No report yet. Generate one first.' });
  sendJson(response, 200, report);
}

function sendMarkdown(response, report) {
  if (!report) return sendJson(response, 404, { error: 'No report yet. Generate one first.' });
  response.writeHead(200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="community-voices-${report.week.endDate}.md"`,
  });
  response.end(reportToMarkdown(report));
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
