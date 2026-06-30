const HEX_DIRS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

function key(q, r) {
  return `${q},${r}`;
}

function getMapCell(gameState, q, r) {
  return gameState.mapByKey?.[key(q, r)]
    || gameState.mapCells?.find(cell => cell.q === q && cell.r === r)
    || null;
}

function getUnitById(gameState, id) {
  return [...(gameState.humans || []), ...(gameState.bots || [])]
    .find(unit => unit.id === id) || null;
}

function getCellUnit(gameState, q, r, kind) {
  const pos = key(q, r);
  const id = kind === 'human' ? gameState.humansByPos?.[pos] : gameState.botsByPos?.[pos];
  return id ? getUnitById(gameState, id) : null;
}

function isPassable(gameState, q, r) {
  const cell = getMapCell(gameState, q, r);
  return !!cell && cell.terrain !== 'water';
}

function isOccupied(gameState, q, r) {
  return !!getCellUnit(gameState, q, r, 'human') || !!getCellUnit(gameState, q, r, 'bot');
}

function getNeighbors(gameState, q, r) {
  return HEX_DIRS
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter(pos => getMapCell(gameState, pos.q, pos.r));
}

function compactUnit(unit) {
  return {
    id: unit.id,
    kind: unit.kind,
    unitType: unit.unitType,
    q: unit.q,
    r: unit.r,
    hp: unit.hp,
    hpMax: unit.hpMax,
  };
}

function actionsEqual(a, b) {
  if (!a || !b || a.type !== b.type || a.unitId !== b.unitId) return false;
  if (a.type === 'move' || a.type === 'conquer') return a.q === b.q && a.r === b.r;
  if (a.type === 'attack') return a.targetId === b.targetId;
  return a.type === 'wait';
}

function normalizeAction(rawAction) {
  if (typeof rawAction === 'string') {
    const parsed = JSON.parse(rawAction);
    return normalizeAction(parsed);
  }
  if (rawAction && typeof rawAction === 'object' && rawAction.action) {
    return normalizeAction(rawAction.action);
  }
  if (!rawAction || typeof rawAction !== 'object') return null;

  const type = String(rawAction.type || '').toLowerCase();
  const unitId = Number(rawAction.unitId);
  if (!type || !Number.isFinite(unitId)) return null;

  if (type === 'move' || type === 'conquer') {
    return { type, unitId, q: Number(rawAction.q), r: Number(rawAction.r) };
  }
  if (type === 'attack') {
    return { type, unitId, targetId: Number(rawAction.targetId) };
  }
  if (type === 'wait') {
    return { type, unitId };
  }
  return null;
}

export function trimTrailingSlashes(value) {
  let result = String(value || '');
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

function getFetch(fetchImpl) {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === 'function') return fetch;
  throw new Error('No fetch implementation is available for this AI provider.');
}

function providerPrompt() {
  return [
    'You are the opponent player in Human-vs-bots.',
    'Choose exactly one legal action from the supplied legalActions array.',
    'Return JSON only, with no markdown or prose.',
  ].join(' ');
}

function extractTextFromMcpResult(result) {
  if (typeof result === 'string') return result;
  if (result?.text) return result.text;
  const content = result?.content;
  if (Array.isArray(content)) {
    const textItem = content.find(item => typeof item?.text === 'string');
    if (textItem) return textItem.text;
  }
  return result;
}

async function readJsonResponse(response, label) {
  if (!response.ok) {
    const text = typeof response.text === 'function' ? await response.text() : '';
    throw new Error(`${label} failed with ${response.status || 'unknown'} ${text}`.trim());
  }
  return response.json();
}

export function createProxyProvider({ endpoint = '/api/ai-opponent/decide', model = 'default', fetchImpl } = {}) {
  return {
    id: 'proxy',
    async decideTurn({ gameState, legalActions }) {
      const doFetch = getFetch(fetchImpl);
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, gameState, legalActions }),
      });
      const payload = await readJsonResponse(response, 'AI proxy request');
      return normalizeAction(payload);
    },
  };
}

