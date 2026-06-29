/* ─────────────────────────────────────────────────────
   game.js – CIV Lite Engine
   Layered rendering with procedural sprites
   Inspired by Freeciv-web layers, C7 terrain system,
   and Unciv tile groups.
   ───────────────────────────────────────────────────── */
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

// ─── Constants ──────────────────────────────────────
const MAP_W = 24, MAP_H = 16, TILE = 48;
const ZOOM_MIN = 0.4, ZOOM_MAX = 3, ZOOM_SPEED = 0.08;
const EDGE_SCROLL_ZONE = 30, EDGE_SCROLL_SPEED = 600;  // px from edge, px/sec
const PAN_SPEED = 500;  // WASD px/sec (world units)
const SIGHT = 2;
const TERRAIN_TYPES = ['plains', 'forest', 'hill', 'water', 'desert'];
const TERRAIN_YIELD = {
  plains: { food: 2, prod: 1, sci: 0 },
  forest: { food: 1, prod: 2, sci: 0 },
  hill:   { food: 0, prod: 2, sci: 1 },
  water:  { food: 3, prod: 0, sci: 0 },
  desert: { food: 0, prod: 1, sci: 1 },
};
const TERRAIN_DEFENSE = { plains: 0, forest: 0.25, hill: 0.35, water: 0, desert: 0 };
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
  food:    document.getElementById('food'),
  prod:    document.getElementById('prod'),
  science: document.getElementById('science'),
  currentTech: document.getElementById('currentTech'),
  techList: document.getElementById('techList'),
  unitDet: document.getElementById('unitDetails'),
  logBox:  document.getElementById('logContent'),
};

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

// ─── Seeded RNG for tile variants ───────────────────
function hashTile(x, y) { return ((x * 374761393 + y * 668265263) ^ 1274126177) >>> 0; }

// ─── Map generation ─────────────────────────────────
function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      const n = noise(x, y);
      let t;
      if (n < 0.2) t = 'water';
      else if (n < 0.38) t = 'plains';
      else if (n < 0.55) t = 'forest';
      else if (n < 0.7) t = 'hill';
      else t = 'desert';
      row.push(t);
    }
    map.push(row);
  }
  // Ensure starting positions are on land
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const y1 = 2 + dy, x1 = 2 + dx;
      const y2 = MAP_H - 3 + dy, x2 = MAP_W - 3 + dx;
      if (map[y1][x1] === 'water') map[y1][x1] = 'plains';
      if (map[y2][x2] === 'water') map[y2][x2] = 'plains';
    }
  return map;
}

function noise(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// ─── State ──────────────────────────────────────────
const S = {
  map: generateMap(),
  units: [
    createUnit(1, 'player', 2, 2, 'warrior'),
    createUnit(2, 'bot', MAP_W - 3, MAP_H - 3, 'warrior'),
  ],
  cities: [
    { owner: 'player', x: 2, y: 2, name: 'Athens', food: 0, prod: 0, pop: 1 },
    { owner: 'bot',    x: MAP_W - 3, y: MAP_H - 3, name: 'Babylon', food: 0, prod: 0, pop: 1 },
  ],
  turn: 1,
  phase: 'player',  // player | bot | animating | gameover
  selected: null,
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
  fadeVision();
  S.units.filter(u => u.owner === 'player').forEach(u => revealAround(u.x, u.y));
  S.cities.filter(c => c.owner === 'player').forEach(c => revealAround(c.x, c.y));
}

refreshVision();

// ─── Pathfinding (A*) ───────────────────────────────
function heuristic(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function neighbors(x, y) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  return dirs.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H && S.map[p.y][p.x] !== 'water');
}

function moveCost(tx, ty) {
  const t = S.map[ty][tx];
  if (t === 'hill' || t === 'forest') return 2;
  return 1;
}

