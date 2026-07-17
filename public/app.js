/**
 * Token Universe — The Known Universe edition.
 *
 * ONE universe, fed by the combined token usage of EVERY Claude Code
 * session. It reconstructs our actual cosmic neighbourhood, slowly:
 *
 *   the Sun (core → radiative zone → convective zone → photosphere)
 *   → Earth (inner core → outer core → mantles → crust → surface → air)
 *   → the Moon → Mercury → Venus → Mars → the asteroid belt
 *   → Jupiter → Saturn (+ rings) → Uranus → Neptune → the Kuiper belt
 *   → named nearby stars → the Milky Way's galactic field.
 *
 * Planets are built from the core outward, so while under construction
 * you see a geological cutaway; the surface wraps over it at the end.
 *
 * ~40,000 cosmic energy = 1 block, so building is deliberately slow.
 * The world is pannable (drag) and zoomable (wheel / bottom-right
 * control). Everything is deterministic: same layout every time.
 */
'use strict';

// ---------------------------------------------------------------------------
// Deterministic randomness (fixed seed — it's OUR universe, always the same)
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

const ENERGY_PER_BLOCK = 40_000;  // slow, deliberate growth
const BASE = 3;                   // css px per block at zoom 1
const WB = 2400, HB = 1400;       // world size in blocks
const SUN = { x: 500, y: 700 };   // world position of the Sun
const FIELD_CAP = 30_000;         // max Milky Way field blocks

// ---------------------------------------------------------------------------
// Pixel-art builders
// ---------------------------------------------------------------------------

function discCells(R) {
  const cells = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= R + 0.3) cells.push({ dx, dy, d });
    }
  }
  return cells;
}

function dither(rng, colors) {
  return colors[Math.min(colors.length - 1, (rng() * colors.length) | 0)];
}

/**
 * A body built as concentric geological shells, then a surface that wraps
 * over the whole face, then (optionally) a thin atmosphere.
 * shells: [{frac, name, colors}] ordered inside-out; fracs of R.
 */
function makeBody(rng, cfg) {
  const { name, cx, cy, R, shells, surface, surfaceName, sweep, atmosphere } = cfg;
  const cells = discCells(R);
  const layers = [];

  let prevFrac = 0;
  for (const sh of shells) {
    const blocks = cells
      .filter((c) => c.d > prevFrac * R - 0.35 && c.d <= sh.frac * R + (sh.frac === 1 ? 0.3 : 0))
      .sort((a, b) => a.d - b.d || a.dx - b.dx)
      .map((c) => ({ dx: c.dx, dy: c.dy, color: dither(rng, sh.colors) }));
    if (blocks.length) layers.push({ name: sh.name, blocks });
    prevFrac = sh.frac;
  }

  if (surface) {
    const blocks = cells
      .slice()
      .sort(sweep === 'bands'
        ? (a, b) => a.dy - b.dy || a.dx - b.dx     // gas giants: band by band
        : (a, b) => a.dx - b.dx || a.dy - b.dy)    // rocky: sweep across the face
      .map((c) => {
        const col = surface(c.dx, c.dy, c.d, R, rng);
        return col ? { dx: c.dx, dy: c.dy, color: col } : null;
      })
      .filter(Boolean);
    layers.push({ name: surfaceName || 'the surface', blocks });
  }

  if (atmosphere) {
    const blocks = [];
    for (let dy = -R - 2; dy <= R + 2; dy++) {
      for (let dx = -R - 2; dx <= R + 2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > R + 0.3 && d <= R + 1.7) {
          blocks.push({ dx, dy, color: atmosphere, alpha: 0.35 });
        }
      }
    }
    layers.push({ name: 'the atmosphere', blocks });
  }

  return { name, cx, cy, R, kind: 'body', layers };
}

function makeRingScatter(rng, name, layerName, dist, spread, count, colors, alphaLo) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = dist + (rng() + rng() - 1) * spread;
    blocks.push({
      dx: Math.round(Math.cos(ang) * rad),
      dy: Math.round(Math.sin(ang) * rad),
      color: dither(rng, colors),
      alpha: alphaLo + rng() * 0.4,
      ang,
    });
  }
  blocks.sort((a, b) => a.ang - b.ang); // builds sweeping around the orbit
  return { name, cx: SUN.x, cy: SUN.y, R: dist + spread, kind: 'ring', layers: [{ name: layerName, blocks }] };
}

