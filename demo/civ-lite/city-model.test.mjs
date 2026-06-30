import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBuilding,
  calculateCityEconomy,
  CITY_BUILDINGS,
  createCity,
  progressCityTurn,
} from './city-model.js';

const terrainYield = {
  plains: { food: 2, prod: 1, sci: 0 },
  forest: { food: 1, prod: 2, sci: 0 },
  hill: { food: 0, prod: 2, sci: 1 },
  water: { food: 3, prod: 0, sci: 0 },
  desert: { food: 0, prod: 1, sci: 1 },
};

const map = [
  ['plains', 'forest', 'hill'],
  ['plains', 'plains', 'desert'],
  ['water', 'forest', 'hill'],
];

test('calculateCityEconomy works the city center plus best population tiles', () => {
  const city = createCity({ owner: 'player', x: 1, y: 1, name: 'Athens', pop: 2 });
  const economy = calculateCityEconomy(city, map, terrainYield, 1);

  assert.equal(economy.workedTiles.length, 3);
  assert.deepEqual(economy.baseYields, { food: 3, prod: 5, sci: 1 });
  assert.deepEqual(economy.totalYields, { food: 3, prod: 5, sci: 1 });
});

test('building effects improve city yields and defense', () => {
  const city = createCity({
    owner: 'player',
    x: 1,
    y: 1,
    name: 'Athens',
    pop: 1,
    buildings: ['granary', 'library', 'walls'],
  });
  const economy = calculateCityEconomy(city, map, terrainYield, 1);

  assert.deepEqual(economy.buildingYields, { food: 2, prod: 1, sci: 2 });
  assert.equal(economy.defenseBonus, CITY_BUILDINGS.walls.defense);
  assert.deepEqual(economy.totalYields, { food: 5, prod: 4, sci: 2 });
});

test('happiness accounts for population pressure, expansion, and amenities', () => {
  const strained = createCity({
    owner: 'player',
    x: 1,
    y: 1,
    name: 'Athens',
    pop: 6,
    amenities: 0,
  });
  const supported = createCity({
    owner: 'player',
    x: 1,
    y: 1,
    name: 'Athens',
    pop: 6,
    amenities: 2,
    buildings: ['market'],
  });

  assert.equal(calculateCityEconomy(strained, map, terrainYield, 4).happiness, -2);
  assert.equal(calculateCityEconomy(supported, map, terrainYield, 4).happiness, 1);
});

test('progressCityTurn accumulates food and grows when food reaches threshold', () => {
  const city = createCity({ owner: 'player', x: 1, y: 1, name: 'Athens', pop: 1, food: 5, prod: 0 });
  const economy = calculateCityEconomy(city, map, terrainYield, 1);
  const next = progressCityTurn(city, economy);

  assert.equal(next.pop, 2);
  assert.equal(next.food, 0);
  assert.equal(next.prod, 3);
});

test('buildBuilding spends production and prevents duplicate buildings', () => {
  const city = createCity({ owner: 'player', x: 1, y: 1, name: 'Athens', prod: 12 });
  const built = buildBuilding(city, 'granary');
  const duplicate = buildBuilding(built.city, 'granary');

  assert.equal(built.ok, true);
  assert.deepEqual(built.city.buildings, ['granary']);
  assert.equal(built.city.prod, 0);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'already-built');
});
