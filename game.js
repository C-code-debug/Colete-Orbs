'use strict';

// ══════════════════════════════════════════════
//  CONSTANTS & CONFIG
// ══════════════════════════════════════════════
const SAVE_KEY  = 'colete-orbs-v2';
const isMobile  = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const ORB_TYPES = {
  normal:  { color: '#4ade80', glow: 'rgba(74,222,128,0.7)',  radius: 9,  points: 1,   chance: 0.60 },
  silver:  { color: '#e2e8f0', glow: 'rgba(226,232,240,0.7)', radius: 8,  points: 3,   chance: 0.25 },
  golden:  { color: '#fbbf24', glow: 'rgba(251,191,36,0.8)',  radius: 12, points: 10,  chance: 0.10 },
  rainbow: { color: null,       glow: null,                   radius: 14, points: 25,  chance: 0.05 },
};

const UPGRADES_CONFIG = {
  magnet:       { icon:'🧲', name:'Raio do Ímã',       desc:'Atrai orbs de longe',                         maxLevel: 8,  baseCost: 12,  mult: 2.5 },
  magnetForce:  { icon:'⚡', name:'Força do Ímã',      desc:'Orbs chegam mais rápido',                     maxLevel: 10, baseCost: 28,  mult: 2.2 },
  spawnRate:    { icon:'🌊', name:'Chuva de Orbs',     desc:'Orbs aparecem mais rápido',                   maxLevel: 10, baseCost: 22,  mult: 2.0 },
  maxOrbs:      { icon:'💎', name:'Mais Orbs',         desc:'Mais orbs no mapa ao mesmo tempo',            maxLevel: 50, baseCost: 9,   mult: 1.35 },
  multiplier:   { icon:'✨', name:'Multiplicador',     desc:'Mais pontos por orb coletado',                maxLevel: 10, baseCost: 60,  mult: 3.0 },
  goldenChance: { icon:'⭐', name:'Chance Dourada',    desc:'Aumenta orbs especiais',                      maxLevel: 15, baseCost: 110, mult: 2.8 },
  speed:        { icon:'🚀', name:'Velocidade',        desc:'Jogador se move mais rápido',                 maxLevel: 8,  baseCost: 35,  mult: 2.3 },
  comboTime:    { icon:'🔥', name:'Tempo de Combo',    desc:'Mantém o combo por mais tempo',               maxLevel: 6,  baseCost: 45,  mult: 2.5 },
};

// ══════════════════════════════════════════════
//  GAME STATE
// ══════════════════════════════════════════════
let state = {
  running: false,
  paused: false,
  score: 0,
  totalScore: 0,
  rebirths: 0,
  combo: 0,
  comboTimer: 0,
  maxCombo: 0,
  orbsCollected: 0,
  goldenCollected: 0,
  upgrades: {}
};

function initUpgrades() {
  state.upgrades = {};
  for (const [key, cfg] of Object.entries(UPGRADES_CONFIG)) {
    state.upgrades[key] = { level: 0 };
  }
}

// ══════════════════════════════════════════════
//  CANVAS & DOM
// ══════════════════════════════════════════════
const canvas   = document.getElementById('gameCanvas');
const ctx      = canvas.getContext('2d');
const container = document.getElementById('gameContainer');

function resizeCanvas() {
  const oldW = canvas.width  || container.clientWidth;
  const oldH = canvas.height || container.clientHeight;
  canvas.width  = container.clientWidth;
  canvas.height = container.clientHeight;
  if (state && state.running) {
    player.x = (player.x / oldW) * canvas.width;
    player.y = (player.y / oldH) * canvas.height;
  } else {
    player.x = canvas.width  / 2;
    player.y = canvas.height / 2;
  }
}

// ══════════════════════════════════════════════
//  PLAYER
// ══════════════════════════════════════════════
const player = {
  x: 400, y: 300,
  size: 14,
  speed: 4.5,
  vx: 0, vy: 0,
  rotation: 0,
  targetRotation: 0,
  bouncePhase: 0,
  squishX: 1, squishY: 1,
  trail: [],
  blinking: false,
  blinkTimer: 0,
  collectFlash: 0,
};

// ══════════════════════════════════════════════
//  INPUT
// ══════════════════════════════════════════════
const keys = {};
let joystickDir = { x: 0, y: 0 };
let joystickActive = false;

window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape' && state.running) togglePause();
  if (e.key === 'u' && state.running) togglePanel();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

// ══════════════════════════════════════════════
//  ORBS & PARTICLES
// ══════════════════════════════════════════════
let orbs       = [];
let particles  = [];
let floatTexts = [];
let lastOrbSpawn = 0;
let bgStars    = [];

