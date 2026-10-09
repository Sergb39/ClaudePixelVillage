import { tokenPath } from './connection.js';

const EVENT_URL = 'http://127.0.0.1:4317/api/events';
const VILLAGE_URL = 'http://localhost:4317';
const MAX_PENDING = 256;
const BATCH_SIZE = 16;
const METADATA = ['session_id', 'agent_id', 'agent_type', 'tool_name', 'tool_use_id', 'notification_type'];
// Observe only village lifecycle events, including optional events newer engines emit.
// PreToolUse is supplied by tool.call below: older mods expose a different classic
// payload for it, without the session and subagent identity.
const CLASSIC_EVENTS = new Set([
  'SessionStart', 'UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'Stop',
  'SessionEnd', 'Setup', 'InstructionsLoaded', 'UserPromptExpansion', 'PostToolBatch',
  'PermissionDenied', 'TaskCreated', 'TaskCompleted', 'StopFailure', 'TeammateIdle',
  'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'PreCompact', 'PostCompact',
  'PreModelSwitch', 'PostModelSwitch', 'Elicitation', 'ElicitationResult',
]);

function clean(value) {
  return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160) : undefined;
}

function enqueue(state, name, raw) {
  const event = { hook_event_name: name, source: 'claude-mod' };
  for (const key of METADATA) {
    const value = clean(raw[key]);
    if (value !== undefined) event[key] = value;
  }
  if (!event.session_id) return;
  state.sessionId = event.session_id;
  // Sanitize before retaining anything: prompts, paths, inputs and results never
  // enter the queue. Drop new arrivals at capacity, preserving the in-flight head.
  if (state.queue.length >= MAX_PENDING) {
    state.dropped += 1;
    return;
  }
  state.queue.push(JSON.stringify(event));
}

async function sendBatch($, state) {
  for (let sent = 0; sent < BATCH_SIZE && state.queue.length; sent += 1) {
    let token;
    try {
      // Read at delivery time, including retries, so server token rotation recovers.
      token = (await $.fs.read(tokenPath ?? `${$.plugin.root}/../.village/token`)).trim();
      if (!token) throw new Error('Missing token');
    } catch {
      state.lastAttempt = 'token-unavailable';
      return;
    }
    try {
      const response = await $.http.fetch(EVENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Village-Token': token },
        body: state.queue[0],
      });
      if (!response.ok) {
        state.lastAttempt = 'rejected';
        return;
      }
    } catch {
      state.lastAttempt = 'unreachable';
      return;
    }
    state.queue.shift();
    state.delivered += 1;
    state.lastAttempt = 'delivered';
  }
}

function drain($, state) {
  if (state.inflight) return state.inflight;
  if (!state.queue.length) return Promise.resolve();
  state.inflight = sendBatch($, state).finally(() => { state.inflight = null; });
  return state.inflight;
}

function status(state) {
  const descriptions = {
    'not-attempted': 'Waiting for the first activity delivery.',
    'token-unavailable': 'Offline: the local village token is unavailable. Start the village server.',
    rejected: 'Offline: the village rejected the last delivery. The mod will retry with the current token.',
    unreachable: 'Offline: the last delivery could not reach the village. The mod will retry.',
    delivered: 'The last activity delivery succeeded.',
  };
  const progress = state.inflight ? ' A delivery is in progress.' : '';
  return `Pixel Village: ${descriptions[state.lastAttempt]}${progress}\n` +
    `${state.delivered} delivered · ${state.queue.length} queued · ${state.dropped} dropped\n` +
    `Open ${VILLAGE_URL}`;
}

export function register(on) {
  // Each loaded mod instance owns its own queue. Nothing is written to Claude's
  // settings, and none of these observers changes an event or its result.
  const state = {
    queue: [], sessionId: undefined, inflight: null,
    delivered: 0, dropped: 0, lastAttempt: 'not-attempted',
  };

  on('session.start', async ($, e, next) => {
    try { state.sessionId = clean(await $.session.id()); } catch { /* Classic events also carry it. */ }
    try { $.clock.every(250, () => drain($, state)); } catch { /* Observation must never stop Claude. */ }
    try {
      await $.command.register({ name: 'village', description: 'Show Pixel Village delivery status and its local URL', immediate: true });
    } catch { /* A command collision must not disable event observation. */ }
    return next(e);
  });

  on('tool.call', ($, e, next) => {
    try {
      enqueue(state, 'PreToolUse', {
        session_id: state.sessionId, tool_name: e.tool,
        tool_use_id: e.tool_use_id, agent_id: e.agentId,
      });
    } catch { /* Ignore observer failures; preserve the original call below. */ }
    return next(e);
  });

  on('classic.*', ($, e, next) => {
    try {
      const name = e.hook_event_name;
      if (CLASSIC_EVENTS.has(name)) enqueue(state, name, e);
    } catch { /* Ignore observer failures; preserve the original event below. */ }
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    try {
      if (state.queue.length) await Promise.race([drain($, state), $.clock.sleep(750)]);
    } catch { /* Exit delivery is best effort and bounded by Claude's own budget too. */ }
    // No synthetic SessionEnd: this event also fires for /clear and /resume.
    // Keep the timer: session.start does not run again for those transitions.
    return next(e);
  });

  on('command.run', { command: 'village' }, async ($) => {
    let receiver = 'Local receiver unavailable.';
    try {
      const health = await $.http.fetch('http://127.0.0.1:4317/api/health');
      if (health.ok) receiver = 'Local receiver is running.';
    } catch { /* Status still reports the last delivery and queue. */ }
    return { text: `${receiver}\n${status(state)}` };
  });
}
