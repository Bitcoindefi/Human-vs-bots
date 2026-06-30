import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDiplomacy,
  createGameSetup,
  getPersonalityPlan,
  getRelation,
  normalizeGameSetup,
} from './setup-model.js';

test('normalizeGameSetup clamps map and civilization settings', () => {
  const setup = normalizeGameSetup({
    mapSize: 'huge',
    civCount: 9,
    difficulty: 'nightmare',
    seed: 'alpha-42',
    victories: { domination: true, territory: false, science: true },
  });

  assert.equal(setup.mapSize, 'standard');
  assert.equal(setup.civCount, 4);
  assert.equal(setup.difficulty, 'normal');
  assert.equal(setup.seed, 42);
  assert.deepEqual(setup.victories, { domination: true, territory: false, science: true });
});

test('createGameSetup creates a player plus distinct AI civilizations', () => {
  const setup = createGameSetup({ civCount: 4, mapSize: 'wide', seed: 77 });

  assert.equal(setup.map.width, 30);
  assert.equal(setup.map.height, 18);
  assert.deepEqual(setup.civs.map(civ => civ.id), ['player', 'bot1', 'bot2', 'bot3']);
  assert.deepEqual(setup.civs.slice(1).map(civ => civ.personality), [
    'aggressive',
    'expansive',
    'scientific',
  ]);
});

test('createDiplomacy keeps AI civilizations peaceful until provoked', () => {
  const setup = createGameSetup({ civCount: 4 });
  const diplomacy = createDiplomacy(setup.civs);

  assert.equal(getRelation(diplomacy, 'player', 'bot1').status, 'war');
  assert.equal(getRelation(diplomacy, 'bot1', 'bot2').status, 'peace');
  assert.equal(getRelation(diplomacy, 'bot2', 'bot3').provoked, false);
});

test('personality plans bias AI target selection differently', () => {
  assert.deepEqual(getPersonalityPlan('aggressive').targetOrder, ['unit', 'city']);
  assert.deepEqual(getPersonalityPlan('expansive').targetOrder, ['city', 'unit']);
  assert.equal(getPersonalityPlan('scientific').risk, 'low');
});
