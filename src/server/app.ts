import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { emptySnapshot, reduceEvent, sanitizeEvent, tickSnapshot } from '../shared/reducer';
import type { ActorState, Snapshot } from '../shared/types';

export function createVillageServer(options: { root?: string; port?: number; middleware?: (req: IncomingMessage, res: ServerResponse, next: () => void) => void } = {}) {
  const root = options.root ?? process.cwd(); const port = options.port ?? 4317;
  const dataDir = resolve(root, '.village'); mkdirSync(dataDir, { recursive: true });
  const tokenPath = resolve(dataDir, 'token');
  const token = existsSync(tokenPath) ? readFileSync(tokenPath, 'utf8').trim() : randomBytes(32).toString('hex');
  if (!existsSync(tokenPath)) writeFileSync(tokenPath, token, { mode: 0o600 });
  const browserToken = randomBytes(24).toString('hex');
  let state: Snapshot = emptySnapshot();
  try {
    const saved = JSON.parse(readFileSync(resolve(dataDir, 'snapshot.json'), 'utf8')) as Snapshot;
    // Copy only allowed fields, preserving heroes whose starts aged out of the journal.
    const activities = ['arriving', 'thinking', 'working', 'waiting', 'celebrating', 'resting', 'sleeping', 'leaving', 'interrupted'];
    const stations = ['gate', 'board', 'library', 'forge', 'observatory', 'training', 'campfire', 'beds'];
    const actors: Snapshot['actors'] = Object.create(null);
    for (const actor of Object.values(saved.actors ?? {}).slice(-100)) {
      const event = sanitizeEvent({ hook_event_name: actor.agentId ? 'SubagentStart' : 'SessionStart', session_id: actor.sessionId, agent_id: actor.agentId });
      if (!event) continue;
      const rebuilt = reduceEvent(emptySnapshot(), event);
      const id = event.session_id + (event.agent_id ? `::${event.agent_id}` : '');
      const clean = rebuilt.actors[id];
      if (typeof actor.name === 'string' && /^(Sprout|Pip|Moss|Pebble|Scout|Sage) [a-z0-9]{4}$/.test(actor.name)) clean.name = actor.name;
      if (activities.includes(actor.activity)) clean.activity = actor.activity;
      if (stations.includes(actor.station)) clean.station = actor.station;
      clean.updatedAt = Number.isFinite(actor.updatedAt) ? actor.updatedAt : Date.now();
      clean.lastObservedAt = Number.isFinite(actor.lastObservedAt) ? actor.lastObservedAt : clean.updatedAt;
      clean.stale = actor.stale === true;
      if (Number.isFinite(actor.finishedAt)) clean.finishedAt = actor.finishedAt;
      clean.lastEvent = sanitizeEvent({ ...event, hook_event_name: actor.lastEvent })?.hook_event_name ?? 'SessionStart';
      const safeTool = sanitizeEvent({ ...event, tool_name: actor.toolName }); clean.toolName = safeTool?.tool_name;
      for (const [toolId, toolName] of Object.entries(actor.activeTools ?? {}).slice(-50)) {
        const safe = sanitizeEvent({ ...event, tool_name: toolName, tool_use_id: toolId });
        if (safe?.tool_use_id && safe.tool_name) Object.defineProperty(clean.activeTools, safe.tool_use_id, { value: safe.tool_name, enumerable: true, configurable: true, writable: true });
      }
      clean.completedTools = Object.fromEntries(Object.entries(actor.completedTools ?? {}).slice(-500).flatMap(([id, at]) => typeof id === 'string' && id.length <= 160 && Number.isFinite(at) ? [[id, at]] : []));
      if (actor.pendingWait === null || typeof actor.pendingWait === 'string' && actor.pendingWait.length <= 160) clean.pendingWait = actor.pendingWait;
      actors[id] = clean as ActorState;
    }
    state.actors = actors;
    state.closedActors = Object.fromEntries(Object.entries(saved.closedActors ?? {}).slice(-500).flatMap(([id, closed]) => id.length <= 322 && Number.isFinite(closed.at) && ['SubagentStop', 'SessionEnd'].includes(closed.event) ? [[id, { event: closed.event, at: closed.at }]] : []));
    state.journal = (saved.journal ?? []).slice(-300).flatMap(entry => { const event = sanitizeEvent(entry); return event && Number.isFinite(entry.sequence) && Number.isFinite(entry.receivedAt) ? [{ ...event, sequence: entry.sequence, receivedAt: entry.receivedAt }] : []; });
    if (Number.isSafeInteger(saved.sequence)) state.sequence = Math.max(state.sequence, saved.sequence);
    if (typeof saved.completedQuests === 'number' && Number.isSafeInteger(saved.completedQuests) && saved.completedQuests >= 0) state.completedQuests = saved.completedQuests;
  } catch { /* First launch, or a corrupt snapshot, starts a new village. */ }
  state = tickSnapshot(state);
  const streams = new Set<ServerResponse>();
  const persist = () => { const temporary = resolve(dataDir, 'snapshot.tmp'); writeFileSync(temporary, JSON.stringify(state)); renameSync(temporary, resolve(dataDir, 'snapshot.json')); };
  const broadcast = () => { persist(); const frame = `id: ${state.sequence}\nevent: snapshot\ndata: ${JSON.stringify(state)}\n\n`; for (const response of streams) { if (response.writableLength > 1_000_000) { response.end(); streams.delete(response); } else response.write(frame); } };
  const equal = (value: string, expected: string) => { const actualBytes = Buffer.from(value); const expectedBytes = Buffer.from(expected); return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes); };
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const json = (res: ServerResponse, status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = createServer(async (req, res) => {
    const host = req.headers.host ?? '';
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) { json(res, 403, { error: 'Local host required' }); return; }
    let decodedPath: string;
    try {
      decodedPath = (req.url ?? '/').split('?')[0];
      for (let i = 0; i < 4 && /%[0-9a-f]{2}/i.test(decodedPath); i++) decodedPath = decodeURIComponent(decodedPath);
      decodedPath = decodedPath.replaceAll('\\', '/');
    }
    catch { json(res, 400, { error: 'Invalid path' }); return; }
    if (decodedPath.split('/').some(segment => ['.village', '.claude', '.git', '.aws', '.codex', '.agents'].includes(segment.toLowerCase().replace(/[. ]+$/, '')))) { json(res, 403, { error: 'Private directory' }); return; }
    const pathname = new URL(req.url ?? '/', `http://${host}`).pathname;
    if (req.method === 'GET') res.setHeader('Set-Cookie', `village=${browserToken}; HttpOnly; SameSite=Strict; Path=/`);
    if (pathname === '/api/health' && req.method === 'GET') { json(res, 200, { ok: true }); return; }
    if (pathname === '/api/state' && req.method === 'GET') { json(res, 200, state); return; }
    if (pathname === '/api/stream' && req.method === 'GET') {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) { json(res, 403, { error: 'Origin rejected' }); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      streams.add(res); res.write(`id: ${state.sequence}\nevent: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
      req.on('close', () => streams.delete(res)); return;
    }
    if (pathname.startsWith('/api/') && req.method === 'POST') {
      const supplied = req.headers['x-village-token'];
      const bridge = typeof supplied === 'string' && equal(supplied, token);
      const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('village='))?.slice(8) ?? '';
      const browser = !!req.headers.origin && allowedOrigins.has(req.headers.origin) && equal(cookie, browserToken);
      if (!bridge && !browser) { json(res, 403, { error: 'Local authentication required' }); return; }
      if (pathname === '/api/reset') {
        state = { ...state, sequence: state.sequence + 1, actors: Object.fromEntries(Object.entries(state.actors).filter(([, a]) => !a.sessionId.startsWith('demo-'))), closedActors: Object.fromEntries(Object.entries(state.closedActors ?? {}).filter(([id]) => !id.startsWith('demo-'))), journal: state.journal.filter(e => !e.session_id.startsWith('demo-')) }; broadcast(); json(res, 200, state); return;
      }
      if (pathname === '/api/events') {
        let body = ''; let size = 0;
        try {
          for await (const chunk of req) { size += chunk.length; if (size > 16384) { json(res, 413, { error: 'Event too large' }); return; } body += chunk; }
          const event = sanitizeEvent(JSON.parse(body));
          if (!event) { json(res, 400, { error: 'Event and session IDs required' }); return; }
          state = reduceEvent(state, event); broadcast(); json(res, 202, { ok: true, sequence: state.sequence });
        } catch { json(res, 400, { error: 'Invalid JSON event' }); }
        return;
      }
    }
    if (pathname.startsWith('/api/')) { json(res, 404, { error: 'Unknown endpoint' }); return; }
    const serveStatic = () => {
      const dist = resolve(root, 'dist'); let file: string;
      try { file = resolve(dist, '.' + decodeURIComponent(pathname)); } catch { json(res, 400, { error: 'Invalid path' }); return; }
      if (!file.startsWith(dist + sep) && file !== dist) { json(res, 403, { error: 'Invalid path' }); return; }
      if (!existsSync(file) || file === dist) file = resolve(dist, 'index.html');
      try { const content = readFileSync(file); const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' }; res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(content); }
      catch { json(res, 404, { error: 'Build the village first with npm run build' }); }
    };
    if (options.middleware) options.middleware(req, res, serveStatic); else serveStatic();
  });
  const timer = setInterval(() => { const next = tickSnapshot(state); if (next !== state) { state = next; broadcast(); } else for (const response of streams) response.write(': heartbeat\n\n'); }, 1000); timer.unref();
  server.on('close', () => clearInterval(timer));
  const close = () => { clearInterval(timer); for (const response of streams) response.end(); streams.clear(); return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); };
  return { server, close, getState: () => state, token };
}
