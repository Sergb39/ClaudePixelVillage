import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySnapshot, reduceEvent, sanitizeEvent, tickSnapshot } from '../src/shared/reducer';
import type { VillageEvent } from '../src/shared/types';
import { COMPANION_RETURN_MS, DEPARTURE_MS } from '../src/shared/types';
const event = (hook_event_name: string, rest: Partial<VillageEvent> = {}): VillageEvent => ({ hook_event_name, session_id: 'session', ...rest });
test('parallel completion, duplicate starts and reordered completion preserve work', () => {
  let state = emptySnapshot();
  for (const e of [event('SessionStart'), event('SessionStart'), event('PreToolUse', { tool_use_id: 'a', tool_name: 'Read' }), event('PreToolUse', { tool_use_id: 'b', tool_name: 'Edit' }), event('PostToolUse', { tool_use_id: 'a' }), event('PostToolUse', { tool_use_id: 'a' })]) state = reduceEvent(state, e, 100);
  assert.equal(Object.keys(state.actors).length, 1); assert.equal(state.actors.session.activity, 'working'); assert.deepEqual(state.actors.session.activeTools, { b: 'Edit' });
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'b' }), 101);
  state = reduceEvent(state, event('PreToolUse', { tool_use_id: 'b', tool_name: 'Edit' }), 102);
  assert.deepEqual(state.actors.session.activeTools, {});
});
test('companions finish independently, stop sleeps, resume is stable', () => {
  let state = reduceEvent(emptySnapshot(), event('PreToolUse', { tool_name: 'Read', tool_use_id: 'a' }), 0);
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'tiny' }), 1);
  state = reduceEvent(state, event('SubagentStop', { agent_id: 'tiny' }), 2);
  assert.equal(state.actors.session.activity, 'working'); assert.equal(state.actors['session::tiny'].kind, 'companion');
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'a' }), 3);
  state = reduceEvent(state, event('Stop'), 4); assert.equal(state.actors.session.activity, 'resting');
  state = tickSnapshot(state, 19000); assert.equal(state.actors.session.activity, 'sleeping');
  state = reduceEvent(state, event('SessionStart'), 20000); assert.equal(Object.keys(state.actors).length, 2); assert.equal(state.actors.session.activity, 'arriving');
});
test('sanitize strips private payloads and bounds journal', () => {
  const clean = sanitizeEvent({ ...event('UserPromptSubmit'), prompt: 'secret', tool_input: { file: 'private' }, label: 'secret' });
  assert.deepEqual(clean, event('UserPromptSubmit'));
  let state = emptySnapshot(); for (let i = 0; i < 310; i++) state = reduceEvent(state, event('Notification'), i);
  assert.equal(state.journal.length, 300); assert.equal(state.sequence, 310);
});
test('names stay deterministic and duplicate subagent starts preserve ongoing work', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart', { session_id: 'demo-willow' }), 0);
  assert.equal(state.actors['demo-willow'].name, 'Willow');
  state = reduceEvent(state, event('SessionStart', { session_id: 'demo-rowan' }), 0);
  assert.equal(state.actors['demo-rowan'].name, 'Rowan');
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'tiny', agent_type: 'Explore' }), 1);
  assert.match(state.actors['session::tiny'].name, /^Scout /);
  state = reduceEvent(state, event('PreToolUse', { agent_id: 'tiny', tool_use_id: 't', tool_name: 'Read' }), 2);
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'tiny' }), 3);
  assert.equal(state.actors['session::tiny'].activity, 'working');
  assert.equal(state.actors['session::tiny'].station, 'library');
});
test('waiting survives unrelated hooks and parallel completions until its tool resolves', () => {
  let state = reduceEvent(emptySnapshot(), event('PreToolUse', { tool_use_id: 'permission', tool_name: 'Bash' }), 0);
  state = reduceEvent(state, event('PreToolUse', { tool_use_id: 'parallel', tool_name: 'Read' }), 1);
  state = reduceEvent(state, event('PermissionRequest', { tool_use_id: 'permission' }), 2);
  for (const e of [event('ConfigChange'), event('PostCompact'), event('PostToolUse', { tool_use_id: 'parallel' }), event('Notification', { notification_type: 'other' })]) state = reduceEvent(state, e, 3);
  assert.equal(state.actors.session.activity, 'waiting');
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'permission' }), 4);
  assert.equal(state.actors.session.activity, 'thinking');
});
test('decorative setup rests after its animation and cannot erase active tools', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart'), 0);
  state = reduceEvent(state, event('Setup'), 1);
  state = tickSnapshot(state, 7000); assert.equal(state.actors.session.activity, 'resting');
  state = reduceEvent(state, event('PreToolUse', { tool_use_id: 'a', tool_name: 'Read' }), 8000);
  state = reduceEvent(state, event('ConfigChange'), 9000); assert.equal(state.actors.session.activity, 'working');
});
test('duplicate correlated completion cannot wake a stopped hero or restart its sleep timer', () => {
  let state = reduceEvent(emptySnapshot(), event('PreToolUse', { tool_use_id: 'done', tool_name: 'Read' }), 0);
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'done' }), 1);
  state = reduceEvent(state, event('Stop'), 2);
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'done' }), 5000);
  assert.equal(state.actors.session.activity, 'resting'); assert.equal(state.actors.session.updatedAt, 2);
  state = tickSnapshot(state, 19000);
  state = reduceEvent(state, event('PostToolUse', { tool_use_id: 'done' }), 20000);
  assert.equal(state.actors.session.activity, 'sleeping');
});
test('task completion preserves parallel tool activity and demo suffixes preserve friendly names', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart', { session_id: 'demo-hazel-3' }), 0);
  assert.equal(state.actors['demo-hazel-3'].name, 'Hazel');
  state = reduceEvent(state, event('PreToolUse', { tool_use_id: 'ongoing', tool_name: 'Edit' }), 1);
  state = reduceEvent(state, event('TaskCompleted'), 2);
  assert.equal(state.actors.session.activity, 'working'); assert.equal(state.actors.session.station, 'forge');
});

