/* ─────────────────────────────────────────────────────
   sprites.js – Real sprite loader + procedural fallback
   Loads Unciv FantasyHex tileset PNGs from assets/unciv/
   with automatic upscaling to game tile size and
   procedural generation as fallback if image fails.
   ───────────────────────────────────────────────────── */

const SPRITE_SIZE = 64;
const TILE = 48;

// ───── Utility ──────────────────────────────────────
function offscreen(w = SPRITE_SIZE, h = SPRITE_SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

/** Load an image, returning null on failure instead of throwing */
function loadImg(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Given a source image, create N variants for terrain diversity.
 * Each variant gets slight tint adjustments for visual variety.
 */
function makeTerrainVariant(img, variantIndex = 0) {
  const c = offscreen(SPRITE_SIZE, SPRITE_SIZE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

  if (variantIndex > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    const hueShift = (variantIndex * 25 - 37);
    ctx.fillStyle = `hsla(${120 + hueShift}, 15%, ${50 + (variantIndex - 2) * 5}%, 0.08)`;
    ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    ctx.globalCompositeOperation = 'source-over';
  }
  return c;
}

/**
 * Create a colorized unit sprite on a colored circle background.
 */
function makeUnitOnCircle(img, teamColor, glowColor, size = TILE) {
  const c = offscreen(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;

  // Team-colored circle glow
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = glowColor + '60';
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Colored backing circle
  ctx.fillStyle = teamColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 15, 0, Math.PI * 2);
  ctx.fill();

  // Draw the unit sprite scaled up, centered
  const unitScale = 32;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - unitScale / 2, cy - unitScale / 2 - 1, unitScale, unitScale);

  // Slight tint overlay for team color identification
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = teamColor + '30';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';

  // Border ring
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.stroke();

  return c;
}

/**
 * Create a city sprite compositing the Unciv City_center on a decorative background.
 */
function makeCitySprite(img, isPlayer, w = 56, h = 56) {
  const c = offscreen(w, h);
  const ctx = c.getContext('2d');
  const cx = w / 2, cy = h / 2;

  const primary = isPlayer ? '#4488cc' : '#cc4444';
  const secondary = isPlayer ? '#336699' : '#993333';

  // City glow
  ctx.shadowColor = primary;
  ctx.shadowBlur = 12;
  ctx.fillStyle = primary + '30';
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Base platform
  ctx.fillStyle = secondary + '80';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw city sprite upscaled and centered
  const cityScale = 44;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, cx - cityScale / 2, cy - cityScale / 2 - 4, cityScale, cityScale);

  // Team tint overlay
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = primary + '20';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  // Flag
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx, cy - 26);
  ctx.stroke();
  ctx.fillStyle = isPlayer ? '#44aaff' : '#ff4444';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 26);
  ctx.lineTo(cx + 7, cy - 23);
  ctx.lineTo(cx, cy - 20);
  ctx.closePath();
  ctx.fill();

  return c;
}

// =====================================================
// PROCEDURAL FALLBACK SPRITES
// =====================================================

function drawPlainsTile(seed = 42) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
  g.addColorStop(0, '#5a9e5f'); g.addColorStop(0.5, '#4d8f52'); g.addColorStop(1, '#3f7d43');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.strokeStyle = 'rgba(80,160,90,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const x = rng() * SPRITE_SIZE, y = rng() * SPRITE_SIZE;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 6, y - 4 - rng() * 6); ctx.stroke();
  }
  return c;
}

function drawForestTile(seed = 77) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
  g.addColorStop(0, '#2e6e3a'); g.addColorStop(1, '#1a4d26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const treeCount = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < treeCount; i++) {
    const tx = 8 + rng() * (SPRITE_SIZE - 16);
    const ty = 12 + rng() * (SPRITE_SIZE - 20);
    const size = 8 + rng() * 6;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(tx + 2, ty + 3, size * 0.5, size * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(tx - 1.5, ty - 2, 3, 6);
    ctx.fillStyle = `rgb(${30 + Math.floor(rng() * 30)},${90 + Math.floor(rng() * 40)},${30 + Math.floor(rng() * 20)})`;
    ctx.beginPath(); ctx.moveTo(tx, ty - size); ctx.lineTo(tx - size * 0.5, ty); ctx.lineTo(tx + size * 0.5, ty);
    ctx.closePath(); ctx.fill();
  }
  return c;
}

