# Idle Cosmos (token-universe)

A local web app that turns Claude Code token usage into ONE slowly-built
pixel model of the real known universe. All sessions' tokens pool into
"cosmic energy" (~22,000 energy = 1 block, `ENERGY_PER_BLOCK` in app.js);
blocks assemble the Sun and planets core-outward with real geological
layers (Earth: inner core → outer core → mantles → crust → surface →
atmosphere), then belts, named nearby stars, and the Milky Way field.
The world is pannable/zoomable (drag + wheel + bottom-right control,
`?goto=Earth&z=6` deep links).

## How it works

- `server.js` — zero-dependency Node server on `http://localhost:4816`. It
  **reads** (never writes) Claude Code's own session logs in
  `~/.claude/projects/**/*.jsonl`, tallies token usage per session, and
  streams live updates to the page over Server-Sent Events. No API keys, no
  network calls, nothing leaves the machine.
- `public/` — the universe page. Canvas-based, deterministic per session:
  the session id seeds the random generator, so the same session always
  rebuilds the exact same universe (that's also how "saving" works — every
  universe is reproducible from its log).
- `hooks/open-universe.sh` — a Claude Code `UserPromptSubmit` hook that
  starts the server if needed and opens the page only if no tab is already
  connected. Installed in `~/.claude/settings.json`.

## Design constraints

- Zero npm dependencies; only Node built-ins.
- Keep CPU/GPU use light: stars render once to an offscreen layer, only a
  few twinklers/objects/particles animate per frame, loop idles when the
  tab is hidden, respects `prefers-reduced-motion`.
- Energy formula lives in `server.js` (`WEIGHTS`): output tokens ×3,
  input/cache-write ×1, cache-read ×0.08. Milestone thresholds live in
  `public/app.js` (`MILESTONES`).

## Running manually

```
node server.js         # then visit http://localhost:4816
```
