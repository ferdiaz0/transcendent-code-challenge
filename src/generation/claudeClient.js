import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

/**
 * The one place that talks to Claude. It asks for JSON matching a schema and
 * returns the parsed object with token usage and timing (used by the A/B metrics).
 */
export class ClaudeClient {
  /**
   * @param {Object} options
   * @param {string} options.apiKey
   * @param {string} options.model        e.g. 'claude-opus-5'
   * @param {number} options.maxOutputTokens
   * @param {Object} [options.anthropic]  an SDK client; tests pass a fake here
   */
  constructor({ apiKey, model, maxOutputTokens, anthropic = new Anthropic({ apiKey }) }) {
    this.model = model;
    this.maxOutputTokens = maxOutputTokens;
    this.anthropic = anthropic;
  }

  async generateJson({ system, userMessage, schema }) {
    const startedAt = Date.now();
    const response = await this.anthropic.beta.messages.parse({
      model: this.model,
      max_tokens: this.maxOutputTokens,
      system,
      messages: [{ role: 'user', content: userMessage }],
      output_config: { format: jsonSchemaOutputFormat(schema) },
      // If the model's safety filter declines, the API retries on a suitable model instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    assertUsableResponse(response);

    return {
      data: response.parsed_output,
      model: response.model,
      latencyMs: Date.now() - startedAt,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}

function assertUsableResponse(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declined the request (${response.stop_details?.category ?? 'no category'}).`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude ran out of output tokens before finishing. Increase llm.maxOutputTokens.');
  }
  if (!response.parsed_output) {
    throw new Error('Claude returned a response that did not match the expected JSON schema.');
  }
}