function initBgStars() {
  bgStars = [];
  for (let i = 0; i < 80; i++) {
    bgStars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      pulse: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7
    });
  }
}

// ══════════════════════════════════════════════
//  GETTERS
// ══════════════════════════════════════════════
function getLvl(key) { return state.upgrades[key]?.level ?? 0; }

function getSpawnDelay()    { return Math.max(120, 1100 - getLvl('spawnRate') * 110); }
function getMaxOrbs()       { return 6 + getLvl('maxOrbs'); }
function getMagnetRadius()  { return getLvl('magnet') * 75; }
function getMagnetForce()   { return 0.14 + getLvl('magnetForce') * 0.07; }
function getPlayerSpeed()   { return player.speed + getLvl('speed') * 0.35; }
function getComboWindow()   { return 1800 + getLvl('comboTime') * 500; }

function getPointMult() {
  return Math.pow(2, getLvl('multiplier')) * Math.pow(2, state.rebirths);
}

function getUpgradeCost(key) {
  const cfg = UPGRADES_CONFIG[key];
  return Math.floor(cfg.baseCost * Math.pow(cfg.mult, getLvl(key)));
}

function getGoldenChanceBonus() { return getLvl('goldenChance') * 0.018; }

function getOrbType() {
  const bonus = getGoldenChanceBonus();
  const roll = Math.random();
  const types = Object.entries(ORB_TYPES);
  let cum = 0;
  for (const [name, t] of types) {
    let ch = t.chance;
    if (name !== 'normal') ch += bonus / (types.length - 1);
    cum += ch;
    if (roll < cum) return name;
  }
  return 'normal';
}

function getRebirthCost() {
  const costs = [600, 2000, 6000, 15000, 40000, 80000, 200000, 500000, 1200000, 3000000];
  return costs[state.rebirths] ?? Infinity;
}

// ══════════════════════════════════════════════
//  SAVE / LOAD
// ══════════════════════════════════════════════
function saveGame() {
  const data = {
    score: state.score,
    totalScore: state.totalScore,
    rebirths: state.rebirths,
    maxCombo: state.maxCombo,
    orbsCollected: state.orbsCollected,
    goldenCollected: state.goldenCollected,
    upgrades: state.upgrades
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { initUpgrades(); return; }
  try {
    const d = JSON.parse(raw);
    state.score          = d.score ?? 0;
    state.totalScore     = d.totalScore ?? 0;
    state.rebirths       = d.rebirths ?? 0;
    state.maxCombo       = d.maxCombo ?? 0;
    state.orbsCollected  = d.orbsCollected ?? 0;
    state.goldenCollected= d.goldenCollected ?? 0;
    initUpgrades();
    if (d.upgrades) {
      for (const key of Object.keys(state.upgrades)) {
        if (d.upgrades[key]) state.upgrades[key] = d.upgrades[key];
      }
    }
  } catch { initUpgrades(); }
}

function resetGame() {
  if (!confirm('Resetar TUDO? Isso apaga todos os pontos, rebirths e upgrades!')) return;
  localStorage.removeItem(SAVE_KEY);
  state.score = 0;
  state.totalScore = 0;
  state.rebirths = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.maxCombo = 0;
  state.orbsCollected = 0;
  state.goldenCollected = 0;
  initUpgrades();
  updateHUD();
  buildPanel();
}

// ══════════════════════════════════════════════
//  SPAWN
// ══════════════════════════════════════════════
function spawnOrb() {
  if (orbs.length >= getMaxOrbs()) return;
  const m = 35;
  const typeName = getOrbType();
  const typeData = ORB_TYPES[typeName];

  // keep away from player initially
  let x, y, tries = 0;
  do {
    x = m + Math.random() * (canvas.width - m * 2);
    y = m + Math.random() * (canvas.height - m * 2);
    tries++;
  } while (tries < 10 && Math.hypot(x - player.x, y - player.y) < 80);

  orbs.push({
    x, y,
    typeName,
    radius: typeData.radius,
    pulse: Math.random() * Math.PI * 2,
    rainbow: 0,
    scale: 0,      // starts tiny and grows (pop-in)
    popIn: true,
  });
}

// ══════════════════════════════════════════════
//  PARTICLES
// ══════════════════════════════════════════════
function burst(x, y, typeName, count = 10) {
  const type = ORB_TYPES[typeName];
  const colors = typeName === 'rainbow'
    ? ['#f87171','#fb923c','#fbbf24','#4ade80','#60a5fa','#a78bfa','#f472b6']
    : [type.color, 'white'];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.4;
    const spd = 2.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 1,
      r: 2.5 + Math.random() * 3.5,
      alpha: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      decay: 0.018 + Math.random() * 0.012,
      gravity: 0.08,
    });
  }
  // shockwave ring
  particles.push({ shockwave: true, x, y, r: type.radius, maxR: type.radius * 6, alpha: 0.8, color: type.color ?? '#fff', decay: 0.05 });
}

