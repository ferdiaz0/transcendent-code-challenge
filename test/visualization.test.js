import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPrincipalComponents, projectTo2D } from '../src/visualization/pca.js';
import { buildEmbeddingMap, pickHighlightedStories } from '../src/visualization/embeddingMap.js';
import { makeChunk } from './helpers/fixtures.js';

// Points spread widely along the (1, 1, 0) diagonal, a little along z, not at all along (1, -1, 0).
const points = [-3, -2, -1, 0, 1, 2, 3].map((t, index) => [t, t, index % 2 === 0 ? 0.3 : -0.3]);

test('first principal component follows the direction of greatest spread', () => {
  const { components } = findPrincipalComponents(points, 2);
  const [first, second] = components;

  assert.ok(Math.abs(first[0] - first[1]) < 1e-6, 'x and y weights should be equal');
  assert.ok(Math.abs(Math.abs(first[0]) - Math.SQRT1_2) < 1e-3);
  assert.ok(Math.abs(Math.abs(second[2]) - 1) < 1e-3, 'second component should be the z axis');
});

test('projectTo2D returns one [x, y] pair per input, with most variance on x', () => {
  const projected = projectTo2D(points);
  const variance = (values) => values.reduce((sum, value) => sum + value * value, 0);

  assert.equal(projected.length, points.length);
  assert.ok(variance(projected.map((p) => p[0])) > variance(projected.map((p) => p[1])));
  assert.deepEqual(projectTo2D([]), []);
});

test('the most-upvoted stories get colors; other chunks are gray (-1)', () => {
  const chunks = [
    makeChunk({ id: 'a#0', storyId: 'a', storyPoints: 50 }),
    makeChunk({ id: 'b#0', storyId: 'b', storyPoints: 900 }),
    makeChunk({ id: 'b#1', storyId: 'b', storyPoints: 900 }),
  ];

  assert.deepEqual(pickHighlightedStories(chunks, 1).map((s) => [s.storyId, s.chunkCount, s.colorIndex]), [['b', 2, 0]]);

  const map = buildEmbeddingMap(chunks, [[0.123456, 1], [2, 3], [4, 5]], { highlightedStoryCount: 1 });
  assert.deepEqual(map.points.map((p) => p.colorIndex), [-1, 0, 0]);
  assert.equal(map.points[0].x, 0.1235);
});
