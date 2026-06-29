export const CITY_BUILDINGS = {
  granary: {
    name: 'Granary',
    cost: 12,
    yields: { food: 2, prod: 0, sci: 0 },
    amenities: 0,
    defense: 0,
  },
  library: {
    name: 'Library',
    cost: 16,
    yields: { food: 0, prod: 0, sci: 2 },
    amenities: 0,
    defense: 0,
  },
  walls: {
    name: 'Walls',
    cost: 14,
    yields: { food: 0, prod: 1, sci: 0 },
    amenities: 0,
    defense: 15,
  },
  market: {
    name: 'Market',
    cost: 14,
    yields: { food: 0, prod: 0, sci: 0 },
    amenities: 1,
    defense: 0,
  },
};

export function createCity(city) {
  const { buildings = [], ...rest } = city;
  return {
    food: 0,
    prod: 0,
    pop: 1,
    amenities: 0,
    ...rest,
    buildings: [...buildings],
  };
}

export function calculateCityEconomy(city, map, terrainYield, empireCityCount = 1) {
  const normalized = createCity(city);
  const workedTiles = getWorkedTiles(normalized, map, terrainYield);
  const baseYields = sumYields(workedTiles.map(tile => tile.yields));
  const buildingYields = getBuildingYields(normalized);
  const rawYields = addYields(baseYields, buildingYields);
  const happiness = calculateHappiness(normalized, empireCityCount);
  const penalty = happiness < 0 ? Math.min(0.3, Math.abs(happiness) * 0.1) : 0;
  return {
    workedTiles,
    baseYields,
    buildingYields,
    totalYields: applyPenalty(rawYields, penalty),
    happiness,
    foodRequired: getFoodRequired(normalized),
    defenseBonus: normalized.buildings.reduce((sum, key) => sum + (CITY_BUILDINGS[key]?.defense || 0), 0),
  };
}

export function progressCityTurn(city, economy) {
  const next = createCity(city);
  next.food += economy.totalYields.food;
  next.prod += economy.totalYields.prod;
  if (next.food >= economy.foodRequired) {
    next.pop += 1;
    next.food = 0;
  }
  return next;
}

export function buildBuilding(city, key) {
  const building = CITY_BUILDINGS[key];
  const next = createCity(city);
  if (!building) return { ok: false, reason: 'unknown-building', city: next };
  if (next.buildings.includes(key)) return { ok: false, reason: 'already-built', city: next };
  if (next.prod < building.cost) return { ok: false, reason: 'not-enough-production', city: next };
  next.prod -= building.cost;
  next.buildings.push(key);
  return { ok: true, city: next };
}

export function getFoodRequired(city) {
  return 8 * Math.max(1, city.pop);
}

function getWorkedTiles(city, map, terrainYield) {
  const center = getTile(city.x, city.y, map, terrainYield);
  if (!center) return [];
  const candidates = [];
  for (let y = city.y - 1; y <= city.y + 1; y++) {
    for (let x = city.x - 1; x <= city.x + 1; x++) {
      if (x === city.x && y === city.y) continue;
      const tile = getTile(x, y, map, terrainYield);
      if (tile && tile.terrain !== 'water') candidates.push(tile);
    }
  }
  candidates.sort((a, b) => tileScore(b) - tileScore(a));
  return [center, ...candidates.slice(0, Math.max(0, city.pop))];
}

function getTile(x, y, map, terrainYield) {
  if (!map[y]?.[x]) return null;
  const terrain = map[y][x];
  return { x, y, terrain, yields: { ...terrainYield[terrain] } };
}

function tileScore(tile) {
  return tile.yields.prod * 2 + tile.yields.food + tile.yields.sci;
}

function sumYields(rows) {
  return rows.reduce((sum, yields) => addYields(sum, yields), { food: 0, prod: 0, sci: 0 });
}

function addYields(a, b) {
  return {
    food: a.food + b.food,
    prod: a.prod + b.prod,
    sci: a.sci + b.sci,
  };
}

function getBuildingYields(city) {
  return city.buildings.reduce((sum, key) => addYields(sum, CITY_BUILDINGS[key]?.yields || { food: 0, prod: 0, sci: 0 }), {
    food: 0,
    prod: 0,
    sci: 0,
  });
}

function calculateHappiness(city, empireCityCount) {
  const buildingAmenities = city.buildings.reduce((sum, key) => sum + (CITY_BUILDINGS[key]?.amenities || 0), 0);
  const populationPressure = Math.max(0, city.pop - 3);
  const expansionPressure = Math.max(0, empireCityCount - 2);
  return 3 + city.amenities + buildingAmenities - populationPressure - expansionPressure;
}

function applyPenalty(yields, penalty) {
  if (penalty <= 0) return yields;
  return {
    food: Math.max(0, Math.floor(yields.food * (1 - penalty))),
    prod: Math.max(0, Math.floor(yields.prod * (1 - penalty))),
    sci: Math.max(0, Math.floor(yields.sci * (1 - penalty))),
  };
}
