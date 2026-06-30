export const TECH_TREE = [
  {
    id: 'mining',
    name: 'Mining',
    cost: 10,
    prereqs: [],
    unlocks: { units: [], buildings: [], improvements: ['mine'] },
    flavor: 'Reveals productive hills and enables mine improvements.',
  },
  {
    id: 'archery',
    name: 'Archery',
    cost: 12,
    prereqs: [],
    unlocks: { units: ['archer'], buildings: [], improvements: [] },
    flavor: 'Unlocks ranged city defense and early skirmishers.',
  },
  {
    id: 'writing',
    name: 'Writing',
    cost: 14,
    prereqs: [],
    unlocks: { units: [], buildings: ['library'], improvements: [] },
    flavor: 'Turns science income into a focused research economy.',
  },
  {
    id: 'bronze_working',
    name: 'Bronze Working',
    cost: 16,
    prereqs: ['mining'],
    unlocks: { units: ['swordsman'], buildings: [], improvements: [] },
    flavor: 'Unlocks swordsmen for stronger melee assaults.',
  },
  {
    id: 'horseback_riding',
    name: 'Horseback Riding',
    cost: 18,
    prereqs: ['archery'],
    unlocks: { units: ['horseman'], buildings: [], improvements: ['pasture'] },
    flavor: 'Unlocks fast cavalry and pasture economies.',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    cost: 22,
    prereqs: ['bronze_working', 'writing'],
    unlocks: { units: [], buildings: ['walls'], improvements: ['road'] },
    flavor: 'Adds defensive infrastructure and strategic movement.',
  },
];

const TECH_BY_ID = new Map(TECH_TREE.map((tech) => [tech.id, tech]));
const EMPTY_UNLOCKS = { units: [], buildings: [], improvements: [] };

export function createResearchState(seed = {}) {
  return {
    researched: [...(seed.researched || [])],
    current: seed.current || null,
    progress: Number(seed.progress || 0),
  };
}

export function getTech(id) {
  const tech = TECH_BY_ID.get(id);
  if (!tech) throw new Error(`Unknown technology: ${id}`);
  return tech;
}

export function isResearched(state, techId) {
  return state.researched.includes(techId);
}

export function getTechStatus(state, techId) {
  const tech = getTech(techId);
  if (isResearched(state, tech.id)) return 'researched';
  if (state.current === tech.id) return 'in-progress';
  const unlocked = tech.prereqs.every((id) => isResearched(state, id));
  return unlocked ? 'available' : 'blocked';
}

export function getAvailableTechs(state) {
  return TECH_TREE.filter((tech) => getTechStatus(state, tech.id) === 'available');
}

export function selectResearch(state, techId) {
  const status = getTechStatus(state, techId);
  if (status !== 'available' && status !== 'in-progress') {
    throw new Error(`Cannot research ${techId}: ${status}`);
  }
  return {
    ...state,
    current: techId,
    progress: state.current === techId ? state.progress : 0,
  };
}

export function advanceResearch(state, sciencePerTurn) {
  if (!state.current) {
    return { state: createResearchState(state), completed: [] };
  }

  const tech = getTech(state.current);
  const total = state.progress + Math.max(0, Number(sciencePerTurn || 0));
  if (total < tech.cost) {
    return {
      state: { ...state, progress: total },
      completed: [],
    };
  }

  const researched = Array.from(new Set([...state.researched, tech.id]));
  return {
    state: {
      researched,
      current: null,
      progress: total - tech.cost,
    },
    completed: [tech.id],
  };
}

export function getUnlockedContent(state) {
  const unlocks = {
    units: ['warrior'],
    buildings: [],
    improvements: [],
  };

  for (const techId of state.researched) {
    const tech = getTech(techId);
    mergeUnlocks(unlocks, tech.unlocks || EMPTY_UNLOCKS);
  }

  return unlocks;
}

export function chooseBotResearch(state, personality = 'balanced') {
  const available = getAvailableTechs(state);
  if (available.length === 0) return null;

  const preferences = {
    military: ['archery', 'bronze_working', 'horseback_riding', 'engineering', 'mining', 'writing'],
    science: ['writing', 'mining', 'engineering', 'archery', 'bronze_working', 'horseback_riding'],
    expansion: ['mining', 'horseback_riding', 'writing', 'archery', 'bronze_working', 'engineering'],
    balanced: ['mining', 'writing', 'archery', 'bronze_working', 'horseback_riding', 'engineering'],
  };
  const order = preferences[personality] || preferences.balanced;
  return [...available].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))[0].id;
}

function mergeUnlocks(target, incoming) {
  for (const key of Object.keys(target)) {
    for (const value of incoming[key] || []) {
      if (!target[key].includes(value)) target[key].push(value);
    }
  }
}
