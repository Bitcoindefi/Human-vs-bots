import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyEventChoice,
  buildRandomEvent,
  createBarbarianUnit,
  planBarbarianCamps,
  shouldSpawnFromCamp,
} from './barbarian-model.js';

const map = [
  ['plains', 'forest', 'hill', 'plains', 'desert', 'plains'],
  ['plains', 'water', 'plains', 'forest', 'hill', 'plains'],
  ['hill', 'plains', 'desert', 'plains', 'forest', 'plains'],
  ['plains', 'forest', 'plains', 'hill', 'plains', 'desert'],
  ['desert', 'plains', 'hill', 'plains', 'water', 'plains'],
  ['plains', 'hill', 'forest', 'plains', 'desert', 'plains'],
];

test('places deterministic barbarian camps on valid land away from capitals', () => {
  const first = planBarbarianCamps({
    map,
    seed: 'barbarians-21',
    count: 3,
    safeZones: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
  });
  const again = planBarbarianCamps({
    map,
    seed: 'barbarians-21',
    count: 3,
    safeZones: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
  });

  assert.deepEqual(first, again);
  assert.equal(first.length, 3);
  for (const camp of first) {
    assert.notEqual(map[camp.y][camp.x], 'water');
    assert.ok(Math.abs(camp.x - 0) + Math.abs(camp.y - 0) > 3);
    assert.ok(Math.abs(camp.x - 5) + Math.abs(camp.y - 5) > 3);
    assert.match(camp.name, /^Camp /);
  }
});

test('creates reproducible hostile units and throttles camp spawns by cadence', () => {
  const camp = { id: 'camp-1', x: 3, y: 2, lastSpawnTurn: 1 };

  assert.equal(shouldSpawnFromCamp(camp, 2, 3), false);
  assert.equal(shouldSpawnFromCamp(camp, 4, 3), true);

  const unit = createBarbarianUnit(camp, 12, 5);
  assert.deepEqual(unit, {
    id: 12,
    owner: 'barbarian',
    x: 3,
    y: 2,
    hp: 70,
    atk: 22,
    def: 10,
    mov: 1,
    movLeft: 1,
    type: 'raider',
    campId: 'camp-1',
    spawnedTurn: 5,
  });
});

test('selects deterministic random events only on event turns', () => {
  assert.equal(buildRandomEvent({ seed: 'events', turn: 3 }), null);

  const event = buildRandomEvent({ seed: 'events', turn: 4 });
  const again = buildRandomEvent({ seed: 'events', turn: 4 });

  assert.deepEqual(event, again);
  assert.ok(event.id);
  assert.equal(event.turn, 4);
  assert.ok(event.choices.length >= 2);
  assert.ok(event.choices.every(choice => choice.id && choice.label));
});

test('applies event choices without mutating the original empire snapshot', () => {
  const empire = {
    food: 2,
    prod: 3,
    science: 1,
    cityFood: 4,
    cityProd: 5,
  };
  const event = {
    id: 'ancient_ruins',
    choices: [
      { id: 'study', effects: { science: 5, cityProd: 1 } },
      { id: 'salvage', effects: { prod: 4 } },
    ],
  };

  const result = applyEventChoice(empire, event, 'study');

  assert.deepEqual(empire, {
    food: 2,
    prod: 3,
    science: 1,
    cityFood: 4,
    cityProd: 5,
  });
  assert.deepEqual(result, {
    food: 2,
    prod: 3,
    science: 6,
    cityFood: 4,
    cityProd: 6,
  });
});
