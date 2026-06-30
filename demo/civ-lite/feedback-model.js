const FLOATING_TEXT_LIFE = 0.9;
const FLOATING_TEXT_SPEED = -32;

const TEXT_COLORS = {
  damage: '#ffcf5a',
  ko: '#ff5a73',
  capture: '#69f0ae',
};

export function createFloatingText({ x, y, text, kind = 'damage' }) {
  return {
    x,
    y,
    text,
    kind,
    color: TEXT_COLORS[kind] || '#ffffff',
    life: FLOATING_TEXT_LIFE,
    maxLife: FLOATING_TEXT_LIFE,
    vy: FLOATING_TEXT_SPEED,
  };
}

export function createScreenShake(intensity, duration) {
  return {
    baseIntensity: intensity,
    intensity,
    duration,
    time: duration,
  };
}

export function createCombatFeedback({ x, y, damage, destroyed = false }) {
  const hitDamage = Math.max(0, Math.round(damage));
  const texts = [
    createFloatingText({ x, y: y - 12, text: `-${hitDamage}`, kind: 'damage' }),
  ];

  if (destroyed) {
    texts.push(createFloatingText({ x, y: y - 28, text: 'KO', kind: 'ko' }));
  }

  return {
    texts,
    particleCount: destroyed ? 26 : 14,
    shake: destroyed ? createScreenShake(9, 0.26) : createScreenShake(5, 0.18),
  };
}

export function advanceFeedback(current, dt) {
  const texts = current.texts
    .map(text => ({
      ...text,
      y: text.y + text.vy * dt,
      life: Math.max(0, Number((text.life - dt).toFixed(3))),
    }))
    .filter(text => text.life > 0);

  const shake = advanceShake(current.shake, dt);

  return { texts, shake };
}

function advanceShake(shake, dt) {
  if (!shake || shake.time <= 0 || shake.duration <= 0) {
    return createScreenShake(0, 0);
  }

  const time = Math.max(0, Number((shake.time - dt).toFixed(3)));
  const progress = shake.duration > 0 ? time / shake.duration : 0;
  return {
    ...shake,
    time,
    intensity: Number((shake.baseIntensity * progress).toFixed(3)),
  };
}
