# AI Opponent Provider

The browser demo can now route opponent turns through a real AI decision provider while keeping the existing rule-based bot as a safe fallback.

## Decision Contract

Each provider receives a compact public state:

- current turn and match mode
- active unit position and health
- visible living units
- visible map cells with terrain and owner
- an explicit `legalActions` array

The provider must return JSON only. The game validates the returned action against `legalActions`; invalid JSON, unavailable providers, timeouts, or illegal actions fall back to the built-in heuristic bot.

Example response:

```json
{ "type": "attack", "unitId": 3, "targetId": 7 }
```

Supported action types:

- `move`: `{ "type": "move", "unitId": 3, "q": 5, "r": 4 }`
- `conquer`: `{ "type": "conquer", "unitId": 3, "q": 5, "r": 4 }`
- `attack`: `{ "type": "attack", "unitId": 3, "targetId": 7 }`
- `wait`: `{ "type": "wait", "unitId": 3 }`

## Provider Modes

### Heuristic

Default mode. No network calls or credentials are used.

### Cloud Proxy

Use this for OpenAI or Anthropic without exposing API keys in the browser. Run the server-side proxy:

```bash
AI_OPPONENT_PROVIDER=openai \
AI_OPPONENT_MODEL=gpt-4o-mini \
OPENAI_API_KEY=... \
node scripts/ai-opponent-proxy.mjs
```

Then set the in-game endpoint to:

```text
http://127.0.0.1:8787/decide
```

For Anthropic:

```bash
AI_OPPONENT_PROVIDER=anthropic \
AI_OPPONENT_MODEL=claude-3-5-sonnet-latest \
ANTHROPIC_API_KEY=... \
node scripts/ai-opponent-proxy.mjs
```

Do not put production API keys into the static frontend. Keep them in the proxy process environment.

### Local OpenAI-Compatible

For Ollama, LM Studio, llama.cpp, or vLLM, select `Local OpenAI-compatible` and set:

```text
Endpoint: http://localhost:11434/v1
Model: llama3.1
```

The browser calls `/chat/completions` on the configured local endpoint. No key is sent unless that endpoint is already fronted by local infrastructure that requires one.

### MCP Tool

Select `MCP tool` and provide the tool name, defaulting to `decideTurn`. The page expects a browser-injected client:

```js
window.HumanVsBotsMcp = {
  async callTool(name, payload) {
    return { content: [{ text: '{"type":"wait","unitId":3}' }] };
  }
};
```

The tool receives `{ gameState, legalActions }` and must return one legal action as JSON text.

## Anti-Farm Metadata

Proof snapshots and `start_game` payloads include:

```json
{
  "antiFarm": {
    "aiControlsHumanSide": false,
    "aiVsAi": false,
    "opponentProvider": "local-openai",
    "rewardEligible": true
  }
}
```

`LLM vs LLM` and any match where AI controls the human side are marked `rewardEligible: false` so automated games cannot be treated as farmable reward activity.
