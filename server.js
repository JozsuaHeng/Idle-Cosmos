#!/usr/bin/env node
/**
 * Token Universe — local server.
 *
 * Watches Claude Code's session logs (~/.claude/projects/**\/*.jsonl),
 * tallies token usage per session, and streams live updates to the
 * universe webpage over Server-Sent Events (SSE).
 *
 * Read-only with respect to the logs. No dependencies, no network
 * access beyond localhost. Run with:  node server.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const PORT = 4816;
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const PUBLIC_DIR = path.join(__dirname, 'public');

// How raw token counts convert into "cosmic energy" (the number that
// builds the universe). Output tokens are Claude's actual work, so they
// weigh most; cache reads are cheap re-reads of context, so they weigh
// least (otherwise long sessions would dwarf everything).
const WEIGHTS = { input: 1, output: 3, cacheCreate: 1, cacheRead: 0.08 };

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** @type {Map<string, Session>} sessionId -> session */
const sessions = new Map();
/** @type {Map<string, FileState>} absolute path -> file read state */
const files = new Map();

function newSession(id) {
  return {
    id,
    project: '',
    cwd: '',
    firstPrompt: '',
    startedAt: null,
    updatedAt: null,
    prompts: 0,
    tokens: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 },
    energy: 0,
    // per-message usage already counted, so re-emitted lines don't double-count
    msgUsage: new Map(),
  };
}

function publicSession(s) {
  const { msgUsage, ...rest } = s;
  return { ...rest, energy: Math.round(s.energy) };
}

function computeEnergy(u) {
  return (
    u.input * WEIGHTS.input +
    u.output * WEIGHTS.output +
    u.cacheCreate * WEIGHTS.cacheCreate +
    u.cacheRead * WEIGHTS.cacheRead
  );
}

// ---------------------------------------------------------------------------
// Log parsing
// ---------------------------------------------------------------------------

function projectLabelFromDir(dirName) {
  // Directory names mangle the cwd, e.g. "-Users-joz-Downloads-JozsuaHeng".
  // Best-effort: show the last path-ish segment.
  const parts = dirName.split('-').filter(Boolean);
  return parts[parts.length - 1] || dirName;
}

function handleLine(line, session) {
  // Cheap pre-filter: only parse lines that can matter.
  const hasUsage = line.includes('"usage"');
  const isUserPrompt =
    !hasUsage && line.includes('"promptId"') && line.includes('"type":"user"');
  if (!hasUsage && !isUserPrompt) return false;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return false; // partial or malformed line
  }

  let changed = false;
  const ts = obj.timestamp ? Date.parse(obj.timestamp) : null;
  if (ts) {
    if (!session.startedAt || ts < session.startedAt) session.startedAt = ts;
    if (!session.updatedAt || ts > session.updatedAt) session.updatedAt = ts;
  }
  if (obj.cwd && !session.cwd) {
    session.cwd = obj.cwd;
    session.project = path.basename(obj.cwd);
  }

  const usage = obj.message && obj.message.usage;
  if (usage) {
    const key = (obj.message && obj.message.id) || obj.uuid || String(Math.random());
    const u = {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cacheCreate: usage.cache_creation_input_tokens || 0,
      cacheRead: usage.cache_read_input_tokens || 0,
    };
    const prev = session.msgUsage.get(key);
    if (
      !prev ||
      prev.input !== u.input ||
      prev.output !== u.output ||
      prev.cacheCreate !== u.cacheCreate ||
      prev.cacheRead !== u.cacheRead
    ) {
      for (const k of Object.keys(u)) {
        session.tokens[k] += u[k] - (prev ? prev[k] : 0);
      }
      session.energy = computeEnergy(session.tokens);
      session.msgUsage.set(key, u);
      changed = true;
    }
  } else if (obj.type === 'user' && obj.message && !obj.isSidechain) {
    const content = obj.message.content;
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? (content.find((c) => c && c.type === 'text') || {}).text
          : null;
    if (text && !text.startsWith('<')) {
      session.prompts += 1;
      if (!session.firstPrompt) session.firstPrompt = text.slice(0, 120);
      changed = true;
    }
  }
  return changed;
}

