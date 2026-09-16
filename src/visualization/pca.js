import { dotProduct, vectorLength } from '../rag/vectorMath.js';

/**
 * PCA (principal component analysis) flattens 384-dimensional embeddings onto a
 * 2D map we can draw. It finds the two directions in which the data varies the
 * most and measures each point along them. Points close on the map have similar
 * embeddings, which means similar meaning.
 *
 * We find those directions with "power iteration": start from any direction,
 * repeatedly multiply it by the data's covariance, and it turns toward the
 * direction of greatest variance. Simple, dependency-free, and fast enough for
 * a few thousand points.
 */

export function projectTo2D(vectors, { iterations = 100 } = {}) {
  if (vectors.length === 0) return [];
  const { centeredRows, components } = findPrincipalComponents(vectors, 2, { iterations });
  return centeredRows.map((row) => components.map((component) => dotProduct(row, component)));
}

export function findPrincipalComponents(vectors, count, { iterations = 100 } = {}) {
  const centeredRows = centerRows(vectors);
  const components = [];
  for (let index = 0; index < count; index++) {
    components.push(powerIteration(centeredRows, components, iterations, index + 1));
  }
  return { centeredRows, components };
}

/** Subtracts the average vector so PCA measures spread around the center. */
function centerRows(vectors) {
  const dimensions = vectors[0].length;
  const mean = new Float64Array(dimensions);
  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) mean[i] += vector[i] / vectors.length;
  }
  return vectors.map((vector) => Float64Array.from(vector, (value, i) => value - mean[i]));
}

function powerIteration(rows, previousComponents, iterations, seed) {
  let direction = randomUnitVector(rows[0].length, seed);
  for (let step = 0; step < iterations; step++) {
    const next = multiplyByCovariance(rows, direction);
    // Removing earlier components forces this one to find a NEW direction.
    removeProjections(next, previousComponents);
    const length = vectorLength(next);
    if (length === 0) break;
    direction = next.map((value) => value / length);
  }
  return direction;
}

/** Computes Xᵀ(X·v) without building the full covariance matrix. */
function multiplyByCovariance(rows, direction) {
  const result = new Float64Array(direction.length);
  for (const row of rows) {
    const projection = dotProduct(row, direction);
    for (let i = 0; i < row.length; i++) result[i] += projection * row[i];
  }
  return result;
}

function removeProjections(vector, components) {
  for (const component of components) {
    const projection = dotProduct(vector, component);
    for (let i = 0; i < vector.length; i++) vector[i] -= projection * component[i];
  }
}

// Seeded pseudo-random numbers make the map look the same on every run.
function randomUnitVector(dimensions, seed) {
  let state = seed * 2654435761;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296 - 0.5;
  };
  const vector = Float64Array.from({ length: dimensions }, next);
  const length = vectorLength(vector);
  return vector.map((value) => value / length);
}
