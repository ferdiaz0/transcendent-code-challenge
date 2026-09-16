import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeClient } from '../src/generation/claudeClient.js';

function makeFakeAnthropic(response) {
  const requests = [];
  return {
    requests,
    beta: { messages: { parse: async (request) => { requests.push(request); return response; } } },
  };
}

const schema = { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } };
const okResponse = {
  stop_reason: 'end_turn',
  parsed_output: { answer: 'hi' },
  model: 'claude-opus-5',
  usage: { input_tokens: 100, output_tokens: 20 },
};

test('sends model, prompts, JSON schema and fallbacks; returns data with usage', async () => {
  const anthropic = makeFakeAnthropic(okResponse);
  const client = new ClaudeClient({ model: 'claude-opus-5', maxOutputTokens: 1000, anthropic });

  const result = await client.generateJson({ system: 'SYS', userMessage: 'USER', schema });

  const [request] = anthropic.requests;
  assert.equal(request.model, 'claude-opus-5');
  assert.equal(request.max_tokens, 1000);
  assert.equal(request.system, 'SYS');
  assert.deepEqual(request.messages, [{ role: 'user', content: 'USER' }]);
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.equal(request.fallbacks, 'default');
  assert.deepEqual(result.data, { answer: 'hi' });
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 20 });
  assert.equal(typeof result.latencyMs, 'number');
});

test('throws a clear error on refusal, truncation, or unparseable output', async () => {
  const cases = [
    [{ ...okResponse, stop_reason: 'refusal', stop_details: { category: 'cyber' } }, /declined.*cyber/],
    [{ ...okResponse, stop_reason: 'max_tokens' }, /ran out of output tokens/],
    [{ ...okResponse, parsed_output: null }, /did not match/],
  ];
  for (const [response, expectedMessage] of cases) {
    const client = new ClaudeClient({ model: 'm', maxOutputTokens: 10, anthropic: makeFakeAnthropic(response) });
    await assert.rejects(client.generateJson({ system: '', userMessage: '', schema }), expectedMessage);
  }
});
