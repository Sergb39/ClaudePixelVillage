import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../mod/hooks/register.js';

type Handler = (...args: any[]) => any;

function setup() {
  const handlers = new Map<string, Handler>();
  let tick: (() => Promise<void>) | undefined;
  let currentToken = 'token-one';
  let receiverOnline = true;
  const delivered: { event: any; token: string }[] = [];
  const api = {
    plugin: { root: 'C:/Pixel Village/mod' },
    session: { id: async () => 'session-one' },
    command: { register: async () => undefined },
    clock: { every: (_delay: number, callback: () => Promise<void>) => { tick = callback; }, sleep: async () => undefined },
    fs: { read: async () => currentToken },
    http: { fetch: async (url: string, options?: { body: string; headers: Record<string, string> }) => {
      if (!receiverOnline) throw new Error('offline');
      if (url.endsWith('/api/health')) return { ok: true };
      delivered.push({ event: JSON.parse(options!.body), token: options!.headers['X-Village-Token'] });
      return { ok: true };
    } },
  };
  register((name: string, filter: unknown, handler?: Handler) => handlers.set(name, handler ?? filter as Handler));
  const call = (name: string, event: any, result: any = { original: true }) => {
    const handler = handlers.get(name);
    assert.ok(handler, `${name} should be registered`);
    const next = (received: any) => { assert.equal(received, event, 'observer must not modify Claude events'); return result; };
    return handler(api, event, next);
  };
  return {
    call,
    delivered,
    flush: async () => { assert.ok(tick); await tick(); },
    setToken: (token: string) => { currentToken = token; },
    setReceiver: (online: boolean) => { receiverOnline = online; },
  };
}

test('mod forwards lifecycle and tool metadata while preserving Claude results and private fields', async () => {
  const runtime = setup();
  await runtime.call('session.start', { surface: 'desktop' });
  const start = { hook_event_name: 'SessionStart', session_id: 'session-one', prompt: 'PRIVATE', cwd: 'C:/private' };
  const result = { should: 'stay unchanged' };
  assert.equal(runtime.call('classic.*', start, result), result);
  const tool = { tool: 'Read', tool_use_id: 'tool-one', agentId: 'agent-one', file_path: 'C:/private/file' };
  assert.equal(runtime.call('tool.call', tool, result), result);
  runtime.call('classic.*', { hook_event_name: 'PostToolUse', session_id: 'session-one', agent_id: 'agent-one', tool_use_id: 'tool-one', tool_name: 'Read', tool_response: 'SECRET' });
  await runtime.flush();
  assert.deepEqual(runtime.delivered.map(item => item.event), [
    { hook_event_name: 'SessionStart', source: 'claude-mod', session_id: 'session-one' },
    { hook_event_name: 'PreToolUse', source: 'claude-mod', session_id: 'session-one', agent_id: 'agent-one', tool_name: 'Read', tool_use_id: 'tool-one' },
    { hook_event_name: 'PostToolUse', source: 'claude-mod', session_id: 'session-one', agent_id: 'agent-one', tool_name: 'Read', tool_use_id: 'tool-one' },
  ]);
  assert.ok(runtime.delivered.every(item => item.token === 'token-one'));
});

test('mod queues deliveries while offline and reads a rotated token for retry', async () => {
  const runtime = setup();
  await runtime.call('session.start', { surface: 'terminal' });
  runtime.call('classic.*', { hook_event_name: 'SessionStart', session_id: 'session-one' });
  runtime.setReceiver(false);
  await runtime.flush();
  assert.equal(runtime.delivered.length, 0);
  runtime.setToken('token-two');
  runtime.setReceiver(true);
  await runtime.flush();
  assert.equal(runtime.delivered.length, 1);
  assert.equal(runtime.delivered[0].token, 'token-two');
  const status = await runtime.call('command.run', { command: 'village' });
  assert.match(status.text, /Local receiver is running/);
  assert.match(status.text, /1 delivered · 0 queued/);
});
