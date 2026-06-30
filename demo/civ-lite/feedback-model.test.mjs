import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advanceFeedback,
  createCombatFeedback,
  createFloatingText,
  createScreenShake,
} from './feedback-model.js';

test('createFloatingText builds a short-lived world-space damage label', () => {
  const text = createFloatingText({ x: 120, y: 80, text: '-24', kind: 'damage' });

  assert.equal(text.text, '-24');
  assert.equal(text.x, 120);
  assert.equal(text.y, 80);
  assert.equal(text.kind, 'damage');
  assert.equal(text.life, text.maxLife);
  assert.ok(text.vy < 0);
});

test('createCombatFeedback emits damage text, hit particles, and shake', () => {
  const feedback = createCombatFeedback({ x: 96, y: 144, damage: 18, destroyed: false });

  assert.equal(feedback.texts.length, 1);
  assert.equal(feedback.texts[0].text, '-18');
  assert.equal(feedback.particleCount, 14);
  assert.deepEqual(feedback.shake, createScreenShake(5, 0.18));
});

test('destroyed combat feedback is stronger and labels the defeat', () => {
  const feedback = createCombatFeedback({ x: 96, y: 144, damage: 31, destroyed: true });

  assert.equal(feedback.texts.length, 2);
  assert.equal(feedback.texts[1].text, 'KO');
  assert.equal(feedback.particleCount, 26);
  assert.deepEqual(feedback.shake, createScreenShake(9, 0.26));
});

test('advanceFeedback moves labels upward and expires old entries', () => {
  const current = {
    texts: [
      createFloatingText({ x: 0, y: 20, text: '-5', kind: 'damage' }),
      { ...createFloatingText({ x: 0, y: 40, text: 'old', kind: 'ko' }), life: 0.05 },
    ],
    shake: createScreenShake(6, 0.2),
  };
  const next = advanceFeedback(current, 0.1);

  assert.equal(next.texts.length, 1);
  assert.ok(next.texts[0].y < 20);
  assert.ok(next.texts[0].life < next.texts[0].maxLife);
  assert.equal(next.shake.time, 0.1);
  assert.equal(next.shake.intensity, 3);
});
