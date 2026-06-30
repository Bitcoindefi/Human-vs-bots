import http from 'node:http';

const PROMPT = [
  'You are the opponent player in Human-vs-bots.',
  'Choose exactly one legal action from the legalActions array.',
  'Return JSON only, with no markdown or prose.',
].join(' ');

function parseJson(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return JSON.parse(trimmed);
}

export function resolveProxyConfig(env = process.env) {
  return {
    provider: (env.AI_OPPONENT_PROVIDER || 'openai').toLowerCase(),
    model: env.AI_OPPONENT_MODEL || env.OPENAI_MODEL || env.ANTHROPIC_MODEL || 'gpt-4o-mini',
    port: Number(env.AI_OPPONENT_PORT || 8787),
    openaiApiKey: env.OPENAI_API_KEY || '',
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    openaiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    anthropicBaseUrl: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  };
}

export function buildProviderRequest({ config, payload }) {
  if (config.provider === 'anthropic') {
    if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required for anthropic provider.');
    return {
      url: `${config.anthropicBaseUrl.replace(/\/+$/, '')}/v1/messages`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'x-api-key': config.anthropicApiKey,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 160,
          temperature: 0,
          system: PROMPT,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        }),
      },
    };
  }

  if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is required for openai provider.');
  return {
    url: `${config.openaiBaseUrl.replace(/\/+$/, '')}/chat/completions`,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    },
  };
}

export function extractActionFromProviderResponse(provider, json) {
  if (provider === 'anthropic') {
    const text = json?.content?.find(item => item?.type === 'text' && typeof item.text === 'string')?.text;
    return parseJson(text);
  }
  return parseJson(json?.choices?.[0]?.message?.content);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

export async function handleDecideRequest(req, res, { env = process.env, fetchImpl = fetch } = {}) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }
  if (req.method !== 'POST' || !req.url.startsWith('/decide')) {
    sendJson(res, 404, { error: 'Use POST /decide.' });
    return;
  }

  try {
    const payload = await readBody(req);
    const config = resolveProxyConfig(env);
    const request = buildProviderRequest({ config, payload });
    const providerResponse = await fetchImpl(request.url, request.options);
    const providerJson = await providerResponse.json();
    if (!providerResponse.ok) {
      sendJson(res, providerResponse.status || 502, { error: providerJson });
      return;
    }
    sendJson(res, 200, { action: extractActionFromProviderResponse(config.provider, providerJson) });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = resolveProxyConfig(process.env);
  const server = http.createServer((req, res) => {
    handleDecideRequest(req, res).catch(error => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`AI opponent proxy listening on http://127.0.0.1:${config.port}/decide`);
  });
}
