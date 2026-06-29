import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProductionQueue,
  enqueueProduction,
  progressProductionQueue,
  movementPlanForPath,
  evaluateVictory,
} from './production-model.js';

test('production queue completes the front item and carries overflow into the next item', () => {
  const queue = createProductionQueue([
    { id: 'warrior', label: 'Warrior', cost: 12, unitType: 'warrior' },
    { id: 'scout', label: 'Scout', cost: 8, unitType: 'scout' },
  ]);

  const updatedQueue = enqueueProduction(queue, 'warrior');
  enqueueProduction(updatedQueue, 'scout');

  const result = progressProductionQueue(updatedQueue, 15);

  assert.equal(result.completed.length, 1);
  assert.equal(result.completed[0].id, 'warrior');
  assert.equal(result.queue.items[0].id, 'scout');
  assert.equal(result.queue.progress, 3);
});

test('movement plan spends terrain costs without entering blocked or unaffordable tiles', () => {
  const path = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 1 },
  ];
  const costs = new Map([
    ['2,1', 1],
    ['3,1', 2],
    ['4,1', 1],
  ]);
  const occupied = new Set(['4,1']);

  const plan = movementPlanForPath(path, {
    movementLeft: 3,
    costForTile: tile => costs.get(`${tile.x},${tile.y}`),
    isBlocked: tile => occupied.has(`${tile.x},${tile.y}`),
  });

  assert.deepEqual(plan.steps, [{ x: 2, y: 1 }, { x: 3, y: 1 }]);
  assert.equal(plan.movementLeft, 0);
  assert.equal(plan.stopReason, 'blocked');
});

test('victory evaluation reports conquest and domination states', () => {
  assert.deepEqual(
    evaluateVictory({
      units: [{ owner: 'player' }],
      cities: [{ owner: 'player' }],
    }),
    { phase: 'gameover', winner: 'player', reason: 'conquest' },
  );

  assert.deepEqual(
    evaluateVictory({
      units: [{ owner: 'bot' }],
      cities: [{ owner: 'bot' }],
    }),
    { phase: 'gameover', winner: 'bot', reason: 'conquest' },
  );

  assert.deepEqual(
    evaluateVictory({
      units: [{ owner: 'player' }, { owner: 'bot' }],
      cities: [{ owner: 'player' }],
    }),
    { phase: 'gameover', winner: 'player', reason: 'domination' },
  );

  assert.deepEqual(
    evaluateVictory({
      units: [{ owner: 'player' }, { owner: 'bot' }],
      cities: [{ owner: 'bot' }],
    }),
    { phase: 'gameover', winner: 'bot', reason: 'domination' },
  );

  assert.deepEqual(
    evaluateVictory({
      units: [{ owner: 'player' }, { owner: 'bot' }],
      cities: [{ owner: 'player' }, { owner: 'bot' }],
    }),
    { phase: 'active', winner: null, reason: null },
  );
});
