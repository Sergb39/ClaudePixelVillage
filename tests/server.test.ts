import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVillageServer } from '../src/server/app';
import { emptySnapshot, reduceEvent } from '../src/shared/reducer';

test('saved companions and closed identities survive server restoration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-restore-')); const port = 14319;
  let state = reduceEvent(emptySnapshot(), { hook_event_name: 'SessionStart', session_id: 'saved' });
  state = reduceEvent(state, { hook_event_name: 'SubagentStart', session_id: 'saved', agent_id: 'child', agent_type: 'project-manager' });
  state = reduceEvent(state, { hook_event_name: 'SubagentStop', session_id: 'saved', agent_id: 'child' });
  state = reduceEvent(state, { hook_event_name: 'PreToolUse', session_id: 'saved', tool_use_id: 'finished', tool_name: 'Read' });
  state = reduceEvent(state, { hook_event_name: 'PostToolUse', session_id: 'saved', tool_use_id: 'finished' });
  state = reduceEvent(state, { hook_event_name: 'PermissionRequest', session_id: 'saved', tool_use_id: 'approval' });
  state = reduceEvent(state, { hook_event_name: 'TaskCompleted', session_id: 'saved' });
  mkdirSync(join(root, '.village'));
  writeFileSync(join(root, '.village', 'snapshot.json'), JSON.stringify(state));
  const { server, close, getState } = createVillageServer({ root, port });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    assert.equal(getState().actors.saved.kind, 'hero');
    assert.equal(getState().actors['saved::child'].kind, 'companion');
    assert.equal(getState().actors['saved::child'].role, 'project-manager');
    assert.equal(getState().actors['saved::child'].name, state.actors['saved::child'].name);
    assert.equal(getState().actors['saved::child'].palette, 3);
    assert.equal(getState().actors['saved::child'].finishedAt, state.actors['saved::child'].finishedAt);
    assert.equal(getState().closedActors?.['saved::child'].event, 'SubagentStop');
    assert.equal(getState().actors.saved.pendingWait, 'approval');
    assert.ok(getState().actors.saved.completedTools?.finished);
    assert.equal(getState().completedQuests, 1);
  } finally { await close(); rmSync(root, { recursive: true, force: true }); }
});

test('local server authenticates, sanitizes, snapshots, and resets only demos', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-test-')); const port = 14317;
  const { server, close, token } = createVillageServer({ root, port });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${port}`;
  try {
    const initial = await fetch(url + '/api/state'); const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    assert.equal(initial.headers.get('content-security-policy'), "frame-ancestors 'none'");
    assert.equal(initial.headers.get('x-frame-options'), 'DENY');
    assert.equal(initial.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(initial.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(initial.headers.get('access-control-allow-origin'), null);
    if (process.platform !== 'win32') {
      assert.equal(statSync(join(root, '.village')).mode & 0o777, 0o700);
      assert.equal(statSync(join(root, '.village', 'token')).mode & 0o777, 0o600);
    }
    assert.equal((await fetch(url + '/api/events', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': 'wrong' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': 'é'.repeat(token.length) }, body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: 'not json' })).status, 400);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: '{}' })).status, 400);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: 'a'.repeat(17000) })).status, 413);
    for (const session_id of ['demo-one', 'real-one']) {
      const response = await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: JSON.stringify({ hook_event_name: 'SessionStart', session_id, prompt: 'secret' }) }); assert.equal(response.status, 202);
    }
    if (process.platform !== 'win32') assert.equal(statSync(join(root, '.village', 'snapshot.json')).mode & 0o777, 0o600);
    const response = await fetch(url + '/api/reset', { method: 'POST', headers: { Origin: url, Cookie: cookie } }); assert.equal(response.status, 200);
    const state = await response.json(); assert.deepEqual(Object.keys(state.actors), ['real-one']); assert.equal(JSON.stringify(state).includes('secret'), false);
    const abort = new AbortController(); const stream = await fetch(url + '/api/stream', { signal: abort.signal });
    const chunk = await stream.body!.getReader().read(); assert.match(new TextDecoder().decode(chunk.value), /event: snapshot/); abort.abort();
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { Origin: 'https://example.com', Cookie: cookie }, body: '{}' })).status, 403);
  } finally { await close(); rmSync(root, { recursive: true, force: true }); }
});

test('invalid existing delivery tokens fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'village-token-test-'));
  try {
    mkdirSync(join(root, '.village'));
    writeFileSync(join(root, '.village', 'token'), '');
    assert.throws(() => createVillageServer({ root, port: 14320 }), /token is invalid/);
    writeFileSync(join(root, '.village', 'token'), 'known');
    assert.throws(() => createVillageServer({ root, port: 14320 }), /token is invalid/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('static files and state cannot follow symlinks outside the village', { skip: process.platform === 'win32' }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-symlink-test-')); const port = 14321;
  try {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>Village</title>');
    writeFileSync(join(root, 'private.txt'), 'private');
    symlinkSync(join(root, 'private.txt'), join(root, 'dist', 'public.txt'));
    const { server, close } = createVillageServer({ root, port });
    await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/public.txt`);
      assert.equal(response.status, 403);
      assert.doesNotMatch(await response.text(), /private/);
    } finally { await close(); }
    symlinkSync(join(root, 'private.txt'), join(root, '.village', 'snapshot.json'));
    assert.throws(() => createVillageServer({ root, port }), /snapshot must not be a symlink/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('private paths are rejected before development middleware, including encoded and absolute paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-private-test-')); const port = 14318; let middlewareCalls = 0;
  const { server, close } = createVillageServer({ root, port, middleware: (_req, res) => { middlewareCalls++; res.end('public'); } });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/.village/token', '/%2evillage/token', '/%252evillage/token', '/@fs/C:/mock-project/PixelVillage/.village/token', '/@fs/C:%5cmock-project%5cPixelVillage%5c.village%5ctoken', '/%2eclaude/settings.json', '/.git/config', '/.VILLAGE/token', '/.village.%20/token']) {
      assert.equal((await fetch(base + path)).status, 403, path);
    }
    assert.equal(middlewareCalls, 0);
    assert.equal((await fetch(base + '/src/client/main.ts')).status, 200);
    assert.equal(middlewareCalls, 1);
  } finally { await close(); rmSync(root, { recursive: true, force: true }); }
});

