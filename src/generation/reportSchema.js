/**
 * The exact JSON shape Claude must return for a Community Voices document.
 *
 * Using "structured outputs" means the API guarantees valid JSON in this shape,
 * so we never have to parse free-form text. Both A/B variants use the same schema,
 * which makes them easy to compare side by side.
 */

const sourceIds = {
  type: 'array',
  description: 'Ids of the provided sources (e.g. "S12") that support this item. Empty if no sources were provided.',
  items: { type: 'string' },
};

const theme = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'summary', 'sentiment', 'notableVoices', 'sourceIds'],
  properties: {
    name: { type: 'string', description: 'Short theme headline.' },
    summary: { type: 'string', description: 'One specific paragraph about what was said.' },
    sentiment: { type: 'string', enum: ['positive', 'mixed', 'negative', 'neutral'] },
    notableVoices: {
      type: 'array',
      description: 'Verbatim quotes from the provided sources.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['quote', 'sourceId'],
        properties: {
          quote: { type: 'string' },
          sourceId: { type: 'string' },
        },
      },
    },
    sourceIds,
  },
};

const prediction = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'prediction', 'rationale', 'confidence', 'sourceIds'],
  properties: {
    topic: { type: 'string' },
    prediction: { type: 'string', description: 'What the community will likely discuss next week.' },
    rationale: { type: 'string', description: 'The signal from this week that supports the prediction.' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    sourceIds,
  },
};

export const COMMUNITY_VOICES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'weekSummary', 'themes', 'predictions', 'caveats'],
  properties: {
    title: { type: 'string' },
    weekSummary: { type: 'string', description: 'Two or three sentences capturing the week.' },
    themes: { type: 'array', items: theme },
    predictions: { type: 'array', items: prediction },
    caveats: { type: 'string', description: 'What could not be known or verified.' },
  },
};