function findPath(sx, sy, gx, gy) {
  if (S.map[gy][gx] === 'water') return [];
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
function combat(attacker, defender) {
  const defTerrain = S.map[defender.y][defender.x];
  const defBonus = TERRAIN_DEFENSE[defTerrain] || 0;
  const dmg = Math.max(5, attacker.atk - defender.def * (1 + defBonus) * 0.5 + Math.random() * 10);
  defender.hp -= Math.round(dmg);
  // Counter-attack
  if (defender.hp > 0) {
    const counterDmg = Math.max(2, defender.atk * 0.4 - attacker.def * 0.3 + Math.random() * 5);
    attacker.hp -= Math.round(counterDmg);
    log(`Counter! ${attacker.type} takes ${Math.round(counterDmg)} dmg`, 'combat');
  }
  spawnParticles(defender.x * TILE + TILE / 2, defender.y * TILE + TILE / 2, 12);
  log(`${attacker.owner}'s ${attacker.type} hits for ${Math.round(dmg)} dmg`, 'combat');
  if (defender.hp <= 0) {
    S.units = S.units.filter(u => u !== defender);
    log(`${defender.owner}'s ${defender.type} destroyed!`, 'combat');
    spawnParticles(defender.x * TILE + TILE / 2, defender.y * TILE + TILE / 2, 20);
    checkWin();
  }
  if (attacker.hp <= 0) {
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
    S.phase = 'gameover';
    dom.status.textContent = '🎉 Victory!';
    dom.status.className = 'status-win';
    log('*** VICTORY! ***', 'build');
  } else if (playerUnits.length === 0 && playerCities.length === 0) {
    S.phase = 'gameover';
    dom.status.textContent = '💀 Defeat';
    dom.status.className = 'status-lose';
    log('*** DEFEAT ***', 'combat');
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
  let totalFood = 0, totalProd = 0, totalSci = 0;
  for (const city of cities) {
    // Gather yields from surrounding tiles
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = city.x + dx, ny = city.y + dy;
        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H) {
          const y = TERRAIN_YIELD[S.map[ny][nx]];
          totalFood += y.food;
          totalProd += y.prod;
          totalSci  += y.sci;
        }
      }
    city.food += totalFood;
    city.prod += totalProd;

    // City growth
    if (city.food >= 8 * city.pop) {
      city.pop++;
      city.food = 0;
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
            S.map[ny][nx] !== 'water' &&
            !S.units.find(u => u.x === nx && u.y === ny)) {
          spawnX = nx; spawnY = ny; break;
        }
      }
      const type = chooseUnitToTrain(owner);
      S.units.push(createUnit(id, owner, spawnX, spawnY, type));
      log(`${city.name} trained a ${type}!`, 'build');
      if (owner === 'player') revealAround(spawnX, spawnY);
    }
  }
  return { food: totalFood, prod: totalProd, sci: totalSci };
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
  S.phase = 'bot';
  S.selected = null;
  S.reachable.clear();
  S.path = [];
  dom.status.textContent = 'Bot thinking…';
  dom.status.className = 'status-thinking';
  updateUnitPanel();

  const res = gatherResources('player');
  completeResearch('player', res.sci);
  dom.food.textContent = res.food;
  dom.prod.textContent = res.prod;
  dom.science.textContent = res.sci;

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
  updateTechPanel();
  log(`─── Turn ${S.turn} ───`);
}