function drawHillTile(seed = 33) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
  g.addColorStop(0, '#8a7d50'); g.addColorStop(0.5, '#7a6d42'); g.addColorStop(1, '#6a5d35');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const hc = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < hc; i++) {
    const hx = 10 + rng() * (SPRITE_SIZE - 20), hy = 20 + rng() * (SPRITE_SIZE - 30);
    const hw = 18 + rng() * 14, hh = 10 + rng() * 8;
    const hg = ctx.createRadialGradient(hx - 3, hy - 3, 0, hx, hy, hw * 0.6);
    hg.addColorStop(0, '#b5a872'); hg.addColorStop(1, '#8a7a4e');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(hx, hy, hw * 0.5, hh * 0.5, 0, Math.PI, 0); ctx.fill();
  }
  return c;
}

function drawWaterTile(seed = 55) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  g.addColorStop(0, '#1e5799'); g.addColorStop(0.5, '#2469aa'); g.addColorStop(1, '#1a4f88');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.strokeStyle = 'rgba(120,180,240,0.25)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = 6 + rng() * (SPRITE_SIZE - 12);
    ctx.beginPath(); ctx.moveTo(rng() * 10, y);
    for (let wx = 0; wx < SPRITE_SIZE; wx += 8) ctx.quadraticCurveTo(wx + 4, y - 2 - rng() * 2, wx + 8, y);
    ctx.stroke();
  }
  return c;
}

function drawDesertTile(seed = 88) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
  g.addColorStop(0, '#d4b96a'); g.addColorStop(0.5, '#c9a855'); g.addColorStop(1, '#b8973e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.strokeStyle = 'rgba(180,150,80,0.3)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = 10 + rng() * (SPRITE_SIZE - 20);
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x < SPRITE_SIZE; x += 12) ctx.quadraticCurveTo(x + 6, y - 3 + rng() * 6, x + 12, y);
    ctx.stroke();
  }
  return c;
}

