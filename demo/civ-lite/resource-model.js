export const RESOURCE_DEFS = {
  iron: {
    key: 'iron',
    name: 'Iron',
    category: 'strategic',
    terrains: ['hill', 'desert'],
    yield: { food: 0, prod: 2, sci: 0 },
    marker: '#b7c0c7',
  },
  horses: {
    key: 'horses',
    name: 'Horses',
    category: 'strategic',
    terrains: ['plains', 'forest'],
    yield: { food: 1, prod: 1, sci: 0 },
    marker: '#c58b4a',
  },
  gems: {
    key: 'gems',
    name: 'Gems',
    category: 'luxury',
    terrains: ['hill', 'desert'],
    yield: { food: 0, prod: 0, sci: 2 },
    marker: '#c084fc',
  },
  spices: {
    key: 'spices',
    name: 'Spices',
    category: 'luxury',
    terrains: ['plains', 'forest', 'desert'],
    yield: { food: 1, prod: 0, sci: 1 },
    marker: '#f59e0b',
  },
};

const DEFAULT_TARGET_COUNT = 16;

export function generateResourceMap({ map, cities, width, height, targetCount = DEFAULT_TARGET_COUNT }) {
  const resources = [];
  const occupied = new Set(cities.map(city => keyFor(city.x, city.y)));
  const addResource = createResourceAdder({ map, width, height, occupied, resources });
  placeCapitalRingResources({ map, cities, width, height, occupied, addResource });
  scatterResources({ map, width, height, occupied, resources, addResource, targetCount });
  return resources;
}

export function resourceAt(resources, x, y) {
  return resources.find(resource => resource.x === x && resource.y === y) ?? null;
}

export function collectEmpireResources({ owner, cities, map, resources, terrainYield, radius = 1 }) {
  const controlled = [];
  const seen = new Set();
  const cityYields = cities
    .filter(city => city.owner === owner)
    .map(city => collectCityResources({ city, map, resources, terrainYield, radius, controlled, seen }));
  const totals = cityYields.reduce((acc, entry) => addYield(acc, entry.yields), emptyYield());

  return {
    owner,
    yields: totals,
    cityYields,
    controlled,
    stock: stockByResource(controlled),
    categories: {
      strategic: controlled.filter(resource => resource.category === 'strategic'),
      luxury: controlled.filter(resource => resource.category === 'luxury'),
    },
  };
}

function createResourceAdder({ map, width, height, occupied, resources }) {
  return (defKey, x, y, source = 'scatter') => {
    const def = RESOURCE_DEFS[defKey];
    if (!def || !canPlaceResource({ map, width, height, occupied, def, x, y })) return false;
    resources.push(makeResource(def, x, y, resources.length + 1, source));
    occupied.add(keyFor(x, y));
    return true;
  };
}

function makeResource(def, x, y, index, source) {
  return {
    id: `${def.key}-${index}`,
    key: def.key,
    name: def.name,
    category: def.category,
    x,
    y,
    yield: { ...def.yield },
    marker: def.marker,
    source,
  };
}

function placeCapitalRingResources({ map, cities, width, height, occupied, addResource }) {
  for (const city of cities) {
    placeNearCity({
      map,
      width,
      height,
      city,
      defKey: city.owner === 'player' ? 'iron' : 'horses',
      occupied,
      addResource,
    });
    placeNearCity({
      map,
      width,
      height,
      city,
      defKey: city.owner === 'player' ? 'gems' : 'spices',
      occupied,
      addResource,
    });
  }
}

function scatterResources({ map, width, height, occupied, resources, addResource, targetCount }) {
  const resourceKeys = Object.keys(RESOURCE_DEFS);
  for (const candidate of resourceCandidates({ map, width, height, occupied })) {
    if (resources.length >= targetCount) break;
    addFirstCompatibleResource({ candidate, resourceKeys, addResource });
  }
}

function resourceCandidates({ map, width, height, occupied }) {
  const candidates = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isResourceCandidate(map, occupied, x, y)) continue;
      candidates.push({ x, y, score: hashResource(x, y, width, height) });
    }
  }
  return candidates.sort((a, b) => a.score - b.score);
}

function addFirstCompatibleResource({ candidate, resourceKeys, addResource }) {
  const start = candidate.score % resourceKeys.length;
  for (let i = 0; i < resourceKeys.length; i++) {
    if (addResource(resourceKeys[(start + i) % resourceKeys.length], candidate.x, candidate.y)) return;
  }
}

function isResourceCandidate(map, occupied, x, y) {
  return !occupied.has(keyFor(x, y)) && map[y][x] !== 'water';
}

