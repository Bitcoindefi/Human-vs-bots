const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');
const HEX_SIZE = 34;
const SQRT3 = Math.sqrt(3);

const ASSET_BASE = '../civ-lite/assets/unciv/';
const TERRAIN_FILES = {
  plains: 'Grassland.png',
  forest: 'Forest.png',
  hill: 'Hill.png',
  water: 'Coast.png',
  desert: 'Desert.png',
};

const UNIT_DEFS = {
  warrior: { hp: 95, atk: 16, sprite: 'Warrior.png', label: 'W' },
  car: { hp: 130, atk: 23, sprite: 'Tank.png', label: 'C' },
  robot: { hp: 120, atk: 20, sprite: 'Infantry.png', label: 'R' },
};

const STRUCTURE_PRODUCTION = {
  barracks: ['warrior'],
  factory: ['car'],
  'tech-core': ['robot'],
};

const LLM_MODELS = {
  'claude-3-5-sonnet': { name: 'Claude 3.5 Sonnet', difficulty: 'Hard', atkMul: 1.08, hpMul: 1.05, style: 'balanced' },
  'claude-3-opus': { name: 'Claude 3 Opus', difficulty: 'Very Hard', atkMul: 1.14, hpMul: 1.1, style: 'aggressive' },
  'clawbot-v2': { name: 'Clawbot v2', difficulty: 'Medium', atkMul: 1.0, hpMul: 1.0, style: 'swarm' },
  'gpt-4o': { name: 'OpenAI GPT-4o', difficulty: 'Hard', atkMul: 1.1, hpMul: 1.04, style: 'balanced' },
  'gpt-4.1-mini': { name: 'OpenAI GPT-4.1 mini', difficulty: 'Medium', atkMul: 0.98, hpMul: 1.03, style: 'defensive' },
  'o1-mini': { name: 'OpenAI o1-mini', difficulty: 'Very Hard', atkMul: 1.12, hpMul: 1.08, style: 'aggressive' },
};

const ui = {
  panelDrawer: document.getElementById('panelDrawer'),
  btnTogglePanel: document.getElementById('btnTogglePanel'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomReset: document.getElementById('btnZoomReset'),
  walletState: document.getElementById('walletState'),
  humansCount: document.getElementById('humansCount'),
  botsCount: document.getElementById('botsCount'),
  turnCount: document.getElementById('turnCount'),
  phaseState: document.getElementById('phaseState'),
  proofCount: document.getElementById('proofCount'),
  matchState: document.getElementById('matchState'),
  selectedAI: document.getElementById('selectedAI'),
  selectedMode: document.getElementById('selectedMode'),
  selectedHumanModel: document.getElementById('selectedHumanModel'),
  selectedDifficulty: document.getElementById('selectedDifficulty'),
  humanTerritory: document.getElementById('humanTerritory'),
  botTerritory: document.getElementById('botTerritory'),
  aiSelect: document.getElementById('aiSelect'),
  modeSelect: document.getElementById('modeSelect'),
  llmHumanSelect: document.getElementById('llmHumanSelect'),
  difficultySelect: document.getElementById('difficultySelect'),
  buildingSelect: document.getElementById('buildingSelect'),
  produceSelect: document.getElementById('produceSelect'),
  resultBanner: document.getElementById('resultBanner'),
  log: document.getElementById('log'),
  btnConnect: document.getElementById('btnConnect'),
  btnStart: document.getElementById('btnStart'),
  btnEndTurn: document.getElementById('btnEndTurn'),
  btnProduce: document.getElementById('btnProduce'),
  btnConquer: document.getElementById('btnConquer'),
  btnProof: document.getElementById('btnProof'),
  btnExportProofs: document.getElementById('btnExportProofs'),
  btnEnd: document.getElementById('btnEnd'),
  btnReset: document.getElementById('btnReset'),
};

const state = {
  connected: false,
  inMatch: false,
  phase: 'player',
  turn: 0,
  matchMode: 'human-vs-llm',
  selectedAI: 'claude-3-5-sonnet',
  selectedHumanModel: 'claude-3-5-sonnet',
  selectedDifficulty: 'normal',
  mapCells: [],
  mapByKey: {},
  humansByPos: {},
  botsByPos: {},
  humans: [],
  bots: [],
  proofs: [],
  nextId: 1,
  selectedUnitId: null,
  captureMode: false,
  camera: {
    zoom: 1,
    minZoom: 0.75,
    maxZoom: 1.8,
  },
  structures: {
    human: {},
    bot: {},
  },
  assets: {
    terrains: {},
    units: {
      warrior: null,
      car: null,
      robot: null,
    },
    city: null,
    uiCrosshair: null,
  },
};

const StellarGameService = {
  async connectWallet() {
    await delay(350);
    return { address: 'GHUMANVSBOTSDEMO12345XYZ' };
  },
  async start_game(payload) {
    await delay(260);
    return { txHash: 'tx_start_' + Date.now(), payload };
  },
  async submit_zk_proof(payload) {
    await delay(420);
    return { proofId: 'proof_' + Math.floor(Math.random() * 99999), payload };
  },
  async end_game(result) {
    await delay(260);
    return { txHash: 'tx_end_' + Date.now(), result };
  },
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function key(q, r) { return `${q},${r}`; }

function getModelProfile(modelId) {
  return LLM_MODELS[modelId] || LLM_MODELS['claude-3-5-sonnet'];
}

function getOpponentProfile() {
  return getModelProfile(state.selectedAI);
}

function getHumanSideProfile() {
  if (state.matchMode !== 'llm-vs-llm') return null;
  return getModelProfile(state.selectedHumanModel);
}

function formatModelLabel(modelId) {
  const p = getModelProfile(modelId);
  return `${p.name} (${p.difficulty})`;
}

const HEX_DIRS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

function hexDistance(aq, ar, bq, br) {
  const as = -aq - ar;
  const bs = -bq - br;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(as - bs)) / 2;
}

function hexToPixel(q, r) {
  return {
    x: HEX_SIZE * SQRT3 * (q + r / 2) + 58,
    y: HEX_SIZE * 1.5 * r + 58,
  };
}

function noise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function getNeighbors(q, r) {
  return HEX_DIRS
    .map(([dq, dr]) => ({ q: q + dq, r: r + dr }))
    .filter(p => state.mapByKey[key(p.q, p.r)]);
}

function isPassable(q, r) {
  const cell = state.mapByKey[key(q, r)];
  return !!cell && cell.terrain !== 'water';
}

function isOccupied(q, r) {
  const pos = key(q, r);
  return !!state.humansByPos[pos] || !!state.botsByPos[pos];
}

function getCellUnit(q, r, kind) {
  const id = kind === 'human' ? state.humansByPos[key(q, r)] : state.botsByPos[key(q, r)];
  return id ? getUnitById(id) : null;
}

function applyCameraTransform() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const zoom = state.camera.zoom;
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-cx, -cy);
}