// ─── Bot AI ─────────────────────────────────────────
function botTurn() {
  const botRes = gatherResources('bot');
  completeResearch('bot', botRes.sci);
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

    // Check if adjacent to a player unit (attack)
    const adj = S.units.find(u => u.owner === 'player' &&
      Math.abs(u.x - bot.x) + Math.abs(u.y - bot.y) === 1);
    if (adj) {
      combat(bot, adj);
      bot.movLeft = 0;
      // Check city capture
      const cap = S.cities.find(c => c.owner === 'player' && c.x === bot.x && c.y === bot.y);
      if (cap) { cap.owner = 'bot'; log(`Bot captured ${cap.name}!`, 'combat'); }
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
      if (cap) { cap.owner = 'bot'; log(`Bot captured ${cap.name}!`, 'combat'); }
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
      const terrain = S.map[y][x];
      const variant = S.tileVariants[y][x];
      const sprite = ATLAS.terrain[terrain][variant];
      const px = x * TILE;
      const py = y * TILE;
      ctx.drawImage(sprite, px, py, TILE, TILE);

      if (terrain === 'water') {
        const shimmer = Math.sin(S.waterPhase + x * 0.7 + y * 0.5) * 0.08 + 0.04;
        ctx.fillStyle = `rgba(120,200,255,${shimmer})`;
        ctx.fillRect(px, py, TILE, TILE);
      }
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
      ctx.strokeRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
}

// Layer 2: Reachable tile highlights
function drawLayerReachable() {
  if (!S.selected || S.reachable.size === 0) return;
  ctx.fillStyle = 'rgba(90,200,250,0.12)';
  for (const key of S.reachable) {
    const [x, y] = key.split(',').map(Number);
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
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

    ctx.font = `bold ${9 / S.zoom}px system-ui`;
    ctx.fillStyle = city.owner === 'player' ? '#44aaff' : '#ff5555';
    ctx.textAlign = 'center';
    ctx.fillText(city.name, px, py + 28);

    ctx.fillStyle = '#222';
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

    const sprite = unit.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot;
    const px = unit.x * TILE;
    const py = unit.y * TILE;
    ctx.drawImage(sprite, px, py, TILE, TILE);

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
    const sprite = a.unit.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot;
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
    plains: '#4d8f52', forest: '#2a6e3a', hill: '#8a7d50',
    water: '#1e5799', desert: '#c9a855'
  };

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (S.fog[y][x] === 0) {
        miniCtx.fillStyle = '#111';
      } else {
        miniCtx.fillStyle = terrainColors[S.map[y][x]];
        if (S.fog[y][x] === 1) {
          miniCtx.globalAlpha = 0.5;
        }
      }
      miniCtx.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
      miniCtx.globalAlpha = 1;
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
  if (!u) {
    dom.unitDet.innerHTML = '<p class="placeholder">Click a unit to see details</p>';
    return;
  }
  const hpClass = u.hp > 60 ? 'hp-high' : u.hp > 30 ? 'hp-mid' : 'hp-low';
  dom.unitDet.innerHTML = `
    <div class="unit-info-header">
      <canvas class="unit-icon" id="unitIcon" width="32" height="32"></canvas>
      <span class="unit-name">${u.type.charAt(0).toUpperCase() + u.type.slice(1)}</span>
    </div>
    <div class="unit-info-stats">
      <span class="stat-label">HP</span><span class="stat-val ${hpClass}">${u.hp}/100</span>
      <span class="stat-label">ATK</span><span class="stat-val">${u.atk}</span>
      <span class="stat-label">DEF</span><span class="stat-val">${u.def}</span>
      <span class="stat-label">MOV</span><span class="stat-val">${u.movLeft}/${u.mov}</span>
    </div>`;
  // Draw tiny icon
  const ic = document.getElementById('unitIcon');
  if (ic) {
    const ictx = ic.getContext('2d');
    const sprite = u.owner === 'player' ? ATLAS.units.player : ATLAS.units.bot;
    ictx.drawImage(sprite, 0, 0, 32, 32);
  }
}

// ─── Tooltip ────────────────────────────────────────
function showTooltip(x, y, tileX, tileY) {
  if (tileX < 0 || tileX >= MAP_W || tileY < 0 || tileY >= MAP_H) { hideTooltip(); return; }
  if (S.fog[tileY][tileX] === 0) { hideTooltip(); return; }
  const terrain = S.map[tileY][tileX];
  const yields = TERRAIN_YIELD[terrain];
  const def = Math.round(TERRAIN_DEFENSE[terrain] * 100);
  tooltip.innerHTML = `
    <div class="tt-title">${terrain}${def ? ' (+' + def + '% def)' : ''}</div>
    <div class="tt-yields">
      <span>🌾${yields.food}</span>
      <span>⚒️${yields.prod}</span>
      <span>🔬${yields.sci}</span>
    </div>`;
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
    S.selected = myUnit;
    S.reachable = calcReachable(myUnit);
    S.path = [];
    updateUnitPanel();
    return;
  }

  // Move / attack with selected unit
  if (S.selected && S.selected.movLeft > 0) {
    const enemy = S.units.find(u => u.owner === 'bot' && u.x === tx && u.y === ty);
    if (enemy && Math.abs(enemy.x - S.selected.x) + Math.abs(enemy.y - S.selected.y) === 1) {
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
                combat(sel, blocker);
                sel.movLeft = 0;
                S.reachable.clear();
                updateUnitPanel();
                refreshVision();
              });
              return;
            } else {
              combat(S.selected, blocker);
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
        animateMove(sel, walkPath, () => {
          sel.movLeft = finalMovLeft;
          S.reachable = calcReachable(sel);
          updateUnitPanel();
          refreshVision();
          // City capture
          const cap = S.cities.find(c => c.owner === 'bot' && c.x === sel.x && c.y === sel.y);
          if (cap) { cap.owner = 'player'; log(`Captured ${cap.name}!`, 'build'); checkWin(); }
        });
      }
    }
  }
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  keysDown.add(e.key.toLowerCase());

  if (e.key === 'e' || e.key === 'E') endPlayerTurn();
  if (e.key === 'c' || e.key === 'C') {
    const u = S.selected || S.units.find(u => u.owner === 'player');
    if (u) centerOn(u.x, u.y);
  }
  if (e.key === 'Escape') {
    S.selected = null;
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
    S.selected = next;
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
  if (u) centerOn(u.x, u.y);
});

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
  log('Sprites loaded — game starting!', 'good');
  updateTechPanel();
  requestAnimationFrame(gameLoop);
})();