function addTrailParticle() {
  player.trail.push({
    x: player.x + (Math.random()-0.5)*4,
    y: player.y + (Math.random()-0.5)*4,
    r: player.size * (0.3 + Math.random()*0.3),
    alpha: 0.4,
    color: player.collectFlash > 0 ? '#fbbf24' : '#4ade80',
    decay: 0.04,
  });
}

// ══════════════════════════════════════════════
//  COMBO SYSTEM
// ══════════════════════════════════════════════
function addCombo() {
  state.combo++;
  state.comboTimer = getComboWindow();
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;

  const el = document.getElementById('comboDisplay');
  if (state.combo >= 2) {
    el.style.display = 'block';
    el.textContent = `🔥 COMBO x${state.combo}`;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'comboPop 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  }
}

function updateCombo(dt) {
  if (state.combo === 0) return;
  state.comboTimer -= dt * 16.67;
  if (state.comboTimer <= 0) {
    state.combo = 0;
    document.getElementById('comboDisplay').style.display = 'none';
  }
}

// ══════════════════════════════════════════════
//  COLLECT ORB
// ══════════════════════════════════════════════
function collectOrb(orb) {
  const type    = ORB_TYPES[orb.typeName];
  const comboMult = 1 + Math.max(0, (state.combo - 1) * 0.15);
  const pts     = Math.round(type.points * getPointMult() * comboMult);

  state.score += pts;
  state.totalScore += pts;
  state.orbsCollected++;
  if (orb.typeName === 'golden' || orb.typeName === 'rainbow') state.goldenCollected++;

  addCombo();
  burst(orb.x, orb.y, orb.typeName, orb.typeName === 'rainbow' ? 18 : 10);

  // Float text
  const isSpecial = orb.typeName !== 'normal';
  const ftEl = document.createElement('div');
  ftEl.className = 'float-text' + (orb.typeName === 'golden' || orb.typeName === 'rainbow' ? ' golden' : '') + (state.combo >= 3 ? ' combo' : '');
  ftEl.textContent = '+' + formatNum(pts) + (state.combo >= 3 ? ` x${state.combo}` : '');
  ftEl.style.left = orb.x + 'px';
  ftEl.style.top  = orb.y + 'px';
  container.appendChild(ftEl);
  setTimeout(() => ftEl.remove(), 1300);

  player.collectFlash = 0.4;

  updateHUD();
  return true;
}

// ══════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════
function updatePlayer(dt) {
  let dx = 0, dy = 0;
  if (joystickActive) {
    dx = joystickDir.x; dy = joystickDir.y;
  } else {
    if (keys['w'] || keys['arrowup'])    dy -= 1;
    if (keys['s'] || keys['arrowdown'])  dy += 1;
    if (keys['a'] || keys['arrowleft'])  dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
  }
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }

  const spd = getPlayerSpeed() * dt;
  player.vx = dx * spd;
  player.vy = dy * spd;
  player.x += player.vx;
  player.y += player.vy;

  // Boundaries with bounce squish
  if (player.x < player.size)                { player.x = player.size;               player.squishX = 0.6; }
  if (player.x > canvas.width - player.size)  { player.x = canvas.width - player.size; player.squishX = 0.6; }
  if (player.y < player.size)                { player.y = player.size;               player.squishY = 0.6; }
  if (player.y > canvas.height - player.size) { player.y = canvas.height - player.size; player.squishY = 0.6; }

  // Squish recovery
  player.squishX += (1 - player.squishX) * 0.25 * dt;
  player.squishY += (1 - player.squishY) * 0.25 * dt;

  // Rotation toward movement
  if (len > 0) {
    player.targetRotation = Math.atan2(dy, dx);
    if (Math.random() < 0.3 * dt) addTrailParticle();
  }
  let rot = player.targetRotation - player.rotation;
  while (rot > Math.PI)  rot -= Math.PI * 2;
  while (rot < -Math.PI) rot += Math.PI * 2;
  player.rotation += rot * 0.18 * dt;

  player.bouncePhase += 0.25 * dt;
  player.collectFlash = Math.max(0, player.collectFlash - 0.04 * dt);
}