function screenToWorld(screenX, screenY) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const zoom = state.camera.zoom;
  return {
    x: (screenX - cx) / zoom + cx,
    y: (screenY - cy) / zoom + cy,
  };
}

function setZoom(nextZoom) {
  const z = Math.max(state.camera.minZoom, Math.min(state.camera.maxZoom, nextZoom));
  state.camera.zoom = z;
  if (ui.btnZoomReset) {
    ui.btnZoomReset.textContent = `${Math.round(z * 100)}%`;
  }
}

function pickCell(px, py) {
  let best = null;
  let bestDist = Infinity;
  for (const c of state.mapCells) {
    const d = Math.hypot(c.x - px, c.y - py);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return bestDist <= HEX_SIZE ? best : null;
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadAssets() {
  const terrainPromises = Object.entries(TERRAIN_FILES).map(async ([type, file]) => {
    state.assets.terrains[type] = await loadImage(ASSET_BASE + file);
  });

  const [warrior, car, robot, city, crosshair] = await Promise.all([
    loadImage(ASSET_BASE + 'units/' + UNIT_DEFS.warrior.sprite),
    loadImage(ASSET_BASE + 'units/' + UNIT_DEFS.car.sprite),
    loadImage(ASSET_BASE + 'units/' + UNIT_DEFS.robot.sprite),
    loadImage(ASSET_BASE + 'City_center-Modern_era.png'),
    loadImage(ASSET_BASE + 'Crosshair.png'),
    ...terrainPromises,
  ]);

  state.assets.units.warrior = warrior;
  state.assets.units.car = car;
  state.assets.units.robot = robot;
  state.assets.city = city;
  state.assets.uiCrosshair = crosshair;
}

function log(text, cls = '') {
  const row = document.createElement('div');
  row.className = cls;
  row.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  ui.log.prepend(row);
  while (ui.log.children.length > 90) ui.log.lastChild.remove();
}

function buildMap() {
  state.mapCells = [];
  state.mapByKey = {};
  const rows = 13;
  const cols = 18;
  const centerQ = (cols - 1) / 2;
  const centerR = (rows - 1) / 2;
  const qRadius = 7.1;
  const rRadius = 5.4;

  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const { x, y } = hexToPixel(q, r);
      if (x < 30 || y < 30 || x > canvas.width - 30 || y > canvas.height - 30) continue;

      const normQ = (q - centerQ) / qRadius;
      const normR = (r - centerR) / rRadius;
      const radial = Math.sqrt(normQ * normQ + normR * normR);
      const shorelineNoise = (noise(q * 0.83 + 10, r * 0.91 + 15) - 0.5) * 0.18;
      const islandShape = radial + shorelineNoise;
      const forceWaterRing = q <= 1 || q >= cols - 2 || r <= 0 || r >= rows - 1;

      let terrain;
      if (forceWaterRing || islandShape > 0.92) {
        terrain = 'water';
      } else {
        const n = noise(q + 31, r + 17);
        const elevation = 1 - islandShape;
        if (elevation > 0.44 && n > 0.82) terrain = 'hill';
        else if (n < 0.5) terrain = 'plains';
        else if (n < 0.82) terrain = 'forest';
        else terrain = 'desert';
      }

      let owner = 'neutral';
      if (terrain !== 'water') {
        if (q <= centerQ - 3) owner = 'human';
        else if (q >= centerQ + 3) owner = 'bot';
      }
      const cell = { q, r, x, y, terrain, owner };
      state.mapCells.push(cell);
      state.mapByKey[key(q, r)] = cell;
    }
  }
}

