/**
 * Idle Cosmos — a cosmos built slowly, one token at a time.
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
 * ~22,000 cosmic energy = 1 block (Patient pace; Steady / Eager reveal more of the same deterministic universe). Drag to pan, wheel to zoom,
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

// Pace modes: how much cosmic energy buys one block. "patient" is the
// intended slow-burn experience; the others are for the less patient —
// same tokens, same universe, just more of it revealed. Switching is
// lossless (everything is deterministic) and remembered per browser.
const PACES = {
  patient: { epb: 22_000, blurb: 'the slow burn' },
  steady: { epb: 20_000, blurb: 'a little faster' }, // ×1.1
  eager: { epb: 18_300, blurb: 'a bit faster still' }, // ×1.2
};
let paceName = localStorage.getItem('pace');
if (!PACES[paceName]) paceName = 'patient';
let ENERGY_PER_BLOCK = PACES[paceName].epb;
// Which universe-cycle this is (see the reset mechanic near the bottom of
// this file) — declared early so composedTitle() can reference it safely
// regardless of where in the file it's read from.
let cycleNumber = parseInt(localStorage.getItem('cycleNumber') || '1', 10) || 1;
// Lifetime energy at the moment the current cycle began — 0 for cycle 1,
// so existing progress is completely unaffected by this feature existing.
let cycleStartEnergy = parseFloat(localStorage.getItem('cycleStartEnergy') || '0') || 0;
const BASE = 3;                    // css px per block at zoom 1
const WB = 2400, HB = 1900;        // world size in blocks
const SUN = { x: 500, y: 950 };
const FIELD_CAP = 12_000;
// Must mirror server.js's WEIGHTS — duplicated here so the info panel can
// show the formula without a round trip to the server.
// Fallback only — overwritten at boot by /api/config, which reads the real
// WEIGHTS constant in server.js directly, so this can never silently drift
// out of sync with what the server actually computes.
let FORMULA_WEIGHTS = { input: 1, output: 3, cacheCreate: 1, cacheRead: 0.08 };

// How much energy already existed in this machine's Claude Code logs the
// very first time this server ever ran — set by /api/config at boot. Stays
// null (meaning "not loaded yet, don't build anything") until then; see
// targetBlocks(). This is what makes a fresh install start at zero instead
// of instantly unlocking a universe's worth of pre-existing history.
let baselineEnergy = null;

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
      dy: Math.round(Math.sin(ang) * rad * 0.6), // same 3/4 tilt as the orbits
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

// Hand-drawn hemisphere map for Earth (33×33, '.'=ocean, g=land, d=desert,
// i=ice) — Americas on the left, Africa/Europe centre-right, polar caps.
const EARTH_MAP = [
  '.................................',
  '.............iiiiiii.............',
  '..........iiiiiiiiiiiii..........',
  '.......iiiiiii..iiiiiiii.........',
  '......ggg.iii......gggggg........',
  '.....ggggg.......ggggggggggg.....',
  '....gggggggg....gggggggggggggg...',
  '....ggggggggg....ggggggggggggg...',
  '.....gggggggg.....gggddddggggg...',
  '......gggggg......ggddddddggg....',
  '.......ggggg.......gdddddgggg....',
  '........ggg........dddddddgg.....',
  '.........gg.......gddddddggg.....',
  '..........g.......ggggggggg......',
  '..................gggggggg.......',
  '.........gg.......ggggggg........',
  '........gggg......gggggg.........',
  '.......ggggg.......ggggg.........',
  '.......gggggg......gggg..........',
  '........ggggg.......ggg..........',
  '........gggg.........g...........',
  '.........ggg.....................',
  '.........gg......................',
  '..........g.........gg...........',
  '....................gggg.........',
  '...................ggggg.........',
  '....................ggg..........',
  '.................................',
  '...........iii...................',
  '.........iiiiiiiiii..............',
  '.......iiiiiiiiiiiiiii...........',
  '........iiiiiiiiiiii.............',
  '.................................',
];

// The seed the very first cycle has always used — kept as the default so
// nobody's current universe changes appearance from this refactor.
const BASE_SEED = 0xC05305;

// Derives a distinct seed per universe-cycle (see the reset mechanic near
// the end of this file). Cycle 1 always maps back to BASE_SEED exactly.
function cycleSeedFor(n) {
  if (n <= 1) return BASE_SEED;
  return (BASE_SEED ^ Math.imul(n, 0x9e3779b1)) >>> 0;
}

function buildSequence(seed) {
  const rng = mulberry32(seed);
  const S = [];

  const sun = makeBody(rng, {
    name: 'the Sun', cx: SUN.x, cy: SUN.y, R: 40,
    fact: 'The Sun is a G-type main-sequence star that has been fusing hydrogen into helium for 4.6 billion years, and has enough fuel to keep going for about 5 billion more. It holds 99.8% of the Solar System\'s mass — everything else, all eight planets and every moon and asteroid combined, is the leftover 0.2%. Photons born by fusion in its core take up to 100,000 years to random-walk their way out to the surface, but once they escape, that same light crosses the 150 million km to Earth in just 8 minutes. Its outer atmosphere, the corona, is bizarrely hundreds of times hotter than the visible surface beneath it, a puzzle solar physicists are still working out.',
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
    fact: 'The only known world with life, and the only planet not named after a god. Earth\'s solid inner core is a ball of iron and nickel nearly as hot as the Sun\'s surface, kept solid only by immense pressure; the churn of the molten outer core around it acts like a dynamo, generating the magnetic field that deflects the solar wind and makes the atmosphere possible. About 71% of the surface is ocean, and plate tectonics constantly recycles the crust — a process no other planet in the Solar System is known to have. Earth is also the only planet whose name in English does not come from Greek or Roman mythology.',
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
      const row = EARTH_MAP[dy + 16], ch = row ? row[dx + 16] : '.';
      if (ch === 'i') return r() < 0.8 ? '#dfe8ee' : '#c8d8e2';       // polar ice
      if (ch === 'g') return r() < 0.8 ? '#4f7d4a' : '#5f8d54';       // land
      if (ch === 'd') return r() < 0.85 ? '#c9b98a' : '#bcab7c';      // desert
      return r() < 0.88 ? '#2e5f9e' : '#3a6cab';                      // ocean
    },
    atmosphere: '#9fc8e8',
  }));

  S.push(makeBody(rng, {
    name: 'the Moon', cx: planetX(200) + 24, cy: SUN.y - 14, R: 4,
    fact: 'The Moon likely formed when a Mars-sized body called Theia slammed into the young Earth about 4.5 billion years ago, flinging molten debris into orbit that coalesced into the Moon within perhaps a century. It is gradually spiralling away from us at 3.8 cm per year — roughly the rate fingernails grow — and its gravitational pull is what raises our ocean tides and has slowly locked its own rotation so the same face always points at Earth. Twelve astronauts walked on its surface during the Apollo missions between 1969 and 1972, and no human has returned since; the footprints and equipment they left behind will likely last millions of years, since there is no wind or water to erode them.',
    shells: [{ frac: 1.0, name: null, colors: ['#c9c9c4', '#b2b2ac'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (r() < 0.22 ? '#8f8f8a' : null),
  }));

  S.push(makeBody(rng, {
    name: 'Mercury', cx: planetX(85), cy: SUN.y, R: 7,
    fact: 'The smallest and innermost planet, barely larger than our Moon, with an oversized iron core that fills roughly 85% of its radius — proportionally the biggest core of any planet, possibly because an ancient impact blasted away much of its rocky mantle. Mercury is tidally locked into a strange 3:2 spin-orbit resonance, so a single Mercury day, from sunrise to sunrise, lasts 176 Earth days — longer than its 88-day year, meaning the Sun would appear to rise, briefly reverse, and set again at certain points on its surface. Despite being closest to the Sun, it is not the hottest planet (Venus is), because it has almost no atmosphere to trap heat, so nights there plunge to -173°C.',
    shells: [
      { frac: 0.75, name: "Mercury's huge iron core", colors: ['#c8b08a', '#bfa67e'] },
      { frac: 1.0, name: "Mercury's mantle and crust", colors: ['#8a7d70', '#7d7166'] },
    ],
    surfaceName: 'a cratered surface',
    surface: (dx, dy, d, R, r) => (r() < 0.3 ? '#6f6862' : '#9a938c'),
  }));

  S.push(makeBody(rng, {
    name: 'Venus', cx: planetX(140), cy: SUN.y, R: 15,
    fact: 'The hottest planet in the Solar System, at roughly 465°C on the surface — hot enough to melt lead — thanks to a runaway greenhouse effect from its crushing atmosphere of carbon dioxide, which is 90 times denser than Earth\'s. Venus rotates backwards relative to almost every other planet, and so slowly that a single day there (243 Earth days) is longer than its year (225 Earth days); because of the retrograde spin, the Sun rises in the west and sets in the east. Its surface, hidden beneath permanent sulfuric-acid clouds, was mapped by radar from NASA\'s Magellan spacecraft in the early 1990s, revealing thousands of volcanoes — more than any other planet.',
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
    fact: 'Home to Olympus Mons, the largest volcano in the Solar System at nearly three times the height of Everest and wide enough to cover the state of Arizona, and to Valles Marineris, a canyon system stretching roughly the width of the continental United States. Its rusty red colour comes literally from iron oxide dust coating the surface. Mars once had rivers, lakes, and possibly oceans billions of years ago, and current rovers (Curiosity, Perseverance) are actively hunting for signs that microbial life may have existed there; Perseverance is caching rock samples for a future mission to bring back to Earth.',
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
  }, 'The most famous comet, a ball of ice and dust roughly 15 km across that returns to the inner Solar System every 75–79 years, making it the only naked-eye comet likely to appear twice in a human lifetime. It has been observed since at least 240 BC, and its 1066 appearance was stitched into the Bayeux Tapestry, seen as an omen before the Battle of Hastings. Its tail always points away from the Sun regardless of which direction the comet is travelling, pushed outward by the solar wind and radiation pressure, not trailing behind it like smoke. Halley last passed by in 1986, when it was met by a small fleet of spacecraft, and will next be visible from Earth in 2061.', { zoom: 7 }));

  S.push(makeRingScatter(rng, {
    name: 'the asteroid belt', dist: 330, spread: 14, count: 700,
    colors: ['#8a8578', '#6f6b60', '#a09a8c'], alphaLo: 0.35,
    fact: 'Millions of rocky leftovers from the Solar System\'s formation orbit between Mars and Jupiter, debris that never managed to clump into a planet because Jupiter\'s enormous gravity kept stirring it up. Despite the vast numbers, the entire belt\'s mass adds up to less than our Moon, and roughly half of that total mass belongs to just one object — the dwarf planet Ceres. Spacecraft have flown through the belt many times without incident, since real distances between asteroids are typically millions of kilometres, nothing like the crowded fields shown in movies.',
  }));

  S.push(makeBody(rng, {
    name: 'Jupiter', cx: planetX(440), cy: SUN.y, R: 32,
    fact: 'The largest planet, with more mass than all the other planets in the Solar System combined — over twice all of them put together. The Great Red Spot is a giant anticyclonic storm wider than Earth that has been raging for at least 300 years, though it has been visibly shrinking in recent decades. Jupiter\'s enormous gravity acts as a cosmic vacuum cleaner and shield, deflecting or capturing many comets and asteroids that might otherwise threaten the inner planets — famously, fragments of comet Shoemaker-Levy 9 crashed into it in 1994. It also has the strongest magnetic field of any planet, 20,000 times stronger than Earth\'s, and at least 95 known moons, including four large ones (Io, Europa, Ganymede, Callisto) discovered by Galileo in 1610.',
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
    fact: 'The least dense planet in the Solar System — so light that it would float in water, if you could find a bathtub big enough. Its famous rings are made of billions of chunks of nearly pure water ice, ranging from dust grains to house-sized boulders, and although they stretch across hundreds of thousands of kilometres, they are on average only about 10 metres thick. The rings are thought to be relatively young in cosmic terms, perhaps only 100 to 400 million years old, possibly the shattered remains of a moon or comet torn apart by Saturn\'s gravity. Saturn also has a bizarre hexagonal jet-stream pattern swirling around its north pole, wide enough to fit four Earths inside it.',
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
    fact: 'Uranus rolls around the Sun almost completely on its side, tilted 98 degrees from vertical, most likely the result of a colossal collision with an Earth-sized object early in its history. Because of that extreme tilt, each pole gets a continuous 42-year "day" of sunlight followed by 42 years of darkness as the planet slowly orbits the Sun. It is the coldest planetary atmosphere in the Solar System despite not being the farthest from the Sun, with cloud-top temperatures near -224°C, and it has a faint system of rings, discovered in 1977, far dimmer than Saturn\'s. Uranus was the first planet discovered with a telescope, spotted by William Herschel in 1781 — every planet before it had been known since antiquity.',
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
    fact: 'The windiest world in the Solar System, with supersonic storms clocked at up to 2,100 km/h, faster than the speed of sound. Neptune has the unusual distinction of being discovered by mathematics before telescopes: 19th-century astronomers noticed Uranus\'s orbit was being tugged off course by an unseen gravitational pull, calculated where the culprit must be, and pointed a telescope there in 1846 — finding Neptune within a single degree of the predicted position. Its largest moon, Triton, orbits backwards (retrograde) compared to Neptune\'s spin, strong evidence it is a captured object from the Kuiper belt, and it is slowly spiralling inward, meaning it will likely be torn apart to form a ring system in a few billion years.',
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
    fact: 'A dwarf planet smaller than our Moon, discovered in 1930 by Clyde Tombaugh and treated as the ninth planet for 76 years before being reclassified as a "dwarf planet" in 2006, a decision that remains controversial among some astronomers. NASA\'s New Horizons spacecraft flew past Pluto in July 2015 after a nine-year journey, revealing a startlingly active world with a heart-shaped nitrogen-ice glacier called Tombaugh Regio, mountains of water ice, and possibly an underground ocean. Pluto and its largest moon Charon are so close in size and mass that they orbit a shared point in space located outside Pluto itself — technically a double dwarf-planet system.',
    shells: [{ frac: 1.0, name: null, colors: ['#c8b8a8', '#baa896'] }],
    surfaceName: null,
    surface: (dx, dy, d, R, r) => (dx <= 0 && dy >= 0 && r() < 0.6 ? '#e2d8ca' : null),
  }));

  S.push(makeRingScatter(rng, {
    name: 'the Kuiper belt', dist: 880, spread: 30, count: 800,
    colors: ['#6f7a8a', '#5a6474', '#8a93a2'], alphaLo: 0.25,
    fact: 'A vast, disc-shaped ring of icy bodies beyond Neptune\'s orbit, home to Pluto and countless other dwarf planets and frozen relics left over from the Solar System\'s formation. It is the source of most short-period comets — those that swing by the Sun in under 200 years, like Halley\'s Comet — flung inward when their orbits are disturbed. The Kuiper belt is estimated to hold hundreds of thousands of objects over 100 km wide and trillions of comets, and unlike the much smaller asteroid belt, it is roughly 20 times as wide and up to 200 times as massive.',
  }));

  // Voyager 1 — a tiny probe on its way out.
  S.push(makeSprite('Voyager 1', planetX(1000), SUN.y + 90, [
    '.W.',
    'aWa',
    '.a.',
    '.b.',
  ], {
    W: ['#eaf2fc', 1, true], a: ['#8fa8cc', 0.8], b: ['#5d7ba8', 0.5],
  }, 'Launched on 5 September 1977, Voyager 1 used a rare planetary alignment to fly past Jupiter and Saturn before being flung out of the Solar System entirely, and is now the most distant human-made object in existence, over 24 billion km away and still transmitting data on a radio signal that takes more than 22 hours to reach Earth. In 2012 it became the first spacecraft to enter interstellar space, crossing the heliopause where the Sun\'s solar wind gives way to the material between stars. It carries the Golden Record, a phonograph disc of Earth sounds, music from around the world, and greetings in 55 languages, intended for any spacefaring civilization that might one day find it — its plutonium power source is expected to keep its instruments running until around 2025.', { zoom: 8 }));

  S.push(makeRingScatter(rng, {
    name: 'the Oort Cloud', dist: 900, spread: 45, count: 550,
    colors: ['#4a5a78', '#3a4a66', '#5d7092'], alphaLo: 0.15,
    fact: 'A hypothesised spherical shell of trillions of icy objects surrounding the entire Solar System, extending perhaps halfway to the next star — so remote that objects there orbit the Sun over spans of thousands to millions of years. It is thought to be the source of long-period comets, ones that take centuries or millennia to return, which occasionally get nudged out of their distant orbits by the gravity of passing stars or the Milky Way\'s tides and fall inward toward the Sun. No spacecraft has ever reached it — even Voyager 1, the most distant human-made object, would need roughly 300 more years just to reach its inner edge.',
  }));

  const stars = [
    ['Proxima Centauri', 1500, 1420, 1, '#e8a8a0', '#a86a64',
      'Our nearest stellar neighbour after the Sun, a faint red dwarf just 4.24 light-years away — meaning even at Voyager 1\'s speed, reaching it would take over 70,000 years. Too dim to see with the naked eye, it was only discovered in 1915. It hosts at least two planets, including Proxima b, a rocky world orbiting within the star\'s habitable zone, making it one of the most tantalising targets in the search for life beyond our Solar System.'],
    ['Alpha Centauri', 1560, 1380, 2, '#f2ead2', '#b0a880',
      'A binary pair of Sun-like stars orbiting each other, forming a triple system together with the more distant Proxima Centauri. At 4.37 light-years away it is the closest star system to our own, bright enough to be one of the most prominent stars in the southern sky, though it appears as a single point of light to the naked eye — a telescope is needed to resolve the pair.'],
    ["Barnard's Star", 1380, 520, 1, '#e0968a', '#9a6258',
      'A small, ancient red dwarf about 6 light-years away, notable for having the fastest apparent motion across our sky of any star — it visibly shifts position against the background stars within a human lifetime, a phenomenon called Barnard\'s Star\'s "runaway" proper motion, discovered by astronomer E. E. Barnard in 1916.'],
    ['Sirius', 1700, 1150, 3, '#eaf2ff', '#8fa8d8',
      'The brightest star in Earth\'s night sky, 8.6 light-years away, appearing so brilliant partly because it is intrinsically luminous and partly because it is relatively close. It is actually a binary system: Sirius A, a hot white star, is orbited by Sirius B, a white dwarf — the collapsed, Earth-sized corpse of a star that has already burned through its nuclear fuel, packing roughly a Sun\'s worth of mass into a sphere the size of our planet.'],
    ['Epsilon Eridani', 1250, 1600, 1, '#f0c890', '#b08c58',
      'A young, Sun-like star just 10.5 light-years away, still surrounded by dusty debris discs where planet formation may be ongoing. Its youth (under a billion years old, compared to the Sun\'s 4.6 billion) and proximity have made it a favourite target in science fiction, most notably as the home system of Star Trek\'s Vulcans.'],
    ['Tau Ceti', 1820, 680, 1, '#f2dca8', '#b09c6a',
      'A Sun-like star just under 12 light-years away, one of the closest single stars similar in size and temperature to our own. It hosts several candidate planets, at least one within the habitable zone, and its calm, stable nature has long made it a popular hypothetical destination in science fiction and a real target for SETI radio searches.'],
    ['Vega', 1980, 1280, 2, '#dce8ff', '#8098c8',
      'One of the brightest stars in the northern sky, 25 light-years away, and the first star other than the Sun ever to be photographed, in 1850. Roughly twice the Sun\'s mass and 40 times its brightness, Vega spins so fast that it bulges outward at its equator. Around 12,000 CE, Earth\'s wobbling axis will point toward it, making Vega the "North Star" of that era.'],
    ['Altair', 2050, 840, 2, '#e8eefc', '#94a4c8',
      'A rapidly spinning white star 17 light-years away, so fast that it completes a full rotation in under 9 hours (versus the Sun\'s 27 days), flattening it into an oblate, egg-like shape roughly 25% wider at its equator than at its poles. It is one of the corners of the Summer Triangle, a prominent asterism visible from Earth.'],
    ['Polaris', 1150, 250, 2, '#f2f0e2', '#a8a488',
      'The North Star, a yellow supergiant roughly 430 light-years away that sits almost exactly above Earth\'s north pole, making it appear nearly motionless while every other star wheels around it nightly — an invaluable navigation aid for centuries. It is actually a triple star system, and it is a Cepheid variable, rhythmically brightening and dimming, a property astronomers use to measure cosmic distances.'],
    ['Betelgeuse', 2200, 520, 3, '#e88a5a', '#a85a38',
      'A red supergiant roughly 550 light-years away and so enormous that if placed at the centre of our Solar System, its surface would extend out past the orbit of Mars. It is nearing the end of its life and will one day explode as a supernova — possibly within the next 100,000 years, an eyeblink in cosmic terms — briefly becoming bright enough to be visible in Earth\'s daytime sky.'],
    ['Rigel', 2250, 1500, 3, '#cfe0ff', '#7890c0',
      'A blue supergiant roughly 860 light-years away and one of the most luminous stars visible to the naked eye, shining around 120,000 times brighter than the Sun. Despite its distance, it marks the foot of the constellation Orion and is easily seen even from light-polluted cities. Like Betelgeuse, it is massive enough that it will eventually end its life in a supernova.'],
  ];
  for (const [name, x, y, size, c, dim, fact] of stars) {
    const st = makeStar(rng, name, x, y, size, c, dim);
    st.fact = fact;
    S.push(st);
  }

  // The Milky Way's galactic field — lazy, huge.
  const fieldRng = mulberry32(seed ^ 0x9A1AC7);
  const fieldBlocks = [];
  const A = { x: 150, y: 1800 }, B = { x: 2300, y: 150 };
  S.push({
    name: 'the galactic field', kind: 'field', cx: 1400, cy: 950, R: 600, zoom: 0.35,
    fact: 'Our home galaxy is a barred spiral holding somewhere between 100 and 400 billion stars, arranged in a disc roughly 100,000 light-years across but only about 1,000 light-years thick. Every single star you can see with the naked eye on the darkest night lives inside it — the Milky Way itself is only visible as a hazy band because we are looking edge-on through our own disc from the inside. Our Sun sits in a minor spiral arm about 27,000 light-years from the centre, orbiting the galaxy\'s core once every roughly 230 million years — a span often called a "galactic year"; the last time the Sun was in its current position, dinosaurs had not yet appeared on Earth. At the very centre lurks Sagittarius A*, a supermassive black hole about 4 million times the mass of the Sun.',
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

  // --- The deep sky: real objects imaged by Hubble and friends ---

  // TRAPPIST-1: a red dwarf with seven rocky planets.
  {
    const blocks = [
      { dx: 0, dy: 0, color: '#e06a48', twinkle: true },
      { dx: 1, dy: 0, color: '#b04a34' }, { dx: 0, dy: 1, color: '#b04a34' },
      { dx: 1, dy: 1, color: '#984032' },
    ];
    const planetCols = ['#c8b8a8', '#a8c0c8', '#8fb0a0', '#c0a890', '#98a8c0', '#b0988a', '#a89878'];
    for (let i = 0; i < 7; i++) {
      blocks.push({ dx: 4 + i * 3, dy: Math.round(Math.sin(i * 1.2) * 2), color: planetCols[i] });
    }
    S.push({
      name: 'TRAPPIST-1', cx: 240, cy: 1150, R: 14, kind: 'body', zoom: 6,
      layers: [{ name: null, blocks }],
      fact: 'Just 40 light-years away, TRAPPIST-1 is a cool, dim red dwarf barely larger than Jupiter, yet it hosts a remarkable family of SEVEN Earth-sized rocky planets, all packed into an orbit tighter than Mercury\'s around our Sun — an observer standing on one planet could see the others as large disc-shaped neighbours in the sky. Three of the seven sit within the star\'s habitable zone, where temperatures could allow liquid water, making it one of the most exciting systems ever found for the search for life. It was discovered in 2016-17 using ground-based telescopes and confirmed with Hubble and Spitzer, and the James Webb Space Telescope is now studying several of its planets\' atmospheres in detail.',
    });
  }

  // The Pleiades: the Seven Sisters cluster wrapped in blue haze.
  {
    const blocks = [];
    for (let i = 0; i < 60; i++) {
      blocks.push({
        dx: Math.round((rng() + rng() - 1) * 16), dy: Math.round((rng() + rng() - 1) * 11),
        color: rng() < 0.5 ? '#2a3c66' : '#3a5178', alpha: 0.3 + rng() * 0.3,
      });
    }
    const sisters = [[0, 0], [-6, -3], [5, -4], [8, 3], [-9, 4], [3, 6], [-3, -7]];
    for (const [dx, dy] of sisters) {
      blocks.push({ dx, dy, color: '#cfe0ff', twinkle: true });
      blocks.push({ dx: dx + 1, dy, color: '#8fa8d8', alpha: 0.7 });
      blocks.push({ dx: dx - 1, dy, color: '#8fa8d8', alpha: 0.7 });
    }
    S.push({
      name: 'the Pleiades', cx: 1050, cy: 280, R: 17, kind: 'body', zoom: 4,
      layers: [{ name: null, blocks }],
      fact: 'The Seven Sisters (Messier 45), 444 light-years away, is an open cluster of over a thousand young, hot blue stars born from the same cloud of gas about 100 million years ago — infants by stellar standards, compared to our 4.6-billion-year-old Sun. The wispy blue haze visible in photographs is not leftover birth material but an unrelated dust cloud the cluster happens to be passing through, its fine particles scattering the stars\' blue light. Visible to the naked eye as a tight knot of stars, it has been recorded by nearly every ancient culture — mentioned in the Bible, Homer\'s Odyssey, and Japanese folklore (where it is called Subaru, the namesake and logo of the car company).',
    });
  }

  // The Orion Nebula: a glowing stellar nursery.
  {
    const blocks = [];
    const cols = ['#d88ab0', '#b06a9e', '#8a5d9e', '#5d7ba8', '#3a5178', '#c090a8'];
    for (let i = 0; i < 420; i++) {
      const dx = Math.round((rng() + rng() + rng() - 1.5) * 15);
      const dy = Math.round((rng() + rng() + rng() - 1.5) * 11);
      const d = Math.hypot(dx, dy);
      blocks.push({ dx, dy, color: cols[Math.min(cols.length - 1, (d / 4) | 0)], alpha: 0.35 + rng() * 0.45, d });
    }
    blocks.sort((a, b) => a.d - b.d);
    for (const [dx, dy] of [[0, 0], [2, -1], [-1, 2], [1, 1]]) { // the Trapezium
      blocks.push({ dx, dy, color: '#f2f6ff', twinkle: true });
    }
    S.push({
      name: 'the Orion Nebula', cx: 2080, cy: 1620, R: 20, kind: 'body', zoom: 3.5,
      layers: [{ name: null, blocks }],
      fact: 'A vast stellar nursery 1,344 light-years away, one of the closest sites of massive star formation to Earth, where thousands of new stars are being born right now out of collapsing clouds of hydrogen gas. At its heart, the intense ultraviolet light of four young, massive stars called the Trapezium is carving out a glowing cavity in the surrounding nebula and illuminating it from within. Visible to the naked eye as the fuzzy middle "star" in Orion\'s sword, it has been one of the most photographed objects by the Hubble Space Telescope, revealing hundreds of protoplanetary discs — infant solar systems still in the process of forming.',
    });
  }

  // The Pillars of Creation (Eagle Nebula).
  {
    const blocks = [];
    const pillarCols = ['#8a6a54', '#6f5544', '#5d7a72', '#4a6a66'];
    const pillars = [[-8, 18, 3], [0, 24, 4], [8, 14, 2.5]];
    for (let i = 0; i < 70; i++) { // surrounding teal glow
      blocks.push({
        dx: Math.round((rng() - 0.5) * 34), dy: Math.round((rng() - 0.5) * 30),
        color: '#2a4a50', alpha: 0.2 + rng() * 0.25, k: 0,
      });
    }
    for (const [px, height, width] of pillars) {
      for (let y = 0; y < height; y++) {
        const wHere = Math.max(1, width * (1 - (y / height) * 0.5));
        for (let x = -Math.floor(wHere); x <= Math.floor(wHere); x++) {
          blocks.push({
            dx: px + x + Math.round(Math.sin(y * 0.5) * 1.2),
            dy: 13 - y,
            color: dither(rng, pillarCols),
            alpha: 0.75 + rng() * 0.25,
            k: 1 + y,
          });
        }
      }
      blocks.push({ dx: px, dy: 13 - height, color: '#bfe8dc', twinkle: true, k: 99 });
    }
    blocks.sort((a, b) => a.k - b.k);
    S.push({
      name: 'the Pillars of Creation', cx: 1480, cy: 1680, R: 18, kind: 'body', zoom: 3.5,
      layers: [{ name: null, blocks }],
      fact: 'Towering columns of cold molecular hydrogen gas and dust within the Eagle Nebula, roughly 6,600 light-years away, where the tallest pillar stands about 4 light-years high — nearly the same distance as from our Sun to the next nearest star. Inside these dense clouds, gravity is actively collapsing pockets of gas into new stars, while the intense radiation from already-formed young stars nearby is slowly eroding the pillars away in a process called photoevaporation, meaning they are literally being sculpted and destroyed as new stars are born within them. Hubble\'s 1995 photograph of these pillars, later revisited in even sharper detail, became one of the most iconic and widely reproduced images in the history of astronomy.',
    });
  }

  // The Crab Nebula: wreckage of a supernova seen in 1054 AD.
  {
    const blocks = [{ dx: 0, dy: 0, color: '#eaf2ff', twinkle: true, k: 0 }]; // the pulsar
    for (let f = 0; f < 14; f++) {
      const baseAng = (f / 14) * Math.PI * 2;
      for (let r2 = 1; r2 < 13; r2 += 0.8) {
        const ang = baseAng + Math.sin(r2 * 0.7 + f) * 0.25;
        blocks.push({
          dx: Math.round(Math.cos(ang) * r2), dy: Math.round(Math.sin(ang) * r2 * 0.85),
          color: r2 < 4 ? '#9fb8e8' : rng() < 0.55 ? '#d8905a' : '#b06a4a',
          alpha: Math.max(0.3, 1 - r2 * 0.06),
          k: r2,
        });
      }
    }
    blocks.sort((a, b) => a.k - b.k);
    S.push({
      name: 'the Crab Nebula', cx: 760, cy: 170, R: 14, kind: 'body', zoom: 4,
      layers: [{ name: null, blocks }],
      fact: 'The shredded, still-expanding remains of a massive star that ended its life in a supernova explosion — an event Chinese, Japanese, and Arab astronomers all recorded witnessing in 1054 AD, when the new "guest star" became bright enough to see in broad daylight for over three weeks and remained visible at night for nearly two years. At its heart spins a pulsar: the crushed, city-sized core of the original star, now a neutron star so dense that a teaspoon of it would weigh billions of tonnes, spinning 30 times every second and sweeping a beam of radiation across space like a cosmic lighthouse. The nebula is still expanding outward at over 1,500 km/s, and studying it has been fundamental to understanding how the heavy elements that make up planets — and us — are forged and scattered by dying stars.',
    });
  }

  // Beyond: Andromeda.
  S.push(makeSpiralGalaxy(rng, {
    name: 'the Andromeda Galaxy', cx: 350, cy: 280, R: 48,
    coreColors: ['#f2ecdc', '#e8dfc8'],
    armColors: ['#9fb0d8', '#7a8cc0', '#5d6f9e', '#48587e'],
    fact: 'Our nearest major galactic neighbour, 2.5 million light-years away — so distant that the light reaching us tonight left Andromeda before modern humans existed, yet still close enough to be visible to the naked eye as a faint smudge, making it the most distant object most people will ever see without a telescope. It is a spiral galaxy considerably larger than the Milky Way, home to roughly a trillion stars (compared to our few hundred billion), and it is not standing still: Andromeda is racing toward us at about 110 km/s under mutual gravity, and in roughly 4.5 billion years the two galaxies will collide and merge into a single giant elliptical galaxy some astronomers have nicknamed "Milkomeda." Despite the dramatic collision, the vast distances between individual stars mean it is extremely unlikely any stars will actually crash into one another.',
  }));

  // The Triangulum Galaxy (M33) — third-largest in our Local Group.
  S.push(makeSpiralGalaxy(rng, {
    name: 'the Triangulum Galaxy', cx: 2320, cy: 260, R: 30,
    coreColors: ['#eef2e0', '#e2e8cc'],
    armColors: ['#9fd0b8', '#78b09a', '#568f7c', '#3d6a5e'],
    fact: 'The third-largest member of our Local Group of galaxies, after Andromeda and the Milky Way, sitting about 2.73 million light-years away — making it very slightly closer to us than Andromeda, though considerably smaller, with only about 40 billion stars. Under exceptionally dark skies it is the most distant object reliably visible to the naked eye, a step further than Andromeda. It may be a satellite of the Andromeda Galaxy, gravitationally bound and orbiting it, and it hosts NGC 604, one of the largest known star-forming regions in the Local Group, far bigger than the Orion Nebula.',
  }));

  // The Whirlpool Galaxy (M51) — a grand-design spiral with a companion.
  {
    const gRng = mulberry32(seed ^ 0x77C1A0);
    const whirl = makeSpiralGalaxy(gRng, {
      name: 'the Whirlpool Galaxy', cx: 120, cy: 1700, R: 26,
      coreColors: ['#f2ecd8', '#e8dcc0'],
      armColors: ['#b0c8ec', '#84a4d8', '#5c7cb8', '#3f5c94'],
      fact: 'One of the most photographed spiral galaxies in the sky, about 23 million light-years away, prized for its textbook-perfect spiral arms laced with pink star-forming regions and dark dust lanes. Its dramatic shape is no accident: the Whirlpool is caught mid-collision with a smaller companion galaxy, NGC 5195, visible tugging at the end of one spiral arm — the ongoing gravitational interaction is what has kept its arms so well-defined and triggered bursts of new star formation. It was the first galaxy ever recognised as having a spiral structure, by Lord Rosse in 1845, using what was then the largest telescope in the world.',
    });
    // A small companion blob at the end of one arm, bridged by a faint trail.
    const compX = 24, compY = -20;
    whirl.layers[0].blocks.push(
      { dx: compX, dy: compY, color: '#e8dcc0' },
      { dx: compX + 1, dy: compY - 1, color: '#dcd0b4', alpha: 0.8 },
      { dx: compX - 1, dy: compY + 1, color: '#dcd0b4', alpha: 0.8 },
      { dx: compX, dy: compY - 2, color: '#f0e6ce', twinkle: true },
    );
    for (let k = 1; k < 6; k++) {
      whirl.layers[0].blocks.push({
        dx: Math.round(compX * (1 - k / 7)), dy: Math.round(compY * (1 - k / 7)),
        color: '#9fb0d8', alpha: 0.3,
      });
    }
    S.push(whirl);
  }

  // The Virgo Cluster: the nearest large galaxy cluster, anchored by M87.
  {
    const vRng = mulberry32(seed ^ 0x5E11C0);
    const blocks = [];
    // A scatter of small elliptical/spiral member galaxies.
    for (let i = 0; i < 22; i++) {
      const gx = Math.round((vRng() - 0.5) * 46);
      const gy = Math.round((vRng() - 0.5) * 32);
      const size = 1 + (vRng() * 2 | 0);
      const col = vRng() < 0.6 ? '#e8ddc4' : '#c8d4ec';
      for (let dy = -size; dy <= size; dy++) {
        for (let dx = -size; dx <= size; dx++) {
          if (Math.hypot(dx, dy) <= size + 0.3) blocks.push({ dx: gx + dx, dy: gy + dy, color: col, alpha: 0.6 + vRng() * 0.3 });
        }
      }
    }
    // M87 at the centre: a giant elliptical with a famous relativistic jet.
    for (const c of discCells(10)) {
      blocks.push({ dx: c.dx, dy: c.dy, color: dither(vRng, ['#f2ecd8', '#e8e0c8', '#ddd4b8']), k: 1 });
    }
    for (let k = 1; k < 16; k++) {
      blocks.push({ dx: 10 + k, dy: -Math.round(k * 0.15), color: '#cfe0ff', alpha: Math.max(0.2, 0.8 - k * 0.05), twinkle: k === 15 });
    }
    S.push({
      name: 'the Virgo Cluster', cx: 2340, cy: 1740, R: 30, kind: 'body', zoom: 2.5,
      layers: [{ name: null, blocks }],
      fact: 'The nearest large galaxy cluster to us, roughly 54 million light-years away, containing well over 1,000 (by some counts nearer 2,000) galaxies bound together by gravity, with our own Local Group being drawn gently toward it. At its heart sits M87, a monstrous elliptical galaxy harbouring a supermassive black hole 6.5 billion times the Sun\'s mass — the very one captured in the Event Horizon Telescope\'s famous 2019 image, the first photograph ever taken of a black hole\'s silhouette. M87 also shoots out a jet of matter travelling at nearly the speed of light, visible stretching thousands of light-years from its core, powered by the black hole\'s intense gravity and magnetic fields.',
    });
  }

  // The Bullet Cluster: two galaxy clusters colliding — the classic
  // observational evidence for dark matter.
  {
    const bRng = mulberry32(seed ^ 0x8B11E7);
    const blocks = [];
    // Pink: hot X-ray gas, slowed by the collision, lagging behind.
    for (let i = 0; i < 140; i++) {
      const ang = bRng() * Math.PI * 2, rad = bRng() * 11;
      blocks.push({ dx: Math.round(Math.cos(ang) * rad), dy: Math.round(Math.sin(ang) * rad * 0.7), color: '#e8829a', alpha: 0.3 + bRng() * 0.3 });
    }
    // Blue: dark matter (inferred via gravitational lensing), passed through unimpeded.
    const lobes = [[-14, 0], [15, -2]];
    for (const [lx, ly] of lobes) {
      for (let i = 0; i < 55; i++) {
        const ang = bRng() * Math.PI * 2, rad = bRng() * 8;
        blocks.push({ dx: Math.round(lx + Math.cos(ang) * rad), dy: Math.round(ly + Math.sin(ang) * rad * 0.7), color: '#6f9adc', alpha: 0.35 + bRng() * 0.35 });
      }
    }
    S.push({
      name: 'the Bullet Cluster', cx: 130, cy: 300, R: 24, kind: 'body', zoom: 3,
      layers: [{ name: null, blocks }],
      fact: 'Two massive galaxy clusters caught in the act of colliding, about 3.7 billion light-years away, in an image that became one of the strongest pieces of observational evidence for dark matter. X-ray observations (shown in pink) reveal hot gas — the bulk of the clusters\' normal, visible matter — which collided, slowed down, and lagged behind during the impact. But gravitational lensing maps (shown in blue) reveal where most of the clusters\' actual mass sits, and it passed straight through the collision largely undisturbed, offset from the visible gas. That separation is very hard to explain unless most of the mass is invisible dark matter that barely interacts with anything, including itself.',
    });
  }

  // The Hubble Ultra Deep Field: a tiny patch of "empty" sky revealed as
  // packed with thousands of ancient, distant galaxies.
  {
    const hRng = mulberry32(seed ^ 0xF0C05E);
    const blocks = [];
    const cols = ['#e8dcc0', '#c8d4ec', '#e8b8a0', '#b8e0d0', '#d8c8e8', '#f2ecd8'];
    for (let i = 0; i < 500; i++) {
      const dx = Math.round((hRng() - 0.5) * 34);
      const dy = Math.round((hRng() - 0.5) * 24);
      blocks.push({ dx, dy, color: dither(hRng, cols), alpha: 0.35 + hRng() * 0.5, twinkle: hRng() < 0.02 });
    }
    S.push({
      name: 'the Hubble Ultra Deep Field', cx: 2300, cy: 900, R: 20, kind: 'body', zoom: 3.5,
      layers: [{ name: null, blocks }],
      fact: 'In 2003–04, the Hubble Space Telescope was pointed at a patch of sky in the constellation Fornax so small and apparently empty that you could cover it with a grain of sand held at arm\'s length, and stared at it for over 11 days of total exposure time. The result stunned astronomers: nearly 10,000 galaxies packed into that single tiny patch, most never seen before, some so distant their light had been travelling for over 13 billion years — meaning we see them as they looked when the universe was less than a billion years old. The image demonstrated that essentially every direction in the sky, no matter how dark and empty it looks, is filled with countless galaxies once you look deep enough.',
    });
  }

  // The Cosmic Microwave Background: the oldest light in the universe.
  {
    const cRng = mulberry32(seed ^ 0xC0B3B6);
    const blocks = [];
    for (const c of discCells(22)) {
      const n = Math.sin(c.dx * 0.5 + 1.2) + Math.sin(c.dy * 0.6 - 0.7) + Math.sin((c.dx + c.dy) * 0.35) + (cRng() - 0.5) * 1.4;
      const hot = n > 0.3;
      const col = hot
        ? (n > 1.1 ? '#e8703f' : '#d89a5a')
        : (n < -1.1 ? '#3a5ba0' : '#5f7fb8');
      blocks.push({ dx: c.dx, dy: c.dy, color: col, alpha: 0.55 + cRng() * 0.35, k: c.d });
    }
    blocks.sort((a, b) => a.k - b.k);
    S.push({
      name: 'the Cosmic Microwave Background', cx: 1200, cy: 1850, R: 24, kind: 'body', zoom: 2.5,
      layers: [{ name: null, blocks }],
      fact: 'The oldest light that can ever be observed: a faint afterglow left over from about 380,000 years after the Big Bang, when the universe had cooled enough for atoms to first form and for light to travel freely for the first time. It fills the entire sky in every direction and has been stretched by the universe\'s 13.8-billion-year expansion from blistering heat down to a chill of 2.7 degrees above absolute zero, now detectable only as faint microwave radiation. The subtle mottled pattern of warmer and cooler patches, mapped in exquisite detail by the COBE, WMAP, and Planck satellites, records the tiny density ripples in the early universe that would eventually grow, under gravity, into every galaxy, star, and planet — including this one. It marks the practical edge of the observable universe: nothing further back can be seen, because before this the universe was an opaque fog of plasma.',
    });
  }

  // The Ring Nebula (M57): a dying Sun-like star's outer layers, shed as a glowing shell.
  {
    const rRng = mulberry32(seed ^ 0x1A2B3C);
    const blocks = [];
    for (let ring = 0; ring < 3; ring++) {
      const rad = 8 + ring * 2.4;
      for (let a2 = 0; a2 < Math.PI * 2; a2 += 0.09) {
        const wob = 1 + Math.sin(a2 * 3 + ring) * 0.15;
        blocks.push({
          dx: Math.round(Math.cos(a2) * rad * wob), dy: Math.round(Math.sin(a2) * rad * wob * 0.72),
          color: ring === 0 ? '#e89ac8' : ring === 1 ? '#a878d8' : '#5878c0',
          alpha: 0.5 + rRng() * 0.4,
        });
      }
    }
    blocks.push({ dx: 0, dy: 0, color: '#eaf2ff', twinkle: true }); // the white dwarf remnant
    S.push({
      name: 'the Ring Nebula', cx: 980, cy: 60, R: 12, kind: 'body', zoom: 6,
      layers: [{ name: null, blocks }],
      fact: 'A planetary nebula 2,600 light-years away — the glowing shell of gas a Sun-like star gently sheds near the end of its life, leaving behind a small, hot white dwarf at its centre (visible here as the pale core). Despite the name, it has nothing to do with planets; early telescope observers just thought the round, hazy shape looked planet-like. Our own Sun will likely form something similar in roughly 5 billion years. It is one of the most-observed objects in the night sky, a favourite target for amateur telescopes every summer.',
    });
  }

  // The Tarantula Nebula: the largest and most active stellar nursery known.
  {
    const trRng = mulberry32(seed ^ 0x2B3C4D);
    const blocks = [];
    const cols = ['#e888a8', '#c868a0', '#8868c8', '#5878c0', '#f0b8c8'];
    for (let i = 0; i < 480; i++) {
      const dx = Math.round((trRng() + trRng() + trRng() - 1.5) * 20);
      const dy = Math.round((trRng() + trRng() + trRng() - 1.5) * 16);
      const d = Math.hypot(dx, dy);
      blocks.push({ dx, dy, color: dither(trRng, cols), alpha: 0.35 + trRng() * 0.45, k: d });
    }
    blocks.sort((a, b) => a.k - b.k);
    for (let i = 0; i < 8; i++) {
      blocks.push({ dx: Math.round((trRng() - 0.5) * 24), dy: Math.round((trRng() - 0.5) * 18), color: '#f2f6ff', twinkle: true });
    }
    S.push({
      name: 'the Tarantula Nebula', cx: 1900, cy: 1830, R: 24, kind: 'body', zoom: 3.2,
      layers: [{ name: null, blocks }],
      fact: 'The largest and most violently active star-forming region known in our cosmic neighbourhood, 161,000 light-years away in a small satellite galaxy of the Milky Way. It contains R136, a cluster of the most massive stars ever discovered, some over 200 times the Sun\'s mass — stars that shouldn\'t theoretically be able to form at all, yet did. If it were as close to Earth as the Orion Nebula, it would be bright enough to cast shadows at night and would appear to cover a large part of the sky.',
    });
  }

  // Eta Carinae: an unstable, doomed binary star inside its own ejected nebula.
  {
    const etaRng = mulberry32(seed ^ 0x3C4D5E);
    const blocks = [{ dx: 0, dy: 0, color: '#fff2d8', twinkle: true }];
    for (const sgn of [1, -1]) {
      for (let i = 0; i < 55; i++) {
        const t2 = etaRng();
        const lobeY = sgn * (2 + t2 * 11);
        const spread = (1 - t2 * 0.6) * (3 + t2 * 4);
        blocks.push({
          dx: Math.round((etaRng() - 0.5) * spread), dy: Math.round(lobeY),
          color: dither(etaRng, ['#e8905a', '#c86a3a', '#f0b078']),
          alpha: 0.5 + etaRng() * 0.4, k: Math.abs(lobeY),
        });
      }
    }
    blocks.sort((a, b) => (a.k || 0) - (b.k || 0));
    S.push({
      name: 'Eta Carinae', cx: 550, cy: 1820, R: 14, kind: 'body', zoom: 5,
      layers: [{ name: null, blocks }],
      fact: 'One of the most massive and unstable star systems known — a binary of two enormous stars, the larger over 90 times the Sun\'s mass, locked in a tight 5.5-year orbit. In the 1840s it briefly became one of the brightest stars in the sky during a huge eruption, blasting out the two-lobed "Homunculus Nebula" of gas seen here. Astronomers expect it to explode as a supernova, or even a rare hypernova, at any time in the next few hundred thousand years — a blink of an eye in cosmic terms, and one of the best candidate "next" naked-eye supernovae from Earth.',
    });
  }

  // The Large Magellanic Cloud: an irregular dwarf galaxy orbiting the Milky Way.
  {
    const lmcRng = mulberry32(seed ^ 0x4D5E6F);
    const blocks = [];
    const cols = ['#e8dcc0', '#c8d4ec', '#e8b8a0', '#d8c8a8', '#f2ecd8'];
    for (let i = 0; i < 260; i++) {
      const dx = Math.round((lmcRng() + lmcRng() - 1) * 26);
      const dy = Math.round((lmcRng() + lmcRng() - 1) * 18);
      blocks.push({ dx, dy, color: dither(lmcRng, cols), alpha: 0.3 + lmcRng() * 0.4, twinkle: lmcRng() < 0.02 });
    }
    // A brighter bar-like core, since real LMC has a distorted central bar.
    for (let i = 0; i < 40; i++) {
      blocks.push({ dx: Math.round((lmcRng() - 0.5) * 14), dy: Math.round((lmcRng() - 0.5) * 5), color: '#f2ecd8', alpha: 0.6 + lmcRng() * 0.3 });
    }
    S.push({
      name: 'the Large Magellanic Cloud', cx: 1780, cy: 60, R: 28, kind: 'body', zoom: 2.6,
      layers: [{ name: null, blocks }],
      fact: 'A small, irregular satellite galaxy of the Milky Way, only about 163,000 light-years away — close enough to be clearly visible to the naked eye from the Southern Hemisphere, looking like a detached piece of the Milky Way itself. It is named for Ferdinand Magellan\'s crew, who used it for navigation on their 16th-century voyage, though southern peoples had catalogued it long before. It hosted SN 1987A, the closest supernova observed in the modern era, and is gradually being pulled apart by our galaxy\'s gravity — it will eventually merge with the Milky Way entirely.',
    });
  }

  // Centaurus A: the nearest active galaxy, split by a dark dust lane.
  {
    const cenRng = mulberry32(seed ^ 0x5E6F70);
    const blocks = [];
    for (const c of discCells(18)) {
      if (Math.abs(c.dy) < 2.4 + (cenRng() - 0.5) * 1.5) continue; // the dust lane gap
      blocks.push({ dx: c.dx, dy: c.dy, color: dither(cenRng, ['#e8dcc0', '#ddd0b0', '#d0c2a0']), alpha: 0.6 + cenRng() * 0.3, k: c.d });
    }
    for (let dx = -20; dx <= 20; dx++) {
      const dy = Math.round((cenRng() - 0.5) * 2);
      blocks.push({ dx, dy: 2 + dy, color: '#3a2f22', alpha: 0.75, k: 999 });
      blocks.push({ dx, dy: -2 + dy, color: '#4a3d2c', alpha: 0.6, k: 999 });
    }
    // The relativistic jet.
    for (let i = 0; i < 20; i++) {
      blocks.push({ dx: Math.round(i * 1.1), dy: Math.round(-i * 0.5), color: '#a8c8ff', alpha: Math.max(0.15, 0.6 - i * 0.02), k: 1000 });
    }
    blocks.sort((a, b) => (a.k || 0) - (b.k || 0));
    S.push({
      name: 'Centaurus A', cx: 2370, cy: 1050, R: 22, kind: 'body', zoom: 3.2,
      layers: [{ name: null, blocks }],
      fact: 'The nearest active galaxy to Earth, about 12 million light-years away, split visibly in half by a thick, dark lane of dust — the leftover debris of a collision with a smaller spiral galaxy hundreds of millions of years ago. At its heart is a supermassive black hole devouring surrounding matter and firing out a jet of particles at nearly the speed of light, visible here streaming outward. It is a favourite target of amateur astronomers in the Southern Hemisphere and one of the brightest radio sources in the entire sky.',
    });
  }

  // The Cartwheel Galaxy: a ring galaxy formed by a direct collision.
  {
    const cwRng = mulberry32(seed ^ 0x6F7081);
    const blocks = [];
    for (const c of discCells(5)) blocks.push({ dx: c.dx, dy: c.dy, color: dither(cwRng, ['#f0e6c8', '#e6dab8']), alpha: 0.7, k: 0 });
    for (let a2 = 0; a2 < Math.PI * 2; a2 += 0.045) {
      const rad = 18 + (cwRng() - 0.5) * 2.5;
      blocks.push({
        dx: Math.round(Math.cos(a2) * rad), dy: Math.round(Math.sin(a2) * rad * 0.78),
        color: dither(cwRng, ['#e8b878', '#d8a868', '#c8985a']),
        alpha: 0.55 + cwRng() * 0.35, twinkle: cwRng() < 0.05, k: 20,
      });
    }
    for (let i = 0; i < 10; i++) { // faint spokes connecting core to ring
      const a2 = cwRng() * Math.PI * 2, rad = cwRng() * 17 + 2;
      blocks.push({ dx: Math.round(Math.cos(a2) * rad), dy: Math.round(Math.sin(a2) * rad * 0.78), color: '#8a7858', alpha: 0.3, k: 10 });
    }
    blocks.sort((a, b) => a.k - b.k);
    S.push({
      name: 'the Cartwheel Galaxy', cx: 60, cy: 1050, R: 22, kind: 'body', zoom: 3.5,
      layers: [{ name: null, blocks }],
      fact: 'A galaxy shaped like a wagon wheel, 500 million light-years away — the result of a smaller galaxy plunging directly through the middle of what was once an ordinary spiral, roughly 200-400 million years ago. The impact sent a ripple of star formation outward like a stone dropped in a pond, creating the bright outer ring, while faint spokes of gas still connect it to the small core left behind. The James Webb Space Telescope imaged it in stunning infrared detail in 2022, revealing thousands of individual young star clusters within the ring.',
    });
  }

  // Sagittarius A*: our own galaxy's supermassive black hole.
  {
    const blocks = [];
    for (let a2 = 0; a2 < Math.PI * 2; a2 += 0.12) {
      const rad = 4 + Math.sin(a2 * 3) * 0.6;
      blocks.push({ dx: Math.round(Math.cos(a2) * rad), dy: Math.round(Math.sin(a2) * rad * 0.85), color: '#e8a94f', alpha: 0.6 });
    }
    blocks.push({ dx: 0, dy: 0, color: '#000000' });
    S.push({
      name: 'Sagittarius A*', cx: 950, cy: 1800, R: 8, kind: 'body', zoom: 7,
      layers: [{ name: null, blocks }],
      fact: 'The supermassive black hole at the very centre of our own Milky Way, about 27,000 light-years from Earth and roughly 4 million times the Sun\'s mass. In 2022 the Event Horizon Telescope released the first-ever image of it — a faint, glowing ring of superheated gas around a dark shadow — a companion to their famous 2019 image of M87\'s black hole. Stars near it, tracked for decades, whip around it at speeds up to several percent of the speed of light, and that tracking is what first proved it was there long before it could be directly photographed.',
    });
  }

  // 3C 273: the first quasar ever identified.
  {
    const blocks = [{ dx: 0, dy: 0, color: '#eaf2ff', twinkle: true }];
    for (let k = 1; k <= 3; k++) {
      blocks.push({ dx: -k, dy: 0, color: '#a8c8ff', alpha: Math.max(0.2, 0.7 - k * 0.15) },
        { dx: k, dy: 0, color: '#a8c8ff', alpha: Math.max(0.2, 0.7 - k * 0.15) },
        { dx: 0, dy: -k, color: '#a8c8ff', alpha: Math.max(0.2, 0.7 - k * 0.15) },
        { dx: 0, dy: k, color: '#a8c8ff', alpha: Math.max(0.2, 0.7 - k * 0.15) });
    }
    for (let i = 1; i <= 8; i++) blocks.push({ dx: 2 + i, dy: -Math.round(i * 0.3), color: '#c8d8f8', alpha: Math.max(0.15, 0.5 - i * 0.05) }); // the visible jet
    S.push({
      name: '3C 273', cx: 2370, cy: 450, R: 8, kind: 'body', zoom: 7,
      layers: [{ name: null, blocks }],
      fact: 'The first quasar ever identified, in 1963, and still the brightest one visible from Earth — bright enough to be seen through a good amateur telescope despite being about 2.4 billion light-years away, roughly 4 trillion times farther than the Sun. It shines with the light of about 4 trillion Suns, powered by a supermassive black hole devouring gas at the centre of its host galaxy, with a jet of matter (visible here) blasting out for thousands of light-years. Its discovery proved that such extraordinarily distant, extraordinarily bright objects were real, launching the modern study of quasars.',
    });
  }

  // The Laniakea Supercluster: the vast structure our galaxy belongs to.
  {
    const lanRng = mulberry32(seed ^ 0x708192);
    const blocks = [];
    for (let i = 0; i < 300; i++) {
      const dx = Math.round((lanRng() + lanRng() + lanRng() - 1.5) * 34);
      const dy = Math.round((lanRng() + lanRng() + lanRng() - 1.5) * 26);
      blocks.push({ dx, dy, color: dither(lanRng, ['#3a5178', '#4a6088', '#5d7092', '#2a3c5c']), alpha: 0.25 + lanRng() * 0.35 });
    }
    // Little galaxy-dot clusters strung along filament-like lines.
    for (let f = 0; f < 6; f++) {
      const ang = lanRng() * Math.PI * 2, len = 18 + lanRng() * 14;
      for (let t2 = 0; t2 < 1; t2 += 0.12) {
        blocks.push({
          dx: Math.round(Math.cos(ang) * len * t2 + (lanRng() - 0.5) * 3),
          dy: Math.round(Math.sin(ang) * len * t2 + (lanRng() - 0.5) * 3),
          color: '#dce8fa', alpha: 0.6 + lanRng() * 0.3, twinkle: lanRng() < 0.15,
        });
      }
    }
    S.push({
      name: 'the Laniakea Supercluster', cx: 60, cy: 1550, R: 36, kind: 'body', zoom: 2,
      layers: [{ name: null, blocks }],
      fact: 'The vast supercluster of galaxies our own Milky Way calls home — over 100,000 galaxies bound loosely together by gravity across roughly 520 million light-years, first mapped in 2014 by tracing the direction galaxies are flowing under mutual gravitational pull, rather than by what can simply be seen. Its name means "immeasurable heaven" in Hawaiian. Even Laniakea itself is not the end: it is just one lobe of an even larger structure, and the Milky Way sits in its outskirts, gently flowing away from the rest along with everything nearby, toward a mysterious concentration of mass called the Great Attractor.',
    });
  }

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
    title: 'The Deep Sky', names: [
      'TRAPPIST-1', 'the Pleiades', 'the Orion Nebula',
      'the Pillars of Creation', 'the Crab Nebula', 'the Ring Nebula',
      'the Tarantula Nebula', 'Eta Carinae',
    ],
  },
  {
    title: 'Beyond the Milky Way', names: [
      'the Andromeda Galaxy', 'the Triangulum Galaxy', 'the Whirlpool Galaxy',
      'the Large Magellanic Cloud', 'Centaurus A', 'the Cartwheel Galaxy',
    ],
  },
  {
    title: 'The Deep Universe', names: [
      'the Virgo Cluster', 'the Bullet Cluster', 'the Hubble Ultra Deep Field',
      'Sagittarius A*', '3C 273', 'the Laniakea Supercluster',
      'the Cosmic Microwave Background',
    ],
  },
];

// Real stats shown in the info panel (hover or click an atlas entry).
const STATS = {
  'the Sun': { Type: 'G-type main-sequence star', Diameter: '1.39 million km (109 Earths)', Mass: '99.8% of the Solar System', 'Surface temp': '5,500 °C', 'Core temp': '15 million °C', Age: '4.6 billion years' },
  Mercury: { Diameter: '4,880 km', 'Distance from Sun': '58M km (0.39 AU)', Day: '176 Earth days', Year: '88 Earth days', Moons: '0', 'Surface temp': '−173 to 427 °C' },
  Venus: { Diameter: '12,104 km', 'Distance from Sun': '108M km (0.72 AU)', Day: '243 Earth days (retrograde)', Year: '225 Earth days', Moons: '0', 'Surface temp': '465 °C' },
  Earth: { Diameter: '12,742 km', 'Distance from Sun': '149.6M km (1 AU)', Day: '24 hours', Year: '365.25 days', Moons: '1', 'Surface temp': '−88 to 58 °C' },
  'the Moon': { Diameter: '3,474 km', 'Distance from Earth': '384,400 km', 'Orbital period': '27.3 days', Gravity: '16.6% of Earth\'s', 'Visited by': '12 humans (1969–72)' },
  Mars: { Diameter: '6,779 km', 'Distance from Sun': '228M km (1.52 AU)', Day: '24.6 hours', Year: '687 Earth days', Moons: '2 (Phobos, Deimos)', 'Surface temp': '−140 to 20 °C' },
  "Halley's Comet": { Nucleus: '15 × 8 km', 'Orbital period': '75–79 years', 'Last seen': '1986', 'Next visit': '2061', Speed: 'up to 254,000 km/h' },
  'the asteroid belt': { Location: 'between Mars and Jupiter', 'Total mass': 'less than the Moon', 'Largest member': 'Ceres (940 km)', Objects: 'millions' },
  Jupiter: { Diameter: '139,820 km (11 Earths)', 'Distance from Sun': '778M km (5.2 AU)', Day: '9.9 hours', Year: '11.9 Earth years', Moons: '95 known', 'Great Red Spot': 'storm bigger than Earth' },
  Saturn: { Diameter: '116,460 km', 'Distance from Sun': '1.4B km (9.5 AU)', Day: '10.7 hours', Year: '29.4 Earth years', Moons: '146 known', Rings: 'ice, ~10 m thick' },
  Uranus: { Diameter: '50,724 km', 'Distance from Sun': '2.9B km (19.2 AU)', Day: '17.2 hours (sideways)', Year: '84 Earth years', Moons: '28 known', 'Axial tilt': '98°' },
  Neptune: { Diameter: '49,244 km', 'Distance from Sun': '4.5B km (30 AU)', Day: '16.1 hours', Year: '165 Earth years', Moons: '16 known', Winds: 'up to 2,100 km/h' },
  Pluto: { Diameter: '2,377 km (smaller than the Moon)', 'Distance from Sun': '5.9B km (39.5 AU)', Year: '248 Earth years', Moons: '5 (incl. Charon)', Status: 'dwarf planet since 2006' },
  'the Kuiper belt': { Location: 'beyond Neptune, 30–55 AU', Contents: 'icy dwarf planets and comets', 'Known objects': '~3,000 catalogued', 'Famous members': 'Pluto, Eris, Makemake' },
  'Voyager 1': { Launched: '5 Sep 1977', Distance: '24+ billion km', Speed: '61,000 km/h', Status: 'in interstellar space', Cargo: 'the Golden Record' },
  'the Oort Cloud': { Location: '2,000–100,000 AU', Contents: 'trillions of icy bodies', Status: 'hypothesised, never imaged', Source: 'long-period comets' },
  'Proxima Centauri': { Type: 'red dwarf', Distance: '4.24 light-years', Planets: 'at least 2 (one in habitable zone)', 'Travel time': '70,000+ years at Voyager speed' },
  'Alpha Centauri': { Type: 'binary Sun-like stars', Distance: '4.37 light-years', System: 'triple, with Proxima Centauri', Note: 'closest star system to the Sun' },
  "Barnard's Star": { Type: 'red dwarf', Distance: '~6 light-years', Claim: 'fastest apparent motion of any star', Discovered: '1916' },
  Sirius: { Type: 'binary star system', Distance: '8.6 light-years', Brightness: 'brightest star in our night sky', Companion: 'Sirius B, a white dwarf' },
  'Epsilon Eridani': { Type: 'young Sun-like star', Distance: '10.5 light-years', Age: '< 1 billion years', Note: 'sci-fi home of the Vulcans' },
  'Tau Ceti': { Type: 'Sun-like star', Distance: '~12 light-years', Planets: 'several candidates', Note: 'popular SETI target' },
  Vega: { Type: 'white star, fast spinner', Distance: '25 light-years', Claim: 'first star ever photographed (1850)', Future: 'North Star around 12,000 CE' },
  Altair: { Type: 'white star, fast spinner', Distance: '17 light-years', Shape: 'flattened, egg-like', Note: 'corner of the Summer Triangle' },
  Polaris: { Type: 'yellow supergiant (triple system)', Distance: '~430 light-years', Role: 'the North Star', Note: 'almost exactly above Earth\'s north pole' },
  Betelgeuse: { Type: 'red supergiant', Distance: '~550 light-years', Size: 'would swallow Mars if placed at the Sun', Fate: 'will explode as a supernova' },
  Rigel: { Type: 'blue supergiant', Distance: '~860 light-years', Brightness: '~120,000× the Sun', Fate: 'will end in a supernova' },
  'the galactic field': { Stars: '100–400 billion', Diameter: '~100,000 light-years', 'Our position': 'Orion Arm, ~27,000 ly from centre', 'Galactic year': '230 million years' },
  'TRAPPIST-1': { Type: 'ultra-cool red dwarf', Distance: '40 light-years', Planets: '7 rocky, Earth-sized', 'Habitable zone': '3 planets', Discovered: '2016–17' },
  'the Pleiades': { Type: 'open star cluster (M45)', Distance: '444 light-years', Age: '~100 million years', Stars: 'over 1,000 (7 visible)', Note: 'known to nearly every ancient culture' },
  'the Orion Nebula': { Type: 'stellar nursery (M42)', Distance: '1,344 light-years', Width: '~24 light-years', Note: 'visible to the naked eye in Orion\'s sword' },
  'the Pillars of Creation': { Location: 'Eagle Nebula (M16)', Distance: '~6,600 light-years', Height: 'tallest pillar ~4 light-years', Famous: 'Hubble photograph, 1995' },
  'the Crab Nebula': { Type: 'supernova remnant (M1)', Distance: '6,500 light-years', Exploded: 'seen from Earth in 1054 AD', Heart: 'a pulsar spinning 30×/second' },
  'the Ring Nebula': { Type: 'planetary nebula (M57)', Distance: '2,600 light-years', Origin: 'a dying Sun-like star', Heart: 'a white dwarf remnant' },
  'the Tarantula Nebula': { Type: 'stellar nursery', Distance: '161,000 light-years', Location: 'Large Magellanic Cloud', Note: 'largest known star-forming region' },
  'Eta Carinae': { Type: 'unstable binary star', Distance: '~7,500 light-years', Mass: '90+ Suns (larger star)', Fate: 'likely supernova/hypernova candidate' },
  'the Andromeda Galaxy': { Type: 'spiral galaxy (M31)', Distance: '2.5 million light-years', Stars: '~1 trillion', Approach: '110 km/s toward us', Merger: 'in ~4.5 billion years' },
  'the Triangulum Galaxy': { Type: 'spiral galaxy (M33)', Distance: '2.73 million light-years', Stars: '~40 billion', Group: 'possible Andromeda satellite', Note: 'most distant naked-eye object' },
  'the Large Magellanic Cloud': { Type: 'irregular dwarf galaxy', Distance: '~163,000 light-years', Visibility: 'naked eye, Southern Hemisphere', Note: 'hosted supernova SN 1987A' },
  'Centaurus A': { Type: 'active elliptical galaxy', Distance: '~12 million light-years', Feature: 'dark dust lane + relativistic jet', Note: 'brightest radio source in the sky' },
  'the Cartwheel Galaxy': { Type: 'ring galaxy', Distance: '~500 million light-years', Origin: 'direct galactic collision', Imaged: 'JWST, 2022' },
  'the Whirlpool Galaxy': { Type: 'spiral galaxy (M51)', Distance: '~23 million light-years', Companion: 'NGC 5195 (colliding)', Discovered: 'spiral structure seen 1845' },
  'the Virgo Cluster': { Type: 'galaxy cluster', Distance: '~54 million light-years', Members: '1,000–2,000 galaxies', Anchor: 'M87 (supermassive black hole imaged 2019)' },
  'the Bullet Cluster': { Type: 'colliding galaxy clusters', Distance: '~3.7 billion light-years', Famous: 'key evidence for dark matter', Method: 'X-ray + gravitational lensing' },
  'the Hubble Ultra Deep Field': { Type: 'deep-sky image', Galaxies: '~10,000 in one small patch', Exposure: '11.3 days total', Distance: 'up to 13+ billion light-years' },
  'Sagittarius A*': { Type: 'supermassive black hole', Distance: '~27,000 light-years', Mass: '~4 million Suns', Imaged: 'Event Horizon Telescope, 2022' },
  '3C 273': { Type: 'quasar', Distance: '~2.4 billion light-years', Brightness: '~4 trillion Suns', Discovered: '1963 — the first quasar' },
  'the Laniakea Supercluster': { Type: 'galaxy supercluster', Span: '~520 million light-years', Galaxies: 'over 100,000', Mapped: '2014, via galaxy motion' },
  'the Cosmic Microwave Background': { Type: 'relic radiation', Age: '~380,000 years after the Big Bang', Temperature: '2.7 K (−270.4 °C)', Mapped: 'COBE, WMAP, Planck' },
};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const grid = document.createElement('canvas');
grid.width = WB; grid.height = HB;
const gctx = grid.getContext('2d');

let UNI = buildSequence(cycleSeedFor(cycleNumber));
let byName = new Map(UNI.structures.map((s) => [s.name, s]));

const state = {
  sessions: new Map(),
  placed: 0,
  sparks: [],
  assemblies: [],       // fragments converging into a block at its cell
  twinklers: [],
  flashes: [],
  ambient: [],          // shooting stars, meteors, debris (screen-space)
  nextAmbientAt: 0,
  budget: 0,            // paced block-placement allowance
  lastEventAt: 0,       // when Claude last did anything (for the status light)
  loaded: false,
  collapsed: new Set(),
  focus: null, // { kind: 'home' } or { kind: 'loc', name } — re-applied on resize
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

// Faint background specks so the void is never pure black — procedural and
// infinite (not limited to the built WB×HB world), so they're still there
// no matter how far out you zoom. The cell size is locked to screen space
// (scales with 1/zoom), so the ON-SCREEN density of specks stays roughly
// constant at any zoom instead of exploding into clutter when zoomed out
// or thinning to nothing within a small area when zoomed in.
const SPECK_SEED = 0x5bec_c5;
function speckHash(gx, gy, salt) {
  let h = (gx * 374761393 + gy * 668265263 + SPECK_SEED + salt * 2654435761) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function drawSpecks(t, s) {
  const cellWorld = Math.max(4, 42 / s); // ~42 CSS px average spacing, at any zoom
  const vw = W / s, vh = H / s;
  const gx0 = Math.floor((cam.x - vw / 2) / cellWorld) - 1;
  const gx1 = Math.ceil((cam.x + vw / 2) / cellWorld) + 1;
  const gy0 = Math.floor((cam.y - vh / 2) / cellWorld) - 1;
  const gy1 = Math.ceil((cam.y + vh / 2) / cellWorld) + 1;
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gy = gy0; gy <= gy1; gy++) {
      if (speckHash(gx, gy, 0) > 0.4) continue; // ~40% of cells get a speck
      const jx = speckHash(gx, gy, 1), jy = speckHash(gx, gy, 2), tone = speckHash(gx, gy, 3);
      const wx = (gx + 0.15 + jx * 0.7) * cellWorld;
      const wy = (gy + 0.15 + jy * 0.7) * cellWorld;
      const p = w2s(wx, wy);
      if (p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) continue;
      let a = 0.16 + tone * 0.32;
      if (tone > 0.9) a *= 0.5 + 0.5 * Math.sin(t * (0.3 + tone) + gx + gy); // a few gently twinkle
      ctx.globalAlpha = a;
      ctx.fillStyle = tone > 0.7 ? '#ffffff' : '#c8cdd8';
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }
  ctx.globalAlpha = 1;
}

// Which bodies orbit once complete (dist/angle derived from placement).
// Orbits are drawn as tilted ellipses (a 3/4 view of the orbital plane),
// which is also why real orbit paths read as arcs rather than circles.
const ORBIT = new Map();
{
  let i = 0;
  for (const name of ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) {
    const st = byName.get(name);
    const dx = st.cx - SUN.x, dy = st.cy - SUN.y;
    const dist = Math.hypot(dx, dy);
    ORBIT.set(name, {
      dist,
      ang0: Math.atan2(dy, dx),
      speed: 0.028 * Math.sqrt(200 / dist),     // fast enough for the eye
      squash: 0.56 + ((i * 7) % 5) * 0.02,      // per-planet tilt variation
    });
    i++;
  }
  const moon = byName.get('the Moon');
  const earth = byName.get('Earth');
  const mdx = moon.cx - earth.cx, mdy = moon.cy - earth.cy;
  ORBIT.set('the Moon', {
    parent: 'Earth', dist: Math.hypot(mdx, mdy),
    ang0: Math.atan2(mdy, mdx), speed: 0.14, squash: 0.5,
  });
}

// Anchored to wall-clock time so planets keep drifting between visits.
function orbitClock() { return Date.now() / 1000; }

function posOf(st) {
  const o = ORBIT.get(st.name);
  if (!o || !st.sprited) return { x: st.cx, y: st.cy };
  const a = o.ang0 - orbitClock() * o.speed;
  if (o.parent) {
    const p = posOf(byName.get(o.parent));
    return { x: p.x + Math.cos(a) * o.dist, y: p.y + Math.sin(a) * o.dist * o.squash };
  }
  return { x: SUN.x + Math.cos(a) * o.dist, y: SUN.y + Math.sin(a) * o.dist * o.squash };
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
  // Wait for /api/config before building anything — otherwise a brief
  // baselineEnergy-not-loaded-yet window would show a flash of extra,
  // unearned progress that then jumps back down once it arrives.
  if (baselineEnergy === null) return 0;
  // Progress is measured from where THIS cycle began (cycleStartEnergy) and
  // from this install's starting line (baselineEnergy) — not raw lifetime
  // energy. Otherwise a fresh cycle after a reset would instantly complete
  // again, and a fresh install on a machine with a long Claude Code history
  // would instantly unlock the whole universe instead of starting at zero.
  const cycleEnergy = Math.max(0, totalEnergy() - baselineEnergy - cycleStartEnergy);
  return Math.min(UNI.total, Math.floor(cycleEnergy / ENERGY_PER_BLOCK));
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
  // Gate on state.placed, not targetBlocks(): a burst of energy can push the
  // *target* past a structure's end well before its blocks have actually
  // streamed in and been stamped onto the grid. Sprite-ifying on target alone
  // would cut out (and start orbiting) a body some of whose blocks were never
  // drawn — those still-pending blocks then land later at its old static
  // position, orphaned from both the orbiting sprite and whatever's building
  // next. Waiting for state.placed means every block was really placed first.
  for (const st of UNI.structures) {
    if (!ORBIT.has(st.name) || st.sprited || state.placed < st.start + st.count) continue;
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
    state.sparks = [];
    state.assemblies = [];
    const instant = backlog - 300;
    for (let i = 0; i < instant; i++) placeBlock(state.placed++, false);
    spritifyDone();
    backlog = target - state.placed;
  }
  if (state.reduceMotion) {
    state.sparks = [];
    state.assemblies = [];
    while (state.placed < target) placeBlock(state.placed++, true);
    spritifyDone();
    renderLocations();
    return;
  }

  // Steady build rate in blocks/second; rises only when far behind.
  const rate = backlog > 400 ? Math.min(10, backlog / 60) : backlog > 60 ? 2.6 : 1.3;
  state.budget = Math.min(6, state.budget + (rate * dt) / 1000);

  const inFlight = () => state.sparks.length + state.assemblies.length;
  const wanted = backlog > 40 ? 3 : 2;
  while (state.budget >= 1 && state.sparks.length < wanted && state.placed + inFlight() < target) {
    state.budget -= 1;
    const index = state.placed + inFlight();
    const info = blockAt(index);
    const viewW = window.innerWidth / (BASE * cam.z);
    state.sparks.push({
      index,
      x: cam.x + (Math.random() - 0.5) * viewW,
      y: cam.y - (window.innerHeight / (BASE * cam.z)) * 0.6,
      tx: info.cx + 0.5, ty: info.cy + 0.5,
      color: SHARD_COLORS[(Math.random() * SHARD_COLORS.length) | 0],
      trail: [],
    });
  }

  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const sp = state.sparks[i];
    sp.trail.unshift({ x: sp.x, y: sp.y });
    if (sp.trail.length > 7) sp.trail.pop();
    const ddx = sp.tx - sp.x, ddy = sp.ty - sp.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 6) {
      // Arrival: burst into five smaller shards that assemble the block.
      state.assemblies.push({
        index: sp.index, cx: sp.tx, cy: sp.ty, t: 0, dur: 450,
        frags: Array.from({ length: 5 }, () => {
          const ang = Math.random() * Math.PI * 2;
          const d0 = 5 + Math.random() * 11;
          return {
            x0: sp.tx + Math.cos(ang) * d0, y0: sp.ty + Math.sin(ang) * d0,
            color: SHARD_COLORS[(Math.random() * SHARD_COLORS.length) | 0],
          };
        }),
      });
      state.sparks.splice(i, 1);
    } else {
      // Unhurried travel — watching the build should feel meditative.
      const step = Math.max(0.8, dist * 0.028) * (dt / 16.7);
      sp.x += (ddx / dist) * step;
      sp.y += (ddy / dist) * step;
    }
  }

  // Assemblies finish in FIFO order (same duration), keeping `placed` contiguous.
  for (let i = 0; i < state.assemblies.length; i++) state.assemblies[i].t += dt;
  while (state.assemblies.length) {
    const a = state.assemblies[0];
    if (a.t < a.dur || a.index !== state.placed) break;
    placeBlock(state.placed++, true);
    state.assemblies.shift();
    spritifyDone();
    renderLocations();
  }
}

const SHARD_COLORS = ['#e8eef8', '#ffffff', '#c8d4e8', '#9aa4b5', '#3a5a9e', '#5d7ba8'];

// --- Ambient sky: shooting stars, meteors, drifting debris ---------------

// The rarest tier: real, dramatic cosmic events. Each one is witnessed and
// silently recorded in the achievement book the first time it happens.
// `forceKind` lets the book's "watch again" replay the exact same visual
// on demand instead of a random pick from the pool.
const BIG_PHENOMENA = ['meteoroid-collision', 'supernova', 'black-hole', 'quasar',
  'gamma-ray-burst', 'kilonova', 'rogue-planet', 'nova', 'pulsar-flash',
  'tidal-disruption', 'auroral-storm', 'comet-flare'];
function spawnBigPhenomenon(now, forceKind) {
  const kind = forceKind || BIG_PHENOMENA[(Math.random() * BIG_PHENOMENA.length) | 0];
  const x = W * (0.2 + Math.random() * 0.6), y = H * (0.15 + Math.random() * 0.55);

  // Every book-recorded phenomenon runs long and slow on purpose — rare
  // things are meant to be noticed and lingered on, not blinked through.
  if (kind === 'rogue-planet') {
    const fromLeft = Math.random() < 0.5;
    state.ambient.push({
      kind, x: fromLeft ? -18 : W + 18, y,
      vx: (fromLeft ? 1 : -1) * (0.13 + Math.random() * 0.09), vy: (Math.random() - 0.5) * 0.04,
      life: 1, decay: 1 / 42, hue: 210 + Math.random() * 60,
    });
  } else if (kind === 'gamma-ray-burst') {
    state.ambient.push({ kind, x, y, vx: 0, vy: 0, life: 1, decay: 1 / 2.4, angle: Math.random() * Math.PI });
  } else if (kind === 'auroral-storm') {
    // A shimmering curtain low in the sky, not a point event — lingers far
    // longer than anything else in the pool.
    state.ambient.push({
      kind, x: W * (0.1 + Math.random() * 0.5), y: H * (0.55 + Math.random() * 0.2),
      vx: 0, vy: 0, life: 1, decay: 1 / 30, hue: 130 + Math.random() * 140,
    });
  } else if (kind === 'comet-flare') {
    // A comet mid-transit suddenly brightens (a real, if rare, outburst) —
    // moves like a meteor but flares hard partway across.
    const fromLeft = Math.random() < 0.5;
    state.ambient.push({
      kind, x: fromLeft ? -10 : W + 10, y: H * (0.1 + Math.random() * 0.5),
      vx: (fromLeft ? 1 : -1) * (0.4 + Math.random() * 0.22), vy: 0.055 + Math.random() * 0.075,
      life: 1, decay: 1 / 24, trail: [],
    });
  } else {
    // supernova, black-hole, quasar, kilonova, meteoroid-collision, nova,
    // pulsar-flash, tidal-disruption all just happen in place and fade —
    // duration varies by how "big" the event is.
    const durations = {
      supernova: 13, 'black-hole': 15, quasar: 11, kilonova: 12, 'meteoroid-collision': 8,
      nova: 9, 'pulsar-flash': 8, 'tidal-disruption': 14,
    };
    state.ambient.push({
      kind, x, y, vx: 0, vy: 0, life: 1, decay: 1 / durations[kind],
      angle: Math.random() * Math.PI * 2, seed: Math.random() * 1000,
    });
  }
  witnessPhenomenon(kind);
}

// A rare, unforced flourish — not tied to any metric or milestone, just
// occasional variety (a twin, oddly-coloured streak) so the sky never
// feels like it's cycling through the same three things on a loop.
// Split out so the achievement book's "watch again" can replay it exactly.
function spawnTwinStreak() {
  const fromTop = Math.random() < 0.7;
  const color = Math.random() < 0.5 ? '198, 240, 200' : '216, 178, 240'; // emerald or violet, as rgb triples
  const x = Math.random() * W, y = fromTop ? -10 : Math.random() * H * 0.4;
  const vx = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.8);
  const vy = 1.5 + Math.random() * 1.5;
  for (const dx of [0, 12]) {
    state.ambient.push({ kind: 'rare', x: x + dx, y, vx, vy, color, life: 1, decay: 1 / 3 });
  }
  witnessPhenomenon('twin-streak');
}

// A drifting, blinking visitor — small, medium, or large, in one of a few
// silhouette styles. Not tied to any real phenomenon, just occasional
// company. `forceSize`/`forceStyle` let "watch again" reproduce a specific
// look instead of a random one.
const CRAFT_SIZES = ['small', 'medium', 'large'];
const CRAFT_STYLES = ['saucer', 'cylinder', 'wing', 'triangle'];
function spawnAlienCraft(now, forceSize, forceStyle) {
  const size = forceSize || CRAFT_SIZES[(Math.random() * 3) | 0];
  const style = forceStyle || CRAFT_STYLES[(Math.random() * 4) | 0];
  const scale = size === 'small' ? 1 : size === 'medium' ? 1.6 : 2.4;
  const speedBase = size === 'small' ? 0.5 : size === 'medium' ? 0.32 : 0.2;
  const durBase = size === 'small' ? 9 : size === 'medium' ? 12 : 16;
  const fromLeft = Math.random() < 0.5;
  state.ambient.push({
    kind: 'alien-craft', size, style, scale,
    x: fromLeft ? -20 * scale : W + 20 * scale, y: H * (0.12 + Math.random() * 0.5),
    vx: (fromLeft ? 1 : -1) * speedBase * (0.8 + Math.random() * 0.4), vy: (Math.random() - 0.5) * 0.03,
    life: 1, decay: 1 / durBase, seed: Math.random() * 1000,
  });
  witnessPhenomenon('alien-craft');
}

// The rarest sightings of all — small, hand-drawn nods to famous space
// films. Purely a wink for anyone who recognises them; nothing mechanical
// depends on spotting one. `forceKind` lets "watch again" replay a specific
// egg instead of a random pick. `seed` is captured once here so each
// sighting's fine detail (texture, fragment layout) stays fixed for its
// whole lifetime instead of jittering randomly frame to frame.
const EASTER_EGGS = ['gargantua-tribute', 'iss-tribute', 'ad-astra-tribute', 'hail-mary-tribute',
  'gravity-tribute', 'monolith-tribute', 'mothership-tribute', 'dune-tribute',
  'wall-e-tribute', 'moon-tribute', 'star-wars-tribute', 'alien-tribute',
  // Five separate Star Wars sightings in all (the freighter above, plus these
  // four) — different ships, different scale, per explicit request. The
  // capital ships are deliberately huge and slow; the fighters are small,
  // fast, and paired/escorted for contrast.
  'star-wars-destroyer-tribute', 'star-wars-xwing-tribute', 'star-wars-tie-tribute',
  'star-wars-deathstar-tribute',
  'star-trek-tribute', 'the-martian-tribute', 'arrival-tribute', 'close-encounters-tribute'];
function spawnEasterEgg(now, forceKind) {
  const kind = forceKind || EASTER_EGGS[(Math.random() * EASTER_EGGS.length) | 0];
  const durations = {
    'gargantua-tribute': 18, 'iss-tribute': 14, 'ad-astra-tribute': 15, 'hail-mary-tribute': 14,
    'gravity-tribute': 10, 'monolith-tribute': 16, 'mothership-tribute': 16, 'dune-tribute': 15,
    'wall-e-tribute': 13, 'moon-tribute': 15, 'star-wars-tribute': 12, 'alien-tribute': 16,
    'star-wars-destroyer-tribute': 17, 'star-wars-xwing-tribute': 9, 'star-wars-tie-tribute': 9,
    'star-wars-deathstar-tribute': 18, 'star-trek-tribute': 14, 'the-martian-tribute': 15,
    'arrival-tribute': 16, 'close-encounters-tribute': 15,
  };
  const x = W * (0.22 + Math.random() * 0.56), y = H * (0.16 + Math.random() * 0.5);
  let vx = 0, vy = 0;
  if (kind === 'iss-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.12;
  else if (kind === 'mothership-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.05;
  else if (kind === 'wall-e-tribute') { vx = (Math.random() < 0.5 ? -1 : 1) * 0.1; vy = 0.02; }
  else if (kind === 'gravity-tribute') { vx = (Math.random() < 0.5 ? -1 : 1) * 0.5; vy = 0.15; }
  else if (kind === 'star-wars-destroyer-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.06;
  else if (kind === 'star-wars-deathstar-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.03;
  else if (kind === 'star-wars-xwing-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.9;
  else if (kind === 'star-wars-tie-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.85;
  else if (kind === 'star-trek-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.15;
  else if (kind === 'close-encounters-tribute') vx = (Math.random() < 0.5 ? -1 : 1) * 0.1;
  state.ambient.push({
    kind, x, y, vx, vy, life: 1, decay: 1 / durations[kind],
    seed: Math.random() * 1000, angle: Math.random() * Math.PI * 2,
  });
  witnessPhenomenon(kind);
}

function spawnAmbient(now) {
  // Every tier below is deliberately rare: idle time between visits is
  // often long enough that a session catches few of these, and the book's
  // "watch again" now covers the rest.
  const roll0 = Math.random();
  if (roll0 < 0.0006) {
    spawnBigPhenomenon(now);
    state.nextAmbientAt = now + 700 + Math.random() * 1800;
    return;
  }
  if (roll0 < 0.0018) {
    spawnTwinStreak();
    state.nextAmbientAt = now + 700 + Math.random() * 1800;
    return;
  }
  if (roll0 < 0.0026) {
    spawnAlienCraft(now);
    state.nextAmbientAt = now + 700 + Math.random() * 1800;
    return;
  }
  if (roll0 < 0.0032) {
    spawnEasterEgg(now);
    state.nextAmbientAt = now + 700 + Math.random() * 1800;
    return;
  }
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
  state.nextAmbientAt = now + 700 + Math.random() * 1800;
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
    if (a.kind === 'shooting' || a.kind === 'rare') {
      const rgb = a.kind === 'rare' ? a.color : '232, 240, 252';
      // 'rare' (the book-recorded twin streak) gets a longer tail and a
      // thicker line than an ordinary shooting star — its own multiplier
      // rather than a.vx*6, since its velocity was halved to slow it down.
      const tail = a.kind === 'rare' ? 15 : 6;
      const grad = ctx.createLinearGradient(a.x, a.y, a.x - a.vx * tail, a.y - a.vy * tail);
      grad.addColorStop(0, `rgba(${rgb}, ${fade})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = a.kind === 'rare' ? 4 : 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - a.vx * tail, a.y - a.vy * tail);
      ctx.stroke();
      if (a.kind === 'rare') {
        // A scatter of bright sparkle pixels along the tail, for a more
        // detailed look than a single gradient line.
        for (let k = 1; k <= 3; k++) {
          const f = k / 4;
          ctx.globalAlpha = fade * (1 - f) * 0.8;
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.fillRect(a.x - a.vx * tail * f - 1, a.y - a.vy * tail * f - 1, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    } else if (a.kind === 'meteor') {
      a.trail.unshift({ x: a.x, y: a.y });
      if (a.trail.length > 9) a.trail.pop();
      for (let k = 0; k < a.trail.length; k++) {
        ctx.globalAlpha = 0.68 * fade * (1 - k / a.trail.length);
        ctx.fillStyle = '#c8d4e8';
        ctx.fillRect(a.trail[k].x, a.trail[k].y, 2, 2);
      }
      ctx.globalAlpha = 0.92 * fade;
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(a.x - 1, a.y - 1, 2.5, 2.5);
    } else if (a.kind === 'meteoroid-collision') {
      // Three readable phases: two irregular rocks close in, collide in a
      // brighter multi-fragment burst, then leave a fading dust cloud —
      // instead of one flat approach-then-burst.
      if (a.life > 0.55) {
        const approach = (1 - a.life) / 0.45;
        const d = (1 - approach) * 55 + 5;
        for (const sgn of [1, -1]) {
          const rx = a.x + Math.cos(a.angle) * d * sgn, ry = a.y + Math.sin(a.angle) * d * sgn;
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#8f8478';
          ctx.fillRect(rx - 4, ry - 3, 8, 6);
          ctx.fillStyle = '#a89c8c';
          ctx.fillRect(rx - 2, ry - 4, 5, 3);
          ctx.fillStyle = '#6f6558';
          ctx.fillRect(rx + 1, ry + 1, 3, 3);
        }
      } else if (a.life > 0.2) {
        const burst = 1 - (a.life - 0.2) / 0.35;
        ctx.globalAlpha = fade;
        for (let k = 0; k < 10; k++) {
          const bang = a.angle + k * 0.63 + a.seed * 0.001;
          const br = burst * 50;
          const sz = 6 - (k % 3);
          ctx.fillStyle = k % 2 ? '#e8c8a0' : '#c8a878';
          ctx.fillRect(a.x + Math.cos(bang) * br - sz / 2, a.y + Math.sin(bang) * br - sz / 2, sz, sz);
        }
      } else {
        const t3 = 1 - a.life / 0.2;
        ctx.globalAlpha = fade * 0.5;
        for (let k = 0; k < 8; k++) {
          const bang = a.angle + k * 0.79 + a.seed * 0.001;
          const br = 50 + t3 * 25;
          ctx.fillStyle = '#8a7d6c';
          ctx.fillRect(a.x + Math.cos(bang) * br - 1.5, a.y + Math.sin(bang) * br - 1.5, 3, 3);
        }
      }
    } else if (a.kind === 'supernova') {
      const t2 = 1 - a.life;
      const core = Math.max(0, 1 - t2 * 3);
      if (core > 0) {
        // A bright plus-shaped flare instead of a flat square.
        ctx.globalAlpha = core;
        const s2 = 7 + core * 14;
        ctx.fillStyle = '#f2f6ff';
        ctx.fillRect(a.x - s2 / 2, a.y - s2 / 2, s2, s2);
        ctx.fillStyle = '#dce8ff';
        ctx.fillRect(a.x - s2 * 0.9, a.y - 2, s2 * 1.8, 4);
        ctx.fillRect(a.x - 2, a.y - s2 * 0.9, 4, s2 * 1.8);
      }
      // Two shells at different speeds and colours — a blue-white inner
      // shock and a cooler, redder outer shell, echoing a real remnant.
      ctx.globalAlpha = fade * 0.7;
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, t2 * 110, 0, Math.PI * 2);
      ctx.stroke();
      if (t2 > 0.15) {
        ctx.globalAlpha = fade * 0.4;
        ctx.strokeStyle = '#e8a878';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, (t2 - 0.15) * 80, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Ejecta: a handful of bright specks flung outward with the shock.
      if (t2 < 0.6) {
        ctx.globalAlpha = fade * 0.8;
        for (let k = 0; k < 8; k++) {
          const ang = a.seed + k * 0.79;
          const r = t2 * 95;
          ctx.fillStyle = k % 2 ? '#fff2d8' : '#cfe0ff';
          ctx.fillRect(a.x + Math.cos(ang) * r - 1, a.y + Math.sin(ang) * r - 1, 2, 2);
        }
      }
    } else if (a.kind === 'black-hole') {
      const pulse = 0.85 + 0.15 * Math.sin(now / 260);
      const ring = ctx.createRadialGradient(a.x, a.y, 15, a.x, a.y, 50 * pulse);
      ring.addColorStop(0, 'rgba(0, 0, 0, 1)');
      ring.addColorStop(0.55, `rgba(255, 170, 60, ${0.8 * fade})`);
      ring.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 50 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 17, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.kind === 'quasar') {
      // A soft halo behind a bright accretion-disk core, plus two
      // segmented jets that visibly march outward instead of a static line.
      ctx.globalAlpha = fade * 0.25;
      const glow = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, 20);
      glow.addColorStop(0, 'rgba(180, 210, 255, 0.9)');
      glow.addColorStop(1, 'rgba(180, 210, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#eaf2ff';
      ctx.fillRect(a.x - 4.5, a.y - 4.5, 9, 9);
      ctx.strokeStyle = 'rgba(200, 220, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 6.5, 0, Math.PI * 2);
      ctx.stroke();
      for (const dir of [1, -1]) {
        for (let k = 0; k < 5; k++) {
          const off = ((now / 90 + k * 14) % 65) * dir;
          ctx.globalAlpha = fade * 0.55 * (1 - Math.abs(off) / 65);
          ctx.fillStyle = '#bcd8ff';
          ctx.fillRect(a.x + Math.cos(a.angle) * off - 1.5, a.y + Math.sin(a.angle) * off - 1.5, 3, 3);
        }
      }
    } else if (a.kind === 'gamma-ray-burst') {
      // A brief, intense "prompt" flash along the beam, followed by a
      // dimmer, narrower afterglow — the burst's own real two-stage shape.
      const t2 = 1 - a.life;
      const prompt = t2 < 0.25;
      const len = prompt ? 500 : 260;
      const bx0 = a.x - Math.cos(a.angle) * len, by0 = a.y - Math.sin(a.angle) * len;
      const bx1 = a.x + Math.cos(a.angle) * len, by1 = a.y + Math.sin(a.angle) * len;
      const beamFade = prompt ? fade : fade * 0.35;
      const grad = ctx.createLinearGradient(bx0, by0, bx1, by1);
      grad.addColorStop(0, 'rgba(200, 230, 255, 0)');
      grad.addColorStop(0.5, `rgba(230, 245, 255, ${beamFade})`);
      grad.addColorStop(1, 'rgba(200, 230, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = prompt ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(bx0, by0);
      ctx.lineTo(bx1, by1);
      ctx.stroke();
      if (prompt) {
        ctx.globalAlpha = fade * (1 - t2 / 0.25) * 0.9;
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (a.kind === 'kilonova') {
      const t2 = 1 - a.life;
      const early = t2 < 0.35;
      ctx.globalAlpha = fade;
      const s2 = early ? 7 + t2 * 34 : 11;
      ctx.fillStyle = early ? '#dce6ff' : '#e8965a';
      ctx.fillRect(a.x - s2 / 2, a.y - s2 / 2, s2, s2);
      ctx.fillStyle = early ? '#f4f8ff' : '#ffc890';
      ctx.fillRect(a.x - 2, a.y - 2, 4, 4);
      if (!early) {
        ctx.globalAlpha = fade * 0.4;
        ctx.strokeStyle = '#e8965a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, (t2 - 0.35) * 78, 0, Math.PI * 2);
        ctx.stroke();
        // Heavy-element glints — a nod to the gold and platinum this kind
        // of collision is thought to actually forge.
        for (let k = 0; k < 4; k++) {
          const ang = a.seed + k * 1.6 + now / 900;
          const r = 14 + (t2 - 0.35) * 50;
          ctx.globalAlpha = fade * (0.4 + 0.3 * Math.sin(now / 200 + k));
          ctx.fillStyle = '#ffd77a';
          ctx.fillRect(a.x + Math.cos(ang) * r - 1, a.y + Math.sin(ang) * r - 1, 2, 2);
        }
      }
    } else if (a.kind === 'rogue-planet') {
      // Deliberately far more visible than a truly unlit world would be —
      // invisible defeats the point of a witnessable phenomenon. A soft
      // halo, a lit body, and a bright rim-light crescent instead of a
      // flat, near-invisible disc.
      const r = 16;
      ctx.globalAlpha = fade * 0.18;
      const halo = ctx.createRadialGradient(a.x, a.y, r * 0.6, a.x, a.y, r * 2.4);
      halo.addColorStop(0, `hsla(${a.hue}, 40%, 55%, 0.5)`);
      halo.addColorStop(1, `hsla(${a.hue}, 40%, 55%, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = `hsl(${a.hue}, 25%, 30%)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = `hsl(${a.hue}, 45%, 62%)`;
      ctx.beginPath();
      ctx.arc(a.x + r * (a.vx >= 0 ? 0.6 : -0.6), a.y - r * 0.3, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (a.kind === 'nova') {
      // A white dwarf's surface briefly reignites — smaller and quicker
      // than a supernova, no shockwave ring, just a flash that lingers.
      // A pixelated flare-cross instead of a flat square, and real novae
      // occasionally double-pulse before settling, so this one does too.
      const t2 = 1 - a.life;
      const pulse2 = t2 > 0.3 && t2 < 0.45 ? (0.45 - t2) / 0.15 : 0;
      const core = Math.max(0, 1 - t2 * 2.2) + pulse2 * 0.6;
      ctx.globalAlpha = fade;
      const s2 = 6 + core * 13;
      ctx.fillStyle = '#fff2d8';
      ctx.fillRect(a.x - s2 / 2, a.y - s2 / 2, s2, s2);
      ctx.fillStyle = '#ffe0a0';
      ctx.fillRect(a.x - s2 * 0.8, a.y - 1.5, s2 * 1.6, 3);
      ctx.fillRect(a.x - 1.5, a.y - s2 * 0.8, 3, s2 * 1.6);
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = '#e8c890';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 7 + t2 * 25, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.kind === 'pulsar-flash') {
      // A spinning neutron star's beam sweeping past — a fast strobe, not
      // a single fade, plus the faint beam line itself.
      const strobe = Math.max(0, Math.sin(now / 70));
      ctx.globalAlpha = fade * (0.25 + 0.75 * strobe);
      ctx.fillStyle = '#eaf4ff';
      ctx.fillRect(a.x - 3.5, a.y - 3.5, 7, 7);
      ctx.globalAlpha = fade * 0.28 * strobe;
      ctx.strokeStyle = '#bcd8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x - Math.cos(a.angle) * 70, a.y - Math.sin(a.angle) * 70);
      ctx.lineTo(a.x + Math.cos(a.angle) * 70, a.y + Math.sin(a.angle) * 70);
      ctx.stroke();
    } else if (a.kind === 'tidal-disruption') {
      // A star strays too close to a black hole and is stretched into a
      // glowing streak before it fades — an elongating, tilted ellipse.
      const t2 = 1 - a.life;
      const stretch = 7 + t2 * 65;
      ctx.globalAlpha = fade * 0.8;
      ctx.strokeStyle = '#ffd8b0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, stretch, Math.max(2, 9 - t2 * 7), a.angle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#fff0dc';
      ctx.fillRect(a.x - 3.5, a.y - 3.5, 7, 7);
    } else if (a.kind === 'auroral-storm') {
      // Shimmering vertical curtains, low in the sky — the only phenomenon
      // that lingers as a mood rather than a single flash. Wider, taller
      // bands and a slower shimmer to match its now much longer run.
      for (let k = 0; k < 5; k++) {
        const bx = a.x + (k - 2) * 32 + Math.sin(now / 700 + k) * 14;
        ctx.globalAlpha = fade * (0.1 + 0.08 * Math.sin(now / 550 + k * 1.3));
        ctx.fillStyle = `hsl(${a.hue}, 70%, 60%)`;
        ctx.fillRect(bx, a.y - 95, 9, 190);
      }
    } else if (a.kind === 'comet-flare') {
      // A comet's ice suddenly flashes to vapour mid-transit — like a
      // meteor, but with a coma that visibly brightens then fades, and a
      // real comet's two tails: a broad dust tail and a thinner, straighter
      // ion tail alongside it.
      a.trail.unshift({ x: a.x, y: a.y });
      if (a.trail.length > 16) a.trail.pop();
      for (let k = 0; k < a.trail.length; k++) {
        ctx.globalAlpha = 0.5 * fade * (1 - k / a.trail.length);
        ctx.fillStyle = '#dce8ff';
        ctx.fillRect(a.trail[k].x, a.trail[k].y, 4, 4);
        ctx.globalAlpha = 0.3 * fade * (1 - k / a.trail.length);
        ctx.fillStyle = '#a8c8ff';
        ctx.fillRect(a.trail[k].x - a.vy * 1.6, a.trail[k].y + a.vx * 1.6, 2, 2);
      }
      const flare = Math.sin(Math.PI * (1 - a.life));
      ctx.globalAlpha = fade;
      const s2 = 5 + flare * 16;
      ctx.fillStyle = '#eaf2ff';
      ctx.fillRect(a.x - s2 / 2, a.y - s2 / 2, s2, s2);
      ctx.fillStyle = '#c8e0ff';
      ctx.fillRect(a.x - 1.5, a.y - 1.5, 3, 3);
      if (flare > 0.4) {
        ctx.globalAlpha = fade * flare * 0.4;
        ctx.strokeStyle = '#bcd8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, flare * 30, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (a.kind === 'alien-craft') {
      // A drifting, blinking visitor — silhouette varies by style, size by
      // a.scale. Faces its direction of travel and bobs gently.
      ctx.save();
      ctx.translate(a.x, a.y + Math.sin(now / 500 + a.seed) * 3);
      ctx.scale(a.vx < 0 ? -a.scale : a.scale, a.scale);
      ctx.globalAlpha = fade;
      const bodyColor = '#8a94a8', bodyDark = '#5c6478', glow = '#bcd8ff';
      if (a.style === 'saucer') {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-9, -2, 18, 3);
        ctx.fillStyle = bodyDark;
        ctx.fillRect(-5, -5, 10, 3);
        ctx.fillStyle = glow;
        ctx.fillRect(-1.5, -6, 3, 3);
      } else if (a.style === 'cylinder') {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-11, -2.5, 22, 5);
        ctx.fillStyle = bodyDark;
        ctx.fillRect(-11, -2.5, 4, 5);
        ctx.fillRect(7, -2.5, 4, 5);
      } else if (a.style === 'wing') {
        ctx.fillStyle = bodyColor;
        ctx.fillRect(-2, -1.5, 4, 3);
        ctx.fillStyle = bodyDark;
        ctx.fillRect(-10, 0, 8, 2);
        ctx.fillRect(2, 0, 8, 2);
      } else {
        ctx.fillStyle = bodyDark;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-10, 5);
        ctx.lineTo(10, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = glow;
        ctx.fillRect(-1, 2, 2, 2);
      }
      // Blinking running lights — a slow colour chase, quietly alien
      // rather than a standard aircraft red/green pair.
      for (let k = 0; k < 3; k++) {
        const phase = (now / 260 + k * 2.1 + a.seed) % 6.28;
        const b = Math.max(0, Math.sin(phase));
        if (b > 0.4) {
          ctx.globalAlpha = fade * b;
          ctx.fillStyle = k === 0 ? '#ff9a7a' : k === 1 ? '#9affc0' : '#9ac8ff';
          ctx.fillRect(-9 + k * 9, 3, 2, 2);
        }
      }
      ctx.restore();
    } else if (a.kind === 'gargantua-tribute') {
      // A colossal, warped black hole — a nod to a certain 2014 film's most
      // famous shot, right down to a tiny craft dwarfed by it.
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = '#ffdca8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, 46, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(a.x, a.y - 16, 30, 8, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 15, 0, Math.PI * 2);
      ctx.fill();
      const cxp = a.x + Math.sin(now / 4000 + a.seed) * 60, cyp = a.y + 30;
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = '#cfd8e8';
      ctx.fillRect(cxp - 3, cyp - 1, 6, 2);
    } else if (a.kind === 'iss-tribute') {
      // A modular outpost with solar wings — quietly orbiting since 1998.
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(Math.sin(now / 3000) * 0.08);
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#c8ceda';
      ctx.fillRect(-9, -1.5, 18, 3);
      ctx.fillStyle = '#3a5aa0';
      ctx.fillRect(-16, -5, 6, 10);
      ctx.fillRect(10, -5, 6, 10);
      ctx.fillStyle = '#e8ecf4';
      ctx.fillRect(-3, -3, 6, 6);
      ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(now / 300));
      ctx.fillStyle = '#ff8a5a';
      ctx.fillRect(-1, -1, 1.5, 1.5);
      ctx.restore();
    } else if (a.kind === 'ad-astra-tribute') {
      // An antenna array vast enough to hear the edge of the solar system,
      // and a lone figure drifting near it.
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = '#9aa8c0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 22, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + 20);
      ctx.lineTo(a.x, a.y + 4);
      ctx.stroke();
      ctx.fillStyle = '#cfd8e8';
      ctx.fillRect(a.x - 2, a.y + 18, 4, 4);
      const ax = a.x + 34, ay = a.y - 6 + Math.sin(now / 800 + a.seed) * 4;
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = '#e8ecf4';
      ctx.fillRect(ax - 1.5, ay - 3, 3, 5);
      ctx.fillRect(ax - 1.5, ay - 5, 3, 3);
    } else if (a.kind === 'hail-mary-tribute') {
      // Two ships from very different worlds, sitting side by side.
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = '#c8ceda';
      ctx.fillRect(a.x - 26, a.y - 3, 14, 6);
      ctx.fillStyle = '#5c6478';
      ctx.fillRect(a.x - 24, a.y - 5, 4, 3);
      ctx.fillStyle = '#7ac89a';
      ctx.beginPath();
      ctx.ellipse(a.x + 20, a.y, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4f8a6a';
      ctx.beginPath();
      ctx.ellipse(a.x + 20, a.y, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const p = 0.4 + 0.6 * Math.abs(Math.sin(now / 400));
      ctx.globalAlpha = fade * p * 0.7;
      ctx.strokeStyle = '#ffe8a0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x - 12, a.y);
      ctx.lineTo(a.x + 11, a.y);
      ctx.stroke();
    } else if (a.kind === 'gravity-tribute') {
      // Fast, chaotic debris, and a lone figure tumbling helplessly through it.
      ctx.globalAlpha = fade * 0.7;
      for (let k = 0; k < 7; k++) {
        const ang = a.seed + k * 0.9;
        const dx = Math.cos(ang) * (10 + k * 3), dy = Math.sin(ang) * (6 + k * 2);
        ctx.fillStyle = k % 2 ? '#9aa4b5' : '#6c7488';
        ctx.fillRect(a.x + dx - 1.5, a.y + dy - 1.5, 3, 3);
      }
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(now / 500 + a.seed);
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#e8ecf4';
      ctx.fillRect(-1.5, -4, 3, 6);
      ctx.fillRect(-1.5, -6, 3, 3);
      ctx.restore();
    } else if (a.kind === 'monolith-tribute') {
      // A featureless slab, suspiciously exact proportions, perfectly still.
      // Fill is a cool charcoal rather than true black — true black nearly
      // vanished against the background gradient, which defeats a slab
      // that's supposed to be unmistakable.
      const pulse = 0.5 + 0.5 * Math.sin(now / 1400);
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = '#181c26';
      ctx.fillRect(a.x - 6, a.y - 20, 12, 40);
      ctx.globalAlpha = fade * (0.35 + 0.3 * pulse);
      ctx.strokeStyle = '#8aa0d0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x - 6, a.y - 20, 12, 40);
    } else if (a.kind === 'mothership-tribute') {
      // Something enormous, sliding slowly, blotting out a city's worth of stars.
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#04060a';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, 90, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.35;
      ctx.strokeStyle = '#4a5a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, 90, 26, 0, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 5; k++) {
        ctx.globalAlpha = fade * (0.3 + 0.5 * Math.sin(now / 260 + k * 1.4));
        ctx.fillStyle = '#ff8a4a';
        ctx.fillRect(a.x - 60 + k * 30, a.y + 10, 2, 2);
      }
    } else if (a.kind === 'dune-tribute') {
      // A pale desert world under two slowly orbiting moons.
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#c8945a';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a8703c';
      for (let k = 0; k < 6; k++) {
        const yy = a.y - 14 + k * 5;
        ctx.fillRect(a.x - 16 + (k % 2) * 3, yy, 14, 2);
      }
      for (const m of [{ r: 34, sp: 900, s: 3 }, { r: 46, sp: 1400, s: 2.5 }]) {
        const ang = now / m.sp + a.seed;
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle = '#d8d0c0';
        ctx.beginPath();
        ctx.arc(a.x + Math.cos(ang) * m.r, a.y + Math.sin(ang) * m.r * 0.4, m.s, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (a.kind === 'wall-e-tribute') {
      // A small boxy robot, still tending something green against every odd.
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#c8a858';
      ctx.fillRect(a.x - 5, a.y - 4, 10, 8);
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(a.x - 4, a.y - 7, 3, 3);
      ctx.fillRect(a.x + 1, a.y - 7, 3, 3);
      ctx.fillStyle = '#8ad4ff';
      ctx.fillRect(a.x - 3.5, a.y - 6.5, 2, 2);
      ctx.fillRect(a.x + 1.5, a.y - 6.5, 2, 2);
      ctx.fillStyle = '#5cb86c';
      ctx.fillRect(a.x + 6, a.y - 1, 2, 3);
      ctx.fillRect(a.x + 7, a.y - 3, 2, 3);
    } else if (a.kind === 'moon-tribute') {
      // A lonely lunar base — and for a moment, two of the same person.
      ctx.globalAlpha = fade * 0.85;
      ctx.fillStyle = '#8a8a90';
      ctx.fillRect(a.x - 40, a.y + 6, 80, 4);
      ctx.fillStyle = '#c8ccd8';
      ctx.beginPath();
      ctx.arc(a.x - 10, a.y + 2, 8, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(now / 400));
      ctx.fillStyle = '#ffd88a';
      ctx.fillRect(a.x - 11, a.y - 2, 2, 2);
      for (const fx of [8, 16]) {
        const bob = Math.sin(now / 300 + fx) * 1.5;
        ctx.globalAlpha = fade * 0.9;
        ctx.fillStyle = '#e8ecf4';
        ctx.fillRect(a.x + fx - 1, a.y + 2 + bob, 2, 4);
        ctx.fillRect(a.x + fx - 1, a.y + bob, 2, 2);
      }
    } else if (a.kind === 'star-wars-tribute') {
      // A saucer-shaped freighter that hangs still a moment too long, then
      // blurs into a streak of light and is gone.
      const t2 = 1 - a.life;
      const jumping = t2 > 0.85;
      ctx.globalAlpha = fade * 0.9;
      if (!jumping) {
        ctx.fillStyle = '#b8bcc8';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a7e8c';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y - 3, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9ac8ff';
        ctx.fillRect(a.x - 1, a.y - 3, 2, 2);
      } else {
        const stretch = (t2 - 0.85) / 0.15;
        ctx.globalAlpha = fade * (1 - stretch);
        ctx.strokeStyle = '#cfe0ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x - stretch * 140, a.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
      }
    } else if (a.kind === 'alien-tribute') {
      // A horseshoe-shaped wreck, cold and silent — and something inside,
      // still faintly warm.
      ctx.globalAlpha = fade * 0.85;
      ctx.strokeStyle = '#5a6070';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 20, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.globalAlpha = fade * (0.15 + 0.15 * Math.sin(now / 900));
      ctx.fillStyle = '#8a3a3a';
      ctx.beginPath();
      ctx.arc(a.x, a.y - 20, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.kind === 'star-wars-destroyer-tribute') {
      // A wedge-shaped capital ship, seemingly endless — deliberately huge
      // and slow, engines glowing along its trailing edge.
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.vx < 0 ? -1 : 1, 1);
      ctx.globalAlpha = fade * 0.92;
      ctx.fillStyle = '#7a8090';
      ctx.beginPath();
      ctx.moveTo(-70, 0);
      ctx.lineTo(50, -22);
      ctx.lineTo(50, 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#565c6c';
      ctx.beginPath();
      ctx.moveTo(-70, 0);
      ctx.lineTo(30, -10);
      ctx.lineTo(30, 10);
      ctx.closePath();
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = fade * (0.5 + 0.4 * Math.sin(now / 200 + k));
        ctx.fillStyle = '#8ac8ff';
        ctx.fillRect(-74, -8 + k * 8, 4, 3);
      }
      ctx.restore();
    } else if (a.kind === 'star-wars-xwing-tribute') {
      // A small fighter, wings split into an X, cannon-tips glowing.
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.vx < 0 ? -1 : 1, 1);
      ctx.globalAlpha = fade * 0.95;
      ctx.fillStyle = '#d8dce4';
      ctx.fillRect(-7, -1.5, 14, 3);
      ctx.fillStyle = '#9aa2b0';
      ctx.fillRect(2, -6, 8, 2);
      ctx.fillRect(2, 4, 8, 2);
      ctx.fillRect(-6, -6, 8, 2);
      ctx.fillRect(-6, 4, 8, 2);
      ctx.fillStyle = '#ff5a4a';
      for (const ty of [-7, -5, 5, 7]) ctx.fillRect(10, ty, 1.5, 1.5);
      ctx.fillStyle = '#8ac8ff';
      ctx.fillRect(-9, -1, 2, 2);
      ctx.restore();
    } else if (a.kind === 'star-wars-tie-tribute') {
      // A pair of fighters with hexagonal wing panels, screaming past in
      // formation — TIEs almost always travel in twos.
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.vx < 0 ? -1 : 1, 1);
      ctx.globalAlpha = fade * 0.9;
      for (const oy of [-7, 7]) {
        ctx.fillStyle = '#4a4e58';
        ctx.fillRect(-3, oy - 5, 3, 10);
        ctx.fillRect(6, oy - 5, 3, 10);
        ctx.fillStyle = '#8a90a0';
        ctx.beginPath();
        ctx.arc(3, oy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8a5a';
        ctx.fillRect(2, oy - 1, 2, 2);
      }
      ctx.restore();
    } else if (a.kind === 'star-wars-deathstar-tribute') {
      // A sphere far too round, far too artificial — one great dish set
      // into its surface. Huge, ominous, and barely moving.
      ctx.globalAlpha = fade * 0.92;
      ctx.fillStyle = '#8a8e98';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6a6e78';
      ctx.beginPath();
      ctx.arc(a.x, a.y, 46, Math.PI, Math.PI * 1.5);
      ctx.fill();
      ctx.fillStyle = '#3a3e48';
      ctx.beginPath();
      ctx.arc(a.x - 16, a.y - 14, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a8e98';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a.x - 16, a.y - 14, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade * (0.15 + 0.15 * Math.sin(now / 700));
      ctx.fillStyle = '#7affb0';
      ctx.beginPath();
      ctx.arc(a.x - 16, a.y - 14, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.4;
      ctx.strokeStyle = '#50545e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x - 46, a.y + 4);
      ctx.lineTo(a.x + 46, a.y + 4);
      ctx.stroke();
    } else if (a.kind === 'star-trek-tribute') {
      // A saucer and hull with twin nacelles, cruising on a heading toward
      // nowhere in particular.
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.vx < 0 ? -1 : 1, 1);
      ctx.globalAlpha = fade * 0.92;
      ctx.fillStyle = '#dfe4ee';
      ctx.beginPath();
      ctx.ellipse(-4, -2, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8cedc';
      ctx.fillRect(4, -1, 16, 2);
      for (const oy of [-6, 6]) {
        ctx.globalAlpha = fade * 0.92;
        ctx.fillStyle = '#aab4c8';
        ctx.fillRect(14, oy - 1.5, 12, 3);
        ctx.globalAlpha = fade * (0.5 + 0.5 * Math.sin(now / 260));
        ctx.fillStyle = '#8ecfff';
        ctx.fillRect(25, oy - 1, 2, 2);
      }
      ctx.restore();
    } else if (a.kind === 'the-martian-tribute') {
      // A rover crossing rust-red ground, and something impossibly green
      // growing in its shadow.
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#a8552e';
      ctx.fillRect(a.x - 44, a.y + 8, 88, 6);
      ctx.fillStyle = '#8a4324';
      ctx.fillRect(a.x - 44, a.y + 8, 88, 2);
      ctx.fillStyle = '#d8d0c0';
      ctx.fillRect(a.x - 6, a.y - 2, 12, 6);
      ctx.fillStyle = '#403830';
      ctx.fillRect(a.x - 6, a.y + 4, 3, 3);
      ctx.fillRect(a.x + 3, a.y + 4, 3, 3);
      ctx.fillStyle = '#c8c0b0';
      ctx.fillRect(a.x - 1, a.y - 8, 1.5, 6);
      ctx.globalAlpha = fade * (0.7 + 0.3 * Math.sin(now / 500));
      ctx.fillStyle = '#5cb86c';
      ctx.fillRect(a.x - 10, a.y + 4, 2, 3);
      ctx.fillRect(a.x - 12, a.y + 6, 2, 2);
    } else if (a.kind === 'arrival-tribute') {
      // A vast dark shell, hovering in perfect silence, mist pooling
      // beneath it — offering no answers yet.
      const bob = Math.sin(now / 900 + a.seed) * 2;
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#1c2026';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + bob, 20, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.3;
      ctx.strokeStyle = '#5a6a80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + bob, 20, 34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fade * 0.2;
      ctx.fillStyle = '#8a9cb0';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 38, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.kind === 'close-encounters-tribute') {
      // A craft strung with lights, blinking out a simple five-note
      // phrase and waiting politely for a reply.
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = '#8a94a8';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c8ceda';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y - 4, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const active = Math.floor(now / 350) % 5;
      const colors = ['#ff8a5a', '#ffd85a', '#8aff9a', '#5ac8ff', '#c88aff'];
      for (let k = 0; k < 5; k++) {
        const lx = a.x - 12 + k * 6;
        ctx.globalAlpha = fade * (k === active ? 1 : 0.15);
        ctx.fillStyle = colors[k];
        ctx.fillRect(lx, a.y + 5, 2.5, 2.5);
      }
    } else {
      a.spin += dt / 900;
      ctx.globalAlpha = 0.55 * fade;
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
  // Backing-store resolution is DPR-scaled for crisp Retina rendering, but
  // the canvas must be told to DISPLAY at the logical CSS size — otherwise
  // on any DPR>1 screen it renders at its raw pixel dimensions (literally
  // twice too big at DPR=2), which looks exactly like broken, off-centre
  // framing no matter how correct the camera math is.
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

// Re-frame whatever's currently focused whenever the window changes shape —
// moving the browser to a smaller display, resizing it, or rotating a
// tablet all change how much room is actually available, so a zoom picked
// for one window size can otherwise leave things cut off or crammed into
// a corner on another.
let resizeDebounce = null;
window.addEventListener('resize', () => {
  resize();
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(reapplyFocus, 180);
});

function w2s(x, y) {
  const s = BASE * cam.z;
  return { x: (x - cam.x) * s + W / 2, y: (y - cam.y) * s + H / 2 };
}

function clampCam() {
  // The low end is intentionally extreme (~0.3%) — zoomed all the way out,
  // everything ever built shrinks to a speck in a mostly-empty viewport,
  // which is the point: it's honest about how much of the universe is
  // still dark. fitCompleted()'s own "Home" framing has a much gentler
  // floor, so this only matters for deliberate manual zooming.
  camTarget.z = Math.min(14, Math.max(0.003, camTarget.z));
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

// --- Viewport-aware framing --------------------------------------------
//
// Fixed pixel guesses (assume a 1440-wide desktop, assume the info panel
// takes 300px) look fine on a big monitor and break on a smaller laptop
// window, where the sidebar and info panel eat a much bigger share of the
// space. Everything below measures the ACTUAL current window and panel
// visibility instead, so framing adapts to whatever size the browser
// happens to be — including after it's resized or moved to another
// display, via reapplyFocus() below.

const SIDEBAR_W = 230;
const INFO_PANEL_W = 320; // panel width + its right-edge margin

// The screen-space rectangle actually free for content: excludes the
// atlas sidebar (if open) and, when the caller says the info panel is
// about to be shown, its width too.
function visibleRect(reserveInfoPanel) {
  const left = $('sidebar').classList.contains('hidden') ? 0 : SIDEBAR_W;
  const right = W - (reserveInfoPanel ? INFO_PANEL_W : 0);
  return { left, right, top: 80, bottom: H - 170, w: Math.max(160, right - left), h: Math.max(160, H - 250) };
}

// Centre a world point in the middle of whatever's actually visible right
// now — not the literal window centre, which on a narrow window can sit
// partly behind the sidebar or an open info panel.
function flyToCentered(x, y, z, reserveInfoPanel) {
  const r = visibleRect(reserveInfoPanel);
  const cxPx = (r.left + r.right) / 2, cyPx = (r.top + r.bottom) / 2;
  const s = BASE * z;
  flyTo(x - (cxPx - W / 2) / s, y - (cyPx - H / 2) / s, z);
}

// A sensible close-up zoom for a single body: fill about half of whichever
// dimension (width or height) is more constrained, so a tall-narrow window
// doesn't get the same zoom as a wide one and end up overshooting.
function closeUpZoom(st, reserveInfoPanel) {
  if (st.zoom) return st.zoom;
  if (st.kind === 'ring' || st.kind === 'field') return 0.5;
  const r = visibleRect(reserveInfoPanel);
  const fill = Math.min(r.w, r.h) * 0.5;
  return Math.min(9, Math.max(2.2, fill / (st.R * 2 * BASE)));
}

// Home: frame everything that has been built so far, with generous margin.
// A naive tight bounding box lets a single large body (the Sun) dominate
// the frame while small ones get pushed to the very edge — so we pad
// each body proportionally, add an overall margin, and floor the zoom
// so a couple of small objects don't get zoomed in on tightly either.
function fitCompleted() {
  state.focus = { kind: 'home' };
  const target = targetBlocks();
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  let any = false;
  for (const st of UNI.structures) {
    if (target <= st.start) continue;
    any = true;
    if (st.kind === 'field') {
      minx = Math.min(minx, 150); maxx = Math.max(maxx, 2300);
      miny = Math.min(miny, 150); maxy = Math.max(maxy, 1800);
      continue;
    }
    const pos = posOf(st);
    const pad = st.R * 0.5 + 10;
    minx = Math.min(minx, pos.x - st.R - pad); maxx = Math.max(maxx, pos.x + st.R + pad);
    miny = Math.min(miny, pos.y - st.R - pad); maxy = Math.max(maxy, pos.y + st.R + pad);
  }
  if (!any || !isFinite(minx)) return flyToCentered(HOME.x, HOME.y, HOME.z, false);

  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const MARGIN = 1.7;  // extra breathing room so nothing sits flush at an edge
  const MIN_SPAN = 240; // never zoom in tight even for just one or two small bodies
  const spanW = Math.max((maxx - minx) * MARGIN, MIN_SPAN);
  const spanH = Math.max((maxy - miny) * MARGIN, MIN_SPAN * 0.6);
  const r = visibleRect(false);
  const z = Math.min(1.6, Math.max(0.18, Math.min(r.w / (spanW * BASE), r.h / (spanH * BASE))));
  flyToCentered(cx, cy, z, false);
}

// Re-run whatever the camera was last focused on, at the current window
// size. Called after a resize settles.
function reapplyFocus() {
  if (!state.focus) return;
  if (state.focus.kind === 'home') { fitCompleted(); return; }
  const st = byName.get(state.focus.name);
  if (!st) return;
  const z = closeUpZoom(st, state.infoPinned);
  const pos = posOf(st);
  flyToCentered(pos.x, pos.y, z, state.infoPinned);
}

$('zoomIn').onclick = () => zoomAt(W / 2, H / 2, 1.45);
$('zoomOut').onclick = () => zoomAt(W / 2, H / 2, 1 / 1.45);
$('zoomReset').onclick = fitCompleted;

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
            state.focus = { kind: 'loc', name: st.name };
            flyToCentered(st.cx, st.cy, parseFloat(params.get('z')) || closeUpZoom(st, false), false);
            Object.assign(cam, camTarget);
          }
        } else {
          // Start already framed to whatever's unlocked, sized to this
          // window — instead of a fixed zoom that might not fit.
          fitCompleted();
          Object.assign(cam, camTarget);
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
      li.onmouseenter = () => { if (!state.infoPinned) showInfo(s); };
      li.onmouseleave = () => { if (!state.infoPinned) hideInfo(); };
      li.onclick = (e) => {
        e.stopPropagation();
        state.infoPinned = true;
        showInfo(s);
        if (locationState(s) !== 'locked') {
          state.focus = { kind: 'loc', name: s.name };
          const z = closeUpZoom(s, true);
          const pos = posOf(s);
          flyToCentered(pos.x, pos.y, z, true);
        }
      };
      list.appendChild(li);
    }
  }
}

// --- Info panel (right side): description + real stats, hover or click ----

function showInfo(s) {
  const st = locationState(s);
  $('infoTitle').textContent = cap(s.name);
  const target = targetBlocks();
  const statusEl = $('infoStatus');
  if (st === 'done') {
    statusEl.textContent = '✦ fully formed';
    statusEl.className = 'done';
  } else if (st === 'building') {
    const pct = (((target - s.start) / s.count) * 100).toFixed(1);
    statusEl.textContent = `● under construction — ${pct}% built`;
    statusEl.className = 'building';
  } else {
    const needed = (s.start + 1) * ENERGY_PER_BLOCK - totalEnergy();
    statusEl.textContent = `🔒 not yet formed — ${fmt(Math.max(1, needed))} energy until construction begins`;
    statusEl.className = 'locked';
  }
  $('infoFact').textContent = s.fact || '';
  const dl = $('infoStats');
  dl.innerHTML = '';
  const stats = STATS[s.name] || {};
  for (const [k, v] of Object.entries(stats)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  $('infoPanel').classList.add('show');
}

function hideInfo() {
  const was = state.infoPinned;
  state.infoPinned = false;
  $('infoPanel').classList.remove('show');
  if (was) reapplyFocus(); // reclaim the screen space the panel was using
}

$('infoClose').onclick = hideInfo;
// Clicking anywhere outside the atlas/panel dismisses a pinned panel.
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#infoPanel') && !e.target.closest('#locationList')) hideInfo();
});

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
    // City lights blinking on the night side, and an occasional lightning
    // flash over the oceans.
    if (s > 3) {
      const cities = [[-6, 3], [4, -5], [-3, -6], [7, 2], [-8, -2]];
      for (const [dx, dy] of cities) {
        const p = w2s(e.x + dx, e.y + dy);
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 3 + dx * 7);
        ctx.fillStyle = '#ffdf9a';
        ctx.fillRect(p.x, p.y, Math.max(1, s * 0.3), Math.max(1, s * 0.3));
      }
      ctx.globalAlpha = 1;
    }
    const flashCyc = (t + 6) % 11;
    if (flashCyc < 0.25 && s > 2) {
      const fr = mulberry32(Math.floor(t / 11));
      const p = w2s(e.x + (fr() - 0.5) * earth.R * 1.4, e.y + (fr() - 0.5) * earth.R * 1.4);
      ctx.globalAlpha = (1 - flashCyc / 0.25) * 0.8;
      ctx.fillStyle = '#f2f6ff';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(2, s * 0.5), Math.max(2, s * 0.5));
      ctx.globalAlpha = 1;
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
    // A tiny rover trundling a slow loop near the landing site.
    const rc = t % 24;
    const rp = w2s(m.x - 1.5 + Math.cos(rc / 24 * Math.PI * 2) * 1.5, m.y + Math.sin(rc / 24 * Math.PI * 2) * 1);
    ctx.fillStyle = '#d8d8d0';
    ctx.fillRect(rp.x, rp.y, Math.max(1, s * 0.35), Math.max(1, s * 0.35));
  }

  const mars = byName.get('Mars');
  if (mars && structDone(mars)) {
    const m = posOf(mars);
    if (s > 5) {
      const p = w2s(m.x + 3, m.y + mars.R - 1);
      ctx.fillStyle = '#dfe8f4';
      ctx.fillRect(p.x, p.y, s * 1.2, s * 0.7);                        // rover body
      ctx.fillStyle = '#5a6474';
      ctx.fillRect(p.x - s * 0.2, p.y + s * 0.7, s * 1.6, s * 0.35);   // wheels
      ctx.fillRect(p.x + s * 0.4, p.y - s * 0.6, s * 0.2, s * 0.6);    // mast
    }
    // A dust devil wandering the surface every ~20s.
    const cyc = t % 20;
    if (cyc < 6) {
      const wx = m.x - mars.R + (cyc / 6) * mars.R * 2;
      const wy = m.y + Math.sin(cyc * 3) * 2;
      if (Math.hypot(wx - m.x, wy - m.y) < mars.R - 1) {
        const p = w2s(wx, wy);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#d8b48a';
        ctx.fillRect(p.x, p.y - s, Math.max(1.5, s * 0.6), s * 1.6);
        ctx.globalAlpha = 1;
      }
    }
    // A larger, rarer dust storm occasionally veils half the disc.
    const stormCyc = t % 90;
    if (stormCyc < 14 && s > 1.5) {
      const veil = Math.sin((stormCyc / 14) * Math.PI);
      const p = w2s(m.x - mars.R * 0.3, m.y);
      ctx.globalAlpha = veil * 0.35;
      ctx.fillStyle = '#c89468';
      ctx.beginPath();
      ctx.arc(p.x, p.y, mars.R * s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // The Sun: arcing prominences, wandering sunspots, and rare bright flares.
  const sun = byName.get('the Sun');
  if (sun && structDone(sun)) {
    const cyc = t % 17;
    if (cyc < 2.5) {
      const baseAng = Math.floor(t / 17) * 2.4;
      const rise = Math.sin((cyc / 2.5) * Math.PI);
      for (let k = 0; k < 4; k++) {
        const ang = baseAng + k * 0.09;
        const rad = sun.R + 1 + rise * (2.5 + k * 1.2);
        const p = w2s(SUN.x + Math.cos(ang) * rad, SUN.y + Math.sin(ang) * rad);
        ctx.globalAlpha = 0.7 * rise;
        ctx.fillStyle = k < 2 ? '#ffcf7a' : '#e8a94f';
        ctx.fillRect(p.x - s / 2, p.y - s / 2, Math.max(2, s), Math.max(2, s));
      }
      ctx.globalAlpha = 1;
    }
    if (s > 1) {
      for (let i = 0; i < 2; i++) {
        const ang = t * 0.04 + i * 2.8;
        const rad = sun.R * (0.35 + i * 0.2);
        const p = w2s(SUN.x + Math.cos(ang) * rad, SUN.y + Math.sin(ang) * rad * 0.9);
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#b8792f';
        ctx.fillRect(p.x - s * 0.6, p.y - s * 0.6, Math.max(2, s * 1.2), Math.max(2, s * 1.2));
      }
      ctx.globalAlpha = 1;
    }
    const flareCyc = t % 23;
    if (flareCyc < 0.6) {
      const seed = Math.floor(t / 23);
      const fr = mulberry32(seed);
      const ang = fr() * Math.PI * 2;
      const p = w2s(SUN.x + Math.cos(ang) * sun.R * 0.7, SUN.y + Math.sin(ang) * sun.R * 0.7);
      const bright = 1 - flareCyc / 0.6;
      ctx.globalAlpha = bright;
      ctx.fillStyle = '#fffbe8';
      const r2 = Math.max(2, s) * (1 + (1 - bright) * 2);
      ctx.fillRect(p.x - r2 / 2, p.y - r2 / 2, r2, r2);
      ctx.globalAlpha = 1;
    }
  }

  // Mercury: a meteorite impact flash, plus the day/night terminator creeping by.
  const mercury = byName.get('Mercury');
  if (mercury && structDone(mercury)) {
    const m = posOf(mercury);
    const cyc = t % 13;
    if (cyc < 0.9) {
      const seed = Math.floor(t / 13);
      const ang = seed * 2.7, rad = mercury.R * 0.55;
      const p = w2s(m.x + Math.cos(ang) * rad, m.y + Math.sin(ang) * rad);
      const flash = 1 - cyc / 0.9;
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#fff2d8';
      ctx.fillRect(p.x - s / 2, p.y - s / 2, Math.max(2, s), Math.max(2, s));
      ctx.globalAlpha = flash * 0.5;
      ctx.strokeStyle = '#fff2d8';
      const r2 = Math.max(3, s) * (1.6 - flash);
      ctx.strokeRect(p.x - r2, p.y - r2, r2 * 2, r2 * 2);
      ctx.globalAlpha = 1;
    }
    if (s > 2) {
      const termX = (((t * 0.6) % (mercury.R * 4)) - mercury.R * 2);
      const p = w2s(m.x + termX, m.y);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#1a1410';
      ctx.fillRect(p.x, p.y - mercury.R * s, Math.max(1.5, s * 0.5), mercury.R * s * 2);
      ctx.globalAlpha = 1;
    }
  }

  // Venus: a pale cloud band sweeping across the disc, plus flickers of
  // lightning inside its thick sulfuric-acid clouds.
  const venus = byName.get('Venus');
  if (venus && structDone(venus) && s > 2) {
    const v = posOf(venus);
    const sweepX = ((t * 1.1) % (venus.R * 2 + 8)) - venus.R - 4;
    for (let dy = -venus.R + 2; dy <= venus.R - 2; dy += 2) {
      if (Math.hypot(sweepX, dy) > venus.R - 0.5) continue;
      const p = w2s(v.x + sweepX, v.y + dy);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#f4ecc8';
      ctx.fillRect(p.x, p.y, Math.max(1.5, s * 0.8), Math.max(1.5, s * 1.6));
    }
    ctx.globalAlpha = 1;
    const boltCyc = t % 6.5;
    if (boltCyc < 0.15) {
      const fr = mulberry32(Math.floor(t / 6.5));
      const p = w2s(v.x + (fr() - 0.5) * venus.R * 1.3, v.y + (fr() - 0.5) * venus.R * 1.3);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff8dc';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(2, s * 0.5), Math.max(2, s * 0.5));
      ctx.globalAlpha = 1;
    }
  }

  // Jupiter: Io and Europa orbit at different speeds; the Great Red Spot shimmers.
  const jupiter = byName.get('Jupiter');
  if (jupiter && structDone(jupiter)) {
    const j = posOf(jupiter);
    const moons = [
      { rad: jupiter.R + 5, sp: 0.7, ph: 0, c: '#e8c86a', sz: 0.8 },   // Io
      { rad: jupiter.R + 9, sp: 0.42, ph: 1.6, c: '#d8c8a0', sz: 0.7 }, // Europa
    ];
    for (const mn of moons) {
      const a = t * mn.sp + mn.ph;
      const p = w2s(j.x + Math.cos(a) * mn.rad, j.y + Math.sin(a) * mn.rad * 0.4);
      ctx.fillStyle = mn.c;
      const px = Math.max(2, s * mn.sz);
      ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
    }
    if (s > 1.5) {
      const p = w2s(j.x + 11, j.y + 12);
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 1.6);
      ctx.fillStyle = '#e87a4a';
      ctx.fillRect(p.x - s, p.y - s * 0.6, s * 2, s * 1.2);
      ctx.globalAlpha = 1;
    }
  }

  // Saturn: a glint travelling the rings, plus the hexagonal polar storm pulsing.
  const saturn = byName.get('Saturn');
  if (saturn && structDone(saturn)) {
    const sa = posOf(saturn);
    const a = t * 0.5;
    const p = w2s(sa.x + Math.cos(a) * (saturn.R + 14), sa.y + Math.sin(a) * 2.6);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = '#f2ecd8';
    ctx.fillRect(p.x - 1, p.y - 1, Math.max(2, s * 0.7), Math.max(2, s * 0.7));
    ctx.globalAlpha = 1;
    if (s > 1.5) {
      const hp = w2s(sa.x, sa.y - saturn.R * 0.65);
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 1.4);
      ctx.strokeStyle = '#7fd8c8';
      ctx.lineWidth = 1;
      const hr = Math.max(2, s * 1.4);
      ctx.strokeRect(hp.x - hr, hp.y - hr * 0.7, hr * 2, hr * 1.4);
      ctx.globalAlpha = 1;
    }
  }

  // Uranus: a slow polar aurora, plus a faint glint on its own (real, dim) rings.
  const uranus = byName.get('Uranus');
  if (uranus && structDone(uranus) && s > 1.5) {
    const u = posOf(uranus);
    const p = w2s(u.x + uranus.R - 1, u.y);
    ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 1.2);
    ctx.fillStyle = '#bff0e8';
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    ctx.globalAlpha = 1;
    const ra = t * 0.3;
    const rp = w2s(u.x + Math.cos(ra) * (uranus.R + 6), u.y + Math.sin(ra) * (uranus.R + 6));
    ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 4);
    ctx.fillStyle = '#dff2ee';
    ctx.fillRect(rp.x - 1, rp.y - 1, Math.max(1.5, s * 0.4), Math.max(1.5, s * 0.4));
    ctx.globalAlpha = 1;
  }

  // Neptune: Triton orbiting backwards, a faster inner moon streaking by,
  // and the storm brightening.
  const neptune = byName.get('Neptune');
  if (neptune && structDone(neptune)) {
    const n = posOf(neptune);
    const a = -t * 0.35; // retrograde, like the real Triton
    const p = w2s(n.x + Math.cos(a) * (neptune.R + 4), n.y + Math.sin(a) * (neptune.R + 4) * 0.5);
    ctx.fillStyle = '#d8e4f0';
    const px = Math.max(2, s * 0.7);
    ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
    const a2 = t * 1.4;
    const p2 = w2s(n.x + Math.cos(a2) * (neptune.R + 2.5), n.y + Math.sin(a2) * (neptune.R + 2.5) * 0.45);
    ctx.fillStyle = '#a8c0e0';
    const px2 = Math.max(1.5, s * 0.4);
    ctx.fillRect(p2.x - px2 / 2, p2.y - px2 / 2, px2, px2);
    if (s > 2) {
      const sp = w2s(n.x - 2, n.y - 5);
      ctx.globalAlpha = 0.2 + 0.2 * Math.sin(t * 2.2);
      ctx.fillStyle = '#eef4fc';
      ctx.fillRect(sp.x, sp.y, s * 4, s);
      ctx.globalAlpha = 1;
    }
  }

  // --- More company: real spacecraft (and one deliberately unreal visitor)
  // --- for locations that only had environmental effects until now.

  // Mercury: a MESSENGER/BepiColombo-style probe in a slow, tight orbit.
  if (mercury && structDone(mercury) && s > 2) {
    const m = posOf(mercury);
    const a = t * 0.9;
    const p = w2s(m.x + Math.cos(a) * (mercury.R + 4), m.y + Math.sin(a) * (mercury.R + 4) * 0.4);
    const px = Math.max(1.5, s * 0.6);
    ctx.fillStyle = '#d8dce8';
    ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
    if (s > 4) {
      ctx.fillStyle = '#6a7aa0';
      ctx.fillRect(p.x - px * 1.6, p.y - px * 0.2, px, px * 0.4);
      ctx.fillRect(p.x + px * 0.6, p.y - px * 0.2, px, px * 0.4);
    }
  }

  // Venus: a lander's glint on the surface, briefly visible through gaps
  // in the clouds — real landers survived only minutes in the real thing.
  if (venus && structDone(venus) && s > 2) {
    const v = posOf(venus);
    const cyc = (t + 3) % 40;
    if (cyc < 5) {
      const p = w2s(v.x - venus.R * 0.3, v.y + venus.R * 0.35);
      ctx.globalAlpha = (0.4 + 0.3 * Math.sin(t * 8)) * Math.min(1, cyc, 5 - cyc);
      ctx.fillStyle = '#f2d89a';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(1.5, s * 0.5), Math.max(1.5, s * 0.5));
      ctx.globalAlpha = 1;
    }
  }

  // Earth: a UFO. Purely for fun — nothing else here claims to be real.
  if (earth && structDone(earth) && s > 1) {
    const e = posOf(earth);
    const cyc = t % 47;
    if (cyc < 4) {
      const prog = cyc / 4;
      const wx = e.x - earth.R * 3 + prog * earth.R * 6;
      const wy = e.y - earth.R * 2.4 + Math.sin(prog * Math.PI * 3) * 3;
      const p = w2s(wx, wy);
      const px = Math.max(2, s * 1.1);
      ctx.fillStyle = '#8fe0d8';
      ctx.fillRect(p.x - px, p.y - px * 0.3, px * 2, px * 0.6);
      ctx.fillStyle = '#e8fff8';
      ctx.fillRect(p.x - px * 0.35, p.y - px * 0.7, px * 0.7, px * 0.4);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20);
      ctx.fillStyle = '#c8fff0';
      ctx.fillRect(p.x - px * 1.1, p.y + px * 0.2, px * 0.3, px * 0.3);
      ctx.fillRect(p.x + px * 0.8, p.y + px * 0.2, px * 0.3, px * 0.3);
      ctx.globalAlpha = 1;
    }
  }

  // The Moon: the lunar module sitting near the flag.
  if (moon && structDone(moon) && s > 5) {
    const m = posOf(moon);
    const p = w2s(m.x - 1.5, m.y - moon.R - 0.5);
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(p.x - s * 0.5, p.y - s * 0.4, s, s * 0.6);
    ctx.fillStyle = '#a89880';
    ctx.fillRect(p.x - s * 0.65, p.y + s * 0.15, s * 0.3, s * 0.25);
    ctx.fillRect(p.x + s * 0.4, p.y + s * 0.15, s * 0.3, s * 0.25);
  }

  // Mars: Ingenuity, the real Mars helicopter, hopping briefly near the rover.
  if (mars && structDone(mars) && s > 5) {
    const m = posOf(mars);
    const cyc = t % 22;
    if (cyc < 6) {
      const hop = Math.sin((cyc / 6) * Math.PI);
      const p = w2s(m.x + 4, m.y + mars.R - 1 - hop * 3);
      ctx.fillStyle = '#e8d090';
      ctx.fillRect(p.x - s * 0.25, p.y - s * 0.2, s * 0.5, s * 0.35);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(p.x - s * 0.5, p.y - s * 0.3, s, s * 0.08);
      ctx.globalAlpha = 1;
    }
  }

  // Jupiter: Juno, in a long looping polar orbit far out from the cloud tops.
  if (jupiter && structDone(jupiter) && s > 1) {
    const j = posOf(jupiter);
    const a = t * 0.22;
    const p = w2s(j.x + Math.cos(a) * (jupiter.R + 16) * 0.3, j.y + Math.sin(a) * (jupiter.R + 16));
    const px = Math.max(1.5, s * 0.5);
    ctx.fillStyle = '#e0e4ec';
    ctx.fillRect(p.x - px / 2, p.y - px / 2, px, px);
  }

  // Saturn: Cassini's 2017 "Grand Finale" dive into the planet, replayed occasionally.
  if (saturn && structDone(saturn) && s > 1) {
    const sa = posOf(saturn);
    const cyc = t % 55;
    if (cyc < 4) {
      const prog = cyc / 4;
      const p = w2s(sa.x + saturn.R * 2.2 * (1 - prog * 1.3), sa.y - saturn.R * 1.6 * (1 - prog));
      ctx.globalAlpha = Math.min(1, 4 - cyc);
      ctx.fillStyle = '#e8eef8';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(1.5, s * 0.5), Math.max(1.5, s * 0.5));
      ctx.globalAlpha = 1;
    }
  }

  // Uranus and Neptune: Voyager 2, the only spacecraft ever to visit either,
  // its real 1986 and 1989 flybys echoed as a slow one-off streak each.
  if (uranus && structDone(uranus) && s > 1) {
    const u = posOf(uranus);
    const cyc = (t + 10) % 60;
    if (cyc < 8) {
      const prog = cyc / 8;
      const p = w2s(u.x - uranus.R * 3 + prog * uranus.R * 6, u.y + uranus.R * 2);
      ctx.fillStyle = '#dfe8f4';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(1.5, s * 0.5), Math.max(1.5, s * 0.5));
    }
  }
  if (neptune && structDone(neptune) && s > 1) {
    const n = posOf(neptune);
    const cyc = (t + 40) % 60;
    if (cyc < 8) {
      const prog = cyc / 8;
      const p = w2s(n.x - neptune.R * 3 + prog * neptune.R * 6, n.y - neptune.R * 2);
      ctx.fillStyle = '#dfe8f4';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(1.5, s * 0.5), Math.max(1.5, s * 0.5));
    }
  }

  // Pluto: New Horizons' historic 2015 flyby.
  const pluto = byName.get('Pluto');
  if (pluto && structDone(pluto) && s > 3) {
    const pl = posOf(pluto);
    const cyc = t % 50;
    if (cyc < 6) {
      const prog = cyc / 6;
      const p = w2s(pl.x - pluto.R * 3 + prog * pluto.R * 6, pl.y - pluto.R * 1.5);
      ctx.fillStyle = '#eaf0fa';
      ctx.fillRect(p.x - 1, p.y - 1, Math.max(1.5, s * 0.5), Math.max(1.5, s * 0.5));
    }
  }

  // The asteroid belt: Ceres, its largest member, tumbling slowly around the Sun.
  const asteroidBelt = byName.get('the asteroid belt');
  if (asteroidBelt && structDone(asteroidBelt) && s > 1) {
    const a = t * 0.06;
    const wx = SUN.x + Math.cos(a) * 330, wy = SUN.y + Math.sin(a) * 330 * 0.6;
    const p = w2s(wx, wy);
    const px = Math.max(2, s * 1.2);
    ctx.fillStyle = '#a8a094';
    ctx.beginPath();
    ctx.arc(p.x, p.y, px, 0, Math.PI * 2);
    ctx.fill();
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

  drawSpecks(t, s);

  // Orbit paths: tilted ellipses through each begun planet.
  const target = targetBlocks();
  const sunS = w2s(SUN.x, SUN.y);
  ctx.strokeStyle = 'rgba(110, 150, 220, 0.1)';
  ctx.lineWidth = 1;
  for (const [name, o] of ORBIT) {
    if (o.parent) continue;
    const st = byName.get(name);
    if (target <= st.start) continue;
    const rx = o.dist * s, ry = o.dist * o.squash * s;
    if (rx < 8 || rx > Math.hypot(W, H) * 3) continue;
    ctx.beginPath();
    ctx.ellipse(sunS.x, sunS.y, rx, ry, 0, 0, Math.PI * 2);
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
      ctx.globalAlpha = 0.35 * (1 - k / sp.trail.length);
      ctx.fillStyle = sp.color;
      const sz = 3 - k * 0.3;
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    const p = w2s(sp.x, sp.y);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = sp.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // Assembly shards: five small boxes converging into the block's cell.
  for (const a of state.assemblies) {
    const k = Math.min(1, a.t / a.dur);
    const ease = 1 - (1 - k) * (1 - k);
    for (const f of a.frags) {
      const wx = f.x0 + (a.cx - f.x0) * ease;
      const wy = f.y0 + (a.cy - f.y0) * ease;
      const p = w2s(wx, wy);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      ctx.globalAlpha = 0.4 + 0.5 * k;
      ctx.fillStyle = f.color;
      const sz = Math.max(1.5, s * 0.45) * (1 - k * 0.3);
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
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
  const pct = cam.z * 100;
  $('zoomPct').textContent = (pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)) + '%';

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
    $('structLabel').textContent = 'every location fully built';
    $('structFill').style.width = '100%';
    $('beginAgainBtn').classList.add('show');
    return;
  }
  $('beginAgainBtn').classList.remove('show');
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
    // Whole-structure completion (e.g. Earth overall).
    const pct = ((target - st.start) / st.count) * 100;
    $('structLabel').textContent = `${cap(st.name)} · ${pct.toFixed(1)}% built`;
    $('structFill').style.width = Math.max(2, pct) + '%';
  }
}

// ---------------------------------------------------------------------------
// Controls + boot
// ---------------------------------------------------------------------------

$('sidebarToggle').onclick = () => {
  $('sidebar').classList.toggle('hidden');
  reapplyFocus(); // the atlas taking/freeing space changes what "centred" means
};

// --- Pace switching: rebuild the world at the new scale (lossless) ---------

function setPace(name) {
  if (!PACES[name] || name === paceName) return;
  paceName = name;
  localStorage.setItem('pace', name);
  ENERGY_PER_BLOCK = PACES[name].epb;
  state.sparks = [];
  state.assemblies = [];
  state.twinklers = [];
  state.flashes = [];
  state.budget = 0;
  gctx.clearRect(0, 0, WB, HB);
  for (const st of UNI.structures) { st.sprited = false; st.sprite = null; }
  state.placed = Math.max(0, targetBlocks() - 80);
  for (let i = 0; i < state.placed; i++) stamp(blockAt(i));
  spritifyDone();
  lastAtlasKey = '';
  renderLocations();
  updatePaceButtons();
  toast(`Pace: ${name} — ${PACES[name].blurb}`);
}

function updatePaceButtons() {
  for (const b of document.querySelectorAll('#paceCtl button')) {
    b.classList.toggle('active', b.dataset.pace === paceName);
  }
}

for (const b of document.querySelectorAll('#paceCtl button')) {
  b.onclick = () => setPace(b.dataset.pace);
}
updatePaceButtons();

// --- Personalization: an optional name for this universe -----------------

let ownerName = (localStorage.getItem('ownerName') || '').slice(0, 24);
$('ownerName').value = ownerName;

// Builds the one composed title used everywhere (sidebar, HUD, tab title,
// download filename) so they can never drift out of sync with each other.
function composedTitle() {
  let t = 'Idle Cosmos';
  if (ownerName) t += `: ${ownerName}’s Universe`;
  if (cycleNumber > 1) t += ` · Cycle ${cycleNumber}`;
  return t;
}

function updateBranding() {
  const title = composedTitle();
  $('brandTitle').textContent = title;
  $('universeName').textContent = title;
  document.title = title;
}

let ownerNameSaveTimer = null;
$('ownerName').addEventListener('input', (e) => {
  ownerName = e.target.value.trim().slice(0, 24);
  clearTimeout(ownerNameSaveTimer);
  ownerNameSaveTimer = setTimeout(() => {
    localStorage.setItem('ownerName', ownerName);
    updateBranding();
  }, 500);
});
$('ownerName').addEventListener('blur', () => {
  localStorage.setItem('ownerName', ownerName);
  updateBranding();
});
$('ownerName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur();
});

updateBranding();

$('snapBtn').onclick = () => {
  const a = document.createElement('a');
  const slug = composedTitle().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  a.download = `${slug}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('📸 Universe saved as an image');
};

// --- Achievement Book: a private, silent record of rare cosmic phenomena
// --- you happen to witness. It never lists what you haven't seen yet —
// --- the point is discovering them, not checking them off a list.

const PHENOMENA = {
  'twin-streak': { name: 'A Double Omen', desc: 'Two shooting stars crossed the sky together, oddly coloured.', replay: () => spawnTwinStreak() },
  'meteoroid-collision': { name: 'A Collision', desc: 'Two meteoroids struck each other in the dark, scattering debris.' },
  supernova: { name: 'A Star Died', desc: 'A distant star ended its life in a brilliant supernova.' },
  'black-hole': { name: 'A Black Hole', desc: 'Spacetime itself tore open for a moment, then closed again.' },
  quasar: { name: 'A Quasar', desc: 'A galactic core blazed with the light of a trillion suns.' },
  'gamma-ray-burst': { name: 'A Gamma-Ray Burst', desc: 'The most energetic explosion known lit the sky for an instant.' },
  kilonova: { name: 'A Kilonova', desc: 'Two neutron stars collided, forging gold and platinum in the flash.' },
  'rogue-planet': { name: 'A Rogue Planet', desc: 'A starless world drifted silently through the dark.' },
  nova: { name: 'A Nova', desc: "A white dwarf's stolen hydrogen ignited in a sudden flash, then dimmed." },
  'pulsar-flash': { name: "A Pulsar's Beam", desc: 'A spinning neutron star swept its beam past like a lighthouse.' },
  'tidal-disruption': { name: 'A Star, Torn Apart', desc: 'A wandering star strayed too close to a black hole and was stretched into a glowing streak.' },
  'auroral-storm': { name: 'An Auroral Storm', desc: 'Charged particles met a magnetic field, and the sky itself began to glow.' },
  'comet-flare': { name: "A Comet's Outburst", desc: "A comet's ice flashed to vapour, and it burned brighter for a moment." },
  'alien-craft': { name: 'An Unidentified Craft', desc: 'Something with running lights, and clearly not one of ours, drifted past and kept going.' },
  // A dozen small, hand-drawn nods to famous space films — the rarest
  // sightings in the whole book. Each name deliberately avoids trademarked
  // titles or ship names; if you recognise it, that's the point.
  'gargantua-tribute': { name: 'A Warped Horizon', desc: 'A colossal black hole bent its own accretion disk impossibly around itself — and for a moment, something small and metallic drifted past its light.' },
  'iss-tribute': { name: 'A Modular Outpost', desc: "A cluster of modules and solar wings caught the light, exactly where a certain outpost has quietly orbited since 1998." },
  'ad-astra-tribute': { name: 'The Loneliest Signal', desc: 'A lone figure drifted near an antenna array vast enough to hear the edge of the solar system, waiting on a reply that takes a long time to come.' },
  'hail-mary-tribute': { name: 'An Unlikely Handshake', desc: 'Two ships from very different worlds sat side by side and, improbably, began to talk.' },
  'gravity-tribute': { name: 'Silence, Then Debris', desc: "A cloud of high-speed debris tumbled past — and for one heart-stopping moment, so did someone who'd lost their tether." },
  'monolith-tribute': { name: 'A Perfect Black Rectangle', desc: 'A featureless slab hung in the dark, its proportions suspiciously exact. It did not respond to hailing.' },
  'mothership-tribute': { name: 'A Shadow Larger Than the Moon', desc: "Something enormous slid across the starfield, blotting out a city's worth of stars, and then was gone." },
  'dune-tribute': { name: 'Two Moons Over Dunes', desc: 'A pale desert world turned slowly under two moons, and something vast moved beneath its sand.' },
  'wall-e-tribute': { name: 'A Small Robot, A Small Plant', desc: 'A boxy little robot drifted by, clutching something green and growing — tending it against every odd.' },
  'moon-tribute': { name: 'Two of the Same Face', desc: 'A lonely lunar base blinked its lights, and just for a moment, there seemed to be two of the same person walking outside.' },
  'star-wars-tribute': { name: 'A Familiar Silhouette', desc: 'A saucer-shaped freighter hung still a moment too long, then blurred into a streak of light and was gone.' },
  'alien-tribute': { name: 'A Derelict, and Something Waiting', desc: 'A horseshoe-shaped wreck drifted, cold and silent — and deep inside, something in a leathery egg was not quite dead.' },
  'star-wars-destroyer-tribute': { name: 'A Wedge Against the Stars', desc: 'A wedge-shaped capital ship slid past, seemingly endless, engines glowing along its full length.' },
  'star-wars-xwing-tribute': { name: 'Four Wings, Locked Open', desc: 'A small fighter streaked by, its wings split into an X, cannon-tips glowing.' },
  'star-wars-tie-tribute': { name: 'A Screaming Pair', desc: 'Two fighters with hexagonal wing panels shrieked past in formation, gone as fast as they came.' },
  'star-wars-deathstar-tribute': { name: 'A Moon That Should Not Be', desc: 'A sphere far too round, far too artificial, hung in the dark — one great dish set into its surface like a hollow eye.' },
  'star-trek-tribute': { name: 'Where No One Has Gone Before', desc: 'A saucer, twin nacelles trailing blue light, cruised past on a five-year heading toward nowhere in particular.' },
  'the-martian-tribute': { name: 'A Garden in the Rust', desc: 'A lone rover crossed a rust-red plain, and something impossibly green was growing in its shadow.' },
  'arrival-tribute': { name: 'A Shell, Standing on End', desc: 'A vast dark shell hovered in perfect silence, mist pooling beneath it, offering no answers yet.' },
  'close-encounters-tribute': { name: 'Five Notes, Answered', desc: 'A craft strung with lights descended, blinking out a simple five-note phrase, and waited politely for a reply.' },
  reborn: { name: 'Cooling', desc: 'A universe completed, and a new one began.' },
};

let witnessed = JSON.parse(localStorage.getItem('witnessed') || '[]'); // [{id, at}]
let witnessedIds = new Set(witnessed.map((w) => w.id));

function witnessPhenomenon(id) {
  const p = PHENOMENA[id];
  if (!p) return;
  if (!witnessedIds.has(id)) {
    witnessedIds.add(id);
    witnessed.push({ id, at: Date.now() });
    localStorage.setItem('witnessed', JSON.stringify(witnessed));
    updateBookButton();
  }
  showPhenomenonBanner(p.name); // announced every time — seeing it is the reward
}

// Two separate books share the same underlying `witnessed` record — the
// achievement book covers everything except film tributes, the film reel
// covers only EASTER_EGGS. Split by filtering, not by separate storage.
function updateBookButton() {
  const rest = witnessed.filter((w) => !EASTER_EGGS.includes(w.id));
  const movies = witnessed.filter((w) => EASTER_EGGS.includes(w.id));
  $('bookBtn').textContent = rest.length ? `📖 ${rest.length}` : '📖';
  $('movieBookBtn').textContent = movies.length ? `🎬 ${movies.length}` : '🎬';
}
updateBookButton();

let bannerTimer = null;
function showPhenomenonBanner(name) {
  const el = $('phenomenonBanner');
  el.textContent = `✦ ${name}`;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// Plays the exact visual for something already in the book again, on
// demand — for when it happened while the screen sat idle and unwatched.
// Doesn't touch the recorded date or add a duplicate entry.
function replayPhenomenon(id) {
  if (!PHENOMENA[id]) return;
  $('bookPanel').classList.remove('show');
  $('movieBookPanel').classList.remove('show');
  if (id === 'twin-streak') spawnTwinStreak();
  else if (id === 'alien-craft') spawnAlienCraft(performance.now());
  else if (BIG_PHENOMENA.includes(id)) spawnBigPhenomenon(performance.now(), id);
  else if (EASTER_EGGS.includes(id)) spawnEasterEgg(performance.now(), id);
}

function isReplayable(id) {
  return id === 'twin-streak' || id === 'alien-craft' || BIG_PHENOMENA.includes(id) || EASTER_EGGS.includes(id);
}

function renderBookList(listEl, entries) {
  listEl.innerHTML = '';
  for (const w of [...entries].sort((a, b) => b.at - a.at)) {
    const p = PHENOMENA[w.id];
    if (!p) continue;
    const when = new Date(w.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const replayable = isReplayable(w.id);
    const li = document.createElement('li');
    li.innerHTML = `<span class="bname">${p.name}<span class="bwhen">${when}</span></span><div class="bdesc">${p.desc}</div>` +
      (replayable ? `<button class="breplay" data-id="${w.id}">watch again</button>` : '');
    listEl.appendChild(li);
  }
}

function renderBook() {
  const entries = witnessed.filter((w) => !EASTER_EGGS.includes(w.id));
  $('bookIntro').textContent = entries.length
    ? 'A record of rare things you happened to see.'
    : 'Nothing recorded yet. The universe is full of rare things — keep watching.';
  renderBookList($('bookList'), entries);
}

function renderMovieBook() {
  const entries = witnessed.filter((w) => EASTER_EGGS.includes(w.id));
  $('movieBookIntro').textContent = entries.length
    ? 'Small nods to space films, spotted along the way.'
    : "Nothing recorded yet. There's more out there than the achievement book covers — keep watching.";
  renderBookList($('movieBookList'), entries);
}

$('bookBtn').onclick = () => {
  renderBook();
  $('bookPanel').classList.toggle('show');
};
$('bookClose').onclick = () => $('bookPanel').classList.remove('show');
$('bookList').addEventListener('click', (e) => {
  const btn = e.target.closest('.breplay');
  if (btn) replayPhenomenon(btn.dataset.id);
});

$('movieBookBtn').onclick = () => {
  renderMovieBook();
  $('movieBookPanel').classList.toggle('show');
};
$('movieBookClose').onclick = () => $('movieBookPanel').classList.remove('show');
$('movieBookList').addEventListener('click', (e) => {
  const btn = e.target.closest('.breplay');
  if (btn) replayPhenomenon(btn.dataset.id);
});

// --- Cyclic reset: once everything unlockable is fully built, the universe
// --- can "cool" and a new one begins — a real endgame instead of just
// --- stopping, and a reason for "eventually" to mean something twice.
// --- Meta-progress (the achievement book, lifetime totals) carries over;
// --- only the built structures reset, redrawn from a new seed so the new
// --- universe looks subtly different.

function beginNewCycle() {
  const oldTitle = composedTitle();
  cycleStartEnergy = totalEnergy();
  cycleNumber += 1;
  localStorage.setItem('cycleStartEnergy', String(cycleStartEnergy));
  localStorage.setItem('cycleNumber', String(cycleNumber));

  UNI = buildSequence(cycleSeedFor(cycleNumber));
  byName = new Map(UNI.structures.map((s) => [s.name, s]));

  gctx.clearRect(0, 0, WB, HB);
  state.placed = 0;
  state.sparks = [];
  state.assemblies = [];
  state.twinklers = [];
  state.flashes = [];
  state.budget = 0;
  lastAtlasKey = '';
  renderLocations();
  updateBranding();
  $('beginAgainBtn').classList.remove('show');

  state.focus = { kind: 'home' };
  fitCompleted();
  Object.assign(cam, camTarget);

  witnessPhenomenon('reborn');
  toast(`🌑 ${oldTitle} cools into stardust. ${composedTitle()} begins.`);
}
$('beginAgainBtn').onclick = beginNewCycle;

// --- "Go to what's building" — jumps straight to the active construction site ---

function flyToActive() {
  const target = targetBlocks();
  if (target >= UNI.total) { toast('Everything unlocked so far is fully built.'); return; }
  const info = blockAt(target);
  if (!info) return;
  const st = info.s;
  state.focus = { kind: 'loc', name: st.name };
  const z = closeUpZoom(st, true);
  const pos = posOf(st);
  flyToCentered(pos.x, pos.y, z, true);
  state.infoPinned = true;
  showInfo(st);
}
$('goToActive').onclick = flyToActive;

// --- Formula panel: shows exactly how tokens become energy become blocks ---

function renderFormula() {
  const cur = currentSession();
  const w = FORMULA_WEIGHTS;
  $('formulaWeights').innerHTML = `
    <dt>Output tokens</dt><dd>× ${w.output} <span class="why">(Claude's actual work — weighted heaviest)</span></dd>
    <dt>Input tokens</dt><dd>× ${w.input} <span class="why">(your prompts and files)</span></dd>
    <dt>Cache writes</dt><dd>× ${w.cacheCreate} <span class="why">(new context being remembered)</span></dd>
    <dt>Cache reads</dt><dd>× ${w.cacheRead} <span class="why">(cheap re-reads; would dwarf the rest otherwise)</span></dd>
  `;
  $('formulaPace').textContent =
    `${cap(paceName)} pace: ${ENERGY_PER_BLOCK.toLocaleString()} energy = 1 block (${PACES[paceName].blurb})`;
  if (cur) {
    const t = cur.tokens;
    const e = cur.energy;
    const blocks = Math.floor(e / ENERGY_PER_BLOCK);
    $('formulaExample').innerHTML = `
      <strong>Your current session, worked out:</strong><br>
      ${t.input.toLocaleString()} input × ${w.input} + ${t.output.toLocaleString()} output × ${w.output} +
      ${t.cacheCreate.toLocaleString()} cache-write × ${w.cacheCreate} + ${t.cacheRead.toLocaleString()} cache-read × ${w.cacheRead}<br>
      = <strong>${Math.round(e).toLocaleString()} energy</strong> ÷ ${ENERGY_PER_BLOCK.toLocaleString()} per block
      = <strong>${blocks.toLocaleString()} blocks</strong>
    `;
  } else {
    $('formulaExample').textContent = 'No session data yet.';
  }
}

$('formulaBtn').onclick = () => {
  renderFormula();
  $('formulaPanel').classList.toggle('show');
};
$('formulaClose').onclick = () => $('formulaPanel').classList.remove('show');
// Keep it live while open — a snapshot taken once would silently go stale
// if you leave the panel open while Claude keeps working.
setInterval(() => { if ($('formulaPanel').classList.contains('show')) renderFormula(); }, 2000);

fetch('/api/config').then((r) => r.json()).then((cfg) => {
  if (cfg.weights) FORMULA_WEIGHTS = cfg.weights;
  baselineEnergy = cfg.baselineEnergy || 0;
}).catch(() => {
  // Server unreachable — fall back to 0 rather than staying null forever,
  // so the page doesn't get stuck refusing to build anything.
  baselineEnergy = 0;
});

// --- Auto-reload when the app's own files change on disk, so an already- ---
// --- open tab never keeps running stale code after an edit.             ---

let knownVersion = null;
async function checkVersion() {
  try {
    const r = await fetch('/api/version');
    const { mtime } = await r.json();
    if (knownVersion === null) { knownVersion = mtime; return; }
    if (mtime !== knownVersion) {
      toast('✨ Updated — reloading…');
      setTimeout(() => location.reload(), 1200);
    }
  } catch { /* server briefly restarting — ignore, try again next tick */ }
}
setInterval(checkVersion, 6000);
checkVersion();

// On a phone-width screen the fixed 230px sidebar eats most of the view —
// start with the atlas tucked away so the universe itself is visible; the
// hamburger button still opens it on demand.
if (window.innerWidth < 700) $('sidebar').classList.add('hidden');

resize();
connect();
requestAnimationFrame(frame);
