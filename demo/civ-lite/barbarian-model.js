const EVENT_CADENCE = 4;

const EVENT_TABLE = [
  {
    id: 'ancient_ruins',
    title: 'Ancient ruins',
    description: 'Scouts uncover a buried archive near your border.',
    choices: [
      { id: 'study', label: 'Study the tablets', effects: { science: 5, cityProd: 1 } },
      { id: 'salvage', label: 'Salvage the stonework', effects: { prod: 4, cityProd: 2 } },
    ],
  },
  {
    id: 'bumper_harvest',
    title: 'Bumper harvest',
    description: 'A mild season gives your capital surplus grain.',
    choices: [
      { id: 'store', label: 'Store grain', effects: { food: 4, cityFood: 4 } },
      { id: 'trade', label: 'Trade surplus', effects: { prod: 2, science: 2 } },
    ],
  },
  {
    id: 'frontier_plague',
    title: 'Frontier sickness',
    description: 'A caravan brings illness and rumors from the frontier.',
    choices: [
      { id: 'quarantine', label: 'Quarantine quickly', effects: { prod: -1, cityFood: 2 } },
      { id: 'research', label: 'Fund healers', effects: { science: 4, food: -1 } },
    ],
  },
];

function hashSeed(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isSafeTile(tile, safeZones, minDistance) {
  return safeZones.every(zone => distance(tile, zone) > minDistance);
}

export function planBarbarianCamps({
  map,
  seed,
  count = 3,
  safeZones = [],
  minDistance = 3,
}) {
  const rng = createSeededRng(seed);
  const candidates = [];

  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const tile = { x, y };
      if (map[y][x] !== 'water' && isSafeTile(tile, safeZones, minDistance)) {
        candidates.push({ ...tile, score: rng() });
      }
    }
  }

  const sortedCandidates = candidates.sort((a, b) => a.score - b.score);

  return sortedCandidates
    .slice(0, count)
    .map((tile, index) => ({
      id: `camp-${index + 1}`,
      name: `Camp ${index + 1}`,
      x: tile.x,
      y: tile.y,
      hp: 40,
      lastSpawnTurn: 1,
      cleared: false,
    }));
}

export function shouldSpawnFromCamp(camp, turn, cadence = 3) {
  return !camp.cleared && turn - camp.lastSpawnTurn >= cadence;
}

export function createBarbarianUnit(camp, id, turn) {
  return {
    id,
    owner: 'barbarian',
    x: camp.x,
    y: camp.y,
    hp: 70,
    atk: 22,
    def: 10,
    mov: 1,
    movLeft: 1,
    type: 'raider',
    campId: camp.id,
    spawnedTurn: turn,
  };
}

export function buildRandomEvent({ seed, turn, cadence = EVENT_CADENCE }) {
  if (turn <= 1 || turn % cadence !== 0) return null;
  const rng = createSeededRng(`${seed}:${turn}`);
  const event = EVENT_TABLE[Math.floor(rng() * EVENT_TABLE.length)];

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    turn,
    choices: event.choices.map(choice => ({
      id: choice.id,
      label: choice.label,
      effects: { ...choice.effects },
    })),
  };
}

export function applyEventChoice(empire, event, choiceId) {
  const choice = event.choices.find(item => item.id === choiceId);
  if (!choice) return { ...empire };

  const next = { ...empire };
  for (const [key, value] of Object.entries(choice.effects)) {
    next[key] = (next[key] ?? 0) + value;
  }
  return next;
}

export function formatEventEffects(effects) {
  return Object.entries(effects)
    .map(([key, value]) => `${value > 0 ? '+' : ''}${value} ${key}`)
    .join(', ');
}
