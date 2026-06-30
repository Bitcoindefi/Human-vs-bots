import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  RESOURCE_TYPES,
  TERRAIN_TYPES,
  TERRAIN_YIELDS,
  computeVisibility,
  createCivState,
  generateCivMap,
  summarizeEmpire,
} from './civ-model.js';
import { TERRAIN_FILES } from './sprites.js';

test('terrain model covers Civ biomes, resource overlays, and yields', () => {
  const requiredTerrain = [
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

  assert.deepEqual(TERRAIN_TYPES, requiredTerrain);
  assert.equal(RESOURCE_TYPES.wheat.yield.food, 1);
  assert.equal(RESOURCE_TYPES.gold.yield.gold, 2);

  for (const terrain of requiredTerrain) {
    assert.ok(TERRAIN_YIELDS[terrain], `${terrain} has yields`);
    assert.equal(typeof TERRAIN_YIELDS[terrain].food, 'number');
    assert.equal(typeof TERRAIN_YIELDS[terrain].prod, 'number');
    assert.equal(typeof TERRAIN_YIELDS[terrain].science, 'number');
    assert.equal(typeof TERRAIN_YIELDS[terrain].gold, 'number');
    assert.ok(TERRAIN_FILES[terrain]?.length >= 1, `${terrain} has sprite sources`);
  }
});

test('generated map has tile objects with plausible biome and resource variety', () => {
  const map = generateCivMap(32, 24, 17);
  const terrains = new Set(map.flat().map((tile) => tile.terrain));
  const resources = map.flat().filter((tile) => tile.resource);

  assert.equal(map.length, 24);
  assert.equal(map[0].length, 32);
  assert.ok(terrains.has('ocean'));
  assert.ok(terrains.has('coast'));
  assert.ok(terrains.has('grassland'));
  assert.ok(terrains.has('jungle'));
  assert.ok(terrains.has('tundra'));
  assert.ok(resources.length >= 10);
});

test('visibility model keeps hidden, explored, and visible fog states separate', () => {
  const previousFog = Array.from({ length: 5 }, () => Array(5).fill(0));
  previousFog[0][0] = 2;
  const fog = computeVisibility({
    width: 5,
    height: 5,
    previousFog,
    units: [{ owner: 'player', x: 2, y: 2, sight: 1 }],
    cities: [{ owner: 'player', x: 4, y: 4, sight: 1 }],
    owner: 'player',
  });

  assert.equal(fog[0][0], 1, 'previously visible tiles become explored');
  assert.equal(fog[2][2], 2, 'unit tile is visible');
  assert.equal(fog[4][4], 2, 'city tile is visible');
  assert.equal(fog[0][4], 0, 'unseen far tile remains hidden');
});

test('empire summary feeds the 4X HUD with totals and per-turn rates', () => {
  const state = createCivState({ width: 12, height: 8, seed: 3 });
  const summary = summarizeEmpire(state, 'player');

  assert.ok(summary.totals.food >= 0);
  assert.ok(summary.rates.food > 0);
  assert.ok(summary.rates.prod > 0);
  assert.ok(summary.rates.science >= 0);
  assert.ok(summary.rates.gold >= 0);
  assert.ok(summary.notifications.some((line) => line.includes('Turn')));
});

test('Civ HUD markup exposes resource rates, minimap, contextual panel, and turn log', () => {
  const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

  for (const id of [
    'foodRate',
    'prodRate',
    'scienceRate',
    'gold',
    'goldRate',
    'contextPanel',
    'turnState',
    'eventLog',
    'minimap',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
