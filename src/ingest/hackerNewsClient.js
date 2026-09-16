/**
 * Thin wrapper around the free, key-less Hacker News search API hosted by Algolia.
 * Docs: https://hn.algolia.com/api
 */
const API_BASE_URL = 'https://hn.algolia.com/api/v1';

/**
 * Returns stories created after `sinceUnixSeconds` with at least `minPoints`,
 * most popular first.
 */
export async function fetchPopularStoriesSince({ sinceUnixSeconds, minPoints, maxStories }) {
  const params = new URLSearchParams({
    tags: 'story',
    numericFilters: `created_at_i>${sinceUnixSeconds},points>=${minPoints}`,
    hitsPerPage: String(maxStories),
  });
  const body = await getJson(`${API_BASE_URL}/search?${params}`);
  return body.hits;
}

/**
 * Returns one story together with its full nested comment tree (`children`).
 */
export async function fetchItemTree(itemId) {
  return getJson(`${API_BASE_URL}/items/${itemId}`);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Hacker News API request failed (${response.status}): ${url}`);
  }
  return response.json();
}