function nearestPassable(q, r, minQ, maxQ) {
  const candidatesInBand = state.mapCells
    .filter(c => c.q >= minQ && c.q <= maxQ && c.terrain !== 'water')
    .sort((a, b) => hexDistance(q, r, a.q, a.r) - hexDistance(q, r, b.q, b.r));
  if (candidatesInBand[0]) return candidatesInBand[0];

  const fallback = state.mapCells
    .filter(c => c.terrain !== 'water')
    .sort((a, b) => hexDistance(q, r, a.q, a.r) - hexDistance(q, r, b.q, b.r));
  return fallback[0] || null;
}

function placeStructures() {
  const hq = nearestPassable(2, 6, 0, 5);
  const barracks = nearestPassable(4, 4, 1, 7);
  const factory = nearestPassable(4, 8, 1, 8);
  const techCore = nearestPassable(14, 6, 11, 17);

  if (!hq || !barracks || !factory || !techCore) {
    return false;
  }

  state.structures.human = {
    hq: { id: 'hq', kind: 'human', type: 'hq', q: hq.q, r: hq.r, acted: false },
    barracks: { id: 'barracks', kind: 'human', type: 'barracks', q: barracks.q, r: barracks.r, acted: false },
    factory: { id: 'factory', kind: 'human', type: 'factory', q: factory.q, r: factory.r, acted: false },
  };

  state.structures.bot = {
    techCore: { id: 'tech-core', kind: 'bot', type: 'tech-core', q: techCore.q, r: techCore.r, acted: false },
  };

  state.mapByKey[key(hq.q, hq.r)].owner = 'human';
  state.mapByKey[key(barracks.q, barracks.r)].owner = 'human';
  state.mapByKey[key(factory.q, factory.r)].owner = 'human';
  state.mapByKey[key(techCore.q, techCore.r)].owner = 'bot';
  return true;
}

function initializeArenaWithRetries(maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    buildMap();
    if (!placeStructures()) continue;
    addInitialUnits();
    return true;
  }
  return false;
}

function placeUnit(unit, q, r) {
  unit.q = q;
  unit.r = r;
  if (unit.kind === 'human') state.humansByPos[key(q, r)] = unit.id;
  else state.botsByPos[key(q, r)] = unit.id;
}

function clearUnitPos(unit) {
  const pos = key(unit.q, unit.r);
  if (unit.kind === 'human') delete state.humansByPos[pos];
  else delete state.botsByPos[pos];
}

function moveUnit(unit, q, r) {
  clearUnitPos(unit);
  placeUnit(unit, q, r);
  unit.acted = true;
}

function getUnitById(id) {
  return state.humans.find(u => u.id === id) || state.bots.find(u => u.id === id);
}

function removeUnit(unit) {
  unit.alive = false;
  clearUnitPos(unit);
}

function createUnit(kind, unitType) {
  const def = UNIT_DEFS[unitType];
  const difficultyMul = state.selectedDifficulty === 'hard'
    ? (kind === 'bot' ? 1.12 : 0.95)
    : state.selectedDifficulty === 'easy'
      ? (kind === 'bot' ? 0.9 : 1.06)
      : 1;

  let modelAtkMul = 1;
  let modelHpMul = 1;
  if (kind === 'bot') {
    const profile = getOpponentProfile();
    modelAtkMul = profile.atkMul;
    modelHpMul = profile.hpMul;
  } else if (state.matchMode === 'llm-vs-llm') {
    const profile = getHumanSideProfile();
    modelAtkMul = profile?.atkMul ?? 1;
    modelHpMul = profile?.hpMul ?? 1;
  }

  return {
    id: state.nextId++,
    kind,
    unitType,
    q: 0,
    r: 0,
    hp: Math.round(def.hp * difficultyMul * modelHpMul),
    hpMax: Math.round(def.hp * difficultyMul * modelHpMul),
    atk: Math.max(6, Math.round(def.atk * difficultyMul * modelAtkMul)),
    acted: false,
    selected: false,
    alive: true,
  };
}

function availableSpawnHex(structure) {
  const options = getNeighbors(structure.q, structure.r)
    .filter(c => isPassable(c.q, c.r) && !isOccupied(c.q, c.r));
  return options[0] || null;
}

function addInitialUnits() {
  state.humans = [];
  state.bots = [];
  state.humansByPos = {};
  state.botsByPos = {};

  const humanStructures = [state.structures.human.barracks, state.structures.human.factory];
  const botStructure = state.structures.bot.techCore;

  const humanTemplate = ['warrior', 'warrior', 'car'];
  for (const unitType of humanTemplate) {
    const unit = createUnit('human', unitType);
    const source = unitType === 'car' ? state.structures.human.factory : state.structures.human.barracks;
    const spawn = availableSpawnHex(source) || availableSpawnHex(state.structures.human.hq);
    if (spawn) {
      placeUnit(unit, spawn.q, spawn.r);
      state.humans.push(unit);
    }
  }

  const botTemplate = ['robot', 'robot', 'robot'];
  for (const unitType of botTemplate) {
    const unit = createUnit('bot', unitType);
    const spawn = availableSpawnHex(botStructure);
    if (spawn) {
      placeUnit(unit, spawn.q, spawn.r);
      state.bots.push(unit);
    }
  }

  humanStructures.forEach(s => { s.acted = false; });
  state.structures.human.hq.acted = false;
  state.structures.bot.techCore.acted = false;
}

function getSelectedHuman() {
  if (!state.selectedUnitId) return null;
  const unit = getUnitById(state.selectedUnitId);
  if (!unit || !unit.alive || unit.kind !== 'human') return null;
  return unit;
}