function collectCityResources({ city, map, resources, terrainYield, radius, controlled, seen }) {
  const yields = emptyYield();
  forEachCityTile(city, radius, ({ x, y }) => {
    if (!map[y]?.[x]) return;
    addYield(yields, terrainYield[map[y][x]] ?? emptyYield());
    const resource = resourceAt(resources, x, y);
    if (resource) trackControlledResource({ resource, yields, controlled, seen });
  });
  return { city, yields };
}

function forEachCityTile(city, radius, visit) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      visit({ x: city.x + dx, y: city.y + dy });
    }
  }
}

function trackControlledResource({ resource, yields, controlled, seen }) {
  addYield(yields, resource.yield);
  if (seen.has(resource.id)) return;
  controlled.push(resource);
  seen.add(resource.id);
}

function stockByResource(resources) {
  const stock = {};
  for (const resource of resources) {
    stock[resource.key] = (stock[resource.key] ?? 0) + 1;
  }
  return stock;
}

export function createTradeRoute({ playerState, botState, turn }) {
  const exportResource = firstTradable(playerState, botState);
  const importResource = firstTradable(botState, playerState);
  if (!exportResource || !importResource) return null;

  const exportBonus = exportResource.category === 'luxury' ? { food: 1, prod: 0, sci: 2 } : { food: 0, prod: 2, sci: 0 };
  const importBonus = importResource.category === 'luxury' ? { food: 1, prod: 0, sci: 2 } : { food: 0, prod: 2, sci: 0 };
  const playerYield = addYield(addYield(emptyYield(), exportBonus), importBonus);

  return {
    id: `trade-${turn}-${exportResource.key}-${importResource.key}`,
    from: 'player',
    to: 'bot',
    exportKey: exportResource.key,
    importKey: importResource.key,
    exportResource: exportResource.name,
    importResource: importResource.name,
    turnsLeft: 3,
    playerYield,
    botYield: { food: 1, prod: 1, sci: 1 },
  };
}

export function activeTradeYield(routes, owner) {
  const totals = emptyYield();
  const field = owner === 'player' ? 'playerYield' : 'botYield';
  for (const route of routes) {
    if (route.turnsLeft > 0) addYield(totals, route[field] ?? emptyYield());
  }
  return totals;
}

export function advanceTradeRoutes(routes) {
  return routes
    .map(route => ({ ...route, turnsLeft: route.turnsLeft - 1 }))
    .filter(route => route.turnsLeft > 0);
}

export function summarizeResourceList(resources) {
  if (resources.length === 0) return 'None controlled';
  return resources.map(resource => `${resource.name} +${formatYield(resource.yield)}`).join(', ');
}

export function formatYield(yieldValue) {
  const parts = [];
  if (yieldValue.food) parts.push(`${yieldValue.food}F`);
  if (yieldValue.prod) parts.push(`${yieldValue.prod}P`);
  if (yieldValue.sci) parts.push(`${yieldValue.sci}S`);
  return parts.length ? parts.join(' ') : '0';
}

function placeNearCity({ map, width, height, city, defKey, occupied, addResource }) {
  const offsets = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, -1], [2, 0], [0, 2],
    [-2, 0], [0, -2], [2, 1], [-1, 2],
  ];
  const ranked = offsets
    .map(([dx, dy], idx) => ({ x: city.x + dx, y: city.y + dy, idx }))
    .filter(({ x, y }) => x >= 0 && x < width && y >= 0 && y < height && !occupied.has(keyFor(x, y)))
    .sort((a, b) => {
      const terrainA = map[a.y][a.x];
      const terrainB = map[b.y][b.x];
      const def = RESOURCE_DEFS[defKey];
      const scoreA = def.terrains.includes(terrainA) ? a.idx : a.idx + 100;
      const scoreB = def.terrains.includes(terrainB) ? b.idx : b.idx + 100;
      return scoreA - scoreB;
    });
  for (const tile of ranked) {
    if (addResource(defKey, tile.x, tile.y, 'capital-ring')) return;
  }
}

function canPlaceResource({ map, width, height, occupied, def, x, y }) {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  if (occupied.has(keyFor(x, y))) return false;
  return def.terrains.includes(map[y][x]);
}

function firstTradable(primaryState, otherState) {
  return primaryState.controlled.find(resource => (otherState.stock?.[resource.key] ?? 0) === 0) ?? null;
}

function addYield(target, source) {
  target.food += source.food ?? 0;
  target.prod += source.prod ?? 0;
  target.sci += source.sci ?? 0;
  return target;
}

function emptyYield() {
  return { food: 0, prod: 0, sci: 0 };
}

function keyFor(x, y) {
  return `${x},${y}`;
}

function hashResource(x, y, width, height) {
  return ((x + 11) * 73856093 ^ (y + 17) * 19349663 ^ width * 83492791 ^ height * 2654435761) >>> 0;
}
