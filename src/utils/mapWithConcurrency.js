/**
 * Like `Promise.all(items.map(mapper))`, but runs at most `limit` mappers at once.
 * We use it so we don't fire 150 API requests in the same instant.
 * Results keep the same order as `items`.
 */
export async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
