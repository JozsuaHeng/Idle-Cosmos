# 🌌 Everything, Eventually

A cosmos built slowly, one token at a time.

Every token Claude consumes — across **all** your Claude Code sessions —
pools into cosmic energy that slowly reconstructs our real cosmic
neighbourhood as pixel art: the Sun (core → radiative zone → convective
zone → photosphere), then Earth built layer by geological layer (inner
core, outer core, mantles, crust, oceans, atmosphere), the Moon, the
planets, Halley's Comet, the asteroid and Kuiper belts, Voyager 1, the
Oort Cloud, real nearby stars, the Milky Way's field of stars — and one
day, the Andromeda Galaxy.

It's also a little educational atlas: every location (including ones that
haven't formed yet, shown greyed-out with a lock) carries a real
astronomy fact. Completed worlds earn embellishments — satellites, the
ISS and launching rockets around Earth, a flag on the Moon, a rover on
Mars.

## How the "connection" works (and why it's safe)

Claude Code keeps a log of every session on your Mac at
`~/.claude/projects/`, including exact token counts. This app just
**reads those local files** — no API key, no login, no data leaving your
computer.

## The numbers

- Energy = input tokens ×1 + output ×3 + cache-writes ×1 + cache-reads ×0.08
- **~22,000 energy = 1 block** (`ENERGY_PER_BLOCK` in `public/app.js`) —
  building is deliberately slow; a planet takes days of real usage.
- The HUD shows this session's tokens and your all-time total.

## Controls

Drag to pan · scroll or pinch to zoom · zoom control bottom-right ·
click atlas locations to fly there (and read their fact) ·
`?goto=Earth&z=8` deep-links · 📸 saves a PNG.

## Running it

```bash
node server.js       # http://localhost:4816
```

With the hook installed, any prompt in any Claude Code session starts the
server and opens the page automatically (only if no tab is already open).

**Uninstall the hook:** remove the `UserPromptSubmit` entry pointing at
`token-universe/hooks/open-universe.sh` from `~/.claude/settings.json`.

**Stop the server:** `kill $(lsof -ti tcp:4816)`
