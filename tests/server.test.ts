import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createVillageServer } from '../src/server/app';
import { emptySnapshot, reduceEvent } from '../src/shared/reducer';

test('saved companions and closed identities survive server restoration', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-restore-')); const port = 14319;
  let state = reduceEvent(emptySnapshot(), { hook_event_name: 'SessionStart', session_id: 'saved' });
  state = reduceEvent(state, { hook_event_name: 'SubagentStart', session_id: 'saved', agent_id: 'child' });
  state = reduceEvent(state, { hook_event_name: 'SubagentStop', session_id: 'saved', agent_id: 'child' });
  mkdirSync(join(root, '.village'));
  writeFileSync(join(root, '.village', 'snapshot.json'), JSON.stringify(state));
  const { server, getState } = createVillageServer({ root, port });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    assert.equal(getState().actors.saved.kind, 'hero');
    assert.equal(getState().actors['saved::child'].kind, 'companion');
    assert.equal(getState().actors['saved::child'].finishedAt, state.actors['saved::child'].finishedAt);
    assert.equal(getState().closedActors?.['saved::child'].event, 'SubagentStop');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

test('local server authenticates, sanitizes, snapshots, and resets only demos', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-test-')); const port = 14317;
  const { server, token } = createVillageServer({ root, port });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${port}`;
  try {
    const initial = await fetch(url + '/api/state'); const cookie = initial.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(url + '/api/events', { method: 'POST', body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': 'wrong' }, body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': 'é'.repeat(token.length) }, body: '{}' })).status, 403);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: 'not json' })).status, 400);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: '{}' })).status, 400);
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: 'a'.repeat(17000) })).status, 413);
    for (const session_id of ['demo-one', 'real-one']) {
      const response = await fetch(url + '/api/events', { method: 'POST', headers: { 'X-Village-Token': token }, body: JSON.stringify({ hook_event_name: 'SessionStart', session_id, prompt: 'secret' }) }); assert.equal(response.status, 202);
    }
    const response = await fetch(url + '/api/reset', { method: 'POST', headers: { Origin: url, Cookie: cookie } }); assert.equal(response.status, 200);
    const state = await response.json(); assert.deepEqual(Object.keys(state.actors), ['real-one']); assert.equal(JSON.stringify(state).includes('secret'), false);
    const abort = new AbortController(); const stream = await fetch(url + '/api/stream', { signal: abort.signal });
    const chunk = await stream.body!.getReader().read(); assert.match(new TextDecoder().decode(chunk.value), /event: snapshot/); abort.abort();
    assert.equal((await fetch(url + '/api/events', { method: 'POST', headers: { Origin: 'https://example.com', Cookie: cookie }, body: '{}' })).status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

test('hook bridge is silent and successful for malformed input and absent server', async () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), 'village-bridge-test-'));
  mkdirSync(join(isolatedRoot, 'scripts'));
  copyFileSync('scripts/hook-bridge.mjs', join(isolatedRoot, 'scripts/hook-bridge.mjs'));
  try { for (const input of ['not json', JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'bridge-check' })]) {
    const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/hook-bridge.mjs'], { cwd: isolatedRoot, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk); child.on('error', reject); child.on('close', code => resolve({ code, output })); child.stdin.end(input);
    });
    assert.deepEqual(result, { code: 0, output: '' });
  } } finally { rmSync(isolatedRoot, { recursive: true, force: true }); }
});

test('private paths are rejected before development middleware, including encoded and absolute paths', async () => {
  const root = mkdtempSync(join(tmpdir(), 'village-private-test-')); const port = 14318; let middlewareCalls = 0;
  const { server } = createVillageServer({ root, port, middleware: (_req, res) => { middlewareCalls++; res.end('public'); } });
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/.village/token', '/%2evillage/token', '/%252evillage/token', '/@fs/C:/mock-project/PixelVillage/.village/token', '/@fs/C:%5cmock-project%5cPixelVillage%5c.village%5ctoken', '/%2eclaude/settings.json', '/.git/config', '/.VILLAGE/token', '/.village.%20/token']) {
      assert.equal((await fetch(base + path)).status, 403, path);
    }
    assert.equal(middlewareCalls, 0);
    assert.equal((await fetch(base + '/src/client/main.ts')).status, 200);
    assert.equal(middlewareCalls, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(root, { recursive: true, force: true }); }
});

