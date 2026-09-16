import { pipeline } from '@huggingface/transformers';

/**
 * Turns text into embeddings: arrays of 384 numbers that capture meaning.
 * Texts about similar topics end up with similar numbers, which is what lets us
 * "search by meaning" later.
 *
 * The model runs on your CPU. The first run downloads it (~23 MB) and caches it.
 */
export class LocalEmbedder {
  constructor({ modelName, batchSize }) {
    this.modelName = modelName;
    this.batchSize = batchSize;
    this.extractor = null;
  }

  /**
   * @param {string[]} texts
   * @param {(done: number, total: number) => void} [onProgress]
   * @returns {Promise<Float32Array[]>} one unit-length vector per text
   */
  async embed(texts, onProgress = () => {}) {
    if (texts.length === 0) return [];
    const extractor = await this.loadModel();
    const vectors = [];
    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);
      vectors.push(...(await embedBatch(extractor, batch)));
      onProgress(vectors.length, texts.length);
    }
    return vectors;
  }

  async embedOne(text) {
    const [vector] = await this.embed([text]);
    return vector;
  }

  // Loaded lazily so starting the app doesn't pay the model load cost until needed.
  async loadModel() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', this.modelName, { dtype: 'q8' });
    }
    return this.extractor;
  }
}

async function embedBatch(extractor, texts) {
  // pooling 'mean': average the per-word vectors into one vector per text.
  // normalize: scale to length 1, so cosine similarity becomes a simple dot product.
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  const [count, dimensions] = output.dims;
  return Array.from({ length: count }, (_, row) =>
    output.data.slice(row * dimensions, (row + 1) * dimensions)
  );
}
