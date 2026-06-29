export const DEFAULT_PRODUCTION_OPTIONS = [
  { id: 'warrior', label: 'Warrior', cost: 12, unitType: 'warrior' },
  { id: 'scout', label: 'Scout', cost: 8, unitType: 'scout' },
];

export function createProductionQueue(options = DEFAULT_PRODUCTION_OPTIONS) {
  return {
    options: options.map(option => ({ ...option })),
    items: [],
    progress: 0,
  };
}

export function enqueueProduction(queue, itemId) {
  const option = queue.options.find(candidate => candidate.id === itemId);
  if (!option) throw new Error(`Unknown production item: ${itemId}`);
  queue.items.push({ ...option });
  return queue;
}

export function progressProductionQueue(queue, production) {
  let available = Math.max(0, production);
  const completed = [];
  let nextQueue = {
    options: queue.options.map(option => ({ ...option })),
    items: queue.items.map(item => ({ ...item })),
    progress: queue.progress,
  };

  while (available > 0 && nextQueue.items.length > 0) {
    const current = nextQueue.items[0];
    const remaining = current.cost - nextQueue.progress;
    if (available < remaining) {
      nextQueue.progress += available;
      available = 0;
    } else {
      available -= remaining;
      completed.push(current);
      nextQueue.items.shift();
      nextQueue.progress = 0;
    }
  }

  return { queue: nextQueue, completed };
}

export function movementPlanForPath(path, options) {
  const steps = [];
  let movementLeft = Math.max(0, options.movementLeft ?? 0);
  let stopReason = null;

  for (let i = 1; i < path.length; i++) {
    const tile = path[i];
    if (options.isBlocked?.(tile)) {
      stopReason = 'blocked';
      break;
    }

    const cost = options.costForTile(tile);
    if (!Number.isFinite(cost) || cost <= 0) {
      stopReason = 'impassable';
      break;
    }

    if (cost > movementLeft) {
      stopReason = 'movement';
      break;
    }

    steps.push({ ...tile });
    movementLeft -= cost;
  }

  return { steps, movementLeft, stopReason };
}

export function evaluateVictory(state) {
  const playerPieces = countOwnedPieces(state, 'player');
  const botPieces = countOwnedPieces(state, 'bot');
  const playerCities = state.cities.filter(city => city.owner === 'player').length;
  const botCities = state.cities.filter(city => city.owner === 'bot').length;

  if (botPieces === 0 && playerPieces > 0) {
    return { phase: 'gameover', winner: 'player', reason: 'conquest' };
  }

  if (playerPieces === 0 && botPieces > 0) {
    return { phase: 'gameover', winner: 'bot', reason: 'conquest' };
  }

  if (botCities === 0 && playerCities > 0) {
    return { phase: 'gameover', winner: 'player', reason: 'domination' };
  }

  if (playerCities === 0 && botCities > 0) {
    return { phase: 'gameover', winner: 'bot', reason: 'domination' };
  }

  return { phase: 'active', winner: null, reason: null };
}

function countOwnedPieces(state, owner) {
  const units = state.units.filter(unit => unit.owner === owner).length;
  const cities = state.cities.filter(city => city.owner === owner).length;
  return units + cities;
}