function attack(attacker, defender) {
  const cell = state.mapByKey[key(defender.q, defender.r)];
  const terrainDef = cell?.terrain === 'forest' ? 1.14 : cell?.terrain === 'hill' ? 1.22 : 1;
  const dmg = Math.max(6, Math.round(attacker.atk / terrainDef));
  defender.hp -= dmg;
  attacker.acted = true;
  log(`${attacker.kind.toUpperCase()} ${attacker.unitType} hits ${defender.kind.toUpperCase()} ${defender.unitType} for ${dmg}`);
  if (defender.hp <= 0) {
    removeUnit(defender);
    log(`${defender.kind.toUpperCase()} ${defender.unitType} destroyed`, 'ok');
  }
}

function captureCell(unit, cell) {
  if (unit.acted) {
    log(`Unit ${unit.id} already used action this turn`, 'warn');
    return false;
  }
  if (!isPassable(cell.q, cell.r)) {
    log('Cannot conquer water tile', 'warn');
    return false;
  }
  if (hexDistance(unit.q, unit.r, cell.q, cell.r) !== 1) {
    log('Conquer target must be adjacent', 'warn');
    return false;
  }
  if (isOccupied(cell.q, cell.r) && !getCellUnit(cell.q, cell.r, 'human')) {
    log('Clear enemy unit first to conquer this tile', 'warn');
    return false;
  }
  if (cell.owner === 'human') {
    log('Tile already belongs to humans', 'warn');
    return false;
  }

  cell.owner = 'human';
  unit.acted = true;
  state.captureMode = false;
  log(`Tile ${cell.q},${cell.r} conquered by humans`, 'ok');
  return true;
}

function nearestEnemy(unit, enemies) {
  let best = null;
  let bestDist = Infinity;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const d = hexDistance(unit.q, unit.r, enemy.q, enemy.r);
    if (d < bestDist) {
      best = enemy;
      bestDist = d;
    }
  }
  return { target: best, dist: bestDist };
}

function chooseAiAction(unit, teamKind) {
  const enemyKind = teamKind === 'human' ? 'bot' : 'human';
  const ownOwner = teamKind;
  const enemies = (enemyKind === 'human' ? state.humans : state.bots).filter(u => u.alive);
  if (!enemies.length) return;

  const profile = teamKind === 'bot' ? getOpponentProfile() : (getHumanSideProfile() || getModelProfile('clawbot-v2'));
  const style = profile.style;

  const adjacentEnemy = getNeighbors(unit.q, unit.r)
    .map(c => getCellUnit(c.q, c.r, enemyKind))
    .find(Boolean);

  if (adjacentEnemy) {
    attack(unit, adjacentEnemy);
    return;
  }

  const conquerOption = getNeighbors(unit.q, unit.r)
    .map(c => state.mapByKey[key(c.q, c.r)])
    .find(c => c && c.terrain !== 'water' && c.owner !== ownOwner && !isOccupied(c.q, c.r));

  const shouldConquer = style === 'defensive' ? Math.random() < 0.7 : style === 'swarm' ? Math.random() < 0.55 : Math.random() < 0.4;
  if (conquerOption && shouldConquer) {
    conquerOption.owner = ownOwner;
    unit.acted = true;
    return;
  }

  const { target } = nearestEnemy(unit, enemies);
  if (!target) return;

  const options = getNeighbors(unit.q, unit.r)
    .filter(n => isPassable(n.q, n.r) && !isOccupied(n.q, n.r));
  if (!options.length) return;

  options.sort((a, b) => {
    const da = hexDistance(a.q, a.r, target.q, target.r);
    const db = hexDistance(b.q, b.r, target.q, target.r);
    if (style === 'defensive') return db - da;
    return da - db;
  });

  moveUnit(unit, options[0].q, options[0].r);
}

function countTerritory(owner) {
  return state.mapCells.filter(c => c.owner === owner).length;
}

function checkVictory() {
  const humansAlive = state.humans.some(u => u.alive);
  const botsAlive = state.bots.some(u => u.alive);
  const humanWinLabel = state.matchMode === 'llm-vs-llm' ? 'LLM A Wins' : 'Humans Win';
  const botWinLabel = state.matchMode === 'llm-vs-llm' ? 'Opponent LLM Wins' : 'Bots Win';

  if (!botsAlive) {
    finishMatch(humanWinLabel);
    return true;
  }
  if (!humansAlive) {
    finishMatch(botWinLabel);
    return true;
  }

  const total = state.mapCells.filter(c => c.terrain !== 'water').length;
  const humanLand = countTerritory('human');
  const botLand = countTerritory('bot');

  if (humanLand / total >= 0.65) {
    finishMatch(`${humanWinLabel} by Territory`);
    return true;
  }
  if (botLand / total >= 0.65) {
    finishMatch(`${botWinLabel} by Territory`);
    return true;
  }

  return false;
}

function updateProduceOptions() {
  const building = ui.buildingSelect.value;
  const allowed = STRUCTURE_PRODUCTION[building] || [];
  const prev = ui.produceSelect.value;
  ui.produceSelect.innerHTML = '';
  for (const option of allowed) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = option === 'warrior' ? 'Warrior' : option === 'car' ? 'Car' : 'Robot';
    ui.produceSelect.appendChild(node);
  }
  if (allowed.includes(prev)) ui.produceSelect.value = prev;
}

