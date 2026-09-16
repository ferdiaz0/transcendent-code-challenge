/**
 * Small builders shared by tests, so each test only spells out what it cares about.
 */

export function makeChunk(overrides = {}) {
  const id = overrides.id ?? '1#0';
  return {
    id,
    documentId: id.split('#')[0],
    storyId: '1',
    storyTitle: 'A story',
    storyPoints: 100,
    storyCommentCount: 10,
    kind: 'comment',
    author: 'someone',
    createdAt: '2026-09-15T00:00:00.000Z',
    permalink: `https://news.ycombinator.com/item?id=${id.split('#')[0]}`,
    text: `text of ${id}`,
    embedding: new Float32Array([1, 0, 0]),
    ...overrides,
  };
}

export function makeDocument(overrides = {}) {
  return {
    title: 'Community Voices',
    weekSummary: 'A busy week.',
    themes: [],
    predictions: [],
    caveats: 'None.',
    ...overrides,
  };
}

export function makeTheme(overrides = {}) {
  return { name: 'Theme', summary: 'Summary.', sentiment: 'mixed', notableVoices: [], sourceIds: [], ...overrides };
}

export function makePrediction(overrides = {}) {
  return { topic: 'Topic', prediction: 'Prediction.', rationale: 'Because.', confidence: 'medium', sourceIds: [], ...overrides };
}

/** An LLM stand-in that returns queued responses and records every call. */
export function makeFakeLlm(responses) {
  const calls = [];
  return {
    calls,
    async generateJson(request) {
      calls.push(request);
      const next = typeof responses === 'function' ? responses(request) : responses.shift();
      if (next instanceof Error) throw next;
      return { data: next, model: 'fake-model', latencyMs: 5, usage: { inputTokens: 10, outputTokens: 20 } };
    },
  };
}

export const silentLog = () => {};
