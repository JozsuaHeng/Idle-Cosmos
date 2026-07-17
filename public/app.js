/**
 * The Patient Universe — a cosmos built slowly, one token at a time.
 *
 * ONE universe, fed by the combined token usage of EVERY Claude Code
 * session, reconstructing our real cosmic neighbourhood in build order:
 *
 *   the Sun → Earth → the Moon → Mercury → Venus → Mars
 *   → Halley's Comet → the asteroid belt → Jupiter → Saturn (+ rings)
 *   → Uranus → Neptune → Pluto → the Kuiper belt → Voyager 1
 *   → the Oort Cloud → named nearby stars → the Milky Way's field
 *   → the Andromeda Galaxy.
 *
 * Bodies build core-outward with real geological layers (a cutaway
 * while under construction). Completed bodies earn animated ornaments
 * (satellites and rockets for Earth, a flag on the Moon, a rover on
 * Mars). Every location carries a short educational fact — including
 * locked, not-yet-formed ones, shown greyed out in the atlas.
 *
 * ~22,000 cosmic energy = 1 block. Drag to pan, wheel to zoom,
 * ?goto=Earth&z=6 deep-links. Deterministic: same universe every time.
 */
'use strict';

// ---------------------------------------------------------------------------
// Deterministic randomness
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

const ENERGY_PER_BLOCK = 22_000;
const BASE = 3;                    // css px per block at zoom 1
const WB = 2400, HB = 1900;        // world size in blocks
const SUN = { x: 500, y: 950 };
const FIELD_CAP = 30_000;

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

function makeBody(rng, cfg) {
  const { name, cx, cy, R, shells, surface, surfaceName, sweep, atmosphere, fact, zoom } = cfg;
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
        ? (a, b) => a.dy - b.dy || a.dx - b.dx
        : (a, b) => a.dx - b.dx || a.dy - b.dy)
      .map((c) => {
        const col = surface(c.dx, c.dy, c.d, R, rng);
        return col ? { dx: c.dx, dy: c.dy, color: col } : null;
      })
      .filter(Boolean);
    layers.push({ name: surfaceName || 'the surface', blocks });
  }

  if (atmosphere) {
    const blocks = [];
    for (let dy = -R - 3; dy <= R + 3; dy++) {
      for (let dx = -R - 3; dx <= R + 3; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > R + 0.3 && d <= R + 2.2) blocks.push({ dx, dy, color: atmosphere, alpha: 0.32 });
      }
    }
    layers.push({ name: 'the atmosphere', blocks });
  }

  return { name, cx, cy, R, kind: 'body', layers, fact, zoom };
}

function makeRingScatter(rng, cfg) {
  const { name, dist, spread, count, colors, alphaLo, fact } = cfg;
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
  blocks.sort((a, b) => a.ang - b.ang);
  return { name, cx: SUN.x, cy: SUN.y, R: dist + spread, kind: 'ring', layers: [{ name, blocks }], fact, zoom: 0.55 };
}

function makeSprite(name, cx, cy, rows, paletteMap, fact, extra) {
  // rows: array of strings; paletteMap: char -> [color, alpha?]
  const blocks = [];
  const h = rows.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === ' ' || ch === '.') continue;
      const [color, alpha, twinkle] = paletteMap[ch];
      blocks.push({ dx: x - (rows[y].length >> 1), dy: y - (h >> 1), color, alpha, twinkle });
    }
  }
  return { name, cx, cy, R: Math.max(4, h), kind: 'body', layers: [{ name: null, blocks }], fact, ...extra };
}

function makeStar(rng, name, cx, cy, size, color, dimColor, fact) {
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
  return { name, cx, cy, R: size, kind: 'star', layers: [{ name: null, blocks }], fact };
}

function makeSpiralGalaxy(rng, cfg) {
  const { name, cx, cy, R, coreColors, armColors, fact } = cfg;
  const blocks = [];
  // Core bulge.
  for (const c of discCells(Math.round(R * 0.22))) {
    blocks.push({ dx: c.dx, dy: Math.round(c.dy * 0.7), color: dither(rng, coreColors), d: c.d });
  }
  // Two arms.
  for (let arm = 0; arm < 2; arm++) {
    for (let t = 1.2; t < 11; t += 0.055) {
      const ang = t * 0.62 + arm * Math.PI;
      const rad = t * (R / 11);
      const jx = (rng() - 0.5) * 2.5, jy = (rng() - 0.5) * 2;
      blocks.push({
        dx: Math.round(Math.cos(ang) * rad + jx),
        dy: Math.round(Math.sin(ang) * rad * 0.55 + jy),
        color: dither(rng, armColors),
        alpha: Math.max(0.25, 1 - t * 0.08),
        twinkle: rng() < 0.02,
        d: rad,
      });
    }
  }
  blocks.sort((a, b) => (a.d || 0) - (b.d || 0));
  return { name, cx, cy, R, kind: 'body', layers: [{ name: null, blocks }], fact, zoom: 3 };
}

// ---------------------------------------------------------------------------
// The universe — structures in build order, with educational facts
// ---------------------------------------------------------------------------

function planetX(dist) { return SUN.x + dist; }