function produceHumanUnit() {
  if (state.matchMode !== 'human-vs-llm') {
    log('Manual production is available in Human vs LLM mode', 'warn');
    return;
  }
  if (!state.inMatch || state.phase !== 'player') {
    log('You can produce only during your turn', 'warn');
    return;
  }

  const buildingKey = ui.buildingSelect.value;
  const unitType = ui.produceSelect.value;
  const structure = state.structures.human[buildingKey];

  if (!structure) {
    log('Selected building is not available', 'err');
    return;
  }
  if (structure.acted) {
    log(`${structure.type} already produced this turn`, 'warn');
    return;
  }

  const allowed = STRUCTURE_PRODUCTION[structure.type] || [];
  if (!allowed.includes(unitType)) {
    log(`${structure.type} cannot produce ${unitType}`, 'warn');
    return;
  }

  const spawn = availableSpawnHex(structure);
  if (!spawn) {
    log(`No free adjacent hex near ${structure.type}`, 'warn');
    return;
  }

  const unit = createUnit('human', unitType);
  placeUnit(unit, spawn.q, spawn.r);
  state.humans.push(unit);
  structure.acted = true;
  state.mapByKey[key(spawn.q, spawn.r)].owner = 'human';
  log(`${structure.type} produced ${unitType}`, 'ok');
  syncUi();
}

function produceHumanAiUnit() {
  const barracks = state.structures.human.barracks;
  const factory = state.structures.human.factory;
  if (!barracks || !factory) return;

  const attempts = [
    { structure: barracks, unitType: 'warrior' },
    { structure: factory, unitType: 'car' },
  ];

  for (const attempt of attempts) {
    if (attempt.structure.acted) continue;
    const spawn = availableSpawnHex(attempt.structure);
    if (!spawn) continue;

    const unit = createUnit('human', attempt.unitType);
    placeUnit(unit, spawn.q, spawn.r);
    state.humans.push(unit);
    attempt.structure.acted = true;
    state.mapByKey[key(spawn.q, spawn.r)].owner = 'human';
    log(`LLM A produced ${attempt.unitType}`);
    return;
  }
}

function produceBotRobot(force = false) {
  const core = state.structures.bot.techCore;
  if (!core || core.acted) return;

  const profile = getOpponentProfile();
  const interval = profile.difficulty === 'Very Hard' ? 1 : profile.difficulty === 'Hard' ? 2 : 3;
  const shouldProduce = force || state.turn % interval === 0 || state.selectedDifficulty === 'hard';
  if (!shouldProduce) return;

  const spawn = availableSpawnHex(core);
  if (!spawn) return;

  const robot = createUnit('bot', 'robot');
  placeUnit(robot, spawn.q, spawn.r);
  state.bots.push(robot);
  core.acted = true;
  state.mapByKey[key(spawn.q, spawn.r)].owner = 'bot';
  log('Bot tech-core produced robot', 'warn');
}

function handlePlayerCellClick(cell) {
  if (state.matchMode !== 'human-vs-llm') return;
  if (!state.inMatch || state.phase !== 'player') return;

  const humanOnCell = getCellUnit(cell.q, cell.r, 'human');
  const botOnCell = getCellUnit(cell.q, cell.r, 'bot');

  if (humanOnCell) {
    if (humanOnCell.acted) {
      log(`Human ${humanOnCell.unitType} already acted`, 'warn');
      return;
    }
    state.humans.forEach(u => { u.selected = false; });
    humanOnCell.selected = true;
    state.selectedUnitId = humanOnCell.id;
    state.captureMode = false;
    log(`Selected human ${humanOnCell.unitType}`);
    syncUi();
    return;
  }

  const selected = getSelectedHuman();
  if (!selected || selected.acted) return;

  if (state.captureMode) {
    captureCell(selected, cell);
    checkVictory();
    syncUi();
    return;
  }

  const dist = hexDistance(selected.q, selected.r, cell.q, cell.r);
  if (dist !== 1) {
    log('Move/attack target must be adjacent', 'warn');
    return;
  }

  if (botOnCell) {
    attack(selected, botOnCell);
  } else if (!isOccupied(cell.q, cell.r) && isPassable(cell.q, cell.r)) {
    moveUnit(selected, cell.q, cell.r);
    if (state.mapByKey[key(cell.q, cell.r)].owner !== 'human') {
      state.mapByKey[key(cell.q, cell.r)].owner = 'human';
      log(`Tile ${cell.q},${cell.r} occupied for humans`, 'ok');
    } else {
      log(`Human ${selected.unitType} moved`);
    }
  }

  checkVictory();
  syncUi();
}

function buildProofSnapshot(tag = 'turn') {
  const payload = {
    tag,
    turn: state.turn,
    ai: state.selectedAI,
    difficulty: state.selectedDifficulty,
    humansAlive: state.humans.filter(u => u.alive).length,
    botsAlive: state.bots.filter(u => u.alive).length,
    humanTerritory: countTerritory('human'),
    botTerritory: countTerritory('bot'),
    timestamp: new Date().toISOString(),
    proofInputHash: btoa(`${state.turn}|${countTerritory('human')}|${countTerritory('bot')}|${state.selectedAI}`),
  };
  state.proofs.push(payload);
  return payload;
}

