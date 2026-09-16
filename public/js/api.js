/**
 * Every call the frontend makes to our server, in one place.
 */

async function getJson(path) {
  const response = await fetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

/** Job-starting POSTs return { started, reason? } for both 202 and 409 responses. */
async function postJson(path) {
  const response = await fetch(path, { method: 'POST' });
  return response.json();
}

export const api = {
  getStatus: () => getJson('/api/status'),
  startIngest: () => postJson('/api/ingest'),
  startReport: () => postJson('/api/reports'),
  getEmbeddingMap: () => getJson('/api/embeddings/map'),
  getRetrievalStats: (limit) => getJson(`/api/retrievals/stats?limit=${limit}`),
  markdownDownloadUrl: '/api/reports/latest/markdown',

  async getLatestReport() {
    try {
      return await getJson('/api/reports/latest');
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  },
};
