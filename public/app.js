/**
 * Token Universe — front-end (pixel edition).
 *
 * The screen starts as an empty midnight void. Every ~400 cosmic energy
 * buys ONE block. A builder spark flies to the next block's spot and
 * places it; blocks accumulate into pixel-art structures (stars, a sun,
 * planets, a comet, a nebula, a galaxy…) one after another.
 *
 * Determinism: the session id seeds every random choice, so the same
 * session always rebuilds the exact same universe — energy only decides
 * how many blocks exist yet.
 *
 * Performance: placed blocks live on a small offscreen canvas (1 canvas
 * pixel = 1 block) scaled up with smoothing off. Per frame we only
 * animate the spark, a few twinkling blocks, and soft structure glows.
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
// Palette — pale midnight / turquoise, luminescent but subtle
// ---------------------------------------------------------------------------

const PAL = {
  sparkBright: '#e9fbf7',
  starPale: ['#cfeee9', '#b5e6de', '#9fdcd6', '#d8f2ec', '#8fcfd1'],
  starDim: ['#5f9aa3', '#4d838f', '#6fb3b8'],
  sunCore: '#eafcf6',
  sunBody: ['#bdeee2', '#9fe3d4', '#8ad6c8'],
  sunEdge: '#5fb3ac',
  planet: [
    ['#a8dfe0', '#6fb5bd', '#3f7c8a'],   // light, mid, shadow
    ['#b9e6d3', '#7cc2ab', '#47897e'],
    ['#9fd0e8', '#6a9fc4', '#3e6a8f'],
    ['#c4ead9', '#8fccba', '#5a948b'],
  ],
  ring: '#d3f0e8',
  moon: ['#d9e8e6', '#a9bfbe'],
  cometHead: '#eafbf6',
  cometTail: ['#a9e4da', '#74b8b4', '#4d8a8c', '#356467'],
  nebula: ['#1d4a50', '#215a5e', '#2a6b6d', '#183c44', '#12303a'],
  galaxyCore: '#e2f6ef',
  galaxyArm: ['#8fd6cb', '#5da8a6', '#3d7a80', '#2a5a63'],
  glow: 'rgba(140, 226, 210, 0.05)',
};

// ---------------------------------------------------------------------------
// Pixel-art structure generators — each returns a list of blocks
// ({dx, dy, color, alpha, twinkle}) already sorted in build order.
// ---------------------------------------------------------------------------

function pick(r, arr) { return arr[(r() * arr.length) | 0]; }

function genSpark(r) {
  return [{ dx: 0, dy: 0, color: PAL.sparkBright, twinkle: true }];
}

function genStar(r) {
  const c = pick(r, PAL.starPale);
  const dim = pick(r, PAL.starDim);
  return [
    { dx: 0, dy: 0, color: c, twinkle: true },
    { dx: -1, dy: 0, color: dim }, { dx: 1, dy: 0, color: dim },
    { dx: 0, dy: -1, color: dim }, { dx: 0, dy: 1, color: dim },
  ];
}

function genCluster(r) {
  const blocks = [{ dx: 0, dy: 0, color: pick(r, PAL.starPale), twinkle: true }];
  const n = 6 + (r() * 4 | 0);
  for (let i = 0; i < n; i++) {
    blocks.push({
      dx: Math.round((r() - 0.5) * 7), dy: Math.round((r() - 0.5) * 5),
      color: r() < 0.4 ? pick(r, PAL.starPale) : pick(r, PAL.starDim),
      twinkle: r() < 0.35,
    });
  }
  return blocks;
}

function discBlocks(radius, colorFn) {
  const blocks = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= radius + 0.25) blocks.push({ dx, dy, color: colorFn(dx, dy, d) });
    }
  }
  // Build from the centre outward — looks like accretion.
  blocks.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  return blocks;
}

function genSun(r) {
  const R = 5 + (r() * 2 | 0);
  const body = discBlocks(R, (dx, dy, d) => {
    if (d < R * 0.35) return PAL.sunCore;
    if (d < R * 0.8) return PAL.sunBody[(dx + dy & 1) ? 0 : 1];
    return (dx + dy & 1) ? PAL.sunBody[2] : PAL.sunEdge;
  });
  // Rays: short pixel spikes on the four axes and diagonals.
  const rays = [];
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const len = ux && uy ? 1 : 2;
    for (let k = 1; k <= len; k++) {
      rays.push({ dx: ux * (R + k + 1), dy: uy * (R + k + 1), color: PAL.sunEdge, alpha: 0.7 - k * 0.25, twinkle: true });
    }
  }
  return body.concat(rays);
}

function genPlanet(r, radius) {
  const R = radius || 3 + (r() * 2 | 0);
  const tone = pick(r, PAL.planet);
  const bandY = Math.round((r() - 0.5) * R);
  return discBlocks(R, (dx, dy, d) => {
    const lit = (dx - dy) / (R * 1.4); // light from upper-left
    if (dy === bandY && Math.abs(dx) < R) return tone[1];
    if (lit > 0.25) return tone[0];
    if (lit < -0.35) return tone[2];
    return (dx + dy & 1) ? tone[1] : tone[0];
  });
}

function genRinged(r) {
  const R = 3 + (r() * 2 | 0);
  const body = genPlanet(r, R);
  const ring = [];
  for (let dx = -(R + 3); dx <= R + 3; dx++) {
    const dy = Math.round(dx * 0.22);
    if (Math.hypot(dx, dy) <= R + 0.3) continue; // behind the planet body
    ring.push({ dx, dy, color: PAL.ring, alpha: Math.abs(dx) > R + 2 ? 0.5 : 0.85 });
  }
  return body.concat(ring);
}

function genMoon(r) {
  return [
    { dx: 0, dy: 0, color: PAL.moon[0] },
    { dx: 1, dy: 0, color: PAL.moon[1] },
    { dx: 0, dy: 1, color: PAL.moon[1] },
    { dx: 1, dy: 1, color: PAL.moon[1] },
    { dx: -1, dy: 0, color: PAL.moon[1], alpha: 0.6 },
  ];
}

function genComet(r) {
  const dir = r() < 0.5 ? 1 : -1;
  const blocks = [
    { dx: 0, dy: 0, color: PAL.cometHead, twinkle: true },
    { dx: dir, dy: 0, color: PAL.cometTail[0] },
    { dx: 0, dy: -1, color: PAL.cometTail[0] },
  ];
  for (let k = 1; k <= 9; k++) {
    blocks.push({
      dx: -dir * k, dy: Math.round(k * 0.5),
      color: PAL.cometTail[Math.min(3, k >> 1)],
      alpha: Math.max(0.25, 1 - k * 0.09),
    });
  }
  return blocks;
}

function genNebula(r) {
  const blocks = [];
  const n = 110 + (r() * 50 | 0);
  for (let i = 0; i < n; i++) {
    // Gaussian-ish scatter: sum of two uniforms.
    const dx = Math.round((r() + r() - 1) * 11);
    const dy = Math.round((r() + r() - 1) * 7);
    blocks.push({
      dx, dy,
      color: pick(r, PAL.nebula),
      alpha: 0.5 + r() * 0.4,
    });
  }
  // A few pale glints inside the cloud.
  for (let i = 0; i < 5; i++) {
    blocks.push({
      dx: Math.round((r() - 0.5) * 12), dy: Math.round((r() - 0.5) * 8),
      color: pick(r, PAL.starPale), alpha: 0.9, twinkle: true,
    });
  }
  return blocks;
}

function genGalaxy(r) {
  const blocks = [{ dx: 0, dy: 0, color: PAL.galaxyCore, twinkle: true }];
  const spin = r() < 0.5 ? 1 : -1;
  for (let arm = 0; arm < 2; arm++) {
    for (let t = 0.8; t < 6.8; t += 0.16) {
      const ang = spin * t * 1.15 + arm * Math.PI;
      const rad = t * 1.35;
      blocks.push({
        dx: Math.round(Math.cos(ang) * rad),
        dy: Math.round(Math.sin(ang) * rad * 0.62),
        color: PAL.galaxyArm[Math.min(3, (t / 1.8) | 0)],
        alpha: Math.max(0.3, 1 - t * 0.12),
        twinkle: r() < 0.06,
      });
    }
  }
  blocks.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy));
  return blocks;
}

const GENERATORS = {
  spark: genSpark, star: genStar, cluster: genCluster, sun: genSun,
  planet: (r) => genPlanet(r), ringed: genRinged, moon: genMoon,
  comet: genComet, nebula: genNebula, galaxy: genGalaxy,
};

// What forms, in order. `name` = announced as a milestone when completed.
const SCHEDULE = [
  { type: 'spark', name: 'the first spark of light' },
  { type: 'spark' }, { type: 'star', name: 'a tiny star' }, { type: 'spark' },
  { type: 'star' }, { type: 'cluster', name: 'a star cluster' },
  { type: 'sun', name: 'a sun', glow: 1.0 },
  { type: 'star' }, { type: 'spark' },
  { type: 'planet', name: 'your first planet', glow: 0.5 },
  { type: 'star' }, { type: 'star' },
  { type: 'planet', name: 'a second planet', glow: 0.5 },
  { type: 'comet', name: 'a comet' },
  { type: 'cluster' },
  { type: 'ringed', name: 'a ringed planet', glow: 0.6 },
  { type: 'moon', name: 'a moon' }, { type: 'moon' },
  { type: 'nebula', name: 'a nebula', glow: 1.4 },
  { type: 'star' }, { type: 'cluster' },
  { type: 'planet', name: 'a third planet', glow: 0.5 },
  { type: 'galaxy', name: 'a distant galaxy', glow: 1.2 },
];
// After the schedule, the cosmos keeps growing with this repeating mix.
const FILLER = ['star', 'spark', 'planet', 'cluster', 'star', 'comet',
  'nebula', 'star', 'moon', 'ringed', 'cluster', 'galaxy'];

const ENERGY_PER_BLOCK = 400;
const MAX_BLOCKS = 6000;
const CELL = 7; // css pixels per block

// ---------------------------------------------------------------------------
// Universe: lazily generates structures + placements from the seed
// ---------------------------------------------------------------------------

class Universe {
  constructor(id) {
    this.id = id;
    this.name = universeName(id);
    this.rng = mulberry32(hashSeed('pixels:' + id));
    this.structures = [];   // {type, name, glow, blocks, anchor:{x,y}, span}
    this.totalBlocks = 0;   // blocks across generated structures
    this.boxes = [];        // occupied areas in virtual 200x112 cell space
  }

  scheduleEntry(i) {
    if (i < SCHEDULE.length) return SCHEDULE[i];
    return { type: FILLER[(i - SCHEDULE.length) % FILLER.length] };
  }

  generateNext() {
    const i = this.structures.length;
    const entry = this.scheduleEntry(i);
    const blocks = GENERATORS[entry.type](this.rng);
    let span = 1;
    for (const b of blocks) span = Math.max(span, Math.abs(b.dx), Math.abs(b.dy));

    // Find a spot in virtual 200x112 cell space that doesn't crowd others.
    let ax = 0.5, ay = 0.5;
    for (let attempt = 0; attempt < 50; attempt++) {
      ax = 0.07 + this.rng() * 0.86;
      ay = 0.09 + this.rng() * 0.82;
      const cx = ax * 200, cy = ay * 112, pad = span + 4;
      if (this.boxes.every((b) => Math.abs(b.x - cx) > b.span + pad || Math.abs(b.y - cy) > b.span + pad)) break;
    }
    this.boxes.push({ x: ax * 200, y: ay * 112, span });

    const s = { ...entry, blocks, anchor: { x: ax, y: ay }, span, start: this.totalBlocks };
    this.totalBlocks += blocks.length;
    this.structures.push(s);
    return s;
  }

  // Global block index -> {structure, block}
  blockAt(index) {
    while (this.totalBlocks <= index) this.generateNext();
    for (let i = this.structures.length - 1; i >= 0; i--) {
      const s = this.structures[i];
      if (index >= s.start) return { s, b: s.blocks[index - s.start] };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const grid = document.createElement('canvas'); // 1 canvas px = 1 block
const gctx = grid.getContext('2d');

const state = {
  sessions: new Map(),
  current: null,
  universe: null,
  placed: 0,            // blocks drawn so far
  sparks: [],           // builder sparks in flight
  twinklers: [],        // {cx, cy, color, phase, speed}
  glows: [],            // {x, y, r, strength} from completed structures
  flashes: [],          // brief pop when a block lands
  announced: 0,         // structures announced so far
  loadedOnce: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Canvas sizing / grid drawing
// ---------------------------------------------------------------------------

let W = 0, H = 0, GW = 0, GH = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  GW = Math.ceil(W / CELL);
  GH = Math.ceil(H / CELL);
  grid.width = GW;
  grid.height = GH;
  replayGrid();
}
window.addEventListener('resize', resize);

function cellOf(structure, block) {
  return {
    cx: Math.round(structure.anchor.x * GW) + block.dx,
    cy: Math.round(structure.anchor.y * GH) + block.dy,
  };
}

function stampBlock(structure, block) {
  const { cx, cy } = cellOf(structure, block);
  gctx.globalAlpha = block.alpha != null ? block.alpha : 1;
  gctx.fillStyle = block.color;
  gctx.fillRect(cx, cy, 1, 1);
  gctx.globalAlpha = 1;
}

// Redraw every placed block (after resize or session switch).
function replayGrid() {
  gctx.clearRect(0, 0, GW, GH);
  state.twinklers = [];
  state.glows = [];
  const u = state.universe;
  if (!u) return;
  for (let i = 0; i < state.placed; i++) {
    const { s, b } = u.blockAt(i);
    stampBlock(s, b);
    registerEffects(s, b, i, false);
  }
}

function registerEffects(s, b, index, live) {
  if (b.twinkle && state.twinklers.length < 70) {
    const { cx, cy } = cellOf(s, b);
    state.twinklers.push({ cx, cy, color: b.color, phase: Math.random() * 6.28, speed: 0.4 + Math.random() * 1.2 });
  }
  if (s.glow && index === s.start + s.blocks.length - 1) {
    state.glows.push({ x: s.anchor.x, y: s.anchor.y, r: (s.span + 6) * CELL * 2.2, strength: s.glow });
  }
}

// ---------------------------------------------------------------------------
// Building: sparks place one block at a time
// ---------------------------------------------------------------------------

function targetEnergy() {
  const s = state.sessions.get(state.current);
  return s ? s.energy : 0;
}

function targetBlocks() {
  return Math.min(MAX_BLOCKS, Math.floor(targetEnergy() / ENERGY_PER_BLOCK));
}

function placeBlock(index, announce) {
  const u = state.universe;
  const { s, b } = u.blockAt(index);
  stampBlock(s, b);
  registerEffects(s, b, index, true);
  const { cx, cy } = cellOf(s, b);
  if (!state.reduceMotion) {
    state.flashes.push({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2, life: 1 });
    if (state.flashes.length > 60) state.flashes.shift();
  }
  // Announce a named structure the moment its last block lands.
  if (announce && s.name && index === s.start + s.blocks.length - 1) {
    toast(`✨ ${cap(s.name)} has formed`);
  }
}

function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

function advanceBuilding(dt) {
  const target = targetBlocks();
  let backlog = target - state.placed;
  if (backlog <= 0) { state.sparks = []; return; }

  // Huge backlog (old session / burst): materialize instantly down to a tail
  // that's fun to watch.
  if (backlog > 140) {
    const instant = backlog - 120;
    for (let i = 0; i < instant; i++) placeBlock(state.placed++, false);
    backlog = target - state.placed;
  }
  if (state.reduceMotion) {
    while (state.placed < target) placeBlock(state.placed++, true);
    return;
  }

  // Keep 1–2 sparks flying; each carries one block to its destination.
  const wanted = backlog > 25 ? 2 : 1;
  while (state.sparks.length < wanted && state.placed + state.sparks.length < target) {
    const index = state.placed + state.sparks.length;
    const { s, b } = state.universe.blockAt(index);
    const { cx, cy } = cellOf(s, b);
    state.sparks.push({
      index,
      x: Math.random() * W, y: -10 - Math.random() * 40, // drop in from above
      tx: cx * CELL + CELL / 2, ty: cy * CELL + CELL / 2,
      trail: [],
    });
  }

  // Faster travel when there's more to build.
  const speed = Math.min(2.2, 0.55 + backlog * 0.03);
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const sp = state.sparks[i];
    sp.trail.unshift({ x: sp.x, y: sp.y });
    if (sp.trail.length > 7) sp.trail.pop();
    const ddx = sp.tx - sp.x, ddy = sp.ty - sp.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 3) {
      // Sparks resolve strictly in order so `placed` stays contiguous.
      if (sp.index === state.placed) {
        placeBlock(state.placed++, true);
        state.sparks.splice(i, 1);
      }
    } else {
      const step = Math.max(2.5, dist * 0.055) * speed * (dt / 16.7);
      sp.x += (ddx / dist) * step;
      sp.y += (ddy / dist) * step;
    }
  }
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

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
      if (msg.session.id !== state.current &&
          $('followLive').checked && (!prev || msg.session.energy > prev.energy)) {
        openUniverse(msg.session.id);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Opening a universe
// ---------------------------------------------------------------------------

function openUniverse(id) {
  if (state.current === id) return;
  state.current = id;
  state.universe = new Universe(id);
  state.placed = 0;
  state.sparks = [];
  state.flashes = [];
  state.announced = 0;
  // Show most of an existing universe immediately; animate the last stretch.
  const target = targetBlocks();
  state.placed = Math.max(0, target - 90);
  replayGrid();
  $('universeName').textContent = state.universe.name;
  history.replaceState(null, '', '?session=' + id);
  renderSessionList();
}

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------------------------------------------------------------------------
// Sidebar — titles only
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
    li.textContent = universeName(s.id);
    if (live) {
      const dot = document.createElement('span');
      dot.className = 'livedot';
      li.appendChild(dot);
    }
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
// Render loop
// ---------------------------------------------------------------------------

let lastT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !state.universe) { lastT = now; return; }
  const dt = Math.min(50, now - lastT || 16.7);
  lastT = now;
  const t = now / 1000;

  advanceBuilding(dt);

  // The void: near-black midnight with the faintest teal breath at the bottom.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050a12');
  bg.addColorStop(0.75, '#071019');
  bg.addColorStop(1, '#0a1a20');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft luminescence around finished major structures (very subtle).
  for (const g of state.glows) {
    const gx = g.x * W, gy = g.y * H;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.r);
    grad.addColorStop(0, `rgba(140, 226, 210, ${0.055 * g.strength})`);
    grad.addColorStop(1, 'rgba(140, 226, 210, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx - g.r, gy - g.r, g.r * 2, g.r * 2);
  }

  // Placed blocks, scaled up crisp.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grid, 0, 0, GW, GH, 0, 0, GW * CELL, GH * CELL);

  // Twinkling blocks: gently breathe.
  if (!state.reduceMotion) {
    for (const tw of state.twinklers) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * tw.speed + tw.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = tw.color;
      ctx.fillRect(tw.cx * CELL - 1, tw.cy * CELL - 1, CELL + 2, CELL + 2);
    }
    ctx.globalAlpha = 1;
  }

  // Landing flashes: a brief bright pop where a block just arrived.
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    const f = state.flashes[i];
    f.life -= dt / 450;
    if (f.life <= 0) { state.flashes.splice(i, 1); continue; }
    const r = CELL * (1.6 - f.life);
    ctx.globalAlpha = f.life * 0.55;
    ctx.strokeStyle = '#bff0e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x - r, f.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // Builder sparks with a short fading trail.
  for (const sp of state.sparks) {
    for (let k = 0; k < sp.trail.length; k++) {
      ctx.globalAlpha = 0.35 * (1 - k / sp.trail.length);
      ctx.fillStyle = '#9fe8dd';
      const s = 3 - k * 0.3;
      ctx.fillRect(sp.trail[k].x - s / 2, sp.trail[k].y - s / 2, s, s);
    }
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#eafbf6';
    ctx.fillRect(sp.x - 2, sp.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  updateHUD();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHUD() {
  const s = state.sessions.get(state.current);
  if (!s) return;
  $('energyVal').textContent = fmt(targetEnergy());
  $('tokenVal').textContent = fmt(s.tokens.input + s.tokens.output + s.tokens.cacheCreate + s.tokens.cacheRead);
  $('promptVal').textContent = s.prompts;
  $('universeAge').textContent = `${state.placed.toLocaleString()} blocks placed`;

  // Progress toward completing the structure currently being built.
  const u = state.universe;
  const target = targetBlocks();
  const info = u.blockAt(Math.max(0, target));
  if (info) {
    const { s: cur } = info;
    const done = Math.min(target, cur.start + cur.blocks.length) - cur.start;
    const label = cur.name || 'more of the cosmos';
    const remainingEnergy = (cur.start + cur.blocks.length) * ENERGY_PER_BLOCK - targetEnergy();
    $('milestoneLabel').textContent =
      `now forming: ${label} — ${Math.max(1, Math.ceil(remainingEnergy / 1000))}k energy to finish`;
    $('milestoneFill').style.width = Math.max(3, (done / cur.blocks.length) * 100) + '%';
  }
}

// ---------------------------------------------------------------------------
// Controls + boot
// ---------------------------------------------------------------------------

$('sidebarToggle').onclick = () => $('sidebar').classList.toggle('hidden');

$('snapBtn').onclick = () => {
  const a = document.createElement('a');
  a.download = (state.universe ? state.universe.name : 'universe').replace(/\s+/g, '-') + '.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('📸 Universe saved as an image');
};

resize();
connect();
requestAnimationFrame(frame);