export function createLocalOpenAIProvider({ baseUrl = 'http://localhost:11434/v1', model = 'llama3.1', apiKey = '', fetchImpl } = {}) {
  return {
    id: 'local-openai',
    async decideTurn({ gameState, legalActions }) {
      const doFetch = getFetch(fetchImpl);
      const endpoint = `${trimTrailingSlashes(baseUrl)}/chat/completions`;
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const response = await doFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: providerPrompt() },
            { role: 'user', content: JSON.stringify({ gameState, legalActions }) },
          ],
        }),
      });
      const payload = await readJsonResponse(response, 'Local AI request');
      return normalizeAction(payload?.choices?.[0]?.message?.content ?? payload);
    },
  };
}

export function createMcpProvider({ mcpClient, toolName = 'decideTurn' } = {}) {
  return {
    id: 'mcp',
    async decideTurn({ gameState, legalActions }) {
      if (!mcpClient || typeof mcpClient.callTool !== 'function') {
        throw new Error('MCP client with callTool(name, payload) is not configured.');
      }
      const result = await mcpClient.callTool(toolName, { gameState, legalActions });
      return normalizeAction(extractTextFromMcpResult(result));
    },
  };
}

export function getAntiFarmMetadata({ matchMode, aiControlsHumanSide, opponentProvider }) {
  const aiVsAi = matchMode === 'llm-vs-llm' || !!aiControlsHumanSide;
  return {
    aiControlsHumanSide: !!aiControlsHumanSide,
    aiVsAi,
    opponentProvider: opponentProvider || 'heuristic',
    rewardEligible: !aiVsAi,
  };
}

export function getLegalUnitActions({ gameState, unit, teamKind }) {
  if (!unit?.alive || unit.acted) return [];
  const enemyKind = teamKind === 'human' ? 'bot' : 'human';
  const actions = [];

  for (const pos of getNeighbors(gameState, unit.q, unit.r)) {
    const enemy = getCellUnit(gameState, pos.q, pos.r, enemyKind);
    if (enemy?.alive) {
      actions.push({ type: 'attack', unitId: unit.id, targetId: enemy.id });
      continue;
    }

    if (!isPassable(gameState, pos.q, pos.r) || isOccupied(gameState, pos.q, pos.r)) continue;
    actions.push({ type: 'move', unitId: unit.id, q: pos.q, r: pos.r });

    const cell = getMapCell(gameState, pos.q, pos.r);
    if (cell && cell.owner !== teamKind) {
      actions.push({ type: 'conquer', unitId: unit.id, q: pos.q, r: pos.r });
    }
  }

  actions.push({ type: 'wait', unitId: unit.id });
  return actions;
}

export function serializeGameStateForAI({ gameState, unit, teamKind, legalActions }) {
  return {
    turn: gameState.turn,
    mode: gameState.matchMode,
    team: teamKind,
    activeUnit: compactUnit(unit),
    units: [...(gameState.humans || []), ...(gameState.bots || [])]
      .filter(candidate => candidate.alive)
      .map(compactUnit),
    cells: (gameState.mapCells || []).map(cell => ({
      q: cell.q,
      r: cell.r,
      terrain: cell.terrain,
      owner: cell.owner,
    })),
    legalActions,
  };
}

export function isLegalAction(action, legalActions) {
  return legalActions.some(legal => actionsEqual(action, legal));
}

export function createAIOpponentController({ provider, fallbackDecider }) {
  const safeProvider = provider || { id: 'heuristic', decideTurn: async () => null };
  const safeFallback = fallbackDecider || (({ legalActions }) => legalActions.at(-1) || null);

  return {
    async decideUnitAction({ gameState, unit, teamKind }) {
      const legalActions = getLegalUnitActions({ gameState, unit, teamKind });
      const fallback = (reason) => {
        const fallbackAction = normalizeAction(safeFallback({ gameState, unit, teamKind, legalActions }));
        const action = isLegalAction(fallbackAction, legalActions)
          ? fallbackAction
          : legalActions.find(candidate => candidate.type === 'wait') || null;
        return { source: 'fallback', reason, action, legalActions };
      };

      if (!legalActions.length) {
        return { source: 'none', reason: 'No legal actions available.', action: null, legalActions };
      }

      try {
        const aiState = serializeGameStateForAI({ gameState, unit, teamKind, legalActions });
        const rawAction = await safeProvider.decideTurn({ gameState: aiState, legalActions });
        const action = normalizeAction(rawAction);
        if (!isLegalAction(action, legalActions)) {
          return fallback('Provider action is not legal for the current turn.');
        }
        return { source: safeProvider.id || 'provider', action, legalActions };
      } catch (error) {
        return fallback(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
