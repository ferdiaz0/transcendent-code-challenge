/**
 * What we actually feed the embedding model for each chunk.
 *
 * A comment like "Agreed, this will never scale" means nothing on its own.
 * Prefixing the story title tells the model WHAT is being discussed.
 * Story chunks already start with their title, so they are used as-is.
 */
export function textForEmbedding(chunk) {
  if (chunk.kind === 'story') return chunk.text;
  return `${chunk.storyTitle}\n\n${chunk.text}`;
}