function makeStar(rng, name, cx, cy, size, color, dimColor) {
  const blocks = [{ dx: 0, dy: 0, color, twinkle: true }];
  if (size > 1) {
    blocks.push(
      { dx: -1, dy: 0, color: dimColor }, { dx: 1, dy: 0, color: dimColor },
      { dx: 0, dy: -1, color: dimColor }, { dx: 0, dy: 1, color: dimColor });
  }
  if (size > 2) {
    blocks.push(
      { dx: -2, dy: 0, color: dimColor, alpha: 0.5 }, { dx: 2, dy: 0, color: dimColor, alpha: 0.5 },
      { dx: 0, dy: -2, color: dimColor, alpha: 0.5 }, { dx: 0, dy: 2, color: dimColor, alpha: 0.5 });
  }
  return { name, cx, cy, R: size, kind: 'star', layers: [{ name: null, blocks }] };
}

// ---------------------------------------------------------------------------
// The Known Universe — structure definitions (built in this order)
// ---------------------------------------------------------------------------

function planetX(dist) { return SUN.x + dist; }

function buildUniverse() {
  const rng = mulberry32(0xC05305);
  const S = [];

  // --- The Sun: real interior structure ---
  const sun = makeBody(rng, {
    name: 'the Sun', cx: SUN.x, cy: SUN.y, R: 30,
    shells: [
      { frac: 0.25, name: "the Sun's core", colors: ['#fff7e2', '#fdf2d2'] },
      { frac: 0.55, name: 'the radiative zone', colors: ['#ffe9b4', '#fce2a2'] },
      { frac: 0.85, name: 'the convective zone', colors: ['#ffd685', '#f8cd78'] },
      { frac: 1.0, name: 'the photosphere', colors: ['#ffc45e', '#f2b455', '#e8a94f'] },
    ],
  });
  // Corona: faint spikes.
  const corona = [];
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const len = ux && uy ? 2 : 4;
    for (let k = 1; k <= len; k++) {
      corona.push({ dx: ux * (30 + 1 + k), dy: uy * (30 + 1 + k), color: '#e8a94f', alpha: 0.6 - k * 0.12, twinkle: true });
    }
  }
  sun.layers.push({ name: 'the corona', blocks: corona });
  S.push(sun);

  // --- Earth first (as requested), with full geological layering ---
  S.push(makeBody(rng, {
    name: 'Earth', cx: planetX(160), cy: SUN.y, R: 9,
    shells: [
      { frac: 0.19, name: "Earth's inner core", colors: ['#f2ead0', '#ece2c2'] },
      { frac: 0.35, name: "Earth's outer core", colors: ['#e8b04e', '#dfa444'] },
      { frac: 0.62, name: 'the lower mantle', colors: ['#c96a3f', '#bd6039'] },
      { frac: 0.85, name: 'the upper mantle', colors: ['#a45238', '#984b33'] },
      { frac: 1.0, name: 'the crust', colors: ['#6b4a36', '#5f4230'] },
    ],
    surfaceName: 'oceans and continents',
    surface: (dx, dy, d, R, r) => {
      if (Math.abs(dy) > R * 0.82) return r() < 0.75 ? '#dfe8ee' : '#c8d8e2';     // polar ice
      const n = Math.sin(dx * 0.9 + 1.7) + Math.sin(dy * 1.1 + dx * 0.5) + (r() - 0.5);
      return n > 0.55 ? (r() < 0.85 ? '#4f7d4a' : '#5f8d54') : (r() < 0.9 ? '#2e5f9e' : '#3a6cab');
    },
    atmosphere: '#9fc8e8',
  }));

  S.push(makeBody(rng, {
    name: 'the Moon', cx: planetX(160) + 15, cy: SUN.y - 9, R: 2,
    shells: [{ frac: 1.0, name: null, colors: ['#c9c9c4', '#a8a8a2'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (r() < 0.2 ? '#8f8f8a' : null),
  }));

  // --- Then inward-out: Mercury, Venus, Mars ---
  S.push(makeBody(rng, {
    name: 'Mercury', cx: planetX(70), cy: SUN.y, R: 4,
    shells: [
      { frac: 0.7, name: "Mercury's iron core", colors: ['#c8b08a', '#bfa67e'] },  // huge core — accurate!
      { frac: 1.0, name: "Mercury's mantle and crust", colors: ['#8a7d70', '#7d7166'] },
    ],
    surfaceName: 'a cratered surface',
    surface: (dx, dy, d, R, r) => (r() < 0.3 ? '#6f6862' : '#9a938c'),
  }));

  S.push(makeBody(rng, {
    name: 'Venus', cx: planetX(110), cy: SUN.y, R: 8,
    shells: [
      { frac: 0.5, name: "Venus's core", colors: ['#d8b878', '#cead6c'] },
      { frac: 0.85, name: "Venus's mantle", colors: ['#b0714a', '#a56843'] },
      { frac: 1.0, name: "Venus's crust", colors: ['#8a5f45', '#7d553e'] },
    ],
    surfaceName: 'thick sulfuric clouds',
    surface: (dx, dy, d, R, r) => {
      const band = Math.sin(dy * 0.9 + dx * 0.25);
      return band > 0 ? (r() < 0.9 ? '#e6d9a8' : '#ded093') : '#d9c48a';
    },
  }));

  S.push(makeBody(rng, {
    name: 'Mars', cx: planetX(215), cy: SUN.y, R: 5,
    shells: [
      { frac: 0.45, name: "Mars's core", colors: ['#c89058', '#bd8750'] },
      { frac: 0.8, name: "Mars's mantle", colors: ['#a05a3a', '#955335'] },
      { frac: 1.0, name: "Mars's crust", colors: ['#8a4a30', '#7d442c'] },
    ],
    surfaceName: 'the red surface',
    surface: (dx, dy, d, R, r) => {
      if (Math.abs(dy) > R * 0.8) return '#e8e2da';                                 // polar caps
      return r() < 0.75 ? '#c1704f' : '#a85a3f';
    },
  }));

  // --- Asteroid belt ---
  S.push(makeRingScatter(rng, 'the asteroid belt', 'the asteroid belt', 270, 12, 480,
    ['#8a8578', '#6f6b60', '#a09a8c'], 0.35));

  // --- Gas giants ---
  S.push(makeBody(rng, {
    name: 'Jupiter', cx: planetX(360), cy: SUN.y, R: 20,
    shells: [
      { frac: 0.2, name: "Jupiter's rocky core", colors: ['#d8c8a8', '#cfbf9c'] },
      { frac: 0.55, name: 'metallic hydrogen', colors: ['#b89a78', '#ae9070'] },
      { frac: 0.85, name: 'liquid hydrogen', colors: ['#caa98a', '#c09f80'] },
      { frac: 1.0, name: 'the outer envelope', colors: ['#d4b494', '#cbab8b'] },
    ],
    sweep: 'bands',
    surfaceName: 'banded clouds',
    surface: (dx, dy, d, R, r) => {
      // The Great Red Spot, southern hemisphere.
      if (Math.hypot((dx - 7) / 4.2, (dy - 8) / 2.4) < 1) return r() < 0.85 ? '#c05a3a' : '#b25234';
      const bands = ['#e8dcc8', '#c9a685', '#dcc9ae', '#b98d6f', '#e2d4bc', '#a8765a'];
      return dither(r, [bands[(Math.floor(dy / 3.2) % bands.length + bands.length) % bands.length]]);
    },
  }));

  const saturn = makeBody(rng, {
    name: 'Saturn', cx: planetX(470), cy: SUN.y, R: 16,
    shells: [
      { frac: 0.25, name: "Saturn's core", colors: ['#d0c0a0', '#c7b795'] },
      { frac: 0.6, name: 'metallic hydrogen', colors: ['#c0ab8c', '#b7a284'] },
      { frac: 1.0, name: 'the outer envelope', colors: ['#d9c8a5', '#d0bf9c'] },
    ],
    sweep: 'bands',
    surfaceName: 'pale gold bands',
    surface: (dx, dy, d, R, r) => {
      const bands = ['#e8d9b8', '#d9c8a0', '#e2d2ae', '#c8b088'];
      return bands[(Math.floor(dy / 3.5) % bands.length + bands.length) % bands.length];
    },
  });
  // Saturn's rings, with the Cassini Division gap.
  const ringBlocks = [];
  for (let dx = -(16 + 15); dx <= 16 + 15; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const e = Math.hypot(dx / (16 + 15), dy / 2.6);
      const inner = Math.hypot(dx / (16 + 5), dy / 1.2);
      if (e > 1 || inner < 1) continue;
      if (Math.hypot(dx, dy) <= 16.3) continue;                 // don't overwrite the body
      const cassini = Math.abs(Math.hypot(dx / (16 + 11), dy / 2.0) - 1) < 0.045;
      ringBlocks.push({
        dx, dy,
        color: cassini ? '#5a5346' : dither(rng, ['#cfc4ae', '#c2b7a0', '#b8ad96']),
        alpha: cassini ? 0.5 : 0.85,
        key: Math.abs(dx),
      });
    }
  }
  ringBlocks.sort((a, b) => a.key - b.key);
  saturn.layers.push({ name: "Saturn's rings", blocks: ringBlocks });
  S.push(saturn);

  S.push(makeBody(rng, {
    name: 'Uranus', cx: planetX(580), cy: SUN.y, R: 11,
    shells: [
      { frac: 0.3, name: "Uranus's rocky core", colors: ['#c8bca8', '#bfb39e'] },
      { frac: 0.8, name: 'an icy mantle', colors: ['#7ab8c8', '#70afc0'] },
      { frac: 1.0, name: 'the outer atmosphere', colors: ['#96ccd4', '#8cc4cd'] },
    ],
    sweep: 'bands',
    surfaceName: 'pale cyan haze',
    surface: (dx, dy, d, R, r) => (r() < 0.9 ? '#a8d8d8' : '#98cccf'),
  }));

  S.push(makeBody(rng, {
    name: 'Neptune', cx: planetX(680), cy: SUN.y, R: 11,
    shells: [
      { frac: 0.3, name: "Neptune's rocky core", colors: ['#c0b4a0', '#b7ab96'] },
      { frac: 0.8, name: 'an icy mantle', colors: ['#4a6fb8', '#4468ae'] },
      { frac: 1.0, name: 'the outer atmosphere', colors: ['#3f66c4', '#3a5fba'] },
    ],
    sweep: 'bands',
    surfaceName: 'deep blue storms',
    surface: (dx, dy, d, R, r) => {
      if (dy === -3 && dx > -6 && dx < 2) return '#dfe8f4';     // white storm streak
      return r() < 0.8 ? '#3f6ad8' : '#2f55b8';
    },
  }));

  // --- Kuiper belt + Pluto ---
  S.push(makeRingScatter(rng, 'the Kuiper belt', 'the Kuiper belt', 780, 28, 620,
    ['#6f7a8a', '#5a6474', '#8a93a2'], 0.25));
  S.push(makeBody(rng, {
    name: 'Pluto', cx: planetX(780), cy: SUN.y - 40, R: 2,
    shells: [{ frac: 1.0, name: null, colors: ['#c8b8a8', '#baa896'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (dx <= 0 && dy >= 0 && r() < 0.6 ? '#e2d8ca' : null), // heart-ish patch
  }));

  // --- Named nearby stars, roughly by real distance from us ---
  const stars = [
    ['Proxima Centauri', 1500, 1050, 1, '#e8a8a0', '#a86a64'],
    ['Alpha Centauri', 1560, 1020, 2, '#f2ead2', '#b0a880'],
    ["Barnard's Star", 1380, 380, 1, '#e0968a', '#9a6258'],
    ['Sirius', 1700, 850, 3, '#eaf2ff', '#8fa8d8'],
    ['Epsilon Eridani', 1250, 1180, 1, '#f0c890', '#b08c58'],
    ['Tau Ceti', 1820, 500, 1, '#f2dca8', '#b09c6a'],
    ['Vega', 1980, 950, 2, '#dce8ff', '#8098c8'],
    ['Altair', 2050, 620, 2, '#e8eefc', '#94a4c8'],
    ['Polaris', 1150, 180, 2, '#f2f0e2', '#a8a488'],
    ['Betelgeuse', 2200, 380, 3, '#e88a5a', '#a85a38'],
    ['Rigel', 2250, 1100, 3, '#cfe0ff', '#7890c0'],
  ];
  for (const [name, x, y, size, c, dim] of stars) S.push(makeStar(rng, name, x, y, size, c, dim));

  // Cumulative indices.
  let acc = 0;
  for (const s of S) {
    s.start = acc;
    for (const l of s.layers) { l.start = acc; acc += l.blocks.length; }
    s.count = acc - s.start;
  }
  return { structures: S, fixedTotal: acc };
}

// --- The Milky Way field: lazily generated, effectively endless ---

function makeField() {
  const rng = mulberry32(0x9A1AC7);
  const blocks = [];
  const A = { x: 150, y: 1300 }, B = { x: 2300, y: 120 };
  return {
    name: 'the Milky Way', kind: 'field',
    ensure(n) {
      while (blocks.length <= n && blocks.length < FIELD_CAP) {
        const t = rng();
        const nearCore = t > 0.86;
        const spread = nearCore ? 55 : 130;
        const px = A.x + (B.x - A.x) * t, py = A.y + (B.y - A.y) * t;
        // Perpendicular offset from the band's axis.
        const off = (rng() + rng() + rng() - 1.5) * spread;
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
        const bright = rng();
        blocks.push({
          cx: Math.round(px + nx * off), cy: Math.round(py + ny * off),
          color: bright > 0.93 ? '#dfe8fa' : bright > 0.7 ? '#8fa8cc' : bright > 0.4 ? '#5d7ba8' : '#3a5178',
          alpha: nearCore ? 0.5 + rng() * 0.5 : 0.25 + rng() * 0.5,
          twinkle: bright > 0.96,
        });
      }
      return blocks[Math.min(n, blocks.length - 1)];
    },
    blocks,
  };
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const grid = document.createElement('canvas');
grid.width = WB; grid.height = HB;
const gctx = grid.getContext('2d');

const UNI = buildUniverse();
const FIELD = makeField();

const state = {
  sessions: new Map(),
  placed: 0,
  sparks: [],
  twinklers: [],
  flashes: [],
  loaded: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const HOME = { x: 800, y: 700, z: 0.55 };
const cam = { ...HOME };       // current camera (world blocks)
const camTarget = { ...HOME }; // eased toward each frame

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Block accounting
// ---------------------------------------------------------------------------

function totalEnergy() {
  let e = 0;
  for (const s of state.sessions.values()) e += s.energy;
  return e;
}

function totalTokens() {
  let t = 0;
  for (const s of state.sessions.values()) {
    t += s.tokens.input + s.tokens.output + s.tokens.cacheCreate + s.tokens.cacheRead;
  }
  return t;
}

function currentSession() {
  let best = null;
  for (const s of state.sessions.values()) {
    if (!best || (s.updatedAt || 0) > (best.updatedAt || 0)) best = s;
  }
  return best;
}

function targetBlocks() {
  return Math.min(UNI.fixedTotal + FIELD_CAP, Math.floor(totalEnergy() / ENERGY_PER_BLOCK));
}

// index -> {s, layer, b, cx, cy}
function blockAt(index) {
  if (index >= UNI.fixedTotal) {
    const b = FIELD.ensure(index - UNI.fixedTotal);
    return { s: FIELD, layer: null, b, cx: b.cx, cy: b.cy };
  }
  for (let i = UNI.structures.length - 1; i >= 0; i--) {
    const s = UNI.structures[i];
    if (index >= s.start) {
      for (let j = s.layers.length - 1; j >= 0; j--) {
        const l = s.layers[j];
        if (index >= l.start) {
          const b = l.blocks[index - l.start];
          return { s, layer: l, b, cx: s.cx + b.dx, cy: s.cy + b.dy };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Grid drawing
// ---------------------------------------------------------------------------

function stamp(info) {
  gctx.globalAlpha = info.b.alpha != null ? info.b.alpha : 1;
  gctx.fillStyle = info.b.color;
  gctx.fillRect(info.cx, info.cy, 1, 1);
  gctx.globalAlpha = 1;
  if (info.b.twinkle && state.twinklers.length < 160) {
    state.twinklers.push({ cx: info.cx, cy: info.cy, color: info.b.color, phase: Math.random() * 6.28, speed: 0.4 + Math.random() * 1.1 });
  }
}

function placeBlock(index, announce) {
  const info = blockAt(index);
  stamp(info);
  if (!state.reduceMotion) {
    state.flashes.push({ x: info.cx, y: info.cy, life: 1 });
    if (state.flashes.length > 50) state.flashes.shift();
  }
  if (!announce || !info.layer) return;
  const { s, layer } = info;
  const layerEnd = layer.start + layer.blocks.length - 1;
  const structEnd = s.start + s.count - 1;
  if (index === structEnd && s.kind === 'body') toast(`✨ ${cap(s.name)} has formed`);
  else if (index === layerEnd && layer.name) toast(`${cap(layer.name)} is complete`);
}

function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

// ---------------------------------------------------------------------------
// Building animation
// ---------------------------------------------------------------------------

function advanceBuilding(dt) {
  const target = targetBlocks();
  let backlog = target - state.placed;
  if (backlog <= 0) { state.sparks = []; return; }

  if (backlog > 120) {
    const instant = backlog - 100;
    for (let i = 0; i < instant; i++) placeBlock(state.placed++, false);
    backlog = target - state.placed;
  }
  if (state.reduceMotion) {
    while (state.placed < target) placeBlock(state.placed++, true);
    return;
  }

  const wanted = backlog > 20 ? 2 : 1;
  while (state.sparks.length < wanted && state.placed + state.sparks.length < target) {
    const index = state.placed + state.sparks.length;
    const info = blockAt(index);
    // Sparks appear from the void just outside the current view.
    const viewW = window.innerWidth / (BASE * cam.z);
    state.sparks.push({
      index,
      x: cam.x + (Math.random() - 0.5) * viewW,
      y: cam.y - (window.innerHeight / (BASE * cam.z)) * 0.6,
      tx: info.cx + 0.5, ty: info.cy + 0.5,
      trail: [],
    });
  }

  const speed = Math.min(2.4, 0.6 + backlog * 0.04);
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const sp = state.sparks[i];
    sp.trail.unshift({ x: sp.x, y: sp.y });
    if (sp.trail.length > 7) sp.trail.pop();
    const ddx = sp.tx - sp.x, ddy = sp.ty - sp.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 1.2) {
      if (sp.index === state.placed) {
        placeBlock(state.placed++, true);
        state.sparks.splice(i, 1);
        renderLocations();
      }
    } else {
      const step = Math.max(1.2, dist * 0.05) * speed * (dt / 16.7);
      sp.x += (ddx / dist) * step;
      sp.y += (ddy / dist) * step;
    }
  }
}

// ---------------------------------------------------------------------------
// Camera + input
// ---------------------------------------------------------------------------

let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);

function w2s(x, y) {
  const s = BASE * cam.z;
  return { x: (x - cam.x) * s + W / 2, y: (y - cam.y) * s + H / 2 };
}

function clampCam() {
  camTarget.z = Math.min(14, Math.max(0.2, camTarget.z));
  camTarget.x = Math.min(WB, Math.max(0, camTarget.x));
  camTarget.y = Math.min(HB, Math.max(0, camTarget.y));
}

let dragging = false, lastMouse = null;

canvas.addEventListener('mousedown', (e) => { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const s = BASE * cam.z;
  camTarget.x -= (e.clientX - lastMouse.x) / s;
  camTarget.y -= (e.clientY - lastMouse.y) / s;
  cam.x = camTarget.x; cam.y = camTarget.y; // pan feels 1:1, no easing lag
  lastMouse = { x: e.clientX, y: e.clientY };
  clampCam();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0013);
  zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

function zoomAt(px, py, factor) {
  const s0 = BASE * cam.z;
  const wx = (px - W / 2) / s0 + cam.x;
  const wy = (py - H / 2) / s0 + cam.y;
  camTarget.z *= factor;
  clampCam();
  const s1 = BASE * camTarget.z;
  camTarget.x = wx - (px - W / 2) / s1;
  camTarget.y = wy - (py - H / 2) / s1;
  clampCam();
}

function flyTo(x, y, z) {
  camTarget.x = x; camTarget.y = y; camTarget.z = z;
  clampCam();
}

$('zoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.45);
$('zoomOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.45);
$('zoomReset').onclick = () => flyTo(HOME.x, HOME.y, HOME.z);

// Touch: one finger pans, pinch zooms.
let lastTouch = null;
canvas.addEventListener('touchstart', (e) => { lastTouch = snapshotTouches(e); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const now = snapshotTouches(e);
  if (lastTouch && now.n === 1 && lastTouch.n === 1) {
    const s = BASE * cam.z;
    camTarget.x -= (now.x - lastTouch.x) / s;
    camTarget.y -= (now.y - lastTouch.y) / s;
    cam.x = camTarget.x; cam.y = camTarget.y;
  } else if (lastTouch && now.n === 2 && lastTouch.n === 2 && lastTouch.d > 0) {
    zoomAt(now.x, now.y, now.d / lastTouch.d);
  }
  clampCam();
  lastTouch = now;
}, { passive: false });

function snapshotTouches(e) {
  const t = e.touches;
  if (t.length >= 2) {
    return {
      n: 2,
      x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2,
      d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
    };
  }
  if (t.length === 1) return { n: 1, x: t[0].clientX, y: t[0].clientY, d: 0 };
  return { n: 0, x: 0, y: 0, d: 0 };
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
      if (!state.loaded) {
        state.loaded = true;
        // Materialize history instantly; animate only the newest stretch.
        state.placed = Math.max(0, targetBlocks() - 80);
        for (let i = 0; i < state.placed; i++) stamp(blockAt(i));
        renderLocations();
        // ?goto=Earth&z=6 jumps straight to a location (shareable views).
        const params = new URLSearchParams(location.search);
        const goto = params.get('goto');
        if (goto) {
          const st = UNI.structures.find((x) => x.name.toLowerCase().includes(goto.toLowerCase()));
          if (st) {
            flyTo(st.cx, st.cy, parseFloat(params.get('z')) || 5);
            Object.assign(cam, camTarget);
          }
        }
      }
    } else if (msg.type === 'update') {
      state.sessions.set(msg.session.id, msg.session);
    }
  };
}

// ---------------------------------------------------------------------------
// Locations panel — jump around the one universe
// ---------------------------------------------------------------------------

let lastLocCount = -1;

function renderLocations() {
  const target = targetBlocks();
  const started = UNI.structures.filter((s) => target > s.start);
  const showField = target > UNI.fixedTotal;
  const count = started.length + (showField ? 1 : 0);
  if (count === lastLocCount) return;
  lastLocCount = count;

  const list = $('locationList');
  list.innerHTML = '';
  for (const s of started) {
    const li = document.createElement('li');
    const done = Math.min(target, s.start + s.count) - s.start;
    li.textContent = cap(s.name);
    if (done < s.count) li.classList.add('building');
    li.onclick = () => {
      const z = s.kind === 'ring' ? 0.8 : Math.min(9, Math.max(2.5, (H * 0.35) / (s.R * 2 * BASE)));
      flyTo(s.cx, s.cy, s.kind === 'ring' ? 0.8 : z);
    };
    list.appendChild(li);
  }
  if (showField) {
    const li = document.createElement('li');
    li.textContent = 'The Milky Way';
    li.onclick = () => flyTo(1400, 700, 0.35);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

let lastT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || !state.loaded) { lastT = now; return; }
  const dt = Math.min(50, now - lastT || 16.7);
  lastT = now;
  const t = now / 1000;

  // Ease camera.
  cam.x += (camTarget.x - cam.x) * 0.12;
  cam.y += (camTarget.y - cam.y) * 0.12;
  cam.z += (camTarget.z - cam.z) * 0.14;

  advanceBuilding(dt);

  const s = BASE * cam.z;

  // Deep navy void.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04070f');
  bg.addColorStop(0.6, '#060b18');
  bg.addColorStop(1, '#0a1224');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Orbit paths for planets that have begun forming (faint, scientific).
  const target = targetBlocks();
  const sunS = w2s(SUN.x, SUN.y);
  ctx.strokeStyle = 'rgba(110, 150, 220, 0.09)';
  ctx.lineWidth = 1;
  for (const st of UNI.structures) {
    if (st.kind !== 'body' || st.name === 'the Sun' || st.name === 'the Moon' || target <= st.start) continue;
    const r = Math.hypot(st.cx - SUN.x, st.cy - SUN.y) * s;
    if (r < 8 || r > Math.hypot(W, H) * 2) continue;
    ctx.beginPath();
    ctx.arc(sunS.x, sunS.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The world grid, crisp.
  ctx.imageSmoothingEnabled = false;
  const vw = W / s, vh = H / s;
  ctx.drawImage(grid,
    cam.x - vw / 2, cam.y - vh / 2, vw, vh,
    0, 0, W, H);

  // Twinkling blocks.
  if (!state.reduceMotion && s > 0.8) {
    for (const tw of state.twinklers) {
      const p = w2s(tw.cx, tw.cy);
      if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
      const a = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * tw.speed + tw.phase));
      ctx.globalAlpha = a;
      ctx.fillStyle = tw.color;
      ctx.fillRect(p.x - 1, p.y - 1, s + 2, s + 2);
    }
    ctx.globalAlpha = 1;
  }

  // Landing flashes.
  for (let i = state.flashes.length - 1; i >= 0; i--) {
    const f = state.flashes[i];
    f.life -= dt / 450;
    if (f.life <= 0) { state.flashes.splice(i, 1); continue; }
    const p = w2s(f.x + 0.5, f.y + 0.5);
    const r = Math.max(3, s) * (1.7 - f.life);
    ctx.globalAlpha = f.life * 0.5;
    ctx.strokeStyle = '#aecdf2';
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;

  // Builder sparks.
  for (const sp of state.sparks) {
    for (let k = 0; k < sp.trail.length; k++) {
      const p = w2s(sp.trail[k].x, sp.trail[k].y);
      ctx.globalAlpha = 0.3 * (1 - k / sp.trail.length);
      ctx.fillStyle = '#9fc0e8';
      const sz = 3 - k * 0.3;
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    const p = w2s(sp.x, sp.y);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#eaf2fc';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // Labels: only when zoomed in enough to care.
  if (cam.z >= 1.1) {
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(150, 178, 220, 0.6)';
    for (const st of UNI.structures) {
      if (target <= st.start || st.kind === 'ring') continue;
      if (st.kind === 'star' && cam.z < 1.6) continue;
      const p = w2s(st.cx, st.cy + st.R + 4);
      if (p.x < -60 || p.x > W + 60 || p.y < -20 || p.y > H + 20) continue;
      ctx.fillText(cap(st.name), p.x, p.y + 8);
    }
  }

  updateHUD();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function updateHUD() {
  const cur = currentSession();
  $('blocksVal').textContent = `${state.placed.toLocaleString()} blocks placed`;
  $('totTok').textContent = fmt(totalTokens());
  $('totEnergy').textContent = fmt(totalEnergy());
  if (cur) {
    $('sessTok').textContent = fmt(cur.tokens.input + cur.tokens.output + cur.tokens.cacheCreate + cur.tokens.cacheRead);
    $('sessEnergy').textContent = fmt(cur.energy);
  }
  $('zoomPct').textContent = Math.round(cam.z * 100) + '%';

  const target = targetBlocks();
  const info = blockAt(Math.min(target, UNI.fixedTotal + FIELD_CAP - 1));
  if (info && info.layer) {
    const { s: st, layer } = info;
    const done = Math.min(target, layer.start + layer.blocks.length) - layer.start;
    const label = layer.name || st.name;
    const finishEnergy = (layer.start + layer.blocks.length) * ENERGY_PER_BLOCK - totalEnergy();
    $('milestoneLabel').textContent =
      `now forming: ${label} — ${fmt(Math.max(1, finishEnergy))} energy to finish`;
    $('milestoneFill').style.width = Math.max(3, (done / layer.blocks.length) * 100) + '%';
  } else {
    $('milestoneLabel').textContent = 'now forming: the Milky Way — one star at a time';
    $('milestoneFill').style.width = '100%';
  }
}

// ---------------------------------------------------------------------------
// Controls + boot
// ---------------------------------------------------------------------------

$('sidebarToggle').onclick = () => $('sidebar').classList.toggle('hidden');

$('snapBtn').onclick = () => {
  const a = document.createElement('a');
  a.download = 'the-known-universe.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('📸 Universe saved as an image');
};

resize();
connect();
requestAnimationFrame(frame);