function endPlayerTurn() {
  if (!state.inMatch) return;

  if (state.matchMode === 'llm-vs-llm') {
    state.phase = 'simulation';
    state.captureMode = false;
    syncUi();

    produceHumanAiUnit();
    for (const unit of state.humans.filter(u => u.alive)) {
      chooseAiAction(unit, 'human');
      if (checkVictory()) return;
    }

    produceBotRobot();
    for (const bot of state.bots.filter(u => u.alive)) {
      chooseAiAction(bot, 'bot');
      if (checkVictory()) return;
    }

    for (const unit of state.humans) {
      unit.acted = false;
      unit.selected = false;
    }
    for (const unit of state.bots) unit.acted = false;
    Object.values(state.structures.human).forEach(structure => { structure.acted = false; });
    Object.values(state.structures.bot).forEach(structure => { structure.acted = false; });

    state.selectedUnitId = null;
    state.turn += 1;
    const proof = buildProofSnapshot('turn');
    log(`Round ${state.turn}: ${formatModelLabel(state.selectedHumanModel)} vs ${formatModelLabel(state.selectedAI)} • ${proof.proofInputHash.slice(0, 14)}...`, 'ok');
    syncUi();
    return;
  }

  if (state.phase !== 'player') return;

  state.phase = 'bot';
  state.captureMode = false;
  syncUi();
  log(`Opponent turn: ${formatModelLabel(state.selectedAI)}`);

  produceBotRobot();
  for (const bot of state.bots.filter(u => u.alive)) {
    chooseAiAction(bot, 'bot');
    if (checkVictory()) return;
  }

  for (const unit of state.humans) {
    unit.acted = false;
    unit.selected = false;
  }
  for (const unit of state.bots) unit.acted = false;

  Object.values(state.structures.human).forEach(structure => { structure.acted = false; });
  Object.values(state.structures.bot).forEach(structure => { structure.acted = false; });

  state.selectedUnitId = null;
  state.phase = 'player';
  state.turn += 1;

  const proof = buildProofSnapshot('turn');
  log(`Turn ${state.turn} closed. Proof: ${proof.proofInputHash.slice(0, 14)}...`, 'ok');
  syncUi();
}

function finishMatch(result) {
  if (!state.inMatch) return;
  state.inMatch = false;
  state.captureMode = false;
  ui.resultBanner.textContent = result;
  ui.resultBanner.classList.add('show');
  syncUi();
  log(`Match finished: ${result}`, 'ok');
}

function structureLabel(type) {
  if (type === 'hq') return 'HQ';
  if (type === 'barracks') return 'B';
  if (type === 'factory') return 'F';
  if (type === 'tech-core') return 'TC';
  return '?';
}

function drawHexCell(cell) {
  const { x, y, terrain } = cell;
  const sprite = state.assets.terrains[terrain];
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push({ x: x + HEX_SIZE * Math.cos(a), y: y + HEX_SIZE * Math.sin(a) });
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();

  if (sprite) {
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    const terrainSize = HEX_SIZE * 2.16;
    ctx.drawImage(sprite, x - terrainSize / 2, y - terrainSize / 2, terrainSize, terrainSize);
  } else {
    ctx.fillStyle = terrain === 'water'
      ? '#1e3a8a'
      : terrain === 'forest'
        ? '#14532d'
        : terrain === 'hill'
          ? '#6b7280'
          : terrain === 'desert'
            ? '#a16207'
            : '#166534';
    ctx.fillRect(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2);
  }

  if (cell.owner === 'human') {
    ctx.fillStyle = 'rgba(96, 165, 250, 0.18)';
    ctx.fillRect(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2);
  } else if (cell.owner === 'bot') {
    ctx.fillStyle = 'rgba(248, 113, 113, 0.18)';
    ctx.fillRect(x - HEX_SIZE, y - HEX_SIZE, HEX_SIZE * 2, HEX_SIZE * 2);
  }

  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
}

function drawStructure(structure) {
  const pos = hexToPixel(structure.q, structure.r);
  const size = 46;

  if (state.assets.city) {
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = structure.acted ? 0.7 : 1;
    ctx.drawImage(state.assets.city, pos.x - size / 2, pos.y - size / 2, size, size);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = structure.kind === 'human' ? '#60a5fa' : '#f87171';
    ctx.fillRect(pos.x - 14, pos.y - 14, 28, 28);
  }

  ctx.fillStyle = 'rgba(11, 16, 32, 0.9)';
  ctx.fillRect(pos.x - 12, pos.y + 12, 24, 14);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(structureLabel(structure.type), pos.x, pos.y + 22);
}

