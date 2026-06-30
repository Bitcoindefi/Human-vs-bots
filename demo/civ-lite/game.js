/* ─────────────────────────────────────────────────────
   game.js – CIV Lite Engine
   Layered rendering with procedural sprites
   Inspired by Freeciv-web layers, C7 terrain system,
   and Unciv tile groups.
   ───────────────────────────────────────────────────── */
import { AUDIO_EVENTS, createAudioSystem } from './audio-model.js';
import {
  CIV_COLORS,
  RESOURCE_TYPES,
  TERRAIN_DEFENSE,
  claimTerritory,
  computeVisibility,
  createCivState,
  describeTile,
  getTileYield,
  isWaterTerrain,
  summarizeCityYield,
  summarizeEmpire,
} from './civ-model.js';
import {
  applyCombatResult,
  calculateCombatPreview,
  formatCombatPreview,
  getUnitProfile,
} from './combat-model.js';
import { buildSpriteAtlas } from './sprites.js';
import {
  TECH_TREE,
  advanceResearch,
  chooseBotResearch,
  createResearchState,
  getAvailableTechs,
  getTech,
  getTechStatus,
  getUnlockedContent,
  selectResearch,
} from './tech-model.js';
import {
  createUxState,
  describeOutcome,
  startGame,
  toggleTutorial,
  updateOutcome,
} from './ux-model.js';

// ─── Constants ──────────────────────────────────────
const MAP_W = 24, MAP_H = 16, TILE = 48;
const ZOOM_MIN = 0.4, ZOOM_MAX = 3, ZOOM_SPEED = 0.08;
const EDGE_SCROLL_ZONE = 30, EDGE_SCROLL_SPEED = 600;  // px from edge, px/sec
const PAN_SPEED = 500;  // WASD px/sec (world units)
const SIGHT = 2;
const UNIT_STATS = {
  warrior: { atk: 30, def: 15, mov: 2 },
  archer: { atk: 24, def: 12, mov: 2 },
  swordsman: { atk: 38, def: 18, mov: 2 },
  horseman: { atk: 34, def: 14, mov: 3 },
};

// ─── DOM refs ───────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const miniC   = document.getElementById('minimap');
const miniCtx = miniC.getContext('2d');
const tooltip = document.getElementById('tooltip');

const dom = {
  turn:    document.getElementById('turnLabel'),
  status:  document.getElementById('status'),
  turnState: document.getElementById('turnState'),
  food:    document.getElementById('food'),
  foodRate: document.getElementById('foodRate'),
  prod:    document.getElementById('prod'),
  prodRate: document.getElementById('prodRate'),
  science: document.getElementById('science'),
  scienceRate: document.getElementById('scienceRate'),
  gold: document.getElementById('gold'),
  goldRate: document.getElementById('goldRate'),
  currentTech: document.getElementById('currentTech'),
  techList: document.getElementById('techList'),
  unitDet: document.getElementById('contextPanel') || document.getElementById('unitDetails'),
  logBox:  document.getElementById('eventLog') || document.getElementById('logContent'),
  audioState: document.getElementById('audioState'),
  audioTheme: document.getElementById('audioTheme'),
  btnMute: document.getElementById('btnMute'),
  masterVolume: document.getElementById('masterVolume'),
  musicVolume: document.getElementById('musicVolume'),
  sfxVolume: document.getElementById('sfxVolume'),
  menu:    document.getElementById('mainMenu'),
  gameOver: document.getElementById('gameOver'),
  tutorial: document.getElementById('tutorialPanel'),
  outcomeEyebrow: document.getElementById('outcomeEyebrow'),
  outcomeTitle: document.getElementById('outcomeTitle'),
  outcomeSummary: document.getElementById('outcomeSummary'),
};

const audio = createAudioSystem({ onSettingsChange: renderAudioSettings });

// ─── Build sprite atlas (async) ─────────────────────
let ATLAS = null;

// ─── Logging ────────────────────────────────────────
function log(msg, cls = '') {
  const d = document.createElement('div');
  d.className = 'log-entry' + (cls ? ' log-' + cls : '');
  d.textContent = msg;
  dom.logBox.prepend(d);
  while (dom.logBox.children.length > 60) dom.logBox.lastChild.remove();
}

// ─── Audio controls ─────────────────────────────────
function volumeToInput(value) {
  return String(Math.round(value * 100));
}

function renderAudioSettings(settings = audio.getSettings()) {
  if (!dom.btnMute) return;
  dom.btnMute.textContent = settings.muted ? 'Unmute' : 'Mute';
  dom.btnMute.setAttribute('aria-pressed', String(settings.muted));
  dom.masterVolume.value = volumeToInput(settings.masterVolume);
  dom.musicVolume.value = volumeToInput(settings.musicVolume);
  dom.sfxVolume.value = volumeToInput(settings.sfxVolume);
  dom.audioTheme.value = audio.getMusicTheme();

  if (settings.muted) dom.audioState.textContent = 'Muted';
  else if (!settings.musicEnabled) dom.audioState.textContent = 'SFX only';
  else if (audio.isUnlocked()) dom.audioState.textContent = 'Playing';
  else dom.audioState.textContent = 'Ready';
}

function playAudioEvent(eventName) {
  if (audio.playEvent(eventName)) return;
  audio.unlock(audio.getMusicTheme())
    .then(ok => {
      if (ok) audio.playEvent(eventName);
      renderAudioSettings();
    })
    .catch(() => {
      if (dom.audioState) dom.audioState.textContent = 'Blocked';
    });
}

function bindAudioControls() {
  if (!dom.btnMute) return;
  audio.setMusicTheme('game');
  renderAudioSettings();

  dom.btnMute.addEventListener('click', () => {
    audio.setMuted(!audio.getSettings().muted);
    playAudioEvent(AUDIO_EVENTS.click);
  });
  dom.audioTheme.addEventListener('change', () => {
    audio.setMusicTheme(dom.audioTheme.value);
    playAudioEvent(AUDIO_EVENTS.click);
    renderAudioSettings();
  });

  const bindVolume = (input, key) => {
    input.addEventListener('input', () => {
      audio.updateSettings({ [key]: Number(input.value) / 100 });
      playAudioEvent(AUDIO_EVENTS.click);
    });
  };
  bindVolume(dom.masterVolume, 'masterVolume');
  bindVolume(dom.musicVolume, 'musicVolume');
  bindVolume(dom.sfxVolume, 'sfxVolume');
}

bindAudioControls();

// ─── UX flow ───────────────────────────────────────
function renderUx() {
  dom.menu.classList.toggle('overlay-hidden', S.ux.screen !== 'menu');
  dom.gameOver.classList.toggle('overlay-hidden', S.ux.screen !== 'gameover');
  dom.tutorial.hidden = !S.ux.tutorialOpen;

  if (S.ux.outcome) {
    const isVictory = S.ux.outcome.result === 'victory';
    dom.outcomeEyebrow.textContent = isVictory ? 'Campaign Won' : 'Campaign Lost';
    dom.outcomeTitle.textContent = isVictory ? 'Victory' : 'Defeat';
    dom.outcomeSummary.textContent = `${describeOutcome(S.ux)}. ${isVictory ? 'Babylon can no longer contest the map.' : 'Athens has fallen out of contention.'}`;
  }
}

