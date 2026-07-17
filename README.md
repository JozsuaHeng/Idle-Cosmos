# 🌌 Token Universe

Every token Claude burns becomes stardust.

Each Claude Code session is its own universe. When the session starts, that's
the big bang. As Claude works on your prompts, the tokens it consumes turn
into **cosmic energy** that builds the universe live on a webpage — stars
first, then at milestones: a sun, planets, a comet, a ringed giant, nebulae,
moons, an asteroid belt, a binary star, a distant galaxy, and finally a black
hole.

## How the "connection" works (and why it's safe)

Claude Code already keeps a log of every session on your Mac at
`~/.claude/projects/`, including exact token counts. This app just **reads
those local files** — no API key, no login, no data leaving your computer.

## Cosmic energy

Raw token counts are weighted so a universe grows at a satisfying pace:

| Token type            | Weight | Why                                    |
| --------------------- | ------ | -------------------------------------- |
| Output tokens         | ×3     | Claude's actual "work"                 |
| Input tokens          | ×1     | your prompts and files                 |
| Cache writes          | ×1     | new context being remembered           |
| Cache reads           | ×0.08  | cheap re-reads; would dwarf the rest   |

Roughly **300 energy = 1 star**, and milestone objects appear from 1,000
energy (first light) up to 2,500,000 (black hole).

## Running it

```bash
node server.js
```

Then open <http://localhost:4816>. With the hook installed (see below), you
never need to do this — submitting any prompt in Claude Code starts the
server and pops the page open automatically (only if it isn't already open).

## Saving universes

Universes are **deterministic**: the session id seeds the layout, so the same
session always rebuilds the same universe. As long as the session log exists,
its universe is "saved" and appears in the sidebar gallery. The 📸 button
also downloads the current view as a PNG.

## The auto-open hook

A `UserPromptSubmit` hook in `~/.claude/settings.json` runs
`hooks/open-universe.sh` on every prompt. It backgrounds everything and exits
instantly, so it never slows your prompts down.

**To uninstall:** open `~/.claude/settings.json` and delete the
`UserPromptSubmit` entry that points at `token-universe/hooks/open-universe.sh`.

## Stopping the server

```bash
kill $(lsof -ti tcp:4816)
```