async function readFileIncremental(filePath) {
  let state = files.get(filePath);
  if (!state) {
    const dirName = path.basename(path.dirname(filePath));
    const sessionId = path.basename(filePath, '.jsonl');
    let session = sessions.get(sessionId);
    if (!session) {
      session = newSession(sessionId);
      session.project = projectLabelFromDir(dirName);
      sessions.set(sessionId, session);
    }
    state = { offset: 0, remainder: '', sessionId };
    files.set(filePath, state);
  }

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return; // deleted between scan and read
  }
  if (stat.size < state.offset) {
    // File shrank (rotated/rewritten) — start over.
    state.offset = 0;
    state.remainder = '';
    const fresh = newSession(state.sessionId);
    fresh.project = sessions.get(state.sessionId)?.project || '';
    sessions.set(state.sessionId, fresh);
  }
  if (stat.size === state.offset) return;

  const session = sessions.get(state.sessionId);
  let changed = false;
  const fh = await fsp.open(filePath, 'r');
  try {
    const CHUNK = 4 * 1024 * 1024;
    const buf = Buffer.alloc(CHUNK);
    while (state.offset < stat.size) {
      const { bytesRead } = await fh.read(buf, 0, CHUNK, state.offset);
      if (bytesRead <= 0) break;
      state.offset += bytesRead;
      const text = state.remainder + buf.toString('utf8', 0, bytesRead);
      const lines = text.split('\n');
      state.remainder = lines.pop() || '';
      for (const line of lines) {
        if (line && handleLine(line, session)) changed = true;
      }
    }
  } finally {
    await fh.close();
  }
  if (changed) scheduleBroadcast(state.sessionId);
}

async function scanAll() {
  let dirs;
  try {
    dirs = await fsp.readdir(CLAUDE_PROJECTS, { withFileTypes: true });
  } catch {
    return; // ~/.claude/projects doesn't exist yet
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const dirPath = path.join(CLAUDE_PROJECTS, d.name);
    let entries;
    try {
      entries = await fsp.readdir(dirPath);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.endsWith('.jsonl')) {
        await readFileIncremental(path.join(dirPath, name));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Change detection: fs.watch (recursive, supported on macOS) + slow rescan
// ---------------------------------------------------------------------------

const pendingReads = new Map(); // filePath -> timeout

function scheduleRead(filePath) {
  if (pendingReads.has(filePath)) return;
  pendingReads.set(
    filePath,
    setTimeout(() => {
      pendingReads.delete(filePath);
      readFileIncremental(filePath).catch(() => {});
    }, 200)
  );
}

function startWatching() {
  try {
    fs.watch(CLAUDE_PROJECTS, { recursive: true }, (_event, fileName) => {
      if (fileName && fileName.endsWith('.jsonl')) {
        scheduleRead(path.join(CLAUDE_PROJECTS, fileName));
      }
    });
  } catch (err) {
    console.error('fs.watch failed, relying on polling only:', err.message);
  }
  // Safety net: full rescan picks up anything the watcher missed.
  setInterval(() => scanAll().catch(() => {}), 10_000);
}

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------

/** @type {Set<http.ServerResponse>} */
const sseClients = new Set();
const pendingBroadcasts = new Set();
let broadcastTimer = null;

function scheduleBroadcast(sessionId) {
  pendingBroadcasts.add(sessionId);
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const ids = [...pendingBroadcasts];
    pendingBroadcasts.clear();
    for (const id of ids) {
      const s = sessions.get(id);
      if (!s) continue;
      const payload = `data: ${JSON.stringify({ type: 'update', session: publicSession(s) })}\n\n`;
      for (const res of sseClients) res.write(payload);
    }
  }, 300);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function sendJSON(res, obj, status = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sessionList() {
  return [...sessions.values()]
    .filter((s) => s.energy > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(publicSession);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/ping') {
    return sendJSON(res, { ok: true, clients: sseClients.size });
  }

  if (url.pathname === '/api/sessions') {
    return sendJSON(res, { sessions: sessionList() });
  }

  if (url.pathname === '/api/config') {
    // Single source of truth for the token->energy weights, so the page
    // never has to keep its own copy in sync with this file by hand.
    return sendJSON(res, { weights: WEIGHTS });
  }

  if (url.pathname === '/api/version') {
    // Lets the page notice when public/ files change (e.g. Claude edited
    // them) and reload itself, so an already-open tab doesn't keep
    // running stale JavaScript indefinitely.
    try {
      const stats = await Promise.all(
        ['index.html', 'app.js', 'style.css'].map((f) => fsp.stat(path.join(PUBLIC_DIR, f)))
      );
      const mtime = Math.max(...stats.map((s) => s.mtimeMs));
      return sendJSON(res, { mtime });
    } catch {
      return sendJSON(res, { mtime: 0 });
    }
  }

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(
      `data: ${JSON.stringify({ type: 'snapshot', sessions: sessionList() })}\n\n`
    );
    sseClients.add(res);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return;
  }

  // Static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const abs = path.join(PUBLIC_DIR, filePath);
  if (!abs.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fsp.readFile(abs);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use — another Token Universe server is probably running.`);
    process.exit(0);
  }
  throw err;
});

scanAll()
  .then(() => {
    startWatching();
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Token Universe running at http://localhost:${PORT}`);
      console.log(`Watching ${CLAUDE_PROJECTS}`);
    });
  })
  .catch((err) => {
    console.error('Initial scan failed:', err);
    process.exit(1);
  });
