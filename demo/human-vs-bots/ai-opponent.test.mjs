import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAIOpponentController,
  createLocalOpenAIProvider,
  createMcpProvider,
  createProxyProvider,
  getAntiFarmMetadata,
  getLegalUnitActions,
  serializeGameStateForAI,
} from './ai-opponent.js';

function makeFixture() {
  const cells = [
    { q: 0, r: 0, terrain: 'plains', owner: 'bot' },
    { q: 1, r: 0, terrain: 'plains', owner: 'neutral' },
    { q: 0, r: 1, terrain: 'forest', owner: 'human' },
    { q: 1, r: -1, terrain: 'water', owner: 'neutral' },
  ];
  return {
    turn: 4,
    selectedAI: 'gpt-4o',
    selectedDifficulty: 'normal',
    matchMode: 'human-vs-llm',
    mapCells: cells,
    humans: [{ id: 7, kind: 'human', unitType: 'warrior', q: 0, r: 1, hp: 80, hpMax: 95, alive: true }],
    bots: [{ id: 3, kind: 'bot', unitType: 'robot', q: 0, r: 0, hp: 90, hpMax: 120, alive: true }],
    mapByKey: Object.fromEntries(cells.map(cell => [`${cell.q},${cell.r}`, cell])),
    humansByPos: { '0,1': 7 },
    botsByPos: { '0,0': 3 },
  };
}

test('getLegalUnitActions lists only adjacent legal bot actions', () => {
  const gameState = makeFixture();
  const unit = gameState.bots[0];

  const actions = getLegalUnitActions({ gameState, unit, teamKind: 'bot' });

  assert.deepEqual(actions, [
    { type: 'move', unitId: 3, q: 1, r: 0 },
    { type: 'conquer', unitId: 3, q: 1, r: 0 },
    { type: 'attack', unitId: 3, targetId: 7 },
    { type: 'wait', unitId: 3 },
  ]);
});

test('AI controller accepts valid structured JSON from provider', async () => {
  const gameState = makeFixture();
  const unit = gameState.bots[0];
  const controller = createAIOpponentController({
    provider: {
      id: 'mock-provider',
      decideTurn: async () => ({ type: 'move', unitId: 3, q: 1, r: 0 }),
    },
    fallbackDecider: () => ({ type: 'wait', unitId: 3 }),
  });

  const decision = await controller.decideUnitAction({ gameState, unit, teamKind: 'bot' });

  assert.equal(decision.source, 'mock-provider');
  assert.deepEqual(decision.action, { type: 'move', unitId: 3, q: 1, r: 0 });
});

test('AI controller falls back when provider returns an illegal action', async () => {
  const gameState = makeFixture();
  const unit = gameState.bots[0];
  const controller = createAIOpponentController({
    provider: {
      id: 'bad-provider',
      decideTurn: async () => ({ type: 'move', unitId: 3, q: 9, r: 9 }),
    },
    fallbackDecider: () => ({ type: 'attack', unitId: 3, targetId: 7 }),
  });

  const decision = await controller.decideUnitAction({ gameState, unit, teamKind: 'bot' });

  assert.equal(decision.source, 'fallback');
  assert.match(decision.reason, /not legal/);
  assert.deepEqual(decision.action, { type: 'attack', unitId: 3, targetId: 7 });
});

test('serializeGameStateForAI exposes compact public state without secrets', () => {
  const gameState = makeFixture();

  const serialized = serializeGameStateForAI({
    gameState,
    unit: gameState.bots[0],
    teamKind: 'bot',
    legalActions: [{ type: 'wait', unitId: 3 }],
  });

  assert.deepEqual(serialized, {
    turn: 4,
    mode: 'human-vs-llm',
    team: 'bot',
    activeUnit: { id: 3, kind: 'bot', unitType: 'robot', q: 0, r: 0, hp: 90, hpMax: 120 },
    units: [
      { id: 7, kind: 'human', unitType: 'warrior', q: 0, r: 1, hp: 80, hpMax: 95 },
      { id: 3, kind: 'bot', unitType: 'robot', q: 0, r: 0, hp: 90, hpMax: 120 },
    ],
    cells: [
      { q: 0, r: 0, terrain: 'plains', owner: 'bot' },
      { q: 1, r: 0, terrain: 'plains', owner: 'neutral' },
      { q: 0, r: 1, terrain: 'forest', owner: 'human' },
      { q: 1, r: -1, terrain: 'water', owner: 'neutral' },
    ],
    legalActions: [{ type: 'wait', unitId: 3 }],
  });
  assert.equal(JSON.stringify(serialized).includes('apiKey'), false);
});

test('proxy provider posts compact state to backend without browser authorization headers', async () => {
  const calls = [];
  const provider = createProxyProvider({
    endpoint: '/api/ai-opponent/decide',
    model: 'claude-3-5-sonnet',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({ action: { type: 'wait', unitId: 3 } }),
      };
    },
  });

  const action = await provider.decideTurn({
    gameState: { turn: 1 },
    legalActions: [{ type: 'wait', unitId: 3 }],
  });

  assert.deepEqual(action, { type: 'wait', unitId: 3 });
  assert.equal(calls[0].url, '/api/ai-opponent/decide');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    model: 'claude-3-5-sonnet',
    gameState: { turn: 1 },
    legalActions: [{ type: 'wait', unitId: 3 }],
  });
});

test('local OpenAI-compatible provider extracts structured JSON action from chat response', async () => {
  const provider = createLocalOpenAIProvider({
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'http://localhost:11434/v1/chat/completions');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, undefined);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"type":"attack","unitId":3,"targetId":7}' } }],
        }),
      };
    },
  });

  const action = await provider.decideTurn({
    gameState: { turn: 1 },
    legalActions: [{ type: 'attack', unitId: 3, targetId: 7 }],
  });

  assert.deepEqual(action, { type: 'attack', unitId: 3, targetId: 7 });
});

test('MCP provider calls configured decideTurn tool', async () => {
  const provider = createMcpProvider({
    toolName: 'decideTurn',
    mcpClient: {
      callTool: async (name, payload) => {
        assert.equal(name, 'decideTurn');
        assert.deepEqual(payload.legalActions, [{ type: 'wait', unitId: 3 }]);
        return { content: [{ text: '{"type":"wait","unitId":3}' }] };
      },
    },
  });

  const action = await provider.decideTurn({
    gameState: { turn: 1 },
    legalActions: [{ type: 'wait', unitId: 3 }],
  });

  assert.deepEqual(action, { type: 'wait', unitId: 3 });
});

test('anti-farm metadata marks AI-controlled human side as not reward eligible', () => {
  assert.deepEqual(getAntiFarmMetadata({
    matchMode: 'human-vs-llm',
    aiControlsHumanSide: false,
    opponentProvider: 'local-openai',
  }), {
    aiControlsHumanSide: false,
    aiVsAi: false,
    opponentProvider: 'local-openai',
    rewardEligible: true,
  });

  assert.deepEqual(getAntiFarmMetadata({
    matchMode: 'llm-vs-llm',
    aiControlsHumanSide: true,
    opponentProvider: 'mcp',
  }), {
    aiControlsHumanSide: true,
    aiVsAi: true,
    opponentProvider: 'mcp',
    rewardEligible: false,
  });
});