function drawTundraTile(seed = 99) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, 0, SPRITE_SIZE);
  g.addColorStop(0, '#8ba08d'); g.addColorStop(0.5, '#74876f'); g.addColorStop(1, '#5e705f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.fillStyle = 'rgba(225,235,225,0.22)';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(rng() * SPRITE_SIZE, rng() * SPRITE_SIZE, 3 + rng() * 9, 1 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function drawSnowTile(seed = 101) {
  const c = offscreen();
  const ctx = c.getContext('2d');
  const rng = seededRandom(seed);
  const g = ctx.createLinearGradient(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  g.addColorStop(0, '#dce8ed'); g.addColorStop(0.55, '#cbd9df'); g.addColorStop(1, '#edf4f7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  ctx.strokeStyle = 'rgba(150,170,180,0.18)';
  for (let i = 0; i < 7; i++) {
    const y = rng() * SPRITE_SIZE;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.quadraticCurveTo(SPRITE_SIZE * 0.5, y + (rng() - 0.5) * 10, SPRITE_SIZE, y + (rng() - 0.5) * 8);
    ctx.stroke();
  }
  return c;
}

function drawWarriorSprite(color, isBot = false) {
  const c = offscreen(48, 48);
  const ctx = c.getContext('2d');
  const cx = 24, cy = 24;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = isBot ? '#cc3333' : '#3388cc';
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isBot ? '#aa2222' : '#2266aa';
  ctx.beginPath(); ctx.ellipse(cx, cy, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd4a3'; ctx.beginPath(); ctx.arc(cx, cy - 8, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = isBot ? '#882222' : '#224488';
  ctx.beginPath(); ctx.arc(cx, cy - 10, 5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(cx - 3, cy - 9, 2, 1.5); ctx.fillRect(cx + 1, cy - 9, 2, 1.5);
  if (isBot) {
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + 10, cy - 6); ctx.lineTo(cx + 10, cy + 10); ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.beginPath(); ctx.moveTo(cx + 7, cy - 6); ctx.lineTo(cx + 13, cy - 6);
    ctx.lineTo(cx + 14, cy - 2); ctx.lineTo(cx + 7, cy - 2); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx + 10, cy - 10); ctx.lineTo(cx + 10, cy + 6); ctx.stroke();
    ctx.strokeStyle = '#8b6914'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + 6, cy + 1); ctx.lineTo(cx + 14, cy + 1); ctx.stroke();
  }
  ctx.fillStyle = isBot ? '#661111' : '#114466';
  ctx.strokeStyle = isBot ? '#882222' : '#2266aa'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx - 9, cy + 1, 5, 7, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = isBot ? '#ff4444' : '#44aaff';
  ctx.beginPath(); ctx.arc(cx - 9, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  return c;
}

function drawCitySpriteFallback(isPlayer) {
  const w = 56, h = 56;
  const c = offscreen(w, h);
  const ctx = c.getContext('2d');
  const cx = w / 2, cy = h / 2;
  const primary = isPlayer ? '#4488cc' : '#cc4444';
  const wall = isPlayer ? '#5599dd' : '#dd5555';
  const roof = isPlayer ? '#2255aa' : '#aa2233';
  const secondary = isPlayer ? '#336699' : '#993333';
  ctx.shadowColor = primary; ctx.shadowBlur = 10;
  ctx.fillStyle = primary + '40'; ctx.beginPath(); ctx.arc(cx, cy, 24, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = wall; ctx.strokeStyle = secondary; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(cx - 20, cy + 4, 40, 14, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = secondary;
  for (let i = 0; i < 5; i++) ctx.fillRect(cx - 18 + i * 9, cy + 1, 5, 4);
  ctx.fillStyle = wall; ctx.fillRect(cx - 8, cy - 6, 16, 16);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(cx - 10, cy - 6); ctx.lineTo(cx, cy - 16);
  ctx.lineTo(cx + 10, cy - 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = wall; ctx.fillRect(cx - 16, cy - 2, 8, 12);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(cx - 18, cy - 2); ctx.lineTo(cx - 12, cy - 10);
  ctx.lineTo(cx - 6, cy - 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = wall; ctx.fillRect(cx + 8, cy - 2, 8, 12);
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(cx + 6, cy - 2); ctx.lineTo(cx + 12, cy - 10);
  ctx.lineTo(cx + 18, cy - 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffeebb';
  ctx.fillRect(cx - 3, cy - 2, 3, 3); ctx.fillRect(cx + 1, cy - 2, 3, 3);
  ctx.fillRect(cx - 3, cy + 3, 3, 3); ctx.fillRect(cx + 1, cy + 3, 3, 3);
  ctx.fillStyle = '#6b4423';
  ctx.beginPath(); ctx.arc(cx, cy + 10, 3, Math.PI, 0); ctx.fill();
  ctx.fillRect(cx - 3, cy + 10, 6, 4);
  ctx.strokeStyle = '#666'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy - 24); ctx.stroke();
  ctx.fillStyle = isPlayer ? '#44aaff' : '#ff4444';
  ctx.beginPath(); ctx.moveTo(cx, cy - 24); ctx.lineTo(cx + 7, cy - 21);
  ctx.lineTo(cx, cy - 18); ctx.closePath(); ctx.fill();
  return c;
}

// ───── Effect sprites (always procedural) ───────────
function drawExplosionFrame(frame, maxFrames = 6) {
  const c = offscreen(48, 48); const ctx = c.getContext('2d');
  const cx = 24, cy = 24, progress = frame / maxFrames;
  const radius = 6 + progress * 18, alpha = 1 - progress * 0.8;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, `rgba(255,200,50,${alpha})`);
  g.addColorStop(0.4, `rgba(255,100,20,${alpha * 0.7})`);
  g.addColorStop(1, 'rgba(180,30,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
  const rng = seededRandom(frame * 31);
  ctx.fillStyle = `rgba(255,230,100,${alpha})`;
  for (let i = 0; i < 6; i++) {
    const angle = rng() * Math.PI * 2, dist = radius * (0.5 + rng() * 0.7);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, 1.5 - progress, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function drawSelectionRing() {
  const c = offscreen(64, 64); const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(90,200,250,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.stroke();
  return c;
}

function drawMoveTarget() {
  const c = offscreen(24, 24); const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(90,250,150,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(12, 12, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(12, 12, 3, 0, Math.PI * 2); ctx.fill();
  return c;
}

function drawFogTexture() {
  const c = offscreen(SPRITE_SIZE, SPRITE_SIZE); const ctx = c.getContext('2d');
  const rng = seededRandom(123);
  ctx.fillStyle = 'rgba(8,12,20,0.7)'; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  for (let i = 0; i < 30; i++) {
    const x = rng() * SPRITE_SIZE, y = rng() * SPRITE_SIZE, r = 6 + rng() * 14;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(15,20,35,${0.1 + rng() * 0.15})`);
    g.addColorStop(1, 'rgba(15,20,35,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function drawSeenFogTexture() {
  const c = offscreen(SPRITE_SIZE, SPRITE_SIZE); const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,20,0.45)'; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return c;
}

function drawUnknownTexture() {
  const c = offscreen(SPRITE_SIZE, SPRITE_SIZE); const ctx = c.getContext('2d');
  ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  return c;
}

function drawResourceIcon(type) {
  const c = offscreen(16, 16); const ctx = c.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '12px sans-serif';
  switch (type) {
    case 'food': ctx.fillStyle = '#4cd964'; ctx.fillText('🌾', 8, 9); break;
    case 'prod': ctx.fillStyle = '#ff9500'; ctx.fillText('⚒️', 8, 9); break;
    case 'science': ctx.fillStyle = '#5ac8fa'; ctx.fillText('🔬', 8, 9); break;
  }
  return c;
}

// =====================================================
// MAIN ATLAS BUILDER – ASYNC with real sprites
// =====================================================

const UNCIV = './assets/unciv/';

/** Terrain type → Unciv sprite filename mapping (4 variants each) */
export const TERRAIN_FILES = {
  ocean: ['Lakes.png', 'Coast.png', 'Lakes.png', 'Coast.png'],
  coast: ['Coast.png', 'Lakes.png', 'Coast.png', 'Oasis.png'],
  plains: ['Plains.png', 'Plains_Farm.png', 'Grassland.png', 'Grassland_Farm.png'],
  grassland: ['Grassland.png', 'Grassland_Farm.png', 'Plains.png', 'Plains_Farm.png'],
  forest: ['Forest.png', 'GrasslandForest.png', 'PlainsForest.png', 'TundraForest.png'],
  jungle: ['Jungle.png', 'PlainsJungle.png', 'Forest.png', 'GrasslandForest.png'],
  hill: ['Hill.png', 'Mine.png', 'Quarry.png', 'Hill.png'],
  mountain: ['Mountain.png', 'Hill.png', 'Mountain.png', 'Mine.png'],
  desert: ['Desert.png', 'Desert_Farm.png', 'Oasis.png', 'Desert.png'],
  tundra: ['Tundra.png', 'TundraForest.png', 'Forest.png', 'Tundra.png'],
  snow: ['Snow.png', 'Ice.png', 'Snow.png', 'Tundra.png'],
};

const TERRAIN_FALLBACK = {
  ocean: drawWaterTile,
  coast: drawWaterTile,
  plains: drawPlainsTile,
  grassland: drawPlainsTile,
  forest: drawForestTile,
  jungle: drawForestTile,
  hill: drawHillTile,
  mountain: drawHillTile,
  desert: drawDesertTile,
  tundra: drawTundraTile,
  snow: drawSnowTile,
};

export async function buildSpriteAtlas() {
  console.log('[Sprites] Loading real Unciv FantasyHex sprites...');

  // ─── Terrain: load 4 variants per type ───────────
  const terrain = {};
  const terrainPromises = [];

  for (const type of Object.keys(TERRAIN_FILES)) {
    terrain[type] = new Array(4);
    const files = TERRAIN_FILES[type];

    for (let v = 0; v < 4; v++) {
      const file = files[v];
      const idx = v;
      terrainPromises.push(
        loadImg(UNCIV + file).then(img => {
          if (img) {
            terrain[type][idx] = makeTerrainVariant(img, idx);
            console.log(`[Sprites] ✓ ${type}[${idx}] ← ${file}`);
          } else {
            const seed = type.charCodeAt(0) * 97 + idx * 31;
            terrain[type][idx] = TERRAIN_FALLBACK[type](seed);
            console.warn(`[Sprites] ✗ ${file} failed, using procedural`);
          }
        })
      );
    }
  }

  await Promise.all(terrainPromises);

  // ─── Units ────────────────────────────────────────
  const [unitImg, archerImg, knightImg, settlerImg, swordsmanImg, scoutImg] = await Promise.all([
    loadImg(UNCIV + 'units/Warrior.png'),
    loadImg(UNCIV + 'units/Archer.png'),
    loadImg(UNCIV + 'units/Knight.png'),
    loadImg(UNCIV + 'units/Settler.png'),
    loadImg(UNCIV + 'units/Swordsman.png'),
    loadImg(UNCIV + 'units/Scout.png'),
  ]);

  let units;
  if (unitImg) {
    units = {
      player: makeUnitOnCircle(unitImg, '#1a4488', '#44aaff'),
      bot: makeUnitOnCircle(unitImg, '#881a1a', '#ff4444'),
    };
    console.log('[Sprites] ✓ Unit sprites loaded');
  } else {
    units = {
      player: drawWarriorSprite('#44aaff', false),
      bot: drawWarriorSprite('#ff4444', true),
    };
    console.warn('[Sprites] ✗ Unit sprites failed, using procedural');
  }

  // Extended unit type map
  const unitTypes = {};
  for (const [name, img] of [['warrior', unitImg], ['archer', archerImg], ['knight', knightImg],
    ['settler', settlerImg], ['swordsman', swordsmanImg], ['scout', scoutImg]]) {
    if (img) {
      unitTypes[name] = {
        player: makeUnitOnCircle(img, '#1a4488', '#44aaff'),
        bot: makeUnitOnCircle(img, '#881a1a', '#ff4444'),
      };
    }
  }

  // ─── Cities ───────────────────────────────────────
  const [cityImg, cityAncient] = await Promise.all([
    loadImg(UNCIV + 'City_center.png'),
    loadImg(UNCIV + 'City_center-Ancient_era.png'),
  ]);

  let cities;
  if (cityImg) {
    cities = {
      player: makeCitySprite(cityImg, true),
      bot: makeCitySprite(cityAncient || cityImg, false),
    };
    console.log('[Sprites] ✓ City sprites loaded');
  } else {
    cities = {
      player: drawCitySpriteFallback(true),
      bot: drawCitySpriteFallback(false),
    };
    console.warn('[Sprites] ✗ City sprites failed, using procedural');
  }

  // ─── Effects (always procedural) ──────────────────
  const explosionFrames = [];
  for (let i = 0; i < 6; i++) explosionFrames.push(drawExplosionFrame(i, 6));

  const fog = { hidden: drawFogTexture(), seen: drawSeenFogTexture(), unknown: drawUnknownTexture() };

  const ui = {
    selection: drawSelectionRing(), moveTarget: drawMoveTarget(),
    food: drawResourceIcon('food'), prod: drawResourceIcon('prod'), science: drawResourceIcon('science'),
  };

  console.log('[Sprites] Atlas build complete');
  return { terrain, units, unitTypes, cities, explosionFrames, fog, ui };
}
