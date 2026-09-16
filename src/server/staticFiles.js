import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Serves files from the `public/` folder, the whole frontend. No bundler needed:
 * browsers load our plain ES modules directly.
 */
export async function serveStaticFile(response, publicDirectory, urlPath) {
  const filePath = resolveInsideDirectory(publicDirectory, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath) return sendText(response, 403, 'Forbidden');

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
      // Always revalidate, so an edited file shows up on the next reload (no stale JS).
      'Cache-Control': 'no-cache',
    });
    response.end(content);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

/** Blocks "../" tricks: the resolved path must stay inside the public folder. */
export function resolveInsideDirectory(directory, urlPath) {
  const root = normalize(directory);
  const filePath = normalize(join(root, decodeURIComponent(urlPath)));
  return filePath.startsWith(root + sep) ? filePath : null;
}

function sendText(response, status, text) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(text);
}
