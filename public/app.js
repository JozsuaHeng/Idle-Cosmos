/**
 * Token Universe — front-end.
 *
 * Deterministic, seeded universe per Claude Code session: the session id
 * seeds a random-number generator, so the SAME session always produces the
 * SAME universe — the token count only decides how much of it has come
 * into existence yet. That means every universe is automatically "saved":
 * as long as the session log exists, its universe can be rebuilt pixel
 * for pixel.
 *
 * Performance rules: stars are drawn once onto an offscreen canvas (not
 * re-drawn every frame); only a small set of twinklers, the milestone
 * objects, and short-lived particles animate. The loop idles when the tab
 * is hidden.
 */
'use strict';

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ['Crimson', 'Umbral', 'Gilded', 'Whispering', 'Iridescent', 'Sleeping',
  'Fractal', 'Velvet', 'Wandering', 'Luminous', 'Forgotten', 'Electric',
  'Sapphire', 'Molten', 'Quiet', 'Restless'];
const NOUN = ['Whale', 'Lantern', 'Serpent', 'Anvil', 'Orchid', 'Compass',
  'Phoenix', 'Cathedral', 'Fox', 'Mirror', 'Pilgrim', 'Clockwork',
  'Tide', 'Ember', 'Archive', 'Dragonfly'];
const KIND = ['Expanse', 'Nebula', 'Reach', 'Verge', 'Drift', 'Halo', 'Deep', 'Veil'];

function universeName(id) {
  const r = mulberry32(hashSeed('name:' + id));
  return `The ${ADJ[(r() * ADJ.length) | 0]} ${NOUN[(r() * NOUN.length) | 0]} ${KIND[(r() * KIND.length) | 0]}`;
}

// ---------------------------------------------------------------------------
// Milestones: what forms at each energy level
// ---------------------------------------------------------------------------

const MILESTONES = [
  { at: 1_000, key: 'firstlight', label: 'First Light — a star ignites' },
  { at: 8_000, key: 'sun', label: 'A sun coalesces' },
  { at: 20_000, key: 'planet1', label: 'Your first planet forms' },
  { at: 45_000, key: 'planet2', label: 'A second planet forms' },
  { at: 80_000, key: 'comet', label: 'A comet begins its journey' },
  { at: 130_000, key: 'ringed', label: 'A ringed giant appears' },
  { at: 200_000, key: 'nebula1', label: 'A nebula blooms' },
  { at: 300_000, key: 'moons', label: 'Moons fall into orbit' },
  { at: 450_000, key: 'belt', label: 'An asteroid belt settles' },
  { at: 650_000, key: 'nebula2', label: 'A second nebula unfurls' },
  { at: 1_000_000, key: 'binary', label: 'A binary companion star arrives' },
  { at: 1_600_000, key: 'galaxy', label: 'A distant galaxy comes into view' },
  { at: 2_500_000, key: 'blackhole', label: 'A black hole tears open' },
];

const ENERGY_PER_STAR = 300;
const MAX_STARS = 4000;

const STAR_COLORS = ['#ffffff', '#dfe8ff', '#cdd8ff', '#fff3d6', '#ffd9b0', '#d6f0ff'];

// ---------------------------------------------------------------------------
// Universe model (deterministic from session id)
// ---------------------------------------------------------------------------