test('unknown completion and teardown events never spawn phantom heroes or companions', () => {
  let state = emptySnapshot();
  for (const e of [event('SubagentStop', { agent_id: 'unseen' }), event('PostToolUse', { agent_id: 'unseen', tool_use_id: 'late' }), event('SessionEnd'), event('Stop'), event('Notification')]) state = reduceEvent(state, e, 10);
  assert.deepEqual(Object.keys(state.actors), []);
  assert.equal(state.closedActors?.['session::unseen'].event, 'SubagentStop');
  assert.equal(state.closedActors?.session.event, 'SessionEnd');
});
test('completed companions return, leave, get removed, and cannot be revived by delayed tools', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart'), 0);
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'tiny' }), 1);
  state = reduceEvent(state, event('SubagentStop', { agent_id: 'tiny' }), 2);
  state = reduceEvent(state, event('SubagentStop', { agent_id: 'tiny' }), 5000);
  assert.equal(state.actors['session::tiny'].finishedAt, 2);
  state = tickSnapshot(state, COMPANION_RETURN_MS + 2);
  assert.equal(state.actors['session::tiny'].activity, 'leaving');
  state = tickSnapshot(state, COMPANION_RETURN_MS + DEPARTURE_MS + 3);
  assert.equal(state.actors['session::tiny'], undefined);
  // High-volume journal eviction must not erase the separate lifecycle tombstone.
  for (let i = 0; i < 310; i++) state = reduceEvent(state, event('Notification'), 30000 + i);
  state = reduceEvent(state, event('PreToolUse', { agent_id: 'tiny', tool_use_id: 'late', tool_name: 'Read' }), 40000);
  assert.equal(state.actors['session::tiny'], undefined);
  assert.equal(state.actors.session.kind, 'hero');
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'tiny' }), 40001);
  assert.equal(state.actors['session::tiny'].activity, 'arriving');
});
test('session end dismisses its whole family, ignores delayed work, and explicit resume reuses hero identity', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart'), 0);
  const heroName = state.actors.session.name;
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'a' }), 1);
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'b' }), 2);
  state = reduceEvent(state, event('SessionEnd'), 3);
  assert.ok(Object.values(state.actors).every(a => a.activity === 'leaving' && !Object.keys(a.activeTools).length));
  state = tickSnapshot(state, DEPARTURE_MS + 4);
  assert.equal(Object.keys(state.actors).length, 0);
  state = reduceEvent(state, event('PreToolUse', { agent_id: 'a', tool_use_id: 'late' }), DEPARTURE_MS + 5);
  assert.equal(Object.keys(state.actors).length, 0);
  state = reduceEvent(state, event('SessionStart', { source: 'resume' }), DEPARTURE_MS + 6);
  assert.equal(Object.keys(state.actors).length, 1);
  assert.equal(state.actors.session.name, heroName);
  assert.equal(state.actors.session.kind, 'hero');
});
test('legacy sleeping completed companions migrate to departure while stopped main heroes keep sleeping', () => {
  let state = reduceEvent(emptySnapshot(), event('SessionStart'), 0);
  state = reduceEvent(state, event('SubagentStart', { agent_id: 'old' }), 1);
  state.actors['session::old'] = { ...state.actors['session::old'], activity: 'sleeping', lastEvent: 'SubagentStop', updatedAt: 1 };
  state.actors.session = { ...state.actors.session, activity: 'sleeping', lastEvent: 'Stop', updatedAt: 1 };
  state = tickSnapshot(state, 100000);
  assert.equal(state.actors['session::old'].activity, 'leaving');
  assert.equal(state.actors.session.activity, 'sleeping');
});