function updateOrbs(dt) {
  const mr = getMagnetRadius();
  const mf = getMagnetForce();

  for (const orb of orbs) {
    // pop-in animation
    if (orb.popIn) {
      orb.scale += 0.12 * dt;
      if (orb.scale >= 1) { orb.scale = 1; orb.popIn = false; }
    }
    orb.pulse += 0.08 * dt;
    orb.rainbow = (orb.rainbow + 2 * dt) % 360;

    // Magnet
    if (mr > 0) {
      const ddx = player.x - orb.x;
      const ddy = player.y - orb.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist < mr && dist > 1) {
        const force = mf * dt * (1 - dist / mr + 0.2);
        orb.x += (ddx / dist) * force * 16;
        orb.y += (ddy / dist) * force * 16;
      }
    }

    // Collision
    const cdx = player.x - orb.x;
    const cdy = player.y - orb.y;
    if (Math.hypot(cdx, cdy) < player.size + orb.radius * orb.scale) {
      orb.collected = true;
      collectOrb(orb);
    }
  }
  orbs = orbs.filter(o => !o.collected);
}

function updateParticles(dt) {
  for (const p of particles) {
    if (p.shockwave) {
      p.r += 5 * dt;
      p.alpha -= p.decay * dt;
    } else {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.gravity ?? 0) * dt;
      p.alpha -= p.decay * dt;
      p.r *= (1 - 0.01 * dt);
    }
  }
  particles = particles.filter(p => p.alpha > 0 && p.r > 0.3);
}

function updateBgStars(dt) {
  for (const s of bgStars) {
    s.pulse += s.speed * 0.04 * dt;
  }
}

