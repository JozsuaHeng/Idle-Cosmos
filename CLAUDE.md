# Token Universe

A local web app that turns Claude Code token usage into a growing pixel
universe. Each Claude Code session is one universe: the session start is the
big bang, and every token Claude consumes adds "cosmic energy" that reveals
stars and, at milestones, planets, comets, nebulae, galaxies and a black hole.

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
