import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createUxState,
  describeOutcome,
  startGame,
  toggleTutorial,
  updateOutcome,
} from './ux-model.js';

test('createUxState starts in the main menu with tutorial hidden', () => {
  const state = createUxState();

  assert.equal(state.screen, 'menu');
  assert.equal(state.tutorialOpen, false);
  assert.equal(state.outcome, null);
});

test('startGame moves from menu to active play and preserves tutorial choice', () => {
  const state = toggleTutorial(createUxState(), true);
  const next = startGame(state);

  assert.equal(next.screen, 'playing');
  assert.equal(next.tutorialOpen, true);
  assert.equal(next.outcome, null);
});

test('toggleTutorial can explicitly open and close the tutorial', () => {
  const opened = toggleTutorial(createUxState(), true);
  const closed = toggleTutorial(opened, false);
  const toggled = toggleTutorial(closed);

  assert.equal(opened.tutorialOpen, true);
  assert.equal(closed.tutorialOpen, false);
  assert.equal(toggled.tutorialOpen, true);
});

test('updateOutcome records a victory or defeat end screen state', () => {
  const victory = updateOutcome(createUxState(), 'victory', 8);
  const defeat = updateOutcome(createUxState(), 'defeat', 5);

  assert.deepEqual(victory, {
    screen: 'gameover',
    tutorialOpen: false,
    outcome: { result: 'victory', turn: 8 },
  });
  assert.equal(describeOutcome(victory), 'Victory on turn 8');
  assert.equal(describeOutcome(defeat), 'Defeat on turn 5');
});