// ══════════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════════
function drawBg() {
  // Deep bg
  const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 0, canvas.width/2, canvas.height/2, canvas.width*0.8);
  grad.addColorStop(0, '#0d1630');
  grad.addColorStop(1, '#070b1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  for (const s of bgStars) {
    const a = 0.2 + 0.5 * (Math.sin(s.pulse) * 0.5 + 0.5);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    if (p.shockwave) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth   = 2.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTrail() {
  for (const t of player.trail) {
    ctx.save();
    ctx.globalAlpha = t.alpha * 0.7;
    ctx.fillStyle   = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(t.x, t.y, Math.max(0.1, t.r), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    t.alpha -= t.decay;
  }
  player.trail = player.trail.filter(t => t.alpha > 0);
}

function drawMagnetZone() {
  const mr = getMagnetRadius();
  if (mr <= 0) return;
  const pulse = Math.sin(Date.now() * 0.003) * 0.5 + 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(74,222,128,${0.08 + pulse * 0.08})`;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = (Date.now() / 30) % 28;
  ctx.beginPath();
  ctx.arc(player.x, player.y, mr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Safe lookup tables — no regex color hacks
const ORB_DARK = {
  normal:  '#16a34a',
  silver:  '#64748b',
  golden:  '#d97706',
  rainbow: null,   // computed per-frame from hue
};
const ORB_GLOW_RGBA = {
  normal:  '74,222,128',
  silver:  '226,232,240',
  golden:  '251,191,36',
  rainbow: null,
};

function drawOrbs() {
  const t = Date.now();
  for (const orb of orbs) {
    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.scale(orb.scale, orb.scale);

    const type   = ORB_TYPES[orb.typeName];
    const ps     = Math.sin(orb.pulse) * 2.5;
    const totalR = orb.radius + ps;

    // Resolve colors cleanly
    let color, darkColor, glowRgb;
    if (orb.typeName === 'rainbow') {
      const h = orb.rainbow;
      color     = `hsl(${h}, 100%, 65%)`;
      darkColor = `hsl(${h}, 100%, 35%)`;
      glowRgb   = null; // use shadowColor directly
    } else {
      color     = type.color;
      darkColor = ORB_DARK[orb.typeName];
      glowRgb   = ORB_GLOW_RGBA[orb.typeName];
    }

    const shadowCol = orb.typeName === 'rainbow'
      ? `hsla(${orb.rainbow}, 100%, 65%, 0.8)`
      : `rgba(${glowRgb}, 0.8)`;
    const ringStop0 = orb.typeName === 'rainbow'
      ? `hsla(${orb.rainbow}, 100%, 65%, 0.3)`
      : `rgba(${glowRgb}, 0.3)`;

    // Outer glow ring
    ctx.shadowColor = shadowCol;
    ctx.shadowBlur  = 20;
    const ringGrad = ctx.createRadialGradient(0, 0, totalR * 0.5, 0, 0, totalR * 1.6);
    ringGrad.addColorStop(0, ringStop0);
    ringGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.arc(0, 0, totalR * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Main orb gradient
    ctx.shadowBlur = 15;
    const mainGrad = ctx.createRadialGradient(-totalR * 0.3, -totalR * 0.3, 0, 0, 0, totalR);
    mainGrad.addColorStop(0, 'rgba(255,255,255,0.75)');
    mainGrad.addColorStop(0.35, color);
    mainGrad.addColorStop(1, darkColor);
    ctx.fillStyle = mainGrad;
    ctx.beginPath();
    ctx.arc(0, 0, totalR, 0, Math.PI * 2);
    ctx.fill();

    // Sparkle highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-totalR * 0.28, -totalR * 0.28, totalR * 0.28, 0, Math.PI * 2);
    ctx.fill();

    // Tiny inner sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(-totalR * 0.15, -totalR * 0.15, totalR * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Rotating cross lines for golden/rainbow
    if (orb.typeName === 'golden' || orb.typeName === 'rainbow') {
      ctx.rotate(t * 0.002);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -totalR * 1.4);
        ctx.lineTo(0,  totalR * 1.4);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.rotation);

  const bounce = Math.sin(player.bouncePhase) * 0.12 + 1;
  const sx = player.squishX * bounce;
  const sy = player.squishY / bounce;
  ctx.scale(sx, sy);

  const s  = player.size;
  const cf = player.collectFlash;

  // Shadow/glow
  ctx.shadowColor = cf > 0 ? 'rgba(251,191,36,0.8)' : 'rgba(59,130,246,0.7)';
  ctx.shadowBlur  = 20 + cf * 15;

  // Body gradient
  const bodyColor1 = cf > 0 ? '#fde68a' : '#93c5fd';
  const bodyColor2 = cf > 0 ? '#fbbf24' : '#3b82f6';
  const bodyColor3 = cf > 0 ? '#d97706' : '#1d4ed8';
  const bodyGrad = ctx.createLinearGradient(-s, -s, s, s);
  bodyGrad.addColorStop(0, bodyColor1);
  bodyGrad.addColorStop(0.5, bodyColor2);
  bodyGrad.addColorStop(1, bodyColor3);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(-s, -s, s * 2, s * 2, s * 0.5);
  ctx.fill();

  // Highlight
  ctx.shadowBlur = 0;
  const hGrad = ctx.createLinearGradient(-s, -s, 0, 0);
  hGrad.addColorStop(0, 'rgba(255,255,255,0.5)');
  hGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hGrad;
  ctx.beginPath();
  ctx.roundRect(-s, -s, s * 2, s * 2, s * 0.5);
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(-s*0.35, -s*0.15, s*0.28, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( s*0.35, -s*0.15, s*0.28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#1e3a8a';
  ctx.beginPath(); ctx.arc(-s*0.32, -s*0.1, s*0.15, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( s*0.32, -s*0.1, s*0.15, 0, Math.PI*2); ctx.fill();
  // Eye shine
  ctx.fillStyle = 'white';
  ctx.beginPath(); ctx.arc(-s*0.26, -s*0.16, s*0.06, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( s*0.38, -s*0.16, s*0.06, 0, Math.PI*2); ctx.fill();

  // Smile
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, s*0.1, s*0.38, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();
}

function drawHUDCanvas() {
  // nothing extra drawn on canvas HUD now, handled by DOM
}

// ══════════════════════════════════════════════
//  GAME LOOP
// ══════════════════════════════════════════════
let lastTime = 0;
let rafId    = null;

function gameLoop(ts) {
  if (!state.running || state.paused) { lastTime = ts; rafId = requestAnimationFrame(gameLoop); return; }
  const dt = Math.min((ts - lastTime) / 16.67, 3);
  lastTime = ts;

  updateBgStars(dt);
  updatePlayer(dt);
  updateOrbs(dt);
  updateParticles(dt);
  updateCombo(dt);

  if (ts - lastOrbSpawn > getSpawnDelay()) {
    spawnOrb();
    lastOrbSpawn = ts;
  }

  drawBg();
  drawParticles();
  drawTrail();
  drawMagnetZone();
  drawOrbs();
  drawPlayer();

  rafId = requestAnimationFrame(gameLoop);
}

// ══════════════════════════════════════════════
//  HUD / UI
// ══════════════════════════════════════════════
function formatNum(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function updateHUD() {
  document.getElementById('scoreVal').textContent = formatNum(state.score);
  document.getElementById('rebirthVal').textContent = `⭐ x${state.rebirths}`;
  document.getElementById('multVal').textContent   = `✨ ${formatNum(getPointMult())}x`;

  // Rebirth notification
  const canRebirth  = state.score >= getRebirthCost() && state.rebirths < 10;
  const notifEl     = document.getElementById('rebirthNotif');
  notifEl.style.display = (canRebirth && state.running) ? 'block' : 'none';
}

// ══════════════════════════════════════════════
//  UPGRADE PANEL
// ══════════════════════════════════════════════
let currentTab = 'upgrades';

function togglePanel() {
  const panel = document.getElementById('upgradePanel');
  const isOpen = panel.classList.toggle('open');
  if (isOpen) buildPanel();
  document.getElementById('rebirthNotif').style.display = 'none';
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  buildPanel();
}

function buildPanel() {
  const content = document.getElementById('panelContent');
  document.getElementById('panelScore').innerHTML = `<span>${formatNum(state.score)}</span> pts`;
  content.innerHTML = '';

  if (currentTab === 'upgrades') buildUpgradesTab(content);
  else if (currentTab === 'rebirth') buildRebirthTab(content);
  else buildStatsTab(content);
}

function buildUpgradesTab(parent) {
  for (const [key, cfg] of Object.entries(UPGRADES_CONFIG)) {
    const lvl    = getLvl(key);
    const maxLvl = cfg.maxLevel;
    const cost   = getUpgradeCost(key);
    const canAfford = state.score >= cost;
    const maxed  = lvl >= maxLvl;

    const card = document.createElement('div');
    card.className = 'upgrade-card';

    // effect percentage for bar
    const pct = Math.round((lvl / maxLvl) * 100);

    let effectText = '';
    if (key === 'magnet')       effectText = `Raio: ${getMagnetRadius().toFixed(0)}px`;
    if (key === 'magnetForce')  effectText = `Força: ${getMagnetForce().toFixed(2)}`;
    if (key === 'spawnRate')    effectText = `Delay: ${getSpawnDelay()}ms`;
    if (key === 'maxOrbs')      effectText = `Limite: ${getMaxOrbs()} orbs`;
    if (key === 'multiplier')   effectText = `Mult: ${Math.pow(2, lvl)}x`;
    if (key === 'goldenChance') effectText = `Chance +${(getGoldenChanceBonus()*100).toFixed(1)}%`;
    if (key === 'speed')        effectText = `Vel: ${(getPlayerSpeed()).toFixed(1)}`;
    if (key === 'comboTime')    effectText = `Janela: ${(getComboWindow()/1000).toFixed(1)}s`;

    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon">${cfg.icon}</span>
        <span class="card-name">${cfg.name}</span>
        <span class="card-level">Nv ${lvl}/${maxLvl}</span>
      </div>
      <div class="card-desc">${cfg.desc}</div>
      <div class="card-effect">
        <div class="effect-bar-bg"><div class="effect-bar-fill" style="width:${pct}%"></div></div>
        <span class="effect-value">${effectText}</span>
      </div>
      <button class="card-buy-btn ${maxed ? 'maxed' : ''}" data-key="${key}" ${(maxed || !canAfford) && !maxed ? 'disabled' : ''}>
        ${maxed ? '✅ MÁXIMO' : `${cfg.icon} ${formatNum(cost)} pts`}
      </button>
    `;
    parent.appendChild(card);
  }

  parent.querySelectorAll('.card-buy-btn:not(.maxed):not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      buyUpgrade(btn.dataset.key);
      buildPanel();
    });
  });
}

