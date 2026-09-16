/**
 * The tiny bit of linear algebra RAG needs.
 */

export function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function vectorLength(vector) {
  return Math.sqrt(dotProduct(vector, vector));
}

/**
 * How similar two vectors' directions are: 1 = same meaning, 0 = unrelated.
 * (Our embeddings are already length 1, where this equals the dot product,
 * but dividing by the lengths keeps the function correct for any input.)
 */
export function cosineSimilarity(a, b) {
  const lengths = vectorLength(a) * vectorLength(b);
  return lengths === 0 ? 0 : dotProduct(a, b) / lengths;
}