class Universe {
  constructor(id) {
    this.id = id;
    this.name = universeName(id);
    this.starRng = mulberry32(hashSeed('stars:' + id));
    this.rng = mulberry32(hashSeed('objects:' + id));
    this.stars = []; // generated lazily, in a fixed order

    const r = this.rng;
    // Sun sits off-center so planets have room; all coords normalized 0..1.
    this.sun = {
      x: 0.32 + r() * 0.36, y: 0.3 + r() * 0.4,
      r: 26 + r() * 10, hue: 35 + r() * 20,
    };
    this.planets = [];
    for (let i = 0; i < 3; i++) {
      this.planets.push({
        dist: 70 + i * 55 + r() * 30,
        size: 5 + r() * 7,
        speed: (0.05 + r() * 0.08) / (i + 1),
        phase: r() * Math.PI * 2,
        hue: r() * 360,
        ringed: i === 2,
      });
    }
    this.moons = this.planets.slice(0, 2).map(() => ({
      dist: 12 + r() * 8, size: 1.6 + r() * 1.4,
      speed: 0.6 + r() * 0.5, phase: r() * Math.PI * 2,
    }));
    this.comet = { phase: r() * Math.PI * 2, speed: 0.03 + r() * 0.02, tilt: r() * 0.6 - 0.3 };
    this.nebulae = [0, 1].map((i) => ({
      x: r(), y: r(), scale: 0.55 + r() * 0.5,
      hue: i === 0 ? 260 + r() * 60 : 150 + r() * 80,
      drift: r() * Math.PI * 2,
    }));
    this.belt = { count: 90, spread: [] };
    for (let i = 0; i < this.belt.count; i++) {
      this.belt.spread.push({ a: r() * Math.PI * 2, d: 0.92 + r() * 0.16, s: 0.6 + r() * 1.2, sp: 0.02 + r() * 0.02 });
    }
    this.binary = { dist: 60 + r() * 25, size: 8 + r() * 4, speed: 0.08 + r() * 0.05, phase: r() * Math.PI * 2 };
    this.galaxy = { x: 0.12 + r() * 0.1, y: 0.12 + r() * 0.12, scale: 0.5 + r() * 0.4, spin: r() > 0.5 ? 1 : -1 };
    this.blackhole = { x: 0.82 + r() * 0.1, y: 0.75 + r() * 0.15 };
  }