function buildRebirthTab(parent) {
  const canRebirth = state.rebirths < 10;
  const cost       = getRebirthCost();
  const hasEnough  = state.score >= cost;

  if (!canRebirth) {
    parent.innerHTML = `<div style="text-align:center;color:rgba(255,255,255,0.4);padding:40px 20px;font-family:'Fredoka One',cursive;font-size:1.3em;">🌟 Você já alcançou o máximo de Renascimentos!</div>`;
    return;
  }

  const card = document.createElement('div');
  card.className = 'rebirth-card';
  card.innerHTML = `
    <div class="rebirth-title">⭐ RENASCER ⭐</div>
    <div class="rebirth-desc">Redefine pontos e upgrades, mas <strong style="color:var(--gold)">DOBRA</strong> o multiplicador permanentemente!</div>
    <div class="rebirth-arrows">
      <div class="mult-badge">${Math.pow(2, state.rebirths)}x</div>
      <div class="arrow-icon">→</div>
      <div class="mult-badge" style="border-color:rgba(251,191,36,0.6);color:var(--gold)">${Math.pow(2, state.rebirths + 1)}x</div>
    </div>
    <div class="rebirth-desc">30% da Força do Ímã é mantida após o renascimento.</div>
    <div class="rebirth-desc" style="color:${hasEnough ? '#4ade80' : 'var(--red)'}">Custo: ${formatNum(cost)} pts ${hasEnough ? '✅' : '❌'}</div>
    <div style="margin-bottom:8px;color:rgba(255,255,255,0.4);font-size:0.8em;">${state.rebirths}/10 Renascimentos</div>
    <button class="card-buy-btn gold-btn" id="rebirthBtn" ${!hasEnough ? 'disabled' : ''}>
      ${hasEnough ? '⭐ RENASCER AGORA' : `Faltam ${formatNum(cost - state.score)} pts`}
    </button>
  `;
  parent.appendChild(card);

  document.getElementById('rebirthBtn')?.addEventListener('click', performRebirth);
}

