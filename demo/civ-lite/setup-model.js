export const MAP_SIZES = {
  compact: { width: 18, height: 12, label: 'Compact' },
  standard: { width: 24, height: 16, label: 'Standard' },
  wide: { width: 30, height: 18, label: 'Wide' },
};

export const CIV_PROFILES = [
  {
    id: 'player',
    name: 'Athens',
    owner: 'player',
    personality: 'human',
    color: '#44aaff',
  },
  {
    id: 'bot1',
    name: 'Babylon',
    owner: 'bot',
    personality: 'aggressive',
    color: '#ff5555',
  },
  {
    id: 'bot2',
    name: 'Memphis',
    owner: 'bot',
    personality: 'expansive',
    color: '#ffb84d',
  },
  {
    id: 'bot3',
    name: 'Uruk',
    owner: 'bot',
    personality: 'scientific',
    color: '#b388ff',
  },
];

const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

const DEFAULT_VICTORIES = {
  domination: true,
  territory: true,
  science: true,
};

const PERSONALITY_PLANS = {
  aggressive: {
    label: 'Aggressive',
    targetOrder: ['unit', 'city'],
    risk: 'high',
  },
  expansive: {
    label: 'Expansive',
    targetOrder: ['city', 'unit'],
    risk: 'medium',
  },
  scientific: {
    label: 'Scientific',
    targetOrder: ['city', 'unit'],
    risk: 'low',
  },
  human: {
    label: 'Human',
    targetOrder: ['unit', 'city'],
    risk: 'manual',
  },
};

export function normalizeGameSetup(options = {}) {
  const mapSize = MAP_SIZES[options.mapSize] ? options.mapSize : 'standard';
  const difficulty = DIFFICULTIES.has(options.difficulty) ? options.difficulty : 'normal';
  const seed = normalizeSeed(options.seed);
  const civCount = Math.max(2, Math.min(4, Number.parseInt(options.civCount, 10) || 2));
  const victories = options.victories
    ? { ...DEFAULT_VICTORIES, ...options.victories }
    : { ...DEFAULT_VICTORIES };

  return { mapSize, difficulty, seed, civCount, victories };
}

export function createGameSetup(options = {}) {
  const normalized = normalizeGameSetup(options);
  const civs = CIV_PROFILES.slice(0, normalized.civCount).map(civ => ({ ...civ }));
  return {
    ...normalized,
    map: MAP_SIZES[normalized.mapSize],
    civs,
    diplomacy: createDiplomacy(civs),
  };
}

export function createDiplomacy(civs) {
  const relations = {};
  for (let i = 0; i < civs.length; i++) {
    for (let j = i + 1; j < civs.length; j++) {
      const a = civs[i];
      const b = civs[j];
      const touchesPlayer = a.id === 'player' || b.id === 'player';
      relations[relationKey(a.id, b.id)] = {
        a: a.id,
        b: b.id,
        status: touchesPlayer ? 'war' : 'peace',
        provoked: false,
      };
    }
  }
  return relations;
}

export function getRelation(diplomacy, ownerA, ownerB) {
  return diplomacy[relationKey(ownerA, ownerB)] || {
    a: ownerA,
    b: ownerB,
    status: ownerA === ownerB ? 'self' : 'peace',
    provoked: false,
  };
}

export function getPersonalityPlan(personality) {
  return PERSONALITY_PLANS[personality] || PERSONALITY_PLANS.aggressive;
}

export function relationKey(ownerA, ownerB) {
  return [ownerA, ownerB].sort((a, b) => a.localeCompare(b)).join(':');
}

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.round(seed)) || 1;
  }

  const text = String(seed ?? '1');
  const digits = text.match(/\d+/g)?.join('');
  return digits ? Math.abs(Number.parseInt(digits, 10)) || 1 : 1;
}
