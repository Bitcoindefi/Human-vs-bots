export function createUxState() {
  return {
    screen: 'menu',
    tutorialOpen: false,
    outcome: null,
  };
}

export function startGame(state) {
  return {
    ...state,
    screen: 'playing',
    outcome: null,
  };
}

export function toggleTutorial(state, forcedOpen = null) {
  return {
    ...state,
    tutorialOpen: forcedOpen ?? !state.tutorialOpen,
  };
}

export function updateOutcome(state, result, turn) {
  return {
    ...state,
    screen: 'gameover',
    tutorialOpen: false,
    outcome: { result, turn },
  };
}

export function describeOutcome(state) {
  if (!state.outcome) return '';
  const label = state.outcome.result === 'victory' ? 'Victory' : 'Defeat';
  return `${label} on turn ${state.outcome.turn}`;
}