function buildStatsTab(parent) {
  const stats = [
    ['Pontos Atuais',     formatNum(state.score),         ''],
    ['Total Arrecadado',  formatNum(state.totalScore),    ''],
    ['Renascimentos',     `${state.rebirths}/10`,          'gold'],
    ['Multiplicador',     `${formatNum(getPointMult())}x`, 'purple'],
    ['Orbs Coletados',    formatNum(state.orbsCollected), ''],
    ['Orbs Especiais',    formatNum(state.goldenCollected),'gold'],
    ['Maior Combo',       `x${state.maxCombo}`,           'purple'],
    ['Raio do Ímã',       `${getMagnetRadius()}px`,       ''],
    ['Orbs no Mapa',      `${orbs.length} / ${getMaxOrbs()}`, ''],
    ['Velocidade',        getPlayerSpeed().toFixed(1),    ''],
  ];
  for (const [label, value, cls] of stats) {
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value ${cls}">${value}</span>`;
    parent.appendChild(row);
  }
}

// ══════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════
function buyUpgrade(key) {
  const upgrade = state.upgrades[key];
  const cfg     = UPGRADES_CONFIG[key];
  const cost    = getUpgradeCost(key);
  if (state.score >= cost && upgrade.level < cfg.maxLevel) {
    state.score -= cost;
    upgrade.level++;
    updateHUD();
    saveGame();
  }
}

function performRebirth() {
  const cost = getRebirthCost();
  if (state.score < cost || state.rebirths >= 10) return;
  if (!confirm(`Deseja Renascer?\n\nVocê perderá todos os pontos e upgrades.\nCusto: ${formatNum(cost)} pts\nGanho: Multiplicador ${Math.pow(2, state.rebirths)}x → ${Math.pow(2, state.rebirths + 1)}x`)) return;

  const savedMagnetForce = getLvl('magnetForce');
  state.rebirths++;
  state.score = 0;
  initUpgrades();
  state.upgrades.magnetForce.level = Math.floor(savedMagnetForce * 0.3);

  updateHUD();
  buildPanel();
  saveGame();

  // Celebration burst
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      for (let j = 0; j < 20; j++) {
        const angle = Math.random() * Math.PI * 2;
        const spd   = 3 + Math.random() * 5;
        const colors = ['#fbbf24','#f87171','#4ade80','#60a5fa','#a78bfa','#f472b6'];
        particles.push({
          x: cx + (Math.random()-0.5)*100,
          y: cy + (Math.random()-0.5)*100,
          vx: Math.cos(angle)*spd,
          vy: Math.sin(angle)*spd - 2,
          r: 3 + Math.random()*4,
          alpha: 1,
          color: colors[Math.floor(Math.random()*colors.length)],
          decay: 0.012,
          gravity: 0.06,
        });
      }
    }, i * 150);
  }
}

function togglePause() {
  state.paused = !state.paused;
  const overlay = document.getElementById('pauseOverlay');
  overlay.style.display = state.paused ? 'flex' : 'none';
}

// ══════════════════════════════════════════════
//  GAME FLOW
// ══════════════════════════════════════════════
function showMainMenu() {
  document.getElementById('mainMenu').style.display = 'flex';
  document.getElementById('gameUI').style.display = 'none';
  document.getElementById('joystick').style.display = 'none';
  document.getElementById('comboDisplay').style.display = 'none';
  document.getElementById('rebirthNotif').style.display = 'none';
  document.getElementById('upgradePanel').classList.remove('open');
  state.paused = false;
  document.getElementById('pauseOverlay').style.display = 'none';

  const ms = document.getElementById('menuSavedScore');
  if (ms) ms.innerHTML = `Pontos salvos: <span>${formatNum(state.score)}</span> &nbsp;|&nbsp; Renascimentos: <span>${state.rebirths}</span>`;
}

let joystickSetup = false;

