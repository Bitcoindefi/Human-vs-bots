import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProviderRequest,
  extractActionFromProviderResponse,
  resolveProxyConfig,
} from './ai-opponent-proxy.mjs';

test('resolveProxyConfig keeps provider secrets on the server side', () => {
  const config = resolveProxyConfig({
    AI_OPPONENT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'server-only-key',
    AI_OPPONENT_MODEL: 'gpt-4o-mini',
    AI_OPPONENT_PORT: '8999',
  });

  assert.deepEqual(config, {
    provider: 'openai',
    model: 'gpt-4o-mini',
    port: 8999,
    openaiApiKey: 'server-only-key',
    anthropicApiKey: '',
    openaiBaseUrl: 'https://api.openai.com/v1',
    anthropicBaseUrl: 'https://api.anthropic.com',
  });
});

test('buildProviderRequest maps OpenAI requests to chat completions', () => {
  const request = buildProviderRequest({
    config: resolveProxyConfig({
      AI_OPPONENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'server-only-key',
      AI_OPPONENT_MODEL: 'gpt-4o-mini',
    }),
    payload: { gameState: { turn: 2 }, legalActions: [{ type: 'wait', unitId: 3 }] },
  });

  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer server-only-key');
  assert.equal(JSON.parse(request.options.body).model, 'gpt-4o-mini');
});

test('extractActionFromProviderResponse reads JSON action text from OpenAI and Anthropic shapes', () => {
  assert.deepEqual(extractActionFromProviderResponse('openai', {
    choices: [{ message: { content: '{"type":"wait","unitId":3}' } }],
  }), { type: 'wait', unitId: 3 });

  assert.deepEqual(extractActionFromProviderResponse('anthropic', {
    content: [{ type: 'text', text: '{"type":"attack","unitId":3,"targetId":7}' }],
  }), { type: 'attack', unitId: 3, targetId: 7 });
});