function drawUnit(unit) {
  if (!unit.alive) return;
  const pos = hexToPixel(unit.q, unit.r);
  const image = state.assets.units[unit.unitType];

  ctx.fillStyle = unit.kind === 'human' ? '#60a5fa' : '#f87171';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 17, 0, Math.PI * 2);
  ctx.fill();

  if (image) {
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, pos.x - 18, pos.y - 18, 36, 36);
    if (unit.unitType === 'robot') {
      ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
      ctx.fillRect(pos.x - 18, pos.y - 18, 36, 36);
    }
  } else {
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(UNIT_DEFS[unit.unitType].label, pos.x, pos.y + 4);
  }

  if (unit.selected && state.assets.uiCrosshair) {
    ctx.globalAlpha = 0.5;
    ctx.drawImage(state.assets.uiCrosshair, pos.x - 30, pos.y - 28, 60, 54);
    ctx.globalAlpha = 1;
  }

  const hpPct = Math.max(0, unit.hp) / unit.hpMax;
  ctx.fillStyle = 'rgba(0,0,0,.58)';
  ctx.fillRect(pos.x - 16, pos.y - 22, 32, 5);
  ctx.fillStyle = hpPct > 0.55 ? '#22c55e' : hpPct > 0.3 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(pos.x - 16, pos.y - 22, 32 * hpPct, 5);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1c6faa');
  gradient.addColorStop(0.45, '#125785');
  gradient.addColorStop(1, '#0b365e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let i = 0; i < 22; i++) {
    const y = (i / 22) * canvas.height;
    const wobble = Math.sin(i * 1.37) * 8;
    ctx.fillRect(0, y + wobble, canvas.width, 1);
  }

  const glare = ctx.createRadialGradient(canvas.width * 0.25, canvas.height * 0.12, 20, canvas.width * 0.25, canvas.height * 0.12, canvas.width * 0.55);
  glare.addColorStop(0, 'rgba(255,255,255,0.11)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function gameLoop() {
  drawBackground();
  ctx.save();
  applyCameraTransform();
  for (const cell of state.mapCells) drawHexCell(cell);
  Object.values(state.structures.human).forEach(drawStructure);
  Object.values(state.structures.bot).forEach(drawStructure);
  state.humans.forEach(drawUnit);
  state.bots.forEach(drawUnit);
  ctx.restore();
  requestAnimationFrame(gameLoop);
}

function syncUi() {
  const humansAlive = state.humans.filter(u => u.alive).length;
  const botsAlive = state.bots.filter(u => u.alive).length;

  ui.humansCount.textContent = String(humansAlive);
  ui.botsCount.textContent = String(botsAlive);
  ui.turnCount.textContent = String(state.turn);
  ui.phaseState.textContent = state.phase;
  ui.proofCount.textContent = String(state.proofs.length);
  ui.selectedMode.textContent = state.matchMode === 'llm-vs-llm' ? 'LLM vs LLM' : 'Human vs LLM';
  ui.selectedHumanModel.textContent = formatModelLabel(state.selectedHumanModel);
  ui.selectedAI.textContent = formatModelLabel(state.selectedAI);
  ui.selectedDifficulty.textContent = state.selectedDifficulty;
  ui.matchState.textContent = state.inMatch ? 'Running' : 'Idle';
  ui.walletState.textContent = state.connected ? 'Wallet: Connected' : 'Wallet: Disconnected';
  ui.humanTerritory.textContent = String(countTerritory('human'));
  ui.botTerritory.textContent = String(countTerritory('bot'));

  const selected = getSelectedHuman();
  const manualHuman = state.matchMode === 'human-vs-llm';
  const canPlayTurn = state.inMatch && state.phase === 'player' && manualHuman;
  const canAdvance = state.inMatch && (manualHuman ? state.phase === 'player' : true);

  ui.btnEndTurn.disabled = !canAdvance;
  ui.btnProof.disabled = !state.inMatch;
  ui.btnEnd.disabled = !state.inMatch;
  ui.btnStart.disabled = !state.connected || state.inMatch;
  ui.btnProduce.disabled = !canPlayTurn;
  ui.btnConquer.disabled = !canPlayTurn || !selected || selected.acted;
  ui.btnEndTurn.textContent = manualHuman ? 'End Turn' : 'Run LLM Round';
  ui.llmHumanSelect.disabled = state.matchMode !== 'llm-vs-llm' || state.inMatch;
  ui.modeSelect.disabled = state.inMatch;
  ui.aiSelect.disabled = state.inMatch;

  ui.btnEndTurn.classList.toggle('active-turn', canAdvance);
  ui.btnConquer.classList.toggle('active-turn', state.captureMode);
}

function resetArena() {
  const ok = initializeArenaWithRetries();

  state.turn = 0;
  state.phase = 'player';
  state.inMatch = false;
  state.proofs = [];
  state.captureMode = false;
  state.selectedUnitId = null;
  state.matchMode = ui.modeSelect.value;
  state.selectedAI = ui.aiSelect.value;
  state.selectedHumanModel = ui.llmHumanSelect.value;
  state.selectedDifficulty = ui.difficultySelect.value;

  ui.resultBanner.classList.remove('show');
  ui.resultBanner.textContent = '';

  if (!ok) {
    ui.resultBanner.textContent = 'Map generation failed. Press Reset Arena.';
    ui.resultBanner.classList.add('show');
    log('Map generation failed after retries', 'err');
  }

  updateProduceOptions();
  syncUi();
  if (ok) log('Arena reset with island map and ocean ring.', 'warn');
}

canvas.addEventListener('click', event => {
  const rect = canvas.getBoundingClientRect();
  const sx = (event.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (event.clientY - rect.top) * (canvas.height / rect.height);
  const world = screenToWorld(sx, sy);
  const cell = pickCell(world.x, world.y);
  if (!cell) return;
  handlePlayerCellClick(cell);
});

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const delta = event.deltaY > 0 ? -0.08 : 0.08;
  setZoom(state.camera.zoom + delta);
}, { passive: false });