function startGame() {
  const loading = document.getElementById('loadingScreen');
  loading.style.display = 'flex';
  document.getElementById('mainMenu').style.display = 'none';

  setTimeout(() => {
    loading.style.display = 'none';
    state.running = true;
    state.combo   = 0;
    state.comboTimer = 0;
    document.getElementById('gameUI').style.display = 'flex';

    if (isMobile) {
      document.getElementById('joystick').style.display = 'block';
      if (!joystickSetup) { setupJoystick(); joystickSetup = true; }
    }

    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    orbs = [];
    particles = [];
    lastOrbSpawn = 0;
    initBgStars();
    updateHUD();

    if (rafId) cancelAnimationFrame(rafId);
    lastTime = performance.now();
    rafId    = requestAnimationFrame(gameLoop);
  }, 900);
}

function exitToMenu() {
  saveGame();
  state.running = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  showMainMenu();
}

// ══════════════════════════════════════════════
//  JOYSTICK
// ══════════════════════════════════════════════
function setupJoystick() {
  const joy   = document.getElementById('joystick');
  const stick = joy.querySelector('.joy-stick');
  const base  = joy.querySelector('.joy-base');
  let active  = false, cx = 0, cy = 0, activeTouchId = null;
  const MAX   = 40;

  function recalcCenter() {
    const r = base.getBoundingClientRect();
    cx = r.left + r.width  / 2;
    cy = r.top  + r.height / 2;
  }

  function applyTouch(touch) {
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > MAX) { dx = dx/d*MAX; dy = dy/d*MAX; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joystickDir.x = dx / MAX;
    joystickDir.y = dy / MAX;
    joystickActive = true;
  }

  function resetStick() {
    active = false;
    activeTouchId = null;
    stick.style.transform = 'translate(-50%,-50%)';
    joystickDir.x = joystickDir.y = 0;
    joystickActive = false;
  }

  joy.addEventListener('touchstart', e => {
    e.preventDefault();
    active = true;
    activeTouchId = e.changedTouches[0].identifier;
    recalcCenter();
    applyTouch(e.changedTouches[0]);
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!active) return;
    e.preventDefault();
    // track the specific finger that started on the joystick
    const touch = [...e.changedTouches].find(t => t.identifier === activeTouchId) || e.touches[0];
    if (touch) applyTouch(touch);
  }, { passive: false });

  document.addEventListener('touchend',    e => {
    if ([...e.changedTouches].some(t => t.identifier === activeTouchId)) resetStick();
  });
  document.addEventListener('touchcancel', resetStick);
}

// ══════════════════════════════════════════════
//  CUSTOM CURSOR (desktop only)
// ══════════════════════════════════════════════
const cursor = document.getElementById('cursor');
if (isMobile) {
  cursor.style.display = 'none';
} else {
  document.addEventListener('mousemove', e => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });
  document.addEventListener('mousedown', () => cursor.classList.add('clicking'));
  document.addEventListener('mouseup',   () => cursor.classList.remove('clicking'));
}

// ══════════════════════════════════════════════
//  MENU STAR PARTICLES
// ══════════════════════════════════════════════
function spawnMenuStars() {
  const container = document.querySelector('.menu-bg-stars');
  if (!container) return;
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'star-particle';
    const size = 1 + Math.random() * 3;
    el.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%; top:${Math.random()*100}%;
      --dur:${2 + Math.random()*4}s;
      --delay:${-Math.random()*6}s;
      --max-opacity:${0.3 + Math.random()*0.6};
    `;
    container.appendChild(el);
  }
}

// ══════════════════════════════════════════════
//  EVENT WIRING
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadGame();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  initBgStars();
  spawnMenuStars();
  updateHUD();
  showMainMenu();

  // Menu buttons
  document.getElementById('startBtn')?.addEventListener('click', startGame);
  document.getElementById('resetBtn')?.addEventListener('click', resetGame);

  // HUD buttons
  document.getElementById('menuBtn')?.addEventListener('click', togglePanel);
  document.getElementById('saveExitBtn')?.addEventListener('click', exitToMenu);
  document.getElementById('pauseBtn')?.addEventListener('click', togglePause);

  // Panel
  document.getElementById('closePanelBtn')?.addEventListener('click', () => {
    document.getElementById('upgradePanel').classList.remove('open');
  });
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Rebirth notif click
  document.getElementById('rebirthNotif')?.addEventListener('click', () => {
    currentTab = 'rebirth';
    document.getElementById('upgradePanel').classList.add('open');
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'rebirth'));
    buildPanel();
    document.getElementById('rebirthNotif').style.display = 'none';
  });

  // Resume from pause
  document.getElementById('resumeBtn')?.addEventListener('click', togglePause);

  // Pause overlay save+exit
  document.getElementById('pauseExitBtn')?.addEventListener('click', exitToMenu);
});