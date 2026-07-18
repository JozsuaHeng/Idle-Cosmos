# Idle Cosmos

A cosmos built slowly, one token at a time.

Every token Claude consumes — across **all** your Claude Code sessions —
pools into cosmic energy that slowly reconstructs our real cosmic
neighbourhood as pixel art: the Sun (core → radiative zone → convective
zone → photosphere), then Earth built layer by geological layer (inner
core, outer core, mantles, crust, oceans, atmosphere), the Moon, the
planets, Halley's Comet, the asteroid and Kuiper belts, Voyager 1, the
Oort Cloud, real nearby stars, nebulae, galaxies, black holes, quasars,
the Cosmic Microwave Background — all the way out to the Laniakea
Supercluster, the vast structure our own galaxy belongs to.

It's also a little educational atlas: every location (including ones that
haven't formed yet, shown greyed-out with a lock) carries a real astronomy
fact and a stats table. Completed worlds earn embellishments — satellites,
the ISS and launching rockets around Earth, a flag and lunar module on the
Moon, a rover and Ingenuity helicopter on Mars, Cassini's real 2017 dive
into Saturn, Voyager 2's flybys of Uranus and Neptune, New Horizons at
Pluto, and (the one non-real addition) an occasional UFO over Earth.

## Once you've built everything

When every unlockable location is fully formed, the universe can **cool
and begin again** — a fresh cycle, reseeded so it looks subtly different,
while your achievement book and lifetime totals carry over. There's no
real ceiling; it's a cosmos, not a checklist.

## The achievement book

While it builds, rare things occasionally cross the sky — shooting stars
and meteors most of the time, but very occasionally something special:
a supernova, a black hole, a quasar, a gamma-ray burst, a kilonova, a
meteoroid collision, a rogue planet drifting through. Each is recorded
the first time you see it in a private **Achievement Book** (📖) — it
never lists what you haven't found yet, so there's always more to
stumble onto.

## Personalize it

Type a name in the sidebar and the universe becomes "Idle Cosmos:
*Yourname*'s Universe" — everywhere: the sidebar, the HUD, the browser
tab, even the filename when you save a screenshot.

## How the "connection" works (and why it's safe)

Claude Code keeps a log of every session on your Mac at
`~/.claude/projects/`, including exact token counts. This app just
**reads those local files** — no API key, no login, no data leaving your
computer.

## Every install starts from zero

If you already have months of Claude Code history before you ever run this,
your universe does **not** unlock instantly. The very first time you start
the server, it quietly notes down how much energy already existed in your
logs and treats that as the starting line — only tokens you spend *after*
that count toward building anything. So whether you're brand new to Claude
Code or have a huge history already, everyone's universe begins the same
way: empty, and growing from here.

## The numbers

- Energy = input tokens ×1 + output ×3 + cache-writes ×1 + cache-reads ×0.08
  (`WEIGHTS` in `server.js`, served to the page via `/api/config` so it's
  never hand-duplicated).
- Three paces in the sidebar — **Patient** (the default, slow burn),
  **Steady**, and **Eager** — just change how much energy one block costs.
  Same tokens, same universe, just how much of it is currently revealed.
  Switching is lossless.
- The HUD shows this session's tokens and your all-time total.

## Controls

Drag to pan · scroll or pinch to zoom (all the way out to 0.3%, to see how
small everything you've built really is) · zoom control bottom-right ·
◎ jumps to whatever's currently under construction · click atlas locations
to fly there (and read their fact) · ⓘ shows exactly how tokens become
energy become blocks, live · `?goto=Earth&z=8` deep-links · 📸 saves a PNG.

## Running it

```bash
node server.js       # http://localhost:4816
```

With the hook installed, any prompt in any Claude Code session starts the
server and opens the page automatically (only if no tab is already open).
An already-open tab also auto-reloads within a few seconds if the app's own
files change on disk, so it never runs stale code indefinitely.

**Uninstall the hook:** remove the `UserPromptSubmit` entry pointing at
`token-universe/hooks/open-universe.sh` from `~/.claude/settings.json`.

**Stop the server:** `kill $(lsof -ti tcp:4816)`
