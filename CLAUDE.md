# Idle Cosmos (token-universe)

A local web app that turns Claude Code token usage into ONE slowly-built
pixel model of the real known universe. Every session's tokens pool into
"cosmic energy" (`ENERGY_PER_BLOCK` in `public/app.js`, three selectable
paces — Patient/Steady/Eager); blocks assemble the Sun and planets
core-outward with real geological layers, then belts, named stars, deep-sky
objects (nebulae, galaxies, black holes, the CMB), all the way out to the
Laniakea Supercluster. Once everything unlockable is fully built, the
universe can "cool" and a new cycle begins from a new seed (`beginNewCycle`)
— meta-progress (the achievement book, lifetime totals) carries over.

## How it works

- `server.js` — zero-dependency Node server on `http://localhost:4816`. It
  **reads** (never writes) Claude Code's own session logs in
  `~/.claude/projects/**/*.jsonl`, tallies token usage per session, and
  streams live updates over Server-Sent Events. No API keys, no outbound
  network calls, nothing leaves the machine. Also serves `/api/config`
  (the real token→energy weights, so the client never hand-duplicates them)
  and `/api/version` (lets an already-open tab detect file changes and
  auto-reload instead of running stale code indefinitely).
- `public/` — the universe page. Canvas-based, fully deterministic: a fixed
  base seed (XORed with the cycle number) drives every RNG call, so the
  same cycle always rebuilds pixel-identical. Camera framing
  (`visibleRect`, `flyToCentered`, `fitCompleted`) measures the *actual*
  current window/panel state rather than fixed pixel guesses, and re-fits
  on resize — this was a real bug once (see git log), not a hypothetical.
- `hooks/open-universe.sh` — a Claude Code `UserPromptSubmit` hook that
  starts the server if needed and opens the page only if no tab is already
  connected. Installed in `~/.claude/settings.json` (user-level).
- `baseline.json` — **machine-local, gitignored, never commit it.** Written
  once, the very first time `server.js` ever runs on a given machine: it
  freezes whatever token energy already existed in that machine's Claude
  Code logs as `baselineEnergy`. `targetBlocks()` only counts energy earned
  *after* that point (see `ensureBaseline()` in server.js and `baselineEnergy`
  in app.js). Without this, cloning the repo onto a machine with a long
  Claude Code history would instantly unlock most of the universe instead of
  starting at zero. If you ever need to reset a dev machine to "fresh
  install" behaviour, delete `baseline.json` and restart the server.

## Notable systems

- **Pace** (`PACES`): Patient/Steady/Eager just change `ENERGY_PER_BLOCK`;
  switching is lossless since everything derives from real token totals.
- **Achievement book** (`PHENOMENA`, `witnessPhenomenon`): rare ambient sky
  events (supernova, black hole, quasar, GRB, kilonova, rogue planet,
  meteoroid collision, the "twin streak" rarity, and cycle completion) are
  silently recorded to `localStorage` on first sighting. The book UI
  (📖 button) never lists undiscovered entries — by design, don't add a
  "here's everything you can find" list.
- **Personalization**: an optional name composes into the title everywhere
  via `composedTitle()` — never hardcode "Idle Cosmos" elsewhere; call that
  function instead so cycle number / owner name stay in sync.
- **Ornaments** (`drawOrnaments`): real spacecraft/rovers per body (Ingenuity
  at Mars, Voyager 2 at Uranus+Neptune, Cassini's Grand Finale at Saturn,
  etc.), plus one deliberate non-real one (a UFO at Earth).

## Design constraints

- Zero npm dependencies; only Node built-ins.
- Keep CPU/GPU use light: the placed-block grid renders once to an offscreen
  canvas, only twinklers/ambient events/ornaments animate per frame, the
  loop idles when the tab is hidden, and it respects `prefers-reduced-motion`.
- Background specks (`drawSpecks`) are procedural/infinite via a hash
  function, not a fixed pre-seeded array — needed so they're still visible
  at extreme zoom-out (down to 0.3%) instead of only existing within the
  built world's fixed bounds.
- Mobile: sidebar starts collapsed under 700px width; see the `@media`
  block in `style.css` for panel-overlap fixes specific to narrow screens.

## Running manually

```
node server.js         # then visit http://localhost:4816
```