ui.aiSelect.addEventListener('change', () => {
  state.selectedAI = ui.aiSelect.value;
  syncUi();
  log(`Opponent selected: ${formatModelLabel(state.selectedAI)}`, 'warn');
});

ui.llmHumanSelect.addEventListener('change', () => {
  state.selectedHumanModel = ui.llmHumanSelect.value;
  syncUi();
  log(`LLM A selected: ${formatModelLabel(state.selectedHumanModel)}`, 'warn');
});

ui.modeSelect.addEventListener('change', () => {
  state.matchMode = ui.modeSelect.value;
  state.captureMode = false;
  syncUi();
  log(state.matchMode === 'llm-vs-llm' ? 'Mode: LLM vs LLM' : 'Mode: Human vs LLM', 'warn');
});

ui.difficultySelect.addEventListener('change', () => {
  state.selectedDifficulty = ui.difficultySelect.value;
  syncUi();
  log(`Difficulty selected: ${state.selectedDifficulty}`, 'warn');
});

ui.buildingSelect.addEventListener('change', () => {
  updateProduceOptions();
});

ui.btnConnect.addEventListener('click', async () => {
  const acc = await StellarGameService.connectWallet();
  state.connected = true;
  syncUi();
  log(`Wallet connected: ${acc.address}`, 'ok');
});

ui.btnStart.addEventListener('click', async () => {
  if (!state.connected) {
    log('Connect wallet first.', 'warn');
    return;
  }

  const tx = await StellarGameService.start_game({
    mode: state.matchMode,
    llmA: state.selectedHumanModel,
    ai: state.selectedAI,
    difficulty: state.selectedDifficulty,
    contract: 'CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG',
  });

  state.inMatch = true;
  state.phase = state.matchMode === 'llm-vs-llm' ? 'simulation' : 'player';
  state.turn = 1;
  state.captureMode = false;
  state.selectedUnitId = null;
  state.proofs = [];
  state.humans.forEach(u => { u.acted = false; u.selected = false; });
  state.bots.forEach(u => { u.acted = false; u.selected = false; });
  Object.values(state.structures.human).forEach(structure => { structure.acted = false; });
  Object.values(state.structures.bot).forEach(structure => { structure.acted = false; });

  ui.resultBanner.classList.remove('show');
  syncUi();
  log(`start_game sent: ${tx.txHash} • ${state.matchMode === 'llm-vs-llm' ? `${formatModelLabel(state.selectedHumanModel)} vs ${formatModelLabel(state.selectedAI)}` : `Human vs ${formatModelLabel(state.selectedAI)}`}`, 'ok');
});

ui.btnEndTurn.addEventListener('click', endPlayerTurn);

ui.btnProduce.addEventListener('click', () => {
  produceHumanUnit();
  checkVictory();
  syncUi();
});

ui.btnConquer.addEventListener('click', () => {
  const selected = getSelectedHuman();
  if (!selected || selected.acted) {
    log('Select a human unit with available action first', 'warn');
    return;
  }
  state.captureMode = !state.captureMode;
  log(state.captureMode
    ? 'Conquer mode active: click adjacent tile to conquer'
    : 'Conquer mode cancelled');
  syncUi();
});

ui.btnProof.addEventListener('click', async () => {
  const payload = buildProofSnapshot('manual');
  const res = await StellarGameService.submit_zk_proof(payload);
  log(`ZK proof submitted: ${res.proofId}`, 'ok');
  syncUi();
});

ui.btnExportProofs.addEventListener('click', () => {
  if (!state.proofs.length) {
    log('No proofs yet. Start match or click Generate Proof.', 'warn');
    return;
  }

  const blob = new Blob([JSON.stringify({
    game: 'human-vs-bots',
    mode: 'turn-based-buildings',
    ai: state.selectedAI,
    difficulty: state.selectedDifficulty,
    proofs: state.proofs,
  }, null, 2)], { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `human-vs-bots-proofs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  log(`Exported ${state.proofs.length} proof snapshots`, 'ok');
});

ui.btnEnd.addEventListener('click', async () => {
  const winner = state.humans.filter(u => u.alive).length >= state.bots.filter(u => u.alive).length
    ? 'human'
    : 'bot';
  buildProofSnapshot('end');
  const tx = await StellarGameService.end_game({ winner, turn: state.turn });
  state.inMatch = false;
  state.phase = 'player';
  state.captureMode = false;
  syncUi();
  log(`end_game sent: ${tx.txHash}`, 'ok');
});

ui.btnReset.addEventListener('click', resetArena);

ui.btnTogglePanel.addEventListener('click', () => {
  ui.panelDrawer.classList.toggle('open');
  ui.btnTogglePanel.textContent = ui.panelDrawer.classList.contains('open') ? '✕ Menu' : '☰ Menu';
});

ui.btnZoomIn.addEventListener('click', () => setZoom(state.camera.zoom + 0.1));
ui.btnZoomOut.addEventListener('click', () => setZoom(state.camera.zoom - 0.1));
ui.btnZoomReset.addEventListener('click', () => setZoom(1));

resetArena();
setZoom(1);
requestAnimationFrame(gameLoop);

loadAssets()
  .then(() => log('Terrain, unit and structure sprites loaded.', 'ok'))
  .catch(() => log('Sprite loading failed, using fallback visuals.', 'warn'));

log('Ready: produce units, conquer tiles, and defeat bot tech-core army.', 'ok');
