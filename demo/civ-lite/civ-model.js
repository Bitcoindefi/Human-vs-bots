export const TERRAIN_TYPES = [
  'ocean',
  'coast',
  'plains',
  'grassland',
  'forest',
  'jungle',
  'hill',
  'mountain',
  'desert',
  'tundra',
  'snow',
];

export const TERRAIN_YIELDS = {
  ocean: { food: 1, prod: 0, science: 0, gold: 1 },
  coast: { food: 2, prod: 0, science: 0, gold: 1 },
  plains: { food: 1, prod: 2, science: 0, gold: 0 },
  grassland: { food: 2, prod: 1, science: 0, gold: 0 },
  forest: { food: 1, prod: 2, science: 0, gold: 0 },
  jungle: { food: 2, prod: 1, science: 1, gold: 0 },
  hill: { food: 0, prod: 2, science: 1, gold: 0 },
  mountain: { food: 0, prod: 1, science: 2, gold: 0 },
  desert: { food: 0, prod: 1, science: 0, gold: 1 },
  tundra: { food: 1, prod: 1, science: 1, gold: 0 },
  snow: { food: 0, prod: 1, science: 0, gold: 0 },
};

export const TERRAIN_DEFENSE = {
  ocean: 0,
  coast: 0,
  plains: 0,
  grassland: 0,
  forest: 0.25,
  jungle: 0.2,
  hill: 0.35,
  mountain: 0.5,
  desert: 0,
  tundra: 0.1,
  snow: 0.05,
};

export const RESOURCE_TYPES = {
  wheat: { label: 'Wheat', icon: 'W', yield: { food: 1, prod: 0, science: 0, gold: 0 } },
  cattle: { label: 'Cattle', icon: 'C', yield: { food: 1, prod: 1, science: 0, gold: 0 } },
  fish: { label: 'Fish', icon: 'F', yield: { food: 2, prod: 0, science: 0, gold: 0 } },
  iron: { label: 'Iron', icon: 'Fe', yield: { food: 0, prod: 2, science: 0, gold: 0 } },
  gold: { label: 'Gold', icon: 'Au', yield: { food: 0, prod: 0, science: 0, gold: 2 } },
  deer: { label: 'Deer', icon: 'D', yield: { food: 1, prod: 1, science: 0, gold: 0 } },
};

const RESOURCE_BY_TERRAIN = {
  ocean: ['fish'],
  coast: ['fish'],
  plains: ['wheat', 'cattle'],
  grassland: ['wheat', 'cattle'],
  forest: ['deer'],
  jungle: ['deer'],
  hill: ['iron', 'gold'],
  mountain: ['iron', 'gold'],
  desert: ['gold'],
  tundra: ['deer', 'iron'],
  snow: ['iron'],
};

export const CIV_COLORS = {
  player: '#44aaff',
  bot: '#ff5555',
};

const DEFAULT_RESOURCES = { food: 0, prod: 0, science: 0, gold: 0 };

function mixSeed(seed, x, y, salt = 0) {
  let n = (seed ^ (x * 374761393) ^ (y * 668265263) ^ (salt * 1274126177)) >>> 0;
  n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 3266489917) >>> 0;
  return (n ^ (n >>> 16)) >>> 0;
}

function rand(seed, x, y, salt = 0) {
  return mixSeed(seed, x, y, salt) / 4294967295;
}

function pickTerrain(width, height, x, y, seed) {
  const nx = width <= 1 ? 0 : x / (width - 1);
  const ny = height <= 1 ? 0 : y / (height - 1);
  const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
  const latitude = Math.abs(ny - 0.5) * 2;
  const elevation = rand(seed, x, y, 1);
  const moisture = rand(seed, x, y, 2);

  if (edge < 0.07 || elevation < 0.09) return 'ocean';
  if (edge < 0.12 || elevation < 0.16) return 'coast';
  if (latitude > 0.88) return elevation > 0.72 ? 'mountain' : 'snow';
  if (latitude > 0.72) return moisture > 0.45 ? 'tundra' : 'snow';
  if (elevation > 0.88) return 'mountain';
  if (elevation > 0.74) return 'hill';
  if (moisture < 0.18 && latitude < 0.65) return 'desert';
  if (moisture > 0.78 && latitude < 0.55) return 'jungle';
  if (moisture > 0.58) return 'forest';
  return moisture > 0.36 ? 'grassland' : 'plains';
}

function maybeResource(terrain, seed, x, y) {
  const options = RESOURCE_BY_TERRAIN[terrain] || [];
  if (options.length === 0) return null;
  const chance = rand(seed, x, y, 8);
  if (chance > 0.22) return null;
  return options[Math.floor(rand(seed, x, y, 9) * options.length)];
}

function makeTile(terrain, seed, x, y) {
  const resource = maybeResource(terrain, seed, x, y);
  return {
    x,
    y,
    terrain,
    resource,
    yields: getTileYield({ terrain, resource }),
    owner: null,
    variant: mixSeed(seed, x, y, 14) % 4,
  };
}

