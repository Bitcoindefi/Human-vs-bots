import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNIT_TYPES,
  applyCombatResult,
  calculateCombatPreview,
  getUnitProfile,
} from './combat-model.js';

const plainsMap = [
  ['plains', 'plains', 'plains', 'plains'],
  ['plains', 'forest', 'hill', 'plains'],
  ['plains', 'plains', 'plains', 'plains'],
];

test('defines tactical unit profiles for melee, spear, cavalry, and ranged units', () => {
  assert.equal(UNIT_TYPES.spearman.counters, 'cavalry');
  assert.equal(UNIT_TYPES.cavalry.counters, 'swordsman');
  assert.equal(UNIT_TYPES.swordsman.counters, 'spearman');
  assert.equal(UNIT_TYPES.archer.range, 2);
  assert.equal(getUnitProfile({ type: 'unknown' }).family, 'swordsman');
});

test('applies type advantage, terrain defense, and river attack penalties', () => {
  const attacker = { owner: 'player', type: 'spearman', x: 1, y: 0, hp: 100, xp: 0 };
  const defender = { owner: 'bot', type: 'cavalry', x: 2, y: 1, hp: 100, xp: 0 };

  const preview = calculateCombatPreview(attacker, defender, {
    map: plainsMap,
    units: [attacker, defender],
    crossesRiver: true,
  });

  assert.equal(preview.rangeKind, 'melee');
  assert.ok(preview.modifiers.some(mod => mod.label === 'Type advantage'));
  assert.ok(preview.modifiers.some(mod => mod.label === 'Hill defense'));
  assert.ok(preview.modifiers.some(mod => mod.label === 'River crossing'));
  assert.ok(preview.attackerDamage >= 20);
  assert.ok(preview.defenderDamage >= 10);
});

test('counts flanking and support from adjacent allies', () => {
  const attacker = { owner: 'player', type: 'swordsman', x: 1, y: 1, hp: 100, xp: 0 };
  const defender = { owner: 'bot', type: 'spearman', x: 2, y: 1, hp: 100, xp: 0 };
  const ally = { owner: 'player', type: 'warrior', x: 2, y: 2, hp: 100, xp: 0 };
  const defenderAlly = { owner: 'bot', type: 'warrior', x: 3, y: 1, hp: 100, xp: 0 };

  const preview = calculateCombatPreview(attacker, defender, {
    map: plainsMap,
    units: [attacker, defender, ally, defenderAlly],
  });

  assert.ok(preview.modifiers.some(mod => mod.label === 'Flanking'));
  assert.ok(preview.modifiers.some(mod => mod.label === 'Defender support'));
  assert.ok(preview.attackerDamage > preview.defenderDamage);
  assert.ok(preview.attackerDamage >= 30);
});

test('allows ranged attacks without melee counter damage when in range', () => {
  const attacker = { owner: 'player', type: 'archer', x: 0, y: 1, hp: 100, xp: 0 };
  const defender = { owner: 'bot', type: 'warrior', x: 2, y: 1, hp: 100, xp: 0 };

  const preview = calculateCombatPreview(attacker, defender, {
    map: plainsMap,
    units: [attacker, defender],
  });

  assert.equal(preview.rangeKind, 'ranged');
  assert.equal(preview.inRange, true);
  assert.equal(preview.defenderDamage, 0);
  assert.ok(preview.attackerDamage >= 15);
});

test('applies damage, xp, and promotion level from a preview result', () => {
  const attacker = { owner: 'player', type: 'swordsman', x: 1, y: 1, hp: 100, xp: 8, level: 1 };
  const defender = { owner: 'bot', type: 'spearman', x: 2, y: 1, hp: 20, xp: 0, level: 1 };
  const preview = calculateCombatPreview(attacker, defender, {
    map: plainsMap,
    units: [attacker, defender],
  });

  const result = applyCombatResult(attacker, defender, preview);

  assert.equal(defender.hp, 0);
  assert.ok(attacker.hp < 100);
  assert.equal(attacker.xp, 2);
  assert.equal(attacker.level, 2);
  assert.equal(result.defenderDestroyed, true);
  assert.equal(result.attackerPromoted, true);
});