  ensureStars(n) {
    while (this.stars.length < n && this.stars.length < MAX_STARS) {
      const r = this.starRng;
      this.stars.push({
        x: r(), y: r(),
        size: r() < 0.85 ? 0.6 + r() * 0.9 : 1.4 + r() * 1.3,
        color: STAR_COLORS[(r() * STAR_COLORS.length) | 0],
        alpha: 0.35 + r() * 0.65,
        twinkle: r() < 0.04 ? { speed: 0.5 + r() * 2, phase: r() * Math.PI * 2 } : null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const starLayer = document.createElement('canvas');
const starCtx = starLayer.getContext('2d');
const nebulaSprites = new Map(); // hue -> prerendered canvas

const state = {
  sessions: new Map(), // id -> session data from server
  current: null,       // session id being viewed
  universe: null,
  drawnStars: 0,
  displayEnergy: 0,
  unlocked: new Set(),
  particles: [],
  shockwaves: [],
  bornAt: 0,          // performance.now() when current universe was opened
  loadedOnce: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Canvas sizing
// ---------------------------------------------------------------------------

let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  starLayer.width = canvas.width;
  starLayer.height = canvas.height;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  starCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  redrawStarLayer();
}
window.addEventListener('resize', resize);

function redrawStarLayer() {
  starCtx.clearRect(0, 0, W, H);
  state.drawnStars = 0;
  if (state.universe) paintNewStars();
}

function paintNewStars() {
  const u = state.universe;
  const target = Math.min(MAX_STARS, Math.floor(targetEnergy() / ENERGY_PER_STAR));
  u.ensureStars(target);
  for (let i = state.drawnStars; i < u.stars.length; i++) {
    const s = u.stars[i];
    starCtx.globalAlpha = s.alpha;
    starCtx.fillStyle = s.color;
    starCtx.beginPath();
    starCtx.arc(s.x * W, s.y * H, s.size, 0, Math.PI * 2);
    starCtx.fill();
  }
  starCtx.globalAlpha = 1;
  state.drawnStars = u.stars.length;
}

// ---------------------------------------------------------------------------
// Session data / SSE
// ---------------------------------------------------------------------------

function targetEnergy() {
  const s = state.sessions.get(state.current);
  return s ? s.energy : 0;
}

function totalTokens(s) {
  return s.tokens.input + s.tokens.output + s.tokens.cacheCreate + s.tokens.cacheRead;
}

function connect() {
  const es = new EventSource('/events');
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') {
      for (const s of msg.sessions) state.sessions.set(s.id, s);
      if (!state.loadedOnce) {
        state.loadedOnce = true;
        const urlSession = new URLSearchParams(location.search).get('session');
        const pick = (urlSession && state.sessions.get(urlSession) && urlSession) ||
          (msg.sessions[0] && msg.sessions[0].id);
        if (pick) openUniverse(pick);
      }
      renderSessionList();
    } else if (msg.type === 'update') {
      const prev = state.sessions.get(msg.session.id);
      state.sessions.set(msg.session.id, msg.session);
      renderSessionList();
      if (msg.session.id === state.current) {
        if (prev && msg.session.energy > prev.energy) {
          spawnBurst(Math.min(40, Math.ceil((msg.session.energy - prev.energy) / 500)));
        }
        checkMilestones(true);
      } else if ($('followLive').checked && (!prev || msg.session.energy > prev.energy)) {
        openUniverse(msg.session.id); // a different session just did work — follow it
      }
    }
  };
  // EventSource reconnects automatically on error.
}

// ---------------------------------------------------------------------------
// Opening a universe (the big bang)
// ---------------------------------------------------------------------------

function openUniverse(id) {
  if (state.current === id) return;
  state.current = id;
  state.universe = new Universe(id);
  state.displayEnergy = 0;
  state.unlocked = new Set();
  state.particles = [];
  state.shockwaves = [{ r: 0, max: Math.hypot(W, H) * 0.7, alpha: 1 }];
  state.bornAt = performance.now();
  redrawStarLayer();
  checkMilestones(false);
  $('universeName').textContent = state.universe.name;
  history.replaceState(null, '', '?session=' + id);
  renderSessionList();
}

function checkMilestones(announce) {
  const e = targetEnergy();
  for (const m of MILESTONES) {
    if (e >= m.at && !state.unlocked.has(m.key)) {
      state.unlocked.add(m.key);
      if (announce) {
        toast('✨ ' + m.label);
        state.shockwaves.push({ r: 0, max: Math.hypot(W, H) * 0.4, alpha: 0.7 });
      }
    }
  }
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function spawnBurst(count) {
  if (state.reduceMotion) count = Math.min(count, 6);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    state.particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
      vx: Math.cos(a) * (0.2 + Math.random() * 0.8),
      vy: Math.sin(a) * (0.2 + Math.random() * 0.8),
      life: 1,
      size: 1 + Math.random() * 2,
      hue: 40 + Math.random() * 60,
    });
  }
  if (state.particles.length > 300) state.particles.splice(0, state.particles.length - 300);
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function renderSessionList() {
  const list = $('sessionList');
  const items = [...state.sessions.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  list.innerHTML = '';
  const now = Date.now();
  for (const s of items) {
    const li = document.createElement('li');
    if (s.id === state.current) li.classList.add('active');
    const live = now - (s.updatedAt || 0) < 3 * 60 * 1000;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = universeName(s.id);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const when = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
    meta.innerHTML = `${s.project || 'unknown'} · ${fmt(s.energy)} ⚡ · ${when} ${live ? '<span class="live">● live</span>' : ''}`;
    const hint = document.createElement('div');
    hint.className = 'meta';
    hint.textContent = s.firstPrompt ? '“' + s.firstPrompt.slice(0, 60) + '…”' : '';
    li.append(name, meta, hint);
    li.onclick = () => openUniverse(s.id);
    list.appendChild(li);
  }
}

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function nebulaSprite(hue) {
  if (nebulaSprites.has(hue)) return nebulaSprites.get(hue);
  const size = 420;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = mulberry32(hashSeed('nebula' + hue));
  for (let i = 0; i < 9; i++) {
    const x = size / 2 + (r() - 0.5) * size * 0.5;
    const y = size / 2 + (r() - 0.5) * size * 0.5;
    const rad = size * (0.12 + r() * 0.22);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `hsla(${hue + r() * 40 - 20}, 80%, ${55 + r() * 20}%, 0.10)`);
    grad.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  nebulaSprites.set(hue, c);
  return c;
}

function drawSunBody(x, y, radius, hue, t) {
  const pulse = 1 + Math.sin(t * 0.8) * 0.02;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2 * pulse);
  glow.addColorStop(0, `hsla(${hue}, 100%, 78%, 0.9)`);
  glow.addColorStop(0.25, `hsla(${hue}, 95%, 62%, 0.45)`);
  glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.2 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsl(${hue}, 100%, 85%)`;
  ctx.beginPath();
  ctx.arc(x, y, radius * pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlanet(x, y, p, t) {
  const g = ctx.createRadialGradient(x - p.size * 0.4, y - p.size * 0.4, p.size * 0.1, x, y, p.size);
  g.addColorStop(0, `hsl(${p.hue}, 60%, 70%)`);
  g.addColorStop(1, `hsl(${p.hue}, 55%, 28%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, p.size, 0, Math.PI * 2);
  ctx.fill();
  if (p.ringed) {
    ctx.strokeStyle = `hsla(${p.hue + 40}, 60%, 70%, 0.6)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, p.size * 2.1, p.size * 0.7, 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !state.universe) return;

  const t = now / 1000;
  const u = state.universe;
  const e = targetEnergy();

  // Ease the displayed energy toward reality; reveal stars as it climbs.
  state.displayEnergy += (e - state.displayEnergy) * 0.06;
  if (e - state.displayEnergy < 1) state.displayEnergy = e;
  paintNewStars();

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04050d');
  bg.addColorStop(1, '#090b1d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const born = Math.min(1, (now - state.bornAt) / 1800); // fade-in after big bang

  // Nebulae (behind stars)
  if (state.unlocked.has('nebula1')) drawNebula(u.nebulae[0], t, born);
  if (state.unlocked.has('nebula2')) drawNebula(u.nebulae[1], t, born);
  if (state.unlocked.has('galaxy')) drawGalaxy(u.galaxy, t, born);

  // Star layer
  ctx.globalAlpha = born;
  ctx.drawImage(starLayer, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // Twinklers
  if (!state.reduceMotion) {
    for (const s of u.stars) {
      if (!s.twinkle) continue;
      const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.twinkle.speed + s.twinkle.phase));
      ctx.globalAlpha = a * born;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.size * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const sx = u.sun.x * W, sy = u.sun.y * H;

  if (state.unlocked.has('firstlight') && !state.unlocked.has('sun')) {
    drawSunBody(sx, sy, 6, 50, t); // protostar
  }
  if (state.unlocked.has('sun')) drawSunBody(sx, sy, u.sun.r, u.sun.hue, t);

  if (state.unlocked.has('binary')) {
    const b = u.binary;
    const bx = sx + Math.cos(t * b.speed + b.phase) * (u.sun.r + b.dist);
    const by = sy + Math.sin(t * b.speed + b.phase) * (u.sun.r + b.dist) * 0.5;
    drawSunBody(bx, by, b.size, 200, t + 3);
  }

  // Planets + moons
  const planetKeys = ['planet1', 'planet2', 'ringed'];
  u.planets.forEach((p, i) => {
    if (!state.unlocked.has(planetKeys[i])) return;
    const ang = t * p.speed + p.phase;
    const px = sx + Math.cos(ang) * p.dist * 1.6;
    const py = sy + Math.sin(ang) * p.dist * 0.75;
    // faint orbit path
    ctx.strokeStyle = 'rgba(150, 170, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(sx, sy, p.dist * 1.6, p.dist * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawPlanet(px, py, p, t);
    if (state.unlocked.has('moons') && u.moons[i]) {
      const m = u.moons[i];
      const mx = px + Math.cos(t * m.speed + m.phase) * (p.size + m.dist);
      const my = py + Math.sin(t * m.speed + m.phase) * (p.size + m.dist) * 0.6;
      ctx.fillStyle = '#c9cede';
      ctx.beginPath();
      ctx.arc(mx, my, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Asteroid belt
  if (state.unlocked.has('belt')) {
    ctx.fillStyle = 'rgba(200, 205, 230, 0.55)';
    for (const a of u.belt.spread) {
      const ang = a.a + t * a.sp;
      const ax = sx + Math.cos(ang) * u.planets[1].dist * 1.6 * a.d * 1.25;
      const ay = sy + Math.sin(ang) * u.planets[1].dist * 0.75 * a.d * 1.25;
      ctx.fillRect(ax, ay, a.s, a.s);
    }
  }

  // Comet
  if (state.unlocked.has('comet')) {
    const c = u.comet;
    const ang = t * c.speed + c.phase;
    const cx = W * (0.5 + 0.55 * Math.cos(ang));
    const cy = H * (0.5 + 0.45 * Math.sin(ang * 1.3 + c.tilt));
    const tailA = ang + Math.PI * 0.9;
    const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(tailA) * 70, cy + Math.sin(tailA) * 70);
    grad.addColorStop(0, 'rgba(190, 225, 255, 0.8)');
    grad.addColorStop(1, 'rgba(190, 225, 255, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(tailA) * 70, cy + Math.sin(tailA) * 70);
    ctx.stroke();
    ctx.fillStyle = '#eaf6ff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Black hole
  if (state.unlocked.has('blackhole')) {
    const bx = u.blackhole.x * W, by = u.blackhole.y * H;
    const ring = ctx.createRadialGradient(bx, by, 8, bx, by, 26);
    ring.addColorStop(0, 'rgba(0,0,0,1)');
    ring.addColorStop(0.55, 'rgba(255, 170, 60, 0.9)');
    ring.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(bx, by, 26 + Math.sin(t * 2) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Particles (token bursts)
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= 0.012;
    if (p.life <= 0) { state.particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life;
    ctx.fillStyle = `hsl(${p.hue}, 90%, 75%)`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Shockwaves (big bang / milestone rings)
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const s = state.shockwaves[i];
    s.r += (s.max - s.r) * 0.045 + 2;
    s.alpha *= 0.975;
    if (s.alpha < 0.01) { state.shockwaves.splice(i, 1); continue; }
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = '#ffe9c0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  updateHUD();
}

function drawNebula(n, t, born) {
  const sprite = nebulaSprite(Math.round(n.hue));
  const size = Math.min(W, H) * n.scale;
  const dx = Math.sin(t * 0.02 + n.drift) * 12;
  const dy = Math.cos(t * 0.017 + n.drift) * 9;
  ctx.globalAlpha = born;
  ctx.drawImage(sprite, n.x * W - size / 2 + dx, n.y * H - size / 2 + dy, size, size);
  ctx.globalAlpha = 1;
}

function drawGalaxy(g, t, born) {
  const size = Math.min(W, H) * 0.22 * g.scale;
  ctx.save();
  ctx.translate(g.x * W, g.y * H);
  ctx.rotate(t * 0.02 * g.spin);
  ctx.globalAlpha = 0.5 * born;
  for (let arm = 0; arm < 2; arm++) {
    ctx.rotate(Math.PI * arm);
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, size);
    grad.addColorStop(0, 'rgba(255, 240, 220, 0.8)');
    grad.addColorStop(0.4, 'rgba(180, 190, 255, 0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(size * 0.25, 0, size, size * 0.35, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHUD() {
  const s = state.sessions.get(state.current);
  if (!s) return;
  $('energyVal').textContent = Math.round(state.displayEnergy).toLocaleString();
  $('tokenVal').textContent = fmt(totalTokens(s));
  $('promptVal').textContent = s.prompts;

  if (s.startedAt) {
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
    const age = mins < 60 ? `${mins} min` : mins < 60 * 24 ? `${(mins / 60).toFixed(1)} h` : `${(mins / 1440).toFixed(1)} days`;
    $('universeAge').textContent = `universe age: ${age} (≈ ${fmt(mins * 23)} million cosmic years)`;
  }

  const e = targetEnergy();
  const next = MILESTONES.find((m) => m.at > e);
  if (next) {
    const prevAt = MILESTONES[MILESTONES.indexOf(next) - 1]?.at || 0;
    const pct = ((e - prevAt) / (next.at - prevAt)) * 100;
    $('milestoneLabel').textContent = `next: ${next.label} — ${fmt(next.at - e)} energy to go`;
    $('milestoneFill').style.width = Math.max(2, pct) + '%';
  } else {
    $('milestoneLabel').textContent = 'Your universe is complete. For now.';
    $('milestoneFill').style.width = '100%';
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

$('sidebarToggle').onclick = () => $('sidebar').classList.toggle('hidden');

$('snapBtn').onclick = () => {
  const a = document.createElement('a');
  a.download = (state.universe ? state.universe.name : 'universe').replace(/\s+/g, '-') + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('📸 Universe saved as an image');
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

resize();
connect();
requestAnimationFrame(frame);