function beginGame() {
  S.ux = startGame(S.ux);
  S.phase = 'player';
  dom.status.textContent = 'Your turn';
  dom.status.className = '';
  log('Campaign started.', 'build');
  renderUx();
}

function setTutorial(open = null) {
  S.ux = toggleTutorial(S.ux, open);
  renderUx();
}

function finishGame(result) {
  S.phase = 'gameover';
  S.ux = updateOutcome(S.ux, result, S.turn);
  const isVictory = result === 'victory';
  dom.status.textContent = isVictory ? '🎉 Victory!' : '💀 Defeat';
  dom.status.className = isVictory ? 'status-win' : 'status-lose';
  log(isVictory ? '*** VICTORY! ***' : '*** DEFEAT ***', isVictory ? 'build' : 'combat');
  renderUx();
}

function restartGame() {
  window.location.reload();
}

// ─── Seeded RNG for tile variants ───────────────────
function hashTile(x, y) { return ((x * 374761393 + y * 668265263) ^ 1274126177) >>> 0; }

// ─── State ──────────────────────────────────────────
const initialCiv = createCivState({ width: MAP_W, height: MAP_H, seed: 17 });
const S = {
  map: initialCiv.map,
  units: initialCiv.units,
  cities: initialCiv.cities,
  resources: initialCiv.resources,
  turn: 1,
  phase: 'menu',  // menu | player | bot | animating | gameover
  ux: createUxState(),
  selected: null,
  selectedCity: null,
  fog: [],           // 0=unknown, 1=seen, 2=visible
  camX: 0, camY: 0,
  zoom: 1, targetZoom: 1,
  nextId: 3,
  research: {
    player: selectResearch(createResearchState(), 'mining'),
    bot: createResearchState(),
  },
  botPersonality: 'military',
  // Visual state
  particles: [],
  waterPhase: 0,
  selectionPhase: 0,
  hoverTile: null,
  animating: null,     // { unit, from, to, t }
  path: [],
  reachable: new Set(),
  tileVariants: [],
};

function createUnit(id, owner, x, y, type = 'warrior') {
  const stats = UNIT_STATS[type] || UNIT_STATS.warrior;
  return { id, owner, x, y, hp: 100, atk: stats.atk, def: stats.def, mov: stats.mov, movLeft: stats.mov, type };
}

// Init fog
for (let y = 0; y < MAP_H; y++) {
  S.fog[y] = [];
  S.tileVariants[y] = [];
  for (let x = 0; x < MAP_W; x++) {
    S.fog[y][x] = 0;
    S.tileVariants[y][x] = hashTile(x, y) % 4;
  }
}

// ─── Fog helpers ────────────────────────────────────
function revealAround(x, y, r = SIGHT) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) S.fog[ny][nx] = 2;
    }
}

function fadeVision() {
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++)
      if (S.fog[y][x] === 2) S.fog[y][x] = 1;
}

function refreshVision() {
  S.fog = computeVisibility({
    width: MAP_W,
    height: MAP_H,
    previousFog: S.fog,
    units: S.units,
    cities: S.cities,
    owner: 'player',
  });
}

refreshVision();
dom.status.textContent = 'Ready';
renderUx();

// ─── Pathfinding (A*) ───────────────────────────────
function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function neighbors(x, y) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H && !isWaterTerrain(S.map[p.y][p.x].terrain));
}

function moveCost(tx, ty) {
  const t = S.map[ty][tx].terrain;
  if (t === 'hill' || t === 'forest' || t === 'jungle' || t === 'mountain' || t === 'snow') return 2;
  return 1;
}

function findPath(sx, sy, gx, gy) {
  if (isWaterTerrain(S.map[gy][gx].terrain)) return [];
  const key = (x, y) => x + ',' + y;
  const open = [{ x: sx, y: sy, g: 0, f: heuristic({ x: sx, y: sy }, { x: gx, y: gy }) }];
  const came = {}, gScore = { [key(sx, sy)]: 0 };

  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const c = open.shift();
    if (c.x === gx && c.y === gy) {
      const path = [{ x: gx, y: gy }];
      let k = key(gx, gy);
      while (came[k]) { path.unshift(came[k]); k = key(came[k].x, came[k].y); }
      return path;
    }
    for (const n of neighbors(c.x, c.y)) {
      const ng = gScore[key(c.x, c.y)] + moveCost(n.x, n.y);
      if (ng < (gScore[key(n.x, n.y)] ?? Infinity)) {
        gScore[key(n.x, n.y)] = ng;
        came[key(n.x, n.y)] = { x: c.x, y: c.y };
        open.push({ x: n.x, y: n.y, g: ng, f: ng + heuristic(n, { x: gx, y: gy }) });
      }
    }
  }
  return [];
}

function calcReachable(unit) {
  const set = new Set();
  const queue = [{ x: unit.x, y: unit.y, cost: 0 }];
  const visited = {};
  const key = (x, y) => x + ',' + y;
  visited[key(unit.x, unit.y)] = 0;

  while (queue.length) {
    const c = queue.shift();
    for (const n of neighbors(c.x, c.y)) {
      const nc = c.cost + moveCost(n.x, n.y);
      if (nc <= unit.movLeft && (visited[key(n.x, n.y)] === undefined || nc < visited[key(n.x, n.y)])) {
        visited[key(n.x, n.y)] = nc;
        set.add(key(n.x, n.y));
        queue.push({ x: n.x, y: n.y, cost: nc });
      }
    }
  }
  return set;
}

// ─── Combat ─────────────────────────────────────────
// Adapt the civ-model tile-object map into the terrain-string grid that
// combat-model.js expects (its TERRAIN_COMBAT table keys on terrain strings,
// using 'water' for ocean/coast tiles).
function combatTerrainAt(x, y) {
  const terrain = S.map[y]?.[x]?.terrain;
  if (!terrain) return 'plains';
  return isWaterTerrain(terrain) ? 'water' : terrain;
}

function combatTerrainMap() {
  return S.map.map((row, y) => row.map((_, x) => combatTerrainAt(x, y)));
}

function crossesRiver(attacker, defender) {
  return combatTerrainAt(defender.x, attacker.y) === 'water'
    || combatTerrainAt(attacker.x, defender.y) === 'water';
}

function previewCombat(attacker, defender) {
  return calculateCombatPreview(attacker, defender, {
    map: combatTerrainMap(),
    units: S.units,
    crossesRiver: crossesRiver(attacker, defender),
  });
}

function combat(attacker, defender) {
  const preview = previewCombat(attacker, defender);
  if (!preview.inRange) {
    log(`${defender.type} is out of ${attacker.type} range`, 'combat');
    return;
  }

  playAudioEvent(AUDIO_EVENTS.attack);

  const result = applyCombatResult(attacker, defender, preview);
  spawnParticles(defender.x * TILE + TILE / 2, defender.y * TILE + TILE / 2, 12);
  log(`${attacker.owner}'s ${attacker.type} hits for ${preview.attackerDamage} dmg`, 'combat');

  if (preview.defenderDamage > 0) {
    log(`Counter! ${attacker.type} takes ${preview.defenderDamage} dmg`, 'combat');
  }
  if (result.attackerPromoted) {
    log(`${attacker.type} promoted to level ${attacker.level}!`, 'build');
  }

  if (result.defenderDestroyed) {
    S.units = S.units.filter(u => u !== defender);
    log(`${defender.owner}'s ${defender.type} destroyed!`, 'combat');
    spawnParticles(defender.x * TILE + TILE / 2, defender.y * TILE + TILE / 2, 20);
    checkWin();
  }
  if (result.attackerDestroyed) {
    S.units = S.units.filter(u => u !== attacker);
    log(`${attacker.owner}'s ${attacker.type} destroyed!`, 'combat');
    checkWin();
  }
}

function checkWin() {
  const playerUnits = S.units.filter(u => u.owner === 'player');
  const botUnits    = S.units.filter(u => u.owner === 'bot');
  const playerCities = S.cities.filter(c => c.owner === 'player');
  const botCities    = S.cities.filter(c => c.owner === 'bot');
  if (botUnits.length === 0 && botCities.length === 0) {
    playAudioEvent(AUDIO_EVENTS.victory);
    finishGame('victory');
  } else if (playerUnits.length === 0 && playerCities.length === 0) {
    playAudioEvent(AUDIO_EVENTS.defeat);
    finishGame('defeat');
  }
}

// ─── Particles ──────────────────────────────────────
function spawnParticles(sx, sy, count = 10) {
  for (let i = 0; i < count; i++) {
    S.particles.push({
      x: sx, y: sy,
      vx: (Math.random() - 0.5) * 6,
      vy: -Math.random() * 4 - 1,
      life: 30 + Math.random() * 20,
      maxLife: 50,
      color: `hsl(${20 + Math.random() * 30}, 100%, ${50 + Math.random() * 30}%)`,
      size: 1.5 + Math.random() * 3,
    });
  }
}

function updateParticles() {
  for (const p of S.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12; // gravity
    p.life--;
    p.size *= 0.97;
  }
  S.particles = S.particles.filter(p => p.life > 0);
}

// ─── City production ────────────────────────────────
function gatherResources(owner) {
  const cities = S.cities.filter(c => c.owner === owner);
  let totalFood = 0, totalProd = 0, totalSci = 0, totalGold = 0;
  for (const city of cities) {
    const cityYield = summarizeCityYield(S, city);
    totalFood += cityYield.food;
    totalProd += cityYield.prod;
    totalSci += cityYield.science;
    totalGold += cityYield.gold;

    city.food += cityYield.food;
    city.prod += cityYield.prod;

    // City growth
    if (city.food >= 8 * city.pop) {
      city.pop++;
      city.food = 0;
      if (owner === 'player') playAudioEvent(AUDIO_EVENTS.build);
      log(`${city.name} grows to pop ${city.pop}!`, 'build');
    }
    // Auto-recruit
    if (city.prod >= 12) {
      city.prod -= 12;
      const id = S.nextId++;
      let spawnX = city.x, spawnY = city.y;
      // Find empty adjacent tile
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]]) {
        const nx = city.x + dx, ny = city.y + dy;
        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H &&
            !isWaterTerrain(S.map[ny][nx].terrain) &&
            !S.units.find(u => u.x === nx && u.y === ny)) {
          spawnX = nx; spawnY = ny; break;
        }
      }
      const type = chooseUnitToTrain(owner);
      const profile = getUnitProfile({ type });
      S.units.push({
        id,
        owner,
        x: spawnX,
        y: spawnY,
        hp: 100,
        atk: profile.strength,
        def: profile.defense,
        mov: 2,
        movLeft: 2,
        type,
        xp: 0,
        level: 1,
      });
      if (owner === 'player') playAudioEvent(AUDIO_EVENTS.build);
      log(`${city.name} trained a ${type}!`, 'build');
      if (owner === 'player') revealAround(spawnX, spawnY);
    }
  }
  S.resources[owner].food += totalFood;
  S.resources[owner].prod += totalProd;
  S.resources[owner].science += totalSci;
  S.resources[owner].gold += totalGold;
  return { food: totalFood, prod: totalProd, science: totalSci, gold: totalGold };
}

function fmtRate(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function syncText(name, value) {
  const el = dom[name] || document.getElementById(name);
  if (el) el.textContent = value;
  for (const mirror of document.querySelectorAll(`[data-source="${name}"]`)) {
    mirror.textContent = value;
  }
}

function updateHud() {
  const summary = summarizeEmpire(S, 'player');
  syncText('food', summary.totals.food);
  syncText('prod', summary.totals.prod);
  syncText('science', summary.totals.science);
  syncText('gold', summary.totals.gold);
  syncText('foodRate', fmtRate(summary.rates.food));
  syncText('prodRate', fmtRate(summary.rates.prod));
  syncText('scienceRate', fmtRate(summary.rates.science));
  syncText('goldRate', fmtRate(summary.rates.gold));
  if (dom.turnState) {
    const cityLabel = summary.cityCount === 1 ? '1 city' : `${summary.cityCount} cities`;
    const unitLabel = summary.unitCount === 1 ? '1 unit' : `${summary.unitCount} units`;
    dom.turnState.textContent = `${cityLabel} · ${unitLabel}`;
  }
}

function chooseUnitToTrain(owner) {
  const unlocks = getUnlockedContent(S.research[owner]);
  if (unlocks.units.includes('horseman')) return 'horseman';
  if (unlocks.units.includes('swordsman')) return 'swordsman';
  if (unlocks.units.includes('archer')) return 'archer';
  return 'warrior';
}

function completeResearch(owner, sciencePerTurn) {
  if (owner === 'bot' && !S.research.bot.current) {
    const next = chooseBotResearch(S.research.bot, S.botPersonality);
    if (next) S.research.bot = selectResearch(S.research.bot, next);
  }

  const before = S.research[owner].current;
  const result = advanceResearch(S.research[owner], sciencePerTurn);
  S.research[owner] = result.state;

  if (result.completed.length > 0) {
    for (const techId of result.completed) {
      const tech = getTech(techId);
      log(`${owner === 'player' ? 'You' : 'Bot'} researched ${tech.name}!`, 'build');
    }
    if (owner === 'player') updateTechPanel();
  } else if (before && owner === 'player') {
    updateTechPanel();
  }

  if (owner === 'bot' && !S.research.bot.current) {
    const next = chooseBotResearch(S.research.bot, S.botPersonality);
    if (next) S.research.bot = selectResearch(S.research.bot, next);
  }
}

function researchProgressLabel(state) {
  if (!state.current) return 'Choose research';
  const tech = getTech(state.current);
  return `${tech.name}: ${state.progress}/${tech.cost} 🔬`;
}

function updateTechPanel() {
  if (!dom.currentTech || !dom.techList) return;
  dom.currentTech.textContent = researchProgressLabel(S.research.player);
  dom.techList.innerHTML = '';

  for (const tech of TECH_TREE) {
    const status = getTechStatus(S.research.player, tech.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `tech-card tech-${status}`;
    row.disabled = status === 'blocked' || status === 'researched';
    row.dataset.tech = tech.id;
    row.innerHTML = `
      <span class="tech-name">${tech.name}</span>
      <span class="tech-status">${status.replace('-', ' ')}</span>
      <span class="tech-cost">🔬 ${tech.cost}</span>
      <span class="tech-unlocks">${formatUnlocks(tech.unlocks)}</span>`;
    row.addEventListener('click', () => {
      try {
        S.research.player = selectResearch(S.research.player, tech.id);
        log(`Research started: ${tech.name}`, 'build');
        updateTechPanel();
      } catch (error) {
        log(error.message, 'combat');
      }
    });
    dom.techList.append(row);
  }
}

function formatUnlocks(unlocks) {
  const parts = [
    ...(unlocks.units || []).map((item) => `Unit: ${item}`),
    ...(unlocks.buildings || []).map((item) => `Building: ${item}`),
    ...(unlocks.improvements || []).map((item) => `Improvement: ${item}`),
  ];
  return parts.join(' · ') || 'Economy';
}

// ─── Turn management ────────────────────────────────
function endPlayerTurn() {
  if (S.phase !== 'player') return;
  playAudioEvent(AUDIO_EVENTS.endTurn);
  S.phase = 'bot';
  S.selected = null;
  S.selectedCity = null;
  S.reachable.clear();
  S.path = [];
  dom.status.textContent = 'Bot thinking…';
  dom.status.className = 'status-thinking';
  updateUnitPanel();

  const res = gatherResources('player');
  completeResearch('player', res.science);
  updateHud();
  log(`Income: +${res.food} food, +${res.prod} prod, +${res.science} science, +${res.gold} gold`, 'build');

  setTimeout(botTurn, 400);
}

function startPlayerTurn() {
  S.turn++;
  S.phase = 'player';
  dom.turn.textContent = `Turn ${S.turn}`;
  dom.status.textContent = 'Your turn';
  dom.status.className = '';
  S.units.filter(u => u.owner === 'player').forEach(u => { u.movLeft = u.mov; });
  refreshVision();
  claimTerritory(S.map, S.cities);
  updateHud();
  updateTechPanel();
  log(`─── Turn ${S.turn} ───`);
}

// ─── Bot AI ─────────────────────────────────────────
function botTurn() {
  const botRes = gatherResources('bot');
  completeResearch('bot', botRes.science);
  const bots = S.units.filter(u => u.owner === 'bot');

  for (const bot of bots) {
    bot.movLeft = bot.mov;
    // Find nearest player target (units or cities)
    let bestTarget = null, bestDist = Infinity;
    for (const u of S.units.filter(u => u.owner === 'player')) {
      const d = Math.abs(u.x - bot.x) + Math.abs(u.y - bot.y);
      if (d < bestDist) { bestDist = d; bestTarget = { x: u.x, y: u.y }; }
    }
    for (const c of S.cities.filter(c => c.owner === 'player')) {
      const d = Math.abs(c.x - bot.x) + Math.abs(c.y - bot.y);
      if (d < bestDist) { bestDist = d; bestTarget = { x: c.x, y: c.y }; }
    }
    if (!bestTarget) continue;

    // Check if a player unit is in tactical range.
    const adj = S.units.find(u => u.owner === 'player' && previewCombat(bot, u).inRange);
    if (adj) {
      combat(bot, adj);
      bot.movLeft = 0;
      // Check city capture
      const cap = S.cities.find(c => c.owner === 'player' && c.x === bot.x && c.y === bot.y);
      if (cap) {
        cap.owner = 'bot';
        claimTerritory(S.map, S.cities);
        updateHud();
        log(`Bot captured ${cap.name}!`, 'combat');
      }
      continue;
    }

    // Move toward target
    const path = findPath(bot.x, bot.y, bestTarget.x, bestTarget.y);
    if (path.length > 1) {
      let steps = 0, movLeft = bot.movLeft;
      for (let i = 1; i < path.length && movLeft > 0; i++) {
        const cost = moveCost(path[i].x, path[i].y);
        if (cost > movLeft) break;
        // Check blocking
        if (S.units.find(u => u.x === path[i].x && u.y === path[i].y && u !== bot)) {
          if (S.units.find(u => u.x === path[i].x && u.y === path[i].y && u.owner === 'player')) {
            combat(bot, S.units.find(u => u.x === path[i].x && u.y === path[i].y && u.owner === 'player'));
            movLeft = 0;
          }
          break;
        }
        bot.x = path[i].x;
        bot.y = path[i].y;
        movLeft -= cost;
        steps++;
      }
      bot.movLeft = movLeft;
      // Capture city
      const cap = S.cities.find(c => c.owner === 'player' && c.x === bot.x && c.y === bot.y);
      if (cap) {
        cap.owner = 'bot';
        claimTerritory(S.map, S.cities);
        updateHud();
        log(`Bot captured ${cap.name}!`, 'combat');
      }
    }
  }

  if (S.phase !== 'gameover') startPlayerTurn();
}

// ─── Animation helper ───────────────────────────────
function animateMove(unit, path, cb) {
  if (path.length < 2) { cb(); return; }
  const prev = S.phase;
  S.phase = 'animating';
  let step = 1;

  function nextStep() {
    if (step >= path.length) {
      S.phase = prev;
      cb();
      return;
    }
    S.animating = {
      unit,
      from: { x: path[step - 1].x * TILE, y: path[step - 1].y * TILE },
      to: { x: path[step].x * TILE, y: path[step].y * TILE },
      t: 0,
    };
    const dur = 120;
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      S.animating.t = Math.min(1, elapsed / dur);
      if (S.animating.t < 1) {
        requestAnimationFrame(frame);
      } else {
        unit.x = path[step].x;
        unit.y = path[step].y;
        S.animating = null;
        step++;
        nextStep();
      }
    }
    requestAnimationFrame(frame);
  }
  nextStep();
}

// ─── Canvas resize ──────────────────────────────────
function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  miniC.width = miniC.clientWidth * 2;
  miniC.height = miniC.clientHeight * 2;
}
window.addEventListener('resize', resize);
resize();

// ─── Camera ─────────────────────────────────────────
function viewW() { return canvas.width / S.zoom; }
function viewH() { return canvas.height / S.zoom; }

function centerOn(x, y) {
  S.camX = x * TILE + TILE / 2 - viewW() / 2;
  S.camY = y * TILE + TILE / 2 - viewH() / 2;
  clampCam();
}

function clampCam() {
  const maxX = MAP_W * TILE - viewW();
  const maxY = MAP_H * TILE - viewH();
  S.camX = Math.max(0, Math.min(maxX, S.camX));
  S.camY = Math.max(0, Math.min(maxY, S.camY));
}

function smoothZoom(newZoom, pivotScreenX, pivotScreenY) {
  // pivotScreenX/Y are canvas-local coords
  const oldZoom = S.zoom;
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  S.targetZoom = clamped;
  S.zoom = clamped;
  // Adjust camera so the world point under cursor stays fixed
  const wx = pivotScreenX / oldZoom + S.camX;
  const wy = pivotScreenY / oldZoom + S.camY;
  S.camX = wx - pivotScreenX / S.zoom;
  S.camY = wy - pivotScreenY / S.zoom;
  clampCam();
}

centerOn(2, 2);

// ─── Rendering layers ───────────────────────────────
function hexPath(context, px, py, inset = 2) {
  const x = px + inset;
  const y = py + inset;
  const w = TILE - inset * 2;
  const h = TILE - inset * 2;
  context.beginPath();
  context.moveTo(x + w * 0.5, y);
  context.lineTo(x + w, y + h * 0.24);
  context.lineTo(x + w, y + h * 0.76);
  context.lineTo(x + w * 0.5, y + h);
  context.lineTo(x, y + h * 0.76);
  context.lineTo(x, y + h * 0.24);
  context.closePath();
}

function fillHex(px, py, fillStyle, inset = 2) {
  ctx.fillStyle = fillStyle;
  hexPath(ctx, px, py, inset);
  ctx.fill();
}

function strokeHex(px, py, strokeStyle, lineWidth = 1, inset = 2) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  hexPath(ctx, px, py, inset);
  ctx.stroke();
}

function drawResourceMarker(tile, px, py) {
  if (!tile.resource) return;
  const resource = RESOURCE_TYPES[tile.resource];
  if (!resource) return;

  const cx = px + TILE - 12;
  const cy = py + 12;
  ctx.fillStyle = 'rgba(7, 11, 20, 0.72)';
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 236, 160, 0.85)';
  ctx.lineWidth = 1 / S.zoom;
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `bold ${8 / S.zoom}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(resource.icon, cx, cy + 0.5);
  ctx.textBaseline = 'alphabetic';
}

// Layer 0: Terrain
function drawLayerTerrain() {
  const vw = viewW(), vh = viewH();
  const startX = Math.floor(S.camX / TILE);
  const startY = Math.floor(S.camY / TILE);
  const endX = Math.min(MAP_W - 1, startX + Math.ceil(vw / TILE) + 1);
  const endY = Math.min(MAP_H - 1, startY + Math.ceil(vh / TILE) + 1);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (S.fog[y][x] === 0) continue;
      const tile = S.map[y][x];
      const terrain = tile.terrain;
      const variant = tile.variant ?? S.tileVariants[y][x];
      const sprite = ATLAS.terrain[terrain]?.[variant % 4];
      const px = x * TILE;
      const py = y * TILE;
      ctx.save();
      hexPath(ctx, px, py, 1.5);
      ctx.clip();
      if (sprite) ctx.drawImage(sprite, px, py, TILE, TILE);
      else fillHex(px, py, '#2a3a2a', 0);

      if (terrain === 'ocean' || terrain === 'coast') {
        const shimmer = Math.sin(S.waterPhase + x * 0.7 + y * 0.5) * 0.08 + 0.04;
        ctx.fillStyle = `rgba(120,200,255,${shimmer})`;
        ctx.fillRect(px, py, TILE, TILE);
      }
      ctx.restore();

      if (tile.owner) {
        ctx.fillStyle = tile.owner === 'player' ? 'rgba(68, 170, 255, 0.12)' : 'rgba(255, 85, 85, 0.12)';
        hexPath(ctx, px, py, 3);
        ctx.fill();
      }
      drawResourceMarker(tile, px, py);
      strokeHex(px, py, terrain === 'coast' ? 'rgba(180,220,255,0.22)' : 'rgba(200,220,255,0.08)', 0.75 / S.zoom, 1.5);
    }
  }
}

// Layer 1: Grid overlay
function drawLayerGrid() {
  const vw = viewW(), vh = viewH();
  const startX = Math.floor(S.camX / TILE);
  const startY = Math.floor(S.camY / TILE);
  const endX = Math.min(MAP_W - 1, startX + Math.ceil(vw / TILE) + 1);
  const endY = Math.min(MAP_H - 1, startY + Math.ceil(vh / TILE) + 1);

  ctx.strokeStyle = 'rgba(200,220,255,0.06)';
  ctx.lineWidth = 0.5 / S.zoom;  // constant screen-space thickness
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (S.fog[y][x] === 0) continue;
      strokeHex(x * TILE, y * TILE, 'rgba(200,220,255,0.06)', 0.5 / S.zoom, 2);
    }
  }
}

// Layer 2: Reachable tile highlights
function drawLayerReachable() {
  if (!S.selected || S.reachable.size === 0) return;
  for (const key of S.reachable) {
    const [x, y] = key.split(',').map(Number);
    fillHex(x * TILE, y * TILE, 'rgba(90,200,250,0.12)', 4);
  }
  for (const enemy of S.units.filter(u => u.owner !== S.selected.owner)) {
    const dist = Math.abs(enemy.x - S.selected.x) + Math.abs(enemy.y - S.selected.y);
    if (dist <= 1) {
      fillHex(enemy.x * TILE, enemy.y * TILE, 'rgba(255,80,80,0.18)', 4);
      strokeHex(enemy.x * TILE, enemy.y * TILE, 'rgba(255,120,120,0.55)', 1.5 / S.zoom, 4);
    }
  }
}

// Layer 3: Path preview
function drawLayerPath() {
  if (S.path.length < 2) return;
  ctx.strokeStyle = 'rgba(90,250,150,0.5)';
  ctx.lineWidth = 2 / S.zoom;
  ctx.setLineDash([4 / S.zoom, 4 / S.zoom]);
  ctx.beginPath();
  for (let i = 0; i < S.path.length; i++) {
    const px = S.path[i].x * TILE + TILE / 2;
    const py = S.path[i].y * TILE + TILE / 2;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(90,250,150,0.6)';
  for (let i = 1; i < S.path.length; i++) {
    const px = S.path[i].x * TILE + TILE / 2;
    const py = S.path[i].y * TILE + TILE / 2;
    ctx.beginPath();
    ctx.arc(px, py, 3 / S.zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Layer 4: Cities
function drawLayerCities() {
  for (const city of S.cities) {
    if (S.fog[city.y][city.x] === 0) continue;
    const px = city.x * TILE + TILE / 2;
    const py = city.y * TILE + TILE / 2;
    const sprite = city.owner === 'player' ? ATLAS.cities.player : ATLAS.cities.bot;
    ctx.drawImage(sprite, px - 28, py - 28, 56, 56);

    const bannerColor = city.owner === 'player' ? CIV_COLORS.player : CIV_COLORS.bot;
    ctx.fillStyle = 'rgba(7,11,20,0.78)';
    ctx.fillRect(px - 30, py + 19, 60, 13);
    ctx.strokeStyle = bannerColor;
    ctx.lineWidth = 1 / S.zoom;
    ctx.strokeRect(px - 30, py + 19, 60, 13);
    ctx.font = `bold ${8 / S.zoom}px system-ui`;
    ctx.fillStyle = bannerColor;
    ctx.textAlign = 'center';
    ctx.fillText(city.name, px, py + 29);

    ctx.fillStyle = 'rgba(7,11,20,0.86)';
    ctx.beginPath();
    ctx.arc(px + 18, py - 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${8 / S.zoom}px system-ui`;
    ctx.fillText(city.pop, px + 18, py - 15);
  }
}

// Layer 5: Units
function drawLayerUnits() {
  for (const unit of S.units) {
    // Skip animated unit at its stored position
    if (S.animating && S.animating.unit === unit) continue;
    if (S.fog[unit.y][unit.x] === 0) continue;
    if (unit.owner === 'bot' && S.fog[unit.y][unit.x] < 2) continue;

    const side = unit.owner === 'player' ? 'player' : 'bot';
    const sprite = ATLAS.unitTypes?.[unit.type]?.[side] || (unit.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot);
    const px = unit.x * TILE;
    const py = unit.y * TILE;
    ctx.drawImage(sprite, px, py, TILE, TILE);

    ctx.fillStyle = unit.owner === 'player' ? CIV_COLORS.player : CIV_COLORS.bot;
    ctx.beginPath();
    ctx.arc(px + TILE - 8, py + 8, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1 / S.zoom;
    ctx.stroke();

    // HP bar
    drawHPBar(px + 4, py + TILE - 6, TILE - 8, 3, unit.hp / 100);

    // Movement pips
    if (unit.owner === 'player') {
      for (let i = 0; i < unit.mov; i++) {
        ctx.fillStyle = i < unit.movLeft ? '#5af0aa' : '#333';
        ctx.beginPath();
        ctx.arc(px + 8 + i * 7, py + 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Animated unit
  if (S.animating) {
    const a = S.animating;
    const ease = 1 - Math.pow(1 - a.t, 3);
    const px = a.from.x + (a.to.x - a.from.x) * ease;
    const py = a.from.y + (a.to.y - a.from.y) * ease;
    const side = a.unit.owner === 'player' ? 'player' : 'bot';
    const sprite = ATLAS.unitTypes?.[a.unit.type]?.[side] || (a.unit.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot);
    ctx.drawImage(sprite, px, py, TILE, TILE);
    drawHPBar(px + 4, py + TILE - 6, TILE - 8, 3, a.unit.hp / 100);
  }
}

function drawHPBar(x, y, w, h, pct) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const color = pct > 0.6 ? '#4cd964' : pct > 0.3 ? '#ffcc00' : '#ff3b30';
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, pct), h);
}

// Layer 6: Fog of war
function drawLayerFog() {
  const vw = viewW(), vh = viewH();
  const startX = Math.floor(S.camX / TILE);
  const startY = Math.floor(S.camY / TILE);
  const endX = Math.min(MAP_W - 1, startX + Math.ceil(vw / TILE) + 1);
  const endY = Math.min(MAP_H - 1, startY + Math.ceil(vh / TILE) + 1);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const px = x * TILE;
      const py = y * TILE;
      if (S.fog[y][x] === 0) {
        ctx.drawImage(ATLAS.fog.unknown, px, py, TILE, TILE);
      } else if (S.fog[y][x] === 1) {
        ctx.drawImage(ATLAS.fog.seen, px, py, TILE, TILE);
      }
    }
  }
}

// Layer 7: Hover highlight
function drawLayerHover() {
  if (S.hoverTile) {
    const px = S.hoverTile.x * TILE;
    const py = S.hoverTile.y * TILE;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1.5 / S.zoom;
    ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
  }

  // Selection ring
  if (S.selected) {
    const px = S.selected.x * TILE + TILE / 2;
    const py = S.selected.y * TILE + TILE / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(S.selectionPhase * 0.5);
    ctx.drawImage(ATLAS.ui.selection, -32, -32, 64, 64);
    ctx.restore();
  }
}

// Layer 8: Particles (world coords, handled by zoom transform)
function drawLayerParticles() {
  for (const p of S.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Minimap ────────────────────────────────────────
function drawMinimap() {
  const mw = miniC.width, mh = miniC.height;
  const tw = mw / MAP_W, th = mh / MAP_H;
  miniCtx.fillStyle = '#070b14';
  miniCtx.fillRect(0, 0, mw, mh);

  const terrainColors = {
    ocean: '#1e5799',
    coast: '#2f80c9',
    plains: '#7f9b45',
    grassland: '#4d8f52',
    forest: '#2a6e3a',
    jungle: '#1d6b42',
    hill: '#8a7d50',
    mountain: '#7d8490',
    desert: '#c9a855',
    tundra: '#79927a',
    snow: '#dce8ed',
  };

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (S.fog[y][x] === 0) {
        miniCtx.fillStyle = '#111';
      } else {
        const tile = S.map[y][x];
        miniCtx.fillStyle = terrainColors[tile.terrain] || '#555';
        if (S.fog[y][x] === 1) {
          miniCtx.globalAlpha = 0.5;
        }
      }
      miniCtx.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
      miniCtx.globalAlpha = 1;
      const owner = S.map[y][x].owner;
      if (owner) {
        miniCtx.fillStyle = owner === 'player' ? 'rgba(68,170,255,0.35)' : 'rgba(255,85,85,0.35)';
        miniCtx.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
      }
    }
  }

  // Units & cities on minimap
  for (const city of S.cities) {
    miniCtx.fillStyle = city.owner === 'player' ? '#44aaff' : '#ff4444';
    miniCtx.fillRect(city.x * tw, city.y * th, tw * 2, th * 2);
  }
  for (const unit of S.units) {
    if (unit.owner === 'bot' && S.fog[unit.y][unit.x] < 2) continue;
    miniCtx.fillStyle = unit.owner === 'player' ? '#5af0ff' : '#ff6666';
    miniCtx.beginPath();
    miniCtx.arc(unit.x * tw + tw / 2, unit.y * th + th / 2, Math.max(tw, th) * 0.6, 0, Math.PI * 2);
    miniCtx.fill();
  }

  // Viewport rect
  miniCtx.strokeStyle = '#ffffff88';
  miniCtx.lineWidth = 1.5;
  miniCtx.strokeRect(
    (S.camX / (MAP_W * TILE)) * mw,
    (S.camY / (MAP_H * TILE)) * mh,
    (canvas.width / (MAP_W * TILE)) * mw,
    (canvas.height / (MAP_H * TILE)) * mh
  );
}

// ─── Unit info panel ────────────────────────────────
function updateUnitPanel() {
  const u = S.selected;
  const city = S.selectedCity;
  if (!u) {
    if (city) {
      const yields = summarizeCityYield(S, city);
      dom.unitDet.innerHTML = `
        <div class="unit-info-header">
          <span class="city-badge" style="--civ-color:${city.owner === 'player' ? CIV_COLORS.player : CIV_COLORS.bot}"></span>
          <span class="unit-name">${city.name}</span>
        </div>
        <div class="unit-info-stats">
          <span class="stat-label">Population</span><span class="stat-val">${city.pop}</span>
          <span class="stat-label">Build</span><span class="stat-val">${city.production || 'Warrior'}</span>
          <span class="stat-label">Food/turn</span><span class="stat-val hp-high">+${yields.food}</span>
          <span class="stat-label">Prod/turn</span><span class="stat-val">+${yields.prod}</span>
          <span class="stat-label">Science</span><span class="stat-val">+${yields.science}</span>
          <span class="stat-label">Gold</span><span class="stat-val">+${yields.gold}</span>
        </div>`;
      return;
    }
    dom.unitDet.innerHTML = '<p class="placeholder">Click a unit or city to see details</p>';
    return;
  }
  const profile = getUnitProfile(u);
  const hpClass = u.hp > 60 ? 'hp-high' : u.hp > 30 ? 'hp-mid' : 'hp-low';
  dom.unitDet.innerHTML = `
    <div class="unit-info-header">
      <canvas class="unit-icon" id="unitIcon" width="32" height="32"></canvas>
      <span class="unit-name">${profile.label}</span>
    </div>
    <div class="unit-info-stats">
      <span class="stat-label">HP</span><span class="stat-val ${hpClass}">${u.hp}/100</span>
      <span class="stat-label">ATK</span><span class="stat-val">${u.atk}</span>
      <span class="stat-label">DEF</span><span class="stat-val">${u.def}</span>
      <span class="stat-label">MOV</span><span class="stat-val">${u.movLeft}/${u.mov}</span>
      <span class="stat-label">RNG</span><span class="stat-val">${profile.range}</span>
      <span class="stat-label">XP</span><span class="stat-val">${u.xp ?? 0}/10</span>
      <span class="stat-label">LVL</span><span class="stat-val">${u.level ?? 1}</span>
    </div>`;
  // Draw tiny icon
  const ic = document.getElementById('unitIcon');
  if (ic) {
    const ictx = ic.getContext('2d');
    const side = u.owner === 'player' ? 'player' : 'bot';
    const sprite = ATLAS.unitTypes?.[u.type]?.[side] || (u.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot);
    ictx.drawImage(sprite, 0, 0, 32, 32);
  }
}

// ─── Tooltip ────────────────────────────────────────
function showTooltip(x, y, tileX, tileY) {
  if (tileX < 0 || tileX >= MAP_W || tileY < 0 || tileY >= MAP_H) { hideTooltip(); return; }
  if (S.fog[tileY][tileX] === 0) { hideTooltip(); return; }
  const tile = S.map[tileY][tileX];
  const terrain = tile.terrain;
  const yields = getTileYield(tile);
  const def = Math.round(TERRAIN_DEFENSE[terrain] * 100);
  const target = S.units.find(u => u.owner !== 'player' && u.x === tileX && u.y === tileY);
  const preview = S.selected && target ? previewCombat(S.selected, target) : null;
  const modifierLabels = preview?.modifiers.length
    ? `<small>${preview.modifiers.map(mod => mod.label).join(' • ')}</small>`
    : '';
  const combatHtml = preview ? `
    <div class="tt-combat">
      <strong>Combat preview</strong>
      <span>${formatCombatPreview(preview)}</span>
      ${modifierLabels}
    </div>` : '';
  tooltip.innerHTML = `
    <div class="tt-title">${describeTile(tile)}${def ? ' (+' + def + '% def)' : ''}</div>
    <div class="tt-yields">
      <span>🌾${yields.food}</span>
      <span>⚒️${yields.prod}</span>
      <span>🔬${yields.science}</span>
      <span>💰${yields.gold}</span>
    </div>
    ${combatHtml}`;
  tooltip.style.display = 'block';
  tooltip.style.left = (x + 16) + 'px';
  tooltip.style.top = (y + 16) + 'px';
}

function hideTooltip() { tooltip.style.display = 'none'; }

// ─── Input handling ─────────────────────────────────
let dragStart = null, dragging = false;
const keysDown = new Set();
let lastMousePos = null;

// Zoom with wheel — toward cursor
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const newZoom = S.zoom * (1 - Math.sign(e.deltaY) * ZOOM_SPEED);
  smoothZoom(newZoom, px, py);
}, { passive: false });

canvas.addEventListener('mousedown', e => {
  dragStart = { x: e.clientX, y: e.clientY, camX: S.camX, camY: S.camY };
  dragging = false;
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  lastMousePos = { x: e.clientX, y: e.clientY };

  // Drag panning (account for zoom)
  if (dragStart) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true;
    if (dragging) {
      S.camX = dragStart.camX - dx / S.zoom;
      S.camY = dragStart.camY - dy / S.zoom;
      clampCam();
    }
  }

  // Hover (screen to world coords with zoom)
  const mx = (e.clientX - rect.left) / S.zoom + S.camX;
  const my = (e.clientY - rect.top) / S.zoom + S.camY;
  const tx = Math.floor(mx / TILE);
  const ty = Math.floor(my / TILE);

  if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H) {
    S.hoverTile = { x: tx, y: ty };
    showTooltip(e.clientX, e.clientY, tx, ty);

    // Path preview
    if (S.selected && S.selected.movLeft > 0 && S.phase === 'player') {
      S.path = findPath(S.selected.x, S.selected.y, tx, ty);
    }
  } else {
    S.hoverTile = null;
    S.path = [];
    hideTooltip();
  }
});

canvas.addEventListener('mouseup', e => {
  if (!dragging && S.phase === 'player') {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / S.zoom + S.camX;
    const my = (e.clientY - rect.top) / S.zoom + S.camY;
    const tx = Math.floor(mx / TILE);
    const ty = Math.floor(my / TILE);
    handleClick(tx, ty);
  }
  dragStart = null;
  dragging = false;
});

canvas.addEventListener('mouseleave', () => {
  hideTooltip();
  S.hoverTile = null;
  lastMousePos = null;
});

// Minimap click
miniC.addEventListener('click', e => {
  playAudioEvent(AUDIO_EVENTS.click);
  const rect = miniC.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  const tx = Math.floor(mx * MAP_W);
  const ty = Math.floor(my * MAP_H);
  centerOn(tx, ty);
});

function handleClick(tx, ty) {
  if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;

  // Select own unit
  const myUnit = S.units.find(u => u.owner === 'player' && u.x === tx && u.y === ty);
  if (myUnit) {
    playAudioEvent(AUDIO_EVENTS.select);
    S.selected = myUnit;
    S.selectedCity = null;
    S.reachable = calcReachable(myUnit);
    S.path = [];
    updateUnitPanel();
    return;
  }

  const city = S.cities.find(c => c.x === tx && c.y === ty && S.fog[c.y][c.x] > 0);
  if (city && !S.selected) {
    S.selectedCity = city;
    updateUnitPanel();
    return;
  }

  // Move / attack with selected unit
  if (S.selected && S.selected.movLeft > 0) {
    const enemy = S.units.find(u => u.owner === 'bot' && u.x === tx && u.y === ty);
    if (enemy && previewCombat(S.selected, enemy).inRange) {
      combat(S.selected, enemy);
      S.selected.movLeft = 0;
      S.reachable.clear();
      updateUnitPanel();
      refreshVision();
      return;
    }

    const path = findPath(S.selected.x, S.selected.y, tx, ty);
    if (path.length > 1) {
      // Calculate how far we can go
      let stepsCanTake = 0, movLeft = S.selected.movLeft;
      for (let i = 1; i < path.length; i++) {
        const cost = moveCost(path[i].x, path[i].y);
        if (cost > movLeft) break;
        // Block on own units
        if (S.units.find(u => u.x === path[i].x && u.y === path[i].y && u !== S.selected)) {
          // If enemy, attack
          const blocker = S.units.find(u => u.x === path[i].x && u.y === path[i].y);
          if (blocker && blocker.owner === 'bot') {
            // Move to previous tile then attack
            const movePath = path.slice(0, i);
            if (movePath.length > 1) {
              const sel = S.selected;
              animateMove(sel, movePath, () => {
                sel.movLeft = movLeft;
                if (previewCombat(sel, blocker).inRange) combat(sel, blocker);
                sel.movLeft = 0;
                S.reachable.clear();
                updateUnitPanel();
                refreshVision();
              });
              return;
            } else {
              if (previewCombat(S.selected, blocker).inRange) combat(S.selected, blocker);
              S.selected.movLeft = 0;
            }
          }
          break;
        }
        movLeft -= cost;
        stepsCanTake = i;
      }

      if (stepsCanTake > 0) {
        const walkPath = path.slice(0, stepsCanTake + 1);
        const finalMovLeft = movLeft;
        const sel = S.selected;
        playAudioEvent(AUDIO_EVENTS.move);
        animateMove(sel, walkPath, () => {
          sel.movLeft = finalMovLeft;
          S.reachable = calcReachable(sel);
          updateUnitPanel();
          refreshVision();
          // City capture
          const cap = S.cities.find(c => c.owner === 'bot' && c.x === sel.x && c.y === sel.y);
          if (cap) {
            cap.owner = 'player';
            claimTerritory(S.map, S.cities);
            updateHud();
            playAudioEvent(AUDIO_EVENTS.build);
            log(`Captured ${cap.name}!`, 'build');
            checkWin();
          }
        });
      }
    }
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  keysDown.add(e.key.toLowerCase());

  if (S.ux.screen === 'menu') {
    if (e.key === 'Enter') beginGame();
    if (e.key === '?' || e.key.toLowerCase() === 'h') setTutorial();
    return;
  }

  if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') endPlayerTurn();
  if (e.key === 'c' || e.key === 'C') {
    const u = S.selected || S.units.find(u => u.owner === 'player');
    if (u) {
      playAudioEvent(AUDIO_EVENTS.click);
      centerOn(u.x, u.y);
    }
  }
  if (e.key === 'Escape') {
    if (S.ux.tutorialOpen) {
      playAudioEvent(AUDIO_EVENTS.click);
      setTutorial(false);
      return;
    }
    playAudioEvent(AUDIO_EVENTS.click);
    S.selected = null;
    S.selectedCity = null;
    S.reachable.clear();
    S.path = [];
    updateUnitPanel();
  }

  // Space: cycle to next idle player unit (movLeft > 0)
  if (e.key === ' ') {
    e.preventDefault();
    const idle = S.units.filter(u => u.owner === 'player' && u.movLeft > 0);
    if (idle.length === 0) return;
    const curIdx = S.selected ? idle.indexOf(S.selected) : -1;
    const next = idle[(curIdx + 1) % idle.length];
    playAudioEvent(AUDIO_EVENTS.select);
    S.selected = next;
    S.selectedCity = null;
    S.reachable = calcReachable(next);
    S.path = [];
    updateUnitPanel();
    centerOn(next.x, next.y);
  }
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key.toLowerCase());
});

// Buttons
document.getElementById('btnEndTurn').addEventListener('click', endPlayerTurn);
document.getElementById('btnCenter').addEventListener('click', () => {
  const u = S.selected || S.units.find(u => u.owner === 'player');
  if (u) {
    playAudioEvent(AUDIO_EVENTS.click);
    centerOn(u.x, u.y);
  }
});
document.getElementById('btnHelp').addEventListener('click', () => setTutorial());
document.getElementById('btnStartGame').addEventListener('click', beginGame);
document.getElementById('btnMenuTutorial').addEventListener('click', () => setTutorial());
document.getElementById('btnCloseTutorial').addEventListener('click', () => setTutorial(false));
document.getElementById('btnRestartGame').addEventListener('click', restartGame);
document.getElementById('btnGameOverTutorial').addEventListener('click', () => setTutorial(true));

// ─── Main loop ──────────────────────────────────────
let lastTime = 0;
function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update
  S.waterPhase += dt * 2;
  S.selectionPhase += dt * 3;
  updateParticles();

  // Clear
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Render all layers with zoom transform
  ctx.save();
  ctx.scale(S.zoom, S.zoom);
  ctx.translate(-S.camX, -S.camY);
  drawLayerTerrain();
  drawLayerGrid();
  drawLayerReachable();
  drawLayerPath();
  drawLayerCities();
  drawLayerUnits();
  drawLayerFog();
  drawLayerHover();
  drawLayerParticles();
  ctx.restore();

  // Minimap (screen-space, no zoom)
  drawMinimap();

  // Edge scrolling
  if (S.phase === 'player' && lastMousePos) {
    const rect = canvas.getBoundingClientRect();
    const mx = lastMousePos.x - rect.left;
    const my = lastMousePos.y - rect.top;
    let ex = 0, ey = 0;
    if (mx < EDGE_SCROLL_ZONE) ex = -1;
    else if (mx > canvas.width - EDGE_SCROLL_ZONE) ex = 1;
    if (my < EDGE_SCROLL_ZONE) ey = -1;
    else if (my > canvas.height - EDGE_SCROLL_ZONE) ey = 1;
    if (ex || ey) {
      S.camX += ex * EDGE_SCROLL_SPEED * dt / S.zoom;
      S.camY += ey * EDGE_SCROLL_SPEED * dt / S.zoom;
      clampCam();
    }
  }

  // WASD panning
  if (S.phase === 'player' && keysDown.size) {
    let dx = 0, dy = 0;
    if (keysDown.has('w') || keysDown.has('arrowup')) dy = -1;
    if (keysDown.has('s') || keysDown.has('arrowdown')) dy = 1;
    if (keysDown.has('a') || keysDown.has('arrowleft')) dx = -1;
    if (keysDown.has('d') || keysDown.has('arrowright')) dx = 1;
    if (dx || dy) {
      S.camX += dx * PAN_SPEED * dt / S.zoom;
      S.camY += dy * PAN_SPEED * dt / S.zoom;
      clampCam();
    }
  }

  requestAnimationFrame(gameLoop);
}

// ─── Async init: load sprites then start game ───────
(async () => {
  log('Loading sprites…');
  ATLAS = await buildSpriteAtlas();
  updateHud();
  updateUnitPanel();
  log('Sprites loaded — game starting!', 'good');
  updateTechPanel();
  requestAnimationFrame(gameLoop);
})();
