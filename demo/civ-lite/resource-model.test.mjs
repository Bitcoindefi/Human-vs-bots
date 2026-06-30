import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeTradeYield,
  advanceTradeRoutes,
  collectEmpireResources,
  createTradeRoute,
  generateResourceMap,
  resourceAt,
} from './resource-model.js';

const terrainYield = {
  plains: { food: 2, prod: 1, sci: 0 },
  forest: { food: 1, prod: 2, sci: 0 },
  hill: { food: 0, prod: 2, sci: 1 },
  water: { food: 3, prod: 0, sci: 0 },
  desert: { food: 0, prod: 1, sci: 1 },
};

function makeMap(width = 8, height = 6) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      if (x === 0 || y === 0) return 'water';
      if ((x + y) % 5 === 0) return 'hill';
      if ((x + y) % 4 === 0) return 'forest';
      if ((x + y) % 3 === 0) return 'desert';
      return 'plains';
    }),
  );
}

test('generateResourceMap places deterministic strategic and luxury resources on valid non-city tiles', () => {
  const map = makeMap();
  const cities = [
    { owner: 'player', x: 2, y: 2, name: 'Athens' },
    { owner: 'bot', x: 6, y: 4, name: 'Babylon' },
  ];

  const resourcesA = generateResourceMap({ map, cities, width: 8, height: 6 });
  const resourcesB = generateResourceMap({ map, cities, width: 8, height: 6 });

  assert.deepEqual(resourcesA, resourcesB);
  assert.ok(resourcesA.some(resource => resource.category === 'strategic'));
  assert.ok(resourcesA.some(resource => resource.category === 'luxury'));

  const cityKeys = new Set(cities.map(city => `${city.x},${city.y}`));
  for (const resource of resourcesA) {
    assert.notEqual(map[resource.y][resource.x], 'water');
    assert.equal(cityKeys.has(`${resource.x},${resource.y}`), false);
    assert.ok(resource.yield.food >= 0);
    assert.ok(resource.yield.prod >= 0);
    assert.ok(resource.yield.sci >= 0);
  }
});

test('collectEmpireResources adds controlled resource yields and stock counts', () => {
  const map = makeMap();
  const cities = [{ owner: 'player', x: 2, y: 2, name: 'Athens' }];
  const resources = [
    { id: 'iron-1', key: 'iron', name: 'Iron', category: 'strategic', x: 3, y: 2, yield: { food: 0, prod: 2, sci: 0 } },
    { id: 'gems-1', key: 'gems', name: 'Gems', category: 'luxury', x: 1, y: 2, yield: { food: 0, prod: 0, sci: 2 } },
    { id: 'spices-1', key: 'spices', name: 'Spices', category: 'luxury', x: 6, y: 5, yield: { food: 1, prod: 0, sci: 1 } },
  ];

  const collected = collectEmpireResources({ owner: 'player', cities, map, resources, terrainYield });

  assert.equal(resourceAt(resources, 3, 2).name, 'Iron');
  assert.equal(collected.controlled.length, 2);
  assert.equal(collected.stock.iron, 1);
  assert.equal(collected.stock.gems, 1);
  assert.equal(collected.stock.spices ?? 0, 0);
  assert.ok(collected.yields.prod >= 2);
  assert.ok(collected.yields.sci >= 2);
  assert.equal(collected.categories.strategic.length, 1);
  assert.equal(collected.categories.luxury.length, 1);
});

test('createTradeRoute exchanges distinct controlled resources for recurring yield', () => {
  const playerState = {
    controlled: [{ key: 'gems', name: 'Gems', category: 'luxury' }],
    stock: { gems: 1 },
  };
  const botState = {
    controlled: [{ key: 'iron', name: 'Iron', category: 'strategic' }],
    stock: { iron: 1 },
  };

  const route = createTradeRoute({ playerState, botState, turn: 4 });

  assert.equal(route.from, 'player');
  assert.equal(route.to, 'bot');
  assert.equal(route.exportResource, 'Gems');
  assert.equal(route.importResource, 'Iron');
  assert.equal(route.turnsLeft, 3);
  assert.deepEqual(activeTradeYield([route], 'player'), { food: 1, prod: 2, sci: 2 });
});

test('advanceTradeRoutes expires completed trade routes', () => {
  const routes = [
    { id: 'a', turnsLeft: 2, playerYield: { food: 1, prod: 1, sci: 0 }, botYield: { food: 0, prod: 1, sci: 1 } },
    { id: 'b', turnsLeft: 1, playerYield: { food: 0, prod: 0, sci: 2 }, botYield: { food: 1, prod: 0, sci: 0 } },
  ];

  const next = advanceTradeRoutes(routes);

  assert.deepEqual(next, [
    { id: 'a', turnsLeft: 1, playerYield: { food: 1, prod: 1, sci: 0 }, botYield: { food: 0, prod: 1, sci: 1 } },
  ]);
});