function forceTerrainCoverage(map, seed) {
  for (let i = 0; i < TERRAIN_TYPES.length; i++) {
    const y = Math.min(map.length - 1, Math.floor(i / Math.max(1, map[0].length)));
    const x = i % map[0].length;
    map[y][x] = makeTile(TERRAIN_TYPES[i], seed, x, y);
  }
}

function setTile(map, x, y, terrain, seed) {
  if (!map[y] || !map[y][x]) return;
  map[y][x] = makeTile(terrain, seed, x, y);
}

export function isWaterTerrain(terrain) {
  return terrain === 'ocean' || terrain === 'coast';
}

export function getTileYield(tile) {
  const base = TERRAIN_YIELDS[tile.terrain] || DEFAULT_RESOURCES;
  const resource = tile.resource ? RESOURCE_TYPES[tile.resource]?.yield : null;
  return {
    food: base.food + (resource?.food || 0),
    prod: base.prod + (resource?.prod || 0),
    science: base.science + (resource?.science || 0),
    gold: base.gold + (resource?.gold || 0),
  };
}

export function generateCivMap(width = 24, height = 16, seed = 42) {
  const map = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push(makeTile(pickTerrain(width, height, x, y, seed), seed, x, y));
    }
    map.push(row);
  }

  forceTerrainCoverage(map, seed);
  for (const [cx, cy] of [[2, 2], [width - 3, height - 3]]) {
    setTile(map, cx, cy, 'grassland', seed);
    setTile(map, cx + 1, cy, 'plains', seed);
    setTile(map, cx, cy + 1, 'forest', seed);
  }

  return map;
}

export function claimTerritory(map, cities, radius = 2) {
  for (const row of map) for (const tile of row) tile.owner = null;
  for (const city of cities) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = map[city.y + dy]?.[city.x + dx];
        if (tile && Math.abs(dx) + Math.abs(dy) <= radius + 1) tile.owner = city.owner;
      }
    }
  }
}

export function createCivState({ width = 24, height = 16, seed = 42 } = {}) {
  const map = generateCivMap(width, height, seed);
  const cities = [
    { owner: 'player', x: 2, y: 2, name: 'Athens', food: 0, prod: 0, pop: 1, production: 'Warrior' },
    { owner: 'bot', x: width - 3, y: height - 3, name: 'Babylon', food: 0, prod: 0, pop: 1, production: 'Warrior' },
  ];
  claimTerritory(map, cities);

  return {
    map,
    units: [
      { id: 1, owner: 'player', x: 2, y: 2, hp: 100, atk: 30, def: 15, mov: 2, movLeft: 2, type: 'warrior', sight: 2 },
      { id: 2, owner: 'bot', x: width - 3, y: height - 3, hp: 100, atk: 28, def: 18, mov: 2, movLeft: 2, type: 'warrior', sight: 2 },
    ],
    cities,
    resources: {
      player: { food: 0, prod: 0, science: 0, gold: 0 },
      bot: { food: 0, prod: 0, science: 0, gold: 0 },
    },
  };
}

export function computeVisibility({ width, height, previousFog = [], units = [], cities = [], owner }) {
  const fog = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (previousFog[y]?.[x] ? 1 : 0))
  );

  const reveal = (cx, cy, radius) => {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && Math.abs(dx) + Math.abs(dy) <= radius + 1) {
          fog[ny][nx] = 2;
        }
      }
    }
  };

  for (const unit of units.filter((u) => u.owner === owner)) reveal(unit.x, unit.y, unit.sight ?? 2);
  for (const city of cities.filter((c) => c.owner === owner)) reveal(city.x, city.y, city.sight ?? 2);
  return fog;
}

function addYield(total, tile) {
  const yields = getTileYield(tile);
  total.food += yields.food;
  total.prod += yields.prod;
  total.science += yields.science;
  total.gold += yields.gold;
}

export function summarizeCityYield(state, city) {
  const total = { ...DEFAULT_RESOURCES };
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tile = state.map[city.y + dy]?.[city.x + dx];
      if (tile) addYield(total, tile);
    }
  }
  total.food += city.pop;
  total.prod += Math.max(0, city.pop - 1);
  total.gold += city.owner === 'player' ? 1 : 0;
  return total;
}

export function summarizeEmpire(state, owner) {
  const totals = { ...(state.resources?.[owner] || DEFAULT_RESOURCES) };
  const rates = { ...DEFAULT_RESOURCES };
  const ownedCities = state.cities.filter((city) => city.owner === owner);

  for (const city of ownedCities) {
    const cityYield = summarizeCityYield(state, city);
    rates.food += cityYield.food;
    rates.prod += cityYield.prod;
    rates.science += cityYield.science;
    rates.gold += cityYield.gold;
  }

  return {
    totals,
    rates,
    cityCount: ownedCities.length,
    unitCount: state.units.filter((unit) => unit.owner === owner).length,
    notifications: [`Turn economy: ${ownedCities.length} cities, ${rates.food} food, ${rates.prod} prod`],
  };
}

export function describeTile(tile) {
  const terrain = tile.terrain.replace(/^\w/, (c) => c.toUpperCase());
  const resource = tile.resource ? ` + ${RESOURCE_TYPES[tile.resource].label}` : '';
  return `${terrain}${resource}`;
}
