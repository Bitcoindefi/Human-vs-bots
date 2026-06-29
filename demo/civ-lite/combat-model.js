export const UNIT_TYPES = Object.freeze({
  warrior: {
    label: 'Warrior',
    family: 'swordsman',
    strength: 28,
    defense: 16,
    range: 1,
    counters: null,
  },
  swordsman: {
    label: 'Swordsman',
    family: 'swordsman',
    strength: 34,
    defense: 18,
    range: 1,
    counters: 'spearman',
  },
  spearman: {
    label: 'Spearman',
    family: 'spearman',
    strength: 29,
    defense: 20,
    range: 1,
    counters: 'cavalry',
  },
  cavalry: {
    label: 'Cavalry',
    family: 'cavalry',
    strength: 36,
    defense: 17,
    range: 1,
    counters: 'swordsman',
  },
  archer: {
    label: 'Archer',
    family: 'ranged',
    strength: 24,
    defense: 12,
    range: 2,
    counters: null,
  },
});

export const TERRAIN_COMBAT = Object.freeze({
  plains: { defense: 0, label: 'Open ground' },
  forest: { defense: 0.2, label: 'Forest cover' },
  hill: { defense: 0.3, label: 'Hill defense' },
  water: { defense: -0.2, label: 'Water exposure' },
  desert: { defense: -0.05, label: 'Desert exposure' },
});

const XP_TO_PROMOTE = 10;

export function getUnitProfile(unit) {
  return UNIT_TYPES[unit?.type] ?? UNIT_TYPES.warrior;
}

function terrainAt(map, x, y) {
  return map?.[y]?.[x] ?? 'plains';
}

function distance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function adjacent(a, b) {
  return distance(a, b) === 1;
}

function rounded(value) {
  return Math.max(0, Math.round(value));
}

function collectAdjacentSupport(unit, target, units, owner) {
  return units.filter(other =>
    other !== unit &&
    other !== target &&
    other.owner === owner &&
    other.hp > 0 &&
    adjacent(other, target)
  ).length;
}

function collectDefenderSupport(attacker, defender, units) {
  return units.filter(other =>
    other !== attacker &&
    other !== defender &&
    other.owner === defender.owner &&
    other.hp > 0 &&
    adjacent(other, defender)
  ).length;
}

function hasTypeAdvantage(attackerProfile, defenderProfile) {
  return attackerProfile.counters === defenderProfile.family;
}

export function calculateCombatPreview(attacker, defender, {
  map,
  units = [],
  crossesRiver = false,
} = {}) {
  const attackerProfile = getUnitProfile(attacker);
  const defenderProfile = getUnitProfile(defender);
  const attackDistance = distance(attacker, defender);
  const rangeKind = attackerProfile.range > 1 && attackDistance <= attackerProfile.range ? 'ranged' : 'melee';
  const inRange = attackDistance <= attackerProfile.range;
  const defenderTerrain = terrainAt(map, defender.x, defender.y);
  const terrain = TERRAIN_COMBAT[defenderTerrain] ?? TERRAIN_COMBAT.plains;
  const modifiers = [];

  let attackMultiplier = 1;
  let defenseMultiplier = 1 + terrain.defense;

  if (terrain.defense !== 0) {
    modifiers.push({ label: terrain.label, value: terrain.defense });
  }

  if (hasTypeAdvantage(attackerProfile, defenderProfile)) {
    attackMultiplier += 0.25;
    modifiers.push({ label: 'Type advantage', value: 0.25 });
  }

  if (hasTypeAdvantage(defenderProfile, attackerProfile)) {
    defenseMultiplier += 0.18;
    modifiers.push({ label: 'Defender type advantage', value: 0.18 });
  }

  if (crossesRiver && rangeKind === 'melee') {
    attackMultiplier -= 0.15;
    modifiers.push({ label: 'River crossing', value: -0.15 });
  }

  const flankers = collectAdjacentSupport(attacker, defender, units, attacker.owner);
  if (flankers > 0) {
    const value = Math.min(0.2, flankers * 0.1);
    attackMultiplier += value;
    modifiers.push({ label: 'Flanking', value });
  }

  const defenderSupport = collectDefenderSupport(attacker, defender, units);
  if (defenderSupport > 0) {
    const value = Math.min(0.16, defenderSupport * 0.08);
    defenseMultiplier += value;
    modifiers.push({ label: 'Defender support', value });
  }

  const attackerStrength = attacker.atk ?? attackerProfile.strength;
  const defenderDefense = defender.def ?? defenderProfile.defense;
  const defenderStrength = defender.atk ?? defenderProfile.strength;
  const attackerDefense = attacker.def ?? attackerProfile.defense;
  const levelBonus = 1 + ((attacker.level ?? 1) - 1) * 0.08;

  const effectiveAttack = attackerStrength * attackMultiplier * levelBonus;
  const effectiveDefense = defenderDefense * defenseMultiplier;
  const attackerDamage = inRange ? rounded(effectiveAttack * 0.85 - effectiveDefense * 0.28) : 0;

  let defenderDamage = 0;
  if (rangeKind === 'melee' && inRange) {
    defenderDamage = rounded(defenderStrength * 0.45 - attackerDefense * 0.16);
  }

  return {
    attackerDamage: Math.max(inRange ? 4 : 0, attackerDamage),
    defenderDamage,
    defenderTerrain,
    inRange,
    rangeKind,
    modifiers,
    attackerLabel: attackerProfile.label,
    defenderLabel: defenderProfile.label,
  };
}

export function applyCombatResult(attacker, defender, preview) {
  defender.hp = Math.max(0, defender.hp - preview.attackerDamage);
  if (preview.defenderDamage > 0) {
    attacker.hp = Math.max(0, attacker.hp - preview.defenderDamage);
  }

  const defenderDestroyed = defender.hp <= 0;
  const attackerDestroyed = attacker.hp <= 0;
  const xpGain = defenderDestroyed ? 4 : 2;
  attacker.xp = (attacker.xp ?? 0) + xpGain;

  let attackerPromoted = false;
  if (attacker.xp >= XP_TO_PROMOTE) {
    attacker.level = (attacker.level ?? 1) + 1;
    attacker.xp -= XP_TO_PROMOTE;
    attacker.atk = Math.round((attacker.atk ?? getUnitProfile(attacker).strength) * 1.08);
    attacker.def = Math.round((attacker.def ?? getUnitProfile(attacker).defense) * 1.06);
    attackerPromoted = true;
  }

  return {
    attackerDestroyed,
    defenderDestroyed,
    attackerPromoted,
    xpGain,
  };
}

export function formatCombatPreview(preview) {
  if (!preview.inRange) return 'Target out of range';
  const counter = preview.defenderDamage > 0 ? `, counter ${preview.defenderDamage}` : ', no counter';
  const modifierText = preview.modifiers.length
    ? ` (${preview.modifiers.map(mod => mod.label).join(', ')})`
    : '';
  return `${preview.attackerLabel} deals ${preview.attackerDamage}${counter}${modifierText}`;
}