function buildSequence() {
  const rng = mulberry32(0xC05305);
  const S = [];

  const sun = makeBody(rng, {
    name: 'the Sun', cx: SUN.x, cy: SUN.y, R: 40,
    fact: 'The Sun holds 99.8% of the Solar System\'s mass. Light from its core takes up to 100,000 years to escape to the surface — then just 8 minutes to reach Earth.',
    shells: [
      { frac: 0.25, name: "the Sun's core", colors: ['#fff7e2', '#fdf2d2'] },
      { frac: 0.55, name: 'the radiative zone', colors: ['#ffe9b4', '#fce2a2'] },
      { frac: 0.85, name: 'the convective zone', colors: ['#ffd685', '#f8cd78'] },
      { frac: 1.0, name: 'the photosphere', colors: ['#ffc45e', '#f2b455', '#e8a94f'] },
    ],
  });
  const corona = [];
  for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const len = ux && uy ? 3 : 5;
    for (let k = 1; k <= len; k++) {
      corona.push({ dx: ux * (40 + 1 + k), dy: uy * (40 + 1 + k), color: '#e8a94f', alpha: 0.55 - k * 0.09, twinkle: true });
    }
  }
  sun.layers.push({ name: 'the corona', blocks: corona });
  S.push(sun);

  // Earth — extra detail: six real geological layers, then surface + air.
  S.push(makeBody(rng, {
    name: 'Earth', cx: planetX(200), cy: SUN.y, R: 16,
    fact: 'The only known world with life. Earth\'s inner core is a solid iron ball nearly as hot as the Sun\'s surface; its spin in the molten outer core generates the magnetic field that shields us.',
    shells: [
      { frac: 0.19, name: "Earth's inner core", colors: ['#f2ead0', '#ece2c2'] },
      { frac: 0.35, name: "Earth's outer core", colors: ['#e8b04e', '#dfa444', '#e2aa49'] },
      { frac: 0.55, name: 'the lower mantle', colors: ['#c96a3f', '#bd6039'] },
      { frac: 0.74, name: 'the upper mantle', colors: ['#a45238', '#984b33'] },
      { frac: 0.9, name: 'the asthenosphere', colors: ['#8a4a36', '#7f4431'] },
      { frac: 1.0, name: 'the crust', colors: ['#6b4a36', '#5f4230'] },
    ],
    surfaceName: 'oceans and continents',
    surface: (dx, dy, d, R, r) => {
      if (Math.abs(dy) > R * 0.86) return r() < 0.75 ? '#dfe8ee' : '#c8d8e2';
      const n = Math.sin(dx * 0.5 + 1.7) + Math.sin(dy * 0.62 + dx * 0.28)
        + 0.6 * Math.sin(dx * 0.23 - dy * 0.4 + 2.2) + (r() - 0.5) * 0.9;
      if (n > 1.1) return r() < 0.2 ? '#6f9458' : '#4f7d4a';          // land
      if (n > 0.8) return '#c9b98a';                                  // coasts/desert
      return r() < 0.88 ? '#2e5f9e' : '#3a6cab';                      // ocean
    },
    atmosphere: '#9fc8e8',
  }));

  S.push(makeBody(rng, {
    name: 'the Moon', cx: planetX(200) + 24, cy: SUN.y - 14, R: 4,
    fact: 'The Moon drifts 3.8 cm farther from Earth every year, and its gravity is what gives our oceans tides. Twelve people have walked on it.',
    shells: [{ frac: 1.0, name: null, colors: ['#c9c9c4', '#b2b2ac'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (r() < 0.22 ? '#8f8f8a' : null),
  }));

  S.push(makeBody(rng, {
    name: 'Mercury', cx: planetX(85), cy: SUN.y, R: 7,
    fact: 'The smallest planet, with an iron core filling about 85% of its radius. A Mercury day (sunrise to sunrise) lasts 176 Earth days — longer than its year.',
    shells: [
      { frac: 0.75, name: "Mercury's huge iron core", colors: ['#c8b08a', '#bfa67e'] },
      { frac: 1.0, name: "Mercury's mantle and crust", colors: ['#8a7d70', '#7d7166'] },
    ],
    surfaceName: 'a cratered surface',
    surface: (dx, dy, d, R, r) => (r() < 0.3 ? '#6f6862' : '#9a938c'),
  }));

  S.push(makeBody(rng, {
    name: 'Venus', cx: planetX(140), cy: SUN.y, R: 15,
    fact: 'The hottest planet — about 465°C under a crushing CO₂ atmosphere, hot enough to melt lead. It spins backwards, so the Sun rises in the west.',
    shells: [
      { frac: 0.5, name: "Venus's core", colors: ['#d8b878', '#cead6c'] },
      { frac: 0.85, name: "Venus's mantle", colors: ['#b0714a', '#a56843'] },
      { frac: 1.0, name: "Venus's crust", colors: ['#8a5f45', '#7d553e'] },
    ],
    surfaceName: 'thick sulfuric clouds',
    surface: (dx, dy, d, R, r) => {
      const band = Math.sin(dy * 0.55 + dx * 0.18);
      return band > 0 ? (r() < 0.9 ? '#e6d9a8' : '#ded093') : '#d9c48a';
    },
  }));

  S.push(makeBody(rng, {
    name: 'Mars', cx: planetX(265), cy: SUN.y, R: 9,
    fact: 'Home to Olympus Mons, a volcano nearly three times the height of Everest, and Valles Marineris, a canyon as long as the USA. Its red colour is literally rust.',
    shells: [
      { frac: 0.45, name: "Mars's core", colors: ['#c89058', '#bd8750'] },
      { frac: 0.8, name: "Mars's mantle", colors: ['#a05a3a', '#955335'] },
      { frac: 1.0, name: "Mars's crust", colors: ['#8a4a30', '#7d442c'] },
    ],
    surfaceName: 'the red surface',
    surface: (dx, dy, d, R, r) => {
      if (Math.abs(dy) > R * 0.82) return '#e8e2da';
      return r() < 0.75 ? '#c1704f' : '#a85a3f';
    },
  }));

  // Halley's Comet — a small nucleus with a tail pointing away from the Sun.
  S.push(makeSprite("Halley's Comet", planetX(330), SUN.y - 150, [
    '......bb',
    '...abbWc',
    'aabbcc..',
    '...ab...',
  ], {
    W: ['#eaf2fc', 1, true], a: ['#3a5178', 0.35], b: ['#5d7ba8', 0.55], c: ['#8fa8cc', 0.8],
  }, 'The most famous comet, visible from Earth every 75–79 years (next: 2061). Its tail always points away from the Sun, pushed by the solar wind.', { zoom: 7 }));

  S.push(makeRingScatter(rng, {
    name: 'the asteroid belt', dist: 330, spread: 14, count: 700,
    colors: ['#8a8578', '#6f6b60', '#a09a8c'], alphaLo: 0.35,
    fact: 'Millions of rocky leftovers from the Solar System\'s formation orbit between Mars and Jupiter — yet all of them together weigh less than our Moon.',
  }));

  S.push(makeBody(rng, {
    name: 'Jupiter', cx: planetX(440), cy: SUN.y, R: 32,
    fact: 'Larger than all other planets combined. The Great Red Spot is a storm wider than Earth that has raged for at least 300 years. Jupiter\'s gravity shields the inner planets from comets.',
    shells: [
      { frac: 0.2, name: "Jupiter's rocky core", colors: ['#d8c8a8', '#cfbf9c'] },
      { frac: 0.55, name: 'metallic hydrogen', colors: ['#b89a78', '#ae9070'] },
      { frac: 0.85, name: 'liquid hydrogen', colors: ['#caa98a', '#c09f80'] },
      { frac: 1.0, name: 'the outer envelope', colors: ['#d4b494', '#cbab8b'] },
    ],
    sweep: 'bands',
    surfaceName: 'banded clouds',
    surface: (dx, dy, d, R, r) => {
      if (Math.hypot((dx - 11) / 6.5, (dy - 12) / 3.6) < 1) return r() < 0.85 ? '#c05a3a' : '#b25234';
      const bands = ['#e8dcc8', '#c9a685', '#dcc9ae', '#b98d6f', '#e2d4bc', '#a8765a'];
      return bands[(Math.floor(dy / 5) % bands.length + bands.length) % bands.length];
    },
  }));

  const saturn = makeBody(rng, {
    name: 'Saturn', cx: planetX(560), cy: SUN.y, R: 26,
    fact: 'So light it would float in water. Its rings are billions of chunks of nearly pure ice, up to house-sized, yet on average only about 10 metres thick.',
    shells: [
      { frac: 0.25, name: "Saturn's core", colors: ['#d0c0a0', '#c7b795'] },
      { frac: 0.6, name: 'metallic hydrogen', colors: ['#c0ab8c', '#b7a284'] },
      { frac: 1.0, name: 'the outer envelope', colors: ['#d9c8a5', '#d0bf9c'] },
    ],
    sweep: 'bands',
    surfaceName: 'pale gold bands',
    surface: (dx, dy, d, R, r) => {
      const bands = ['#e8d9b8', '#d9c8a0', '#e2d2ae', '#c8b088'];
      return bands[(Math.floor(dy / 5.5) % bands.length + bands.length) % bands.length];
    },
  });
  const RR = 26;
  const ringBlocks = [];
  for (let dx = -(RR + 22); dx <= RR + 22; dx++) {
    for (let dy = -5; dy <= 5; dy++) {
      const e = Math.hypot(dx / (RR + 22), dy / 4.2);
      const inner = Math.hypot(dx / (RR + 7), dy / 1.8);
      if (e > 1 || inner < 1) continue;
      if (Math.hypot(dx, dy) <= RR + 0.3) continue;
      const cassini = Math.abs(Math.hypot(dx / (RR + 16), dy / 3.1) - 1) < 0.04;
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
    name: 'Uranus', cx: planetX(680), cy: SUN.y, R: 17,
    fact: 'Uranus rolls around the Sun on its side — its axis is tilted 98°, probably from an ancient collision — so each pole gets 42 years of sunlight, then 42 years of night.',
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
    name: 'Neptune', cx: planetX(790), cy: SUN.y, R: 17,
    fact: 'The windiest world: supersonic storms reach 2,100 km/h. Neptune was found by mathematics before telescopes — its gravity was tugging Uranus off course.',
    shells: [
      { frac: 0.3, name: "Neptune's rocky core", colors: ['#c0b4a0', '#b7ab96'] },
      { frac: 0.8, name: 'an icy mantle', colors: ['#4a6fb8', '#4468ae'] },
      { frac: 1.0, name: 'the outer atmosphere', colors: ['#3f66c4', '#3a5fba'] },
    ],
    sweep: 'bands',
    surfaceName: 'deep blue storms',
    surface: (dx, dy, d, R, r) => {
      if (dy === -5 && dx > -8 && dx < 3) return '#dfe8f4';
      return r() < 0.8 ? '#3f6ad8' : '#2f55b8';
    },
  }));

  S.push(makeBody(rng, {
    name: 'Pluto', cx: planetX(880), cy: SUN.y - 55, R: 3,
    fact: 'A dwarf planet smaller than our Moon, with a heart-shaped nitrogen glacier (Tombaugh Regio). Reclassified from planet to dwarf planet in 2006.',
    shells: [{ frac: 1.0, name: null, colors: ['#c8b8a8', '#baa896'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (dx <= 0 && dy >= 0 && r() < 0.6 ? '#e2d8ca' : null),
  }));

  S.push(makeRingScatter(rng, {
    name: 'the Kuiper belt', dist: 880, spread: 30, count: 800,
    colors: ['#6f7a8a', '#5a6474', '#8a93a2'], alphaLo: 0.25,
    fact: 'A vast ring of icy bodies beyond Neptune — home of Pluto and the source of short-period comets. It holds hundreds of thousands of objects over 100 km wide.',
  }));

  // Voyager 1 — a tiny probe on its way out.
  S.push(makeSprite('Voyager 1', planetX(1000), SUN.y + 90, [
    '.W.',
    'aWa',
    '.a.',
    '.b.',
  ], {
    W: ['#eaf2fc', 1, true], a: ['#8fa8cc', 0.8], b: ['#5d7ba8', 0.5],
  }, 'Launched in 1977, Voyager 1 is the farthest human-made object — over 24 billion km away, in interstellar space. It carries a golden record of Earth\'s sounds and music.', { zoom: 8 }));

  S.push(makeRingScatter(rng, {
    name: 'the Oort Cloud', dist: 900, spread: 45, count: 550,
    colors: ['#4a5a78', '#3a4a66', '#5d7092'], alphaLo: 0.15,
    fact: 'A hypothesised shell of trillions of icy objects surrounding the whole Solar System, halfway to the next star. Long-period comets fall inward from here.',
  }));

  const stars = [
    ['Proxima Centauri', 1500, 1420, 1, '#e8a8a0', '#a86a64'],
    ['Alpha Centauri', 1560, 1380, 2, '#f2ead2', '#b0a880'],
    ["Barnard's Star", 1380, 520, 1, '#e0968a', '#9a6258'],
    ['Sirius', 1700, 1150, 3, '#eaf2ff', '#8fa8d8'],
    ['Epsilon Eridani', 1250, 1600, 1, '#f0c890', '#b08c58'],
    ['Tau Ceti', 1820, 680, 1, '#f2dca8', '#b09c6a'],
    ['Vega', 1980, 1280, 2, '#dce8ff', '#8098c8'],
    ['Altair', 2050, 840, 2, '#e8eefc', '#94a4c8'],
    ['Polaris', 1150, 250, 2, '#f2f0e2', '#a8a488'],
    ['Betelgeuse', 2200, 520, 3, '#e88a5a', '#a85a38'],
    ['Rigel', 2250, 1500, 3, '#cfe0ff', '#7890c0'],
  ];
  for (const [name, x, y, size, c, dim] of stars) {
    S.push(makeStar(rng, name, x, y, size, c, dim));
  }
  // Group fact for the whole neighbourhood (attached to the first star).
  S[S.length - stars.length].fact =
    'Proxima Centauri is our nearest star after the Sun — 4.24 light-years away. Even at Voyager 1\'s speed, reaching it would take over 70,000 years.';

  // The Milky Way's galactic field — lazy, huge.
  const fieldRng = mulberry32(0x9A1AC7);
  const fieldBlocks = [];
  const A = { x: 150, y: 1800 }, B = { x: 2300, y: 150 };
  S.push({
    name: 'the galactic field', kind: 'field', cx: 1400, cy: 950, R: 600, zoom: 0.35,
    fact: 'The Milky Way holds 100–400 billion stars in a disc 100,000 light-years across. Every star you can see with the naked eye lives inside it. We orbit its centre once every 230 million years.',
    count: FIELD_CAP,
    layers: [{ name: 'the Milky Way', blocks: fieldBlocks }],
    ensure(n) {
      while (fieldBlocks.length <= n && fieldBlocks.length < FIELD_CAP) {
        const t = fieldRng();
        const nearCore = t > 0.86;
        const spread = nearCore ? 60 : 150;
        const px = A.x + (B.x - A.x) * t, py = A.y + (B.y - A.y) * t;
        const off = (fieldRng() + fieldRng() + fieldRng() - 1.5) * spread;
        const len = Math.hypot(B.x - A.x, B.y - A.y);
        const nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
        const bright = fieldRng();
        fieldBlocks.push({
          cx: Math.round(px + nx * off), cy: Math.round(py + ny * off),
          color: bright > 0.93 ? '#dfe8fa' : bright > 0.7 ? '#8fa8cc' : bright > 0.4 ? '#5d7ba8' : '#3a5178',
          alpha: nearCore ? 0.5 + fieldRng() * 0.5 : 0.25 + fieldRng() * 0.5,
          twinkle: bright > 0.97,
        });
      }
      return fieldBlocks[Math.min(n, fieldBlocks.length - 1)];
    },
  });

  // Beyond: Andromeda.
  S.push(makeSpiralGalaxy(rng, {
    name: 'the Andromeda Galaxy', cx: 350, cy: 280, R: 48,
    coreColors: ['#f2ecdc', '#e8dfc8'],
    armColors: ['#9fb0d8', '#7a8cc0', '#5d6f9e', '#48587e'],
    fact: 'Our nearest major galaxy, 2.5 million light-years away, with about a trillion stars. It is approaching us at 110 km/s and will merge with the Milky Way in ~4.5 billion years.',
  }));

  // Cumulative indices.
  let acc = 0;
  for (const s of S) {
    s.start = acc;
    if (s.kind === 'field') {
      s.layers[0].start = acc;
      acc += s.count;
    } else {
      for (const l of s.layers) { l.start = acc; acc += l.blocks.length; }
      s.count = acc - s.start;
    }
  }
  return { structures: S, total: acc };
}

// ---------------------------------------------------------------------------
// Atlas (locations panel) definition — display order, not build order
// ---------------------------------------------------------------------------

const ATLAS = [
  {
    title: 'The Milky Way', names: [
      'the Sun', 'Mercury', 'Venus', 'Earth', 'the Moon', 'Mars',
      "Halley's Comet", 'the asteroid belt', 'Jupiter', 'Saturn', 'Uranus',
      'Neptune', 'Pluto', 'the Kuiper belt', 'Voyager 1', 'the Oort Cloud',
      'Proxima Centauri', 'Sirius', 'Polaris', 'Betelgeuse', 'the galactic field',
    ],
  },
  {
    title: 'Beyond the Milky Way', names: ['the Andromeda Galaxy'],
  },
];

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const grid = document.createElement('canvas');
grid.width = WB; grid.height = HB;
const gctx = grid.getContext('2d');

const UNI = buildSequence();
const byName = new Map(UNI.structures.map((s) => [s.name, s]));

const state = {
  sessions: new Map(),
  placed: 0,
  sparks: [],
  twinklers: [],
  flashes: [],
  ambient: [],          // shooting stars, meteors, debris (screen-space)
  nextAmbientAt: 0,
  budget: 0,            // paced block-placement allowance
  lastEventAt: 0,       // when Claude last did anything (for the status light)
  loaded: false,
  collapsed: new Set(),
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

// Faint background specks so the void is never pure black.
const SPECKS = (() => {
  const r = mulberry32(0x5BECC5);
  const out = [];
  for (let i = 0; i < 520; i++) {
    out.push({
      x: r() * WB, y: r() * HB,
      a: 0.04 + r() * 0.12,
      c: r() < 0.7 ? '#c8cdd8' : '#ffffff',
      tw: r() < 0.06 ? 0.3 + r() * 0.8 : 0,
      ph: r() * 6.28,
    });
  }
  return out;
})();

// Which bodies orbit once complete (dist/angle derived from placement).
const ORBIT = new Map();
for (const name of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) {
  const st = byName.get(name);
  const dx = st.cx - SUN.x, dy = st.cy - SUN.y;
  const dist = Math.hypot(dx, dy);
  ORBIT.set(name, { dist, ang0: Math.atan2(dy, dx), speed: 0.005 * Math.sqrt(200 / dist) });
}
{
  const moon = byName.get('the Moon');
  const earth = byName.get('Earth');
  const dx = moon.cx - earth.cx, dy = moon.cy - earth.cy;
  ORBIT.set('the Moon', { parent: 'Earth', dist: Math.hypot(dx, dy), ang0: Math.atan2(dy, dx), speed: 0.05 });
}

// Anchored to wall-clock time so planets keep drifting between visits.
function orbitClock() { return Date.now() / 1000; }

function posOf(st) {
  const o = ORBIT.get(st.name);
  if (!o || !st.sprited) return { x: st.cx, y: st.cy };
  const a = o.ang0 - orbitClock() * o.speed;
  if (o.parent) {
    const p = posOf(byName.get(o.parent));
    return { x: p.x + Math.cos(a) * o.dist, y: p.y + Math.sin(a) * o.dist };
  }
  return { x: SUN.x + Math.cos(a) * o.dist, y: SUN.y + Math.sin(a) * o.dist };
}

const HOME = { x: 750, y: 950, z: 0.5 };
const cam = { ...HOME };
const camTarget = { ...HOME };

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
  return Math.min(UNI.total, Math.floor(totalEnergy() / ENERGY_PER_BLOCK));
}

function structDone(s) { return targetBlocks() >= s.start + (s.count || 0); }

function blockAt(index) {
  const S = UNI.structures;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i];
    if (index < s.start) continue;
    if (s.kind === 'field') {
      const b = s.ensure(index - s.start);
      return { s, layer: s.layers[0], b, cx: b.cx, cy: b.cy };
    }
    for (let j = s.layers.length - 1; j >= 0; j--) {
      const l = s.layers[j];
      if (index >= l.start) {
        const b = l.blocks[index - l.start];
        return { s, layer: l, b, cx: s.cx + b.dx, cy: s.cy + b.dy };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Grid drawing + building animation
// ---------------------------------------------------------------------------

function stamp(info) {
  gctx.globalAlpha = info.b.alpha != null ? info.b.alpha : 1;
  gctx.fillStyle = info.b.color;
  gctx.fillRect(info.cx, info.cy, 1, 1);
  gctx.globalAlpha = 1;
  if (info.b.twinkle && state.twinklers.length < 180) {
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
  if (!announce) return;
  const { s, layer } = info;
  const layerEnd = layer.start + (layer.blocks.length || s.count) - 1;
  const structEnd = s.start + s.count - 1;
  if (index === structEnd && s.kind === 'body') toast(`✨ ${cap(s.name)} has formed`);
  else if (index === layerEnd && layer.name) toast(`${cap(layer.name)} is complete`);
}

function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

// --- Sprites: a finished orbiter lifts off the static grid and starts moving

function restampRegion(x0, y0, x1, y1) {
  const target = targetBlocks();
  for (let i = 0; i < Math.min(state.placed, target); i++) {
    const info = blockAt(i);
    if (info.s.sprited) continue;
    if (info.cx >= x0 && info.cx <= x1 && info.cy >= y0 && info.cy <= y1) {
      gctx.globalAlpha = info.b.alpha != null ? info.b.alpha : 1;
      gctx.fillStyle = info.b.color;
      gctx.fillRect(info.cx, info.cy, 1, 1);
    }
  }
  gctx.globalAlpha = 1;
}

function spritifyDone() {
  const target = targetBlocks();
  for (const st of UNI.structures) {
    if (!ORBIT.has(st.name) || st.sprited || target < st.start + st.count) continue;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const l of st.layers) {
      for (const b of l.blocks) {
        if (b.dx < minx) minx = b.dx;
        if (b.dx > maxx) maxx = b.dx;
        if (b.dy < miny) miny = b.dy;
        if (b.dy > maxy) maxy = b.dy;
      }
    }
    const w = maxx - minx + 1, h = maxy - miny + 1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (const l of st.layers) {
      for (const b of l.blocks) {
        g.globalAlpha = b.alpha != null ? b.alpha : 1;
        g.fillStyle = b.color;
        g.fillRect(b.dx - minx, b.dy - miny, 1, 1);
      }
    }
    st.sprite = { canvas: c, ox: minx, oy: miny, w, h };
    st.sprited = true;
    const x0 = st.cx + minx, y0 = st.cy + miny, x1 = st.cx + maxx, y1 = st.cy + maxy;
    gctx.clearRect(x0, y0, w, h);
    state.twinklers = state.twinklers.filter((tw) => tw.cx < x0 || tw.cx > x1 || tw.cy < y0 || tw.cy > y1);
    restampRegion(x0, y0, x1, y1); // put back neighbours caught in the clear
  }
}

function advanceBuilding(dt) {
  const target = targetBlocks();
  let backlog = target - state.placed;
  if (backlog <= 0) { state.sparks = []; return; }

  // Only a huge backlog (reopening after days away) jumps ahead; otherwise
  // every block streams in visibly at a calm pace.
  if (backlog > 2000) {
    const instant = backlog - 300;
    for (let i = 0; i < instant; i++) placeBlock(state.placed++, false);
    spritifyDone();
    backlog = target - state.placed;
  }
  if (state.reduceMotion) {
    while (state.placed < target) placeBlock(state.placed++, true);
    spritifyDone();
    renderLocations();
    return;
  }

  // Steady build rate in blocks/second; rises only when far behind.
  const rate = backlog > 400 ? Math.min(10, backlog / 60) : backlog > 60 ? 2.2 : 1.1;
  state.budget = Math.min(6, state.budget + (rate * dt) / 1000);

  const wanted = backlog > 40 ? 2 : 1;
  while (state.budget >= 1 && state.sparks.length < wanted && state.placed + state.sparks.length < target) {
    state.budget -= 1;
    const index = state.placed + state.sparks.length;
    const info = blockAt(index);
    const viewW = window.innerWidth / (BASE * cam.z);
    state.sparks.push({
      index,
      x: cam.x + (Math.random() - 0.5) * viewW,
      y: cam.y - (window.innerHeight / (BASE * cam.z)) * 0.6,
      tx: info.cx + 0.5, ty: info.cy + 0.5,
      trail: [],
    });
  }

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
        spritifyDone();
        renderLocations();
      }
    } else {
      // Unhurried travel — watching the build should feel meditative.
      const step = Math.max(0.8, dist * 0.028) * (dt / 16.7);
      sp.x += (ddx / dist) * step;
      sp.y += (ddy / dist) * step;
    }
  }
}

// --- Ambient sky: shooting stars, meteors, drifting debris ---------------

function spawnAmbient(now) {
  const roll = Math.random();
  if (roll < 0.35) {
    // Shooting star: a fast bright streak.
    const fromTop = Math.random() < 0.7;
    state.ambient.push({
      kind: 'shooting',
      x: Math.random() * W, y: fromTop ? -10 : Math.random() * H * 0.4,
      vx: (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 5),
      vy: 4 + Math.random() * 4,
      life: 1, decay: 1 / (0.5 + Math.random() * 0.4),
    });
  } else if (roll < 0.7) {
    // Meteor: slower, small, with a short trail.
    const fromLeft = Math.random() < 0.5;
    state.ambient.push({
      kind: 'meteor',
      x: fromLeft ? -10 : W + 10, y: Math.random() * H * 0.8,
      vx: (fromLeft ? 1 : -1) * (0.8 + Math.random() * 1.2),
      vy: 0.3 + Math.random() * 0.6,
      life: 1, decay: 1 / (4 + Math.random() * 3),
      trail: [],
    });
  } else {
    // Debris: a tiny tumbling cluster drifting by.
    state.ambient.push({
      kind: 'debris',
      x: Math.random() * W, y: -6,
      vx: (Math.random() - 0.5) * 0.5,
      vy: 0.25 + Math.random() * 0.35,
      spin: Math.random() * 6.28,
      life: 1, decay: 1 / (9 + Math.random() * 5),
    });
  }
  state.nextAmbientAt = now + 4000 + Math.random() * 9000;
}

function drawAmbient(now, dt) {
  if (!state.reduceMotion && now >= state.nextAmbientAt) spawnAmbient(now);
  for (let i = state.ambient.length - 1; i >= 0; i--) {
    const a = state.ambient[i];
    a.life -= (dt / 1000) * a.decay;
    a.x += a.vx * (dt / 16.7);
    a.y += a.vy * (dt / 16.7);
    if (a.life <= 0 || a.x < -40 || a.x > W + 40 || a.y > H + 40) {
      state.ambient.splice(i, 1);
      continue;
    }
    const fade = Math.min(1, a.life * 2.5);
    if (a.kind === 'shooting') {
      const grad = ctx.createLinearGradient(a.x, a.y, a.x - a.vx * 6, a.y - a.vy * 6);
      grad.addColorStop(0, `rgba(232, 240, 252, ${0.55 * fade})`);
      grad.addColorStop(1, 'rgba(232, 240, 252, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - a.vx * 6, a.y - a.vy * 6);
      ctx.stroke();
    } else if (a.kind === 'meteor') {
      a.trail.unshift({ x: a.x, y: a.y });
      if (a.trail.length > 9) a.trail.pop();
      for (let k = 0; k < a.trail.length; k++) {
        ctx.globalAlpha = 0.32 * fade * (1 - k / a.trail.length);
        ctx.fillStyle = '#c8d4e8';
        ctx.fillRect(a.trail[k].x, a.trail[k].y, 2, 2);
      }
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(a.x - 1, a.y - 1, 2.5, 2.5);
    } else {
      a.spin += dt / 900;
      ctx.globalAlpha = 0.22 * fade;
      ctx.fillStyle = '#9aa4b5';
      for (let k = 0; k < 3; k++) {
        const ang = a.spin + (k * 6.28) / 3;
        ctx.fillRect(a.x + Math.cos(ang) * 2.4, a.y + Math.sin(ang) * 2.4, 1.6, 1.6);
      }
    }
    ctx.globalAlpha = 1;
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
  camTarget.z = Math.min(14, Math.max(0.18, camTarget.z));
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
  cam.x = camTarget.x; cam.y = camTarget.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  clampCam();
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0013));
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
        state.placed = Math.max(0, targetBlocks() - 80);
        for (let i = 0; i < state.placed; i++) stamp(blockAt(i));
        spritifyDone();
        renderLocations();
        for (const s of state.sessions.values()) {
          state.lastEventAt = Math.max(state.lastEventAt, s.updatedAt || 0);
        }
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
      state.lastEventAt = Date.now();
    }
  };
}

// ---------------------------------------------------------------------------
// Atlas panel: dropdown groups, greyed-out locked locations, fact cards
// ---------------------------------------------------------------------------

let lastAtlasKey = '';

function locationState(s) {
  const target = targetBlocks();
  if (target >= s.start + s.count) return 'done';
  if (target > s.start) return 'building';
  return 'locked';
}

function renderLocations() {
  const target = targetBlocks();
  const key = UNI.structures.map((s) => locationState(s)[0]).join('') + [...state.collapsed].join(',');
  if (key === lastAtlasKey) return;
  lastAtlasKey = key;

  const list = $('locationList');
  list.innerHTML = '';
  for (const group of ATLAS) {
    const head = document.createElement('li');
    head.className = 'group';
    const open = !state.collapsed.has(group.title);
    head.textContent = `${open ? '▾' : '▸'} ${group.title}`;
    head.onclick = () => {
      if (open) state.collapsed.add(group.title); else state.collapsed.delete(group.title);
      lastAtlasKey = '';
      renderLocations();
    };
    list.appendChild(head);
    if (!open) continue;

    for (const name of group.names) {
      const s = byName.get(name);
      if (!s) continue;
      const st = locationState(s);
      const li = document.createElement('li');
      li.className = 'loc ' + st;
      li.textContent = cap(s.name);
      li.onclick = () => {
        showFact(s, st);
        if (st !== 'locked') {
          const z = s.kind === 'ring' ? 0.5 : (s.zoom || Math.min(9, Math.max(2.5, (H * 0.35) / (s.R * 2 * BASE))));
          const pos = posOf(s);
          flyTo(pos.x, pos.y, z);
        }
      };
      list.appendChild(li);
    }
  }
}

function showFact(s, st) {
  $('factTitle').textContent = cap(s.name);
  let text = s.fact || '';
  if (st === 'locked') {
    const needed = (s.start + 1) * ENERGY_PER_BLOCK - totalEnergy();
    text += ` — Not yet formed: ${fmt(Math.max(1, needed))} more energy until construction begins.`;
  }
  $('factText').textContent = text;
  $('factCard').classList.add('show');
}

$('factClose').onclick = () => $('factCard').classList.remove('show');

// ---------------------------------------------------------------------------
// Ornaments: animated embellishments for completed bodies
// ---------------------------------------------------------------------------

function drawOrnaments(t, s) {
  const earth = byName.get('Earth');
  if (earth && structDone(earth)) {
    const e = posOf(earth);
    // Two satellites + the ISS in inclined orbits.
    const sats = [
      { rx: earth.R + 5, ry: (earth.R + 5) * 0.45, sp: 0.55, ph: 0, c: '#dfe8f4', sz: 1 },
      { rx: earth.R + 9, ry: (earth.R + 9) * 0.38, sp: -0.34, ph: 2.1, c: '#c8d8ee', sz: 1 },
      { rx: earth.R + 3.4, ry: (earth.R + 3.4) * 0.5, sp: 0.85, ph: 4.2, c: '#f2e8c8', sz: 1.6 }, // ISS
    ];
    for (const sat of sats) {
      const wx = e.x + Math.cos(t * sat.sp + sat.ph) * sat.rx;
      const wy = e.y + Math.sin(t * sat.sp + sat.ph) * sat.ry;
      const p = w2s(wx, wy);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const px = Math.max(2, s * sat.sz);
      ctx.fillStyle = sat.c;
      ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
      if (s > 4) { // solar panels visible up close
        ctx.fillStyle = '#5d7ba8';
        ctx.fillRect(p.x - px * 1.4, p.y - px * 0.25, px * 0.8, px * 0.5);
        ctx.fillRect(p.x + px * 0.6, p.y - px * 0.25, px * 0.8, px * 0.5);
      }
    }
    // A rocket launch every ~28 seconds.
    const cycle = (t % 28);
    if (cycle < 5) {
      const prog = cycle / 5;
      const ang = -Math.PI / 3;
      const dist = earth.R + prog * prog * 60;
      const wx = e.x + Math.cos(ang) * dist;
      const wy = e.y + Math.sin(ang) * dist;
      const p = w2s(wx, wy);
      const px = Math.max(2, s);
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(p.x - px / 2, p.y - px, px, px * 2);
      ctx.fillStyle = Math.sin(t * 30) > 0 ? '#ffb85c' : '#ff8f4d'; // flame flicker
      ctx.fillRect(p.x - px / 2, p.y + px, px, px * (0.8 + 0.5 * Math.random()));
    }
  }

  const moon = byName.get('the Moon');
  if (moon && structDone(moon) && s > 5) {
    const m = posOf(moon);
    const p = w2s(m.x + 1, m.y - moon.R - 1);
    ctx.fillStyle = '#c8c8c2';
    ctx.fillRect(p.x, p.y - s * 2, Math.max(1, s * 0.4), s * 2);       // pole
    ctx.fillStyle = '#c05a5a';
    ctx.fillRect(p.x + s * 0.4, p.y - s * 2, s * 1.4, s * 0.9);        // flag
  }

  const mars = byName.get('Mars');
  if (mars && structDone(mars) && s > 5) {
    const m = posOf(mars);
    const p = w2s(m.x + 3, m.y + mars.R - 1);
    ctx.fillStyle = '#dfe8f4';
    ctx.fillRect(p.x, p.y, s * 1.2, s * 0.7);                          // rover body
    ctx.fillStyle = '#5a6474';
    ctx.fillRect(p.x - s * 0.2, p.y + s * 0.7, s * 1.6, s * 0.35);     // wheels
    ctx.fillRect(p.x + s * 0.4, p.y - s * 0.6, s * 0.2, s * 0.6);      // mast
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

  cam.x += (camTarget.x - cam.x) * 0.12;
  cam.y += (camTarget.y - cam.y) * 0.12;
  cam.z += (camTarget.z - cam.z) * 0.14;

  advanceBuilding(dt);

  const s = BASE * cam.z;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#04070f');
  bg.addColorStop(0.6, '#060b18');
  bg.addColorStop(1, '#0a1224');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faint background specks so the void is never pure black.
  for (const spk of SPECKS) {
    const p = w2s(spk.x, spk.y);
    if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) continue;
    let a = spk.a;
    if (spk.tw) a *= 0.5 + 0.5 * Math.sin(t * spk.tw + spk.ph);
    ctx.globalAlpha = a;
    ctx.fillStyle = spk.c;
    ctx.fillRect(p.x, p.y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // Orbit paths.
  const target = targetBlocks();
  const sunS = w2s(SUN.x, SUN.y);
  ctx.strokeStyle = 'rgba(110, 150, 220, 0.09)';
  ctx.lineWidth = 1;
  for (const st of UNI.structures) {
    if (st.kind !== 'body' || st.name === 'the Sun' || st.name === 'the Moon' ||
        st.name === 'the Andromeda Galaxy' || target <= st.start) continue;
    const r = Math.hypot(st.cx - SUN.x, st.cy - SUN.y) * s;
    if (r < 8 || r > Math.hypot(W, H) * 2) continue;
    ctx.beginPath();
    ctx.arc(sunS.x, sunS.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.imageSmoothingEnabled = false;
  const vw = W / s, vh = H / s;
  ctx.drawImage(grid, cam.x - vw / 2, cam.y - vh / 2, vw, vh, 0, 0, W, H);

  // Finished bodies ride above the grid, drifting along their orbits.
  for (const st of UNI.structures) {
    if (!st.sprited) continue;
    const pos = posOf(st);
    const p = w2s(pos.x + st.sprite.ox, pos.y + st.sprite.oy);
    const wpx = st.sprite.w * s, hpx = st.sprite.h * s;
    if (p.x > W + 60 || p.y > H + 60 || p.x + wpx < -60 || p.y + hpx < -60) continue;
    ctx.drawImage(st.sprite.canvas, p.x, p.y, wpx, hpx);
  }

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

  drawOrnaments(t, s);
  drawAmbient(now, dt);

  if (cam.z >= 1.1) {
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(150, 178, 220, 0.6)';
    for (const st of UNI.structures) {
      if (target <= st.start || st.kind === 'ring' || st.kind === 'field') continue;
      if (st.kind === 'star' && cam.z < 1.6) continue;
      const pos = posOf(st);
      const p = w2s(pos.x, pos.y + st.R + 4);
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

  // Claude activity light.
  const age = state.lastEventAt ? Date.now() - state.lastEventAt : Infinity;
  const backlog = targetBlocks() - state.placed;
  const el = $('claudeStatus');
  if (age < 20_000) {
    el.className = 'working';
    $('statusText').textContent = backlog > 0
      ? `Claude is working · ${backlog.toLocaleString()} block${backlog === 1 ? '' : 's'} inbound`
      : 'Claude is working…';
  } else if (age < 4 * 60_000) {
    el.className = 'paused';
    $('statusText').textContent = backlog > 0
      ? `Claude has paused · ${backlog.toLocaleString()} blocks still landing`
      : 'Claude has paused';
  } else {
    el.className = 'idle';
    $('statusText').textContent = 'Claude is idle — all prompts finished';
  }

  const target = targetBlocks();
  if (target >= UNI.total) {
    $('milestoneLabel').textContent = 'the observable universe is complete… for now';
    $('milestoneFill').style.width = '100%';
    return;
  }
  const info = blockAt(target);
  if (info && info.layer) {
    const { s: st, layer } = info;
    const len = layer.blocks.length || st.count;
    const done = target - layer.start;
    const label = layer.name || st.name;
    const finishEnergy = (layer.start + len) * ENERGY_PER_BLOCK - totalEnergy();
    $('milestoneLabel').textContent =
      `now forming: ${label} — ${fmt(Math.max(1, finishEnergy))} energy to finish`;
    $('milestoneFill').style.width = Math.max(3, (done / len) * 100) + '%';
  }
}

// ---------------------------------------------------------------------------
// Controls + boot
// ---------------------------------------------------------------------------

$('sidebarToggle').onclick = () => $('sidebar').classList.toggle('hidden');

$('snapBtn').onclick = () => {
  const a = document.createElement('a');
  a.download = 'the-patient-universe.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('📸 Universe saved as an image');
};

resize();
connect();
requestAnimationFrame(frame);
