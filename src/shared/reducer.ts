import { actorKey, COMPANION_RETURN_MS, DEPARTURE_MS, STALE_SESSION_MS, type ActorState, type Snapshot, type Station, type VillageEvent } from './types';
import { agentRole, ROLE_NAMES, ROLE_PALETTES } from './roles';

export const emptySnapshot = (): Snapshot => ({ sequence: 0, actors: {}, journal: [], completedQuests: 0 });
export function sanitizeEvent(input: unknown): VillageEvent | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ['hook_event_name', 'session_id', 'agent_id', 'agent_type', 'tool_name', 'tool_use_id', 'notification_type', 'source']) {
    if (typeof raw[key] === 'string') result[key] = raw[key].replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);
  }
  return result.hook_event_name && result.session_id ? result as unknown as VillageEvent : null;
}
export function toolStation(tool = ''): Station {
  if (/read|glob|grep|searchfiles/i.test(tool)) return 'library';
  if (/edit|write|notebook/i.test(tool)) return 'forge';
  if (/web|fetch|search|mcp/i.test(tool)) return 'observatory';
  if (/bash|shell|powershell|test/i.test(tool)) return 'training';
  return 'board';
}
function stableHash(value: string): number { let hash = 0; for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0; return hash; }
function hero(sessionId: string, now: number, agentId?: string, agentType?: string): ActorState {
  const hash = stableHash(sessionId);
  const names = ['Willow', 'Rowan', 'Hazel', 'Fern', 'Ash', 'Clover', 'Juniper', 'Briar', 'Reed', 'Wren', 'Iris', 'Oak'];
  const companionNames = ['Sprout', 'Pip', 'Moss', 'Pebble'];
  const demoName = sessionId.startsWith('demo-') ? names.find(name => name.toLowerCase() === sessionId.slice(5).split('-')[0].toLowerCase()) : undefined;
  const companionHash = stableHash(agentId ?? '');
  const role = agentId ? agentRole(agentType) : 'lead';
  const prefix = role === 'general' && agentId ? companionNames[companionHash % companionNames.length] : ROLE_NAMES[role];
  const name = agentId ? `${prefix} ${String(companionHash % 1000).padStart(3, '0')}` : demoName ?? names[hash % names.length];
  return { id: actorKey(sessionId, agentId), sessionId, ...(agentId ? { agentId } : {}), name, kind: agentId ? 'companion' : 'hero', role, palette: agentId && role !== 'general' ? ROLE_PALETTES[role] : hash % 8, activity: 'arriving', station: 'gate', activeTools: {}, completedTools: {}, lastEvent: 'SessionStart', updatedAt: now, lastObservedAt: now };
}
/** Tool completion and permission state live on the actor, independent of the display journal. */
export function reduceEvent(state: Snapshot, event: VillageEvent, now = Date.now()): Snapshot {
  const actors: Snapshot['actors'] = Object.assign(Object.create(null), state.actors);
  const closedActors: NonNullable<Snapshot['closedActors']> = Object.assign(Object.create(null), state.closedActors);
  const mainKey = actorKey(event.session_id);
  const key = actorKey(event.session_id, event.agent_id);
  const close = (id: string, reason: 'SubagentStop' | 'SessionEnd') => {
    if (!Object.hasOwn(closedActors, id) || reason === 'SessionEnd' && closedActors[id].event !== 'SessionEnd') closedActors[id] = { event: reason, at: now };
  };
  let completedQuests = state.completedQuests ?? 0;
  const finish = (): Snapshot => {
    // Bound lifecycle tombstones separately from the high-volume tool journal.
    const retained = Object.fromEntries(Object.entries(closedActors).sort((a, b) => b[1].at - a[1].at).slice(0, 500));
    const sequence = state.sequence + 1;
    return { sequence, actors, closedActors: retained, completedQuests, journal: [...state.journal, { ...event, sequence, receivedAt: now }].slice(-300) };
  };
  if (event.hook_event_name === 'SessionEnd' && !event.agent_id) {
    close(mainKey, 'SessionEnd');
    for (const [id, previous] of Object.entries(actors)) {
      if (previous.sessionId !== event.session_id) continue;
      close(id, 'SessionEnd');
      if (previous.activity !== 'leaving') actors[id] = { ...previous, activeTools: {}, toolName: undefined, finishedAt: now, activity: 'leaving', station: 'gate', lastEvent: 'SessionEnd', updatedAt: now };
    }
    return finish();
  }
  if (event.hook_event_name === 'SubagentStop') {
    if (!event.agent_id) return finish();
    if (Object.hasOwn(closedActors, key) || Object.hasOwn(closedActors, mainKey)) return finish();
    close(key, 'SubagentStop');
    // A delayed stop for an unobserved subagent is history, not a spawn.
    if (!actors[key]) return finish();
  }
  const sessionWake = !event.agent_id && ['SessionStart', 'UserPromptSubmit'].includes(event.hook_event_name);
  if (sessionWake) delete closedActors[mainKey];
  if (event.hook_event_name === 'SubagentStart' && event.agent_id && !Object.hasOwn(closedActors, mainKey)) delete closedActors[key];
  if (Object.hasOwn(closedActors, mainKey) || Object.hasOwn(closedActors, key) && event.hook_event_name !== 'SubagentStop') return finish();
  const canSpawn = event.agent_id ? ['SubagentStart', 'PreToolUse'].includes(event.hook_event_name) : ['SessionStart', 'UserPromptSubmit', 'PreToolUse'].includes(event.hook_event_name);
  if (!actors[key] && !canSpawn) return finish();
  if (!actors[mainKey]) actors[mainKey] = hero(event.session_id, now);
  const previous = actors[key] ?? hero(event.session_id, now, event.agent_id, event.agent_type);
  const actor = { ...previous, activeTools: { ...previous.activeTools }, completedTools: { ...previous.completedTools }, lastEvent: event.hook_event_name, updatedAt: now, lastObservedAt: now, stale: false };
  if (event.agent_id && event.agent_type && agentRole(event.agent_type) !== 'general' && (previous.role === 'general' || !previous.role)) {
    const upgraded = hero(event.session_id, now, event.agent_id, event.agent_type);
    actor.role = upgraded.role; actor.palette = upgraded.palette; actor.name = upgraded.name;
  }
  if (sessionWake || event.hook_event_name === 'SubagentStart') actor.finishedAt = undefined;
  const set = (activity: ActorState['activity'], station: Station) => { actor.activity = activity; actor.station = station; };
  const toolId = event.tool_use_id ?? `uncorrelated:${event.tool_name ?? 'tool'}`;
  const completed = !!event.tool_use_id && Object.hasOwn(actor.completedTools, event.tool_use_id);
  switch (event.hook_event_name) {
    case 'SessionStart': if (previous.activity === 'leaving' || previous.activity === 'sleeping' || previous.activity === 'resting') set('arriving', 'gate'); break;
    case 'SubagentStart': if (!actors[key] || previous.finishedAt !== undefined) { actor.activeTools = {}; actor.completedTools = {}; actor.toolName = undefined; set('arriving', 'board'); } break;
    case 'UserPromptSubmit': case 'UserPromptExpansion': case 'TaskCreated': set('thinking', 'board'); break;
    case 'PreToolUse':
      if (!completed) { Object.defineProperty(actor.activeTools, toolId, { value: event.tool_name ?? 'Tool', enumerable: true, configurable: true, writable: true }); actor.toolName = event.tool_name; set('working', toolStation(event.tool_name)); }
      break;
    case 'PostToolUse': case 'PostToolUseFailure':
      if (completed && !Object.hasOwn(actor.activeTools, toolId)) { actor.updatedAt = previous.updatedAt; actor.lastEvent = previous.lastEvent; break; }
      delete actor.activeTools[toolId];
      if (event.tool_use_id) {
        actor.completedTools[event.tool_use_id] = now;
        actor.completedTools = Object.fromEntries(Object.entries(actor.completedTools).sort((a, b) => b[1] - a[1]).slice(0, 500));
      }
      if (Object.keys(actor.activeTools).length) { actor.toolName = Object.values(actor.activeTools).at(-1); set('working', toolStation(actor.toolName)); }
      else { actor.toolName = undefined; set(event.hook_event_name === 'PostToolUseFailure' ? 'interrupted' : 'thinking', event.hook_event_name === 'PostToolUseFailure' ? 'training' : 'board'); }
      break;
    case 'PermissionRequest': case 'Elicitation': case 'PermissionDenied': actor.pendingWait = event.tool_use_id ?? null; set('waiting', actor.station); break;
    case 'Notification': if (/permission|idle_prompt|elicitation/.test(event.notification_type ?? '')) { actor.pendingWait = event.tool_use_id ?? null; set('waiting', actor.station); } break;
    case 'ElicitationResult': case 'PostCompact': case 'PostToolBatch': set(Object.keys(actor.activeTools).length ? 'working' : 'thinking', Object.keys(actor.activeTools).length ? toolStation(actor.toolName) : 'board'); break;
    case 'Stop': case 'TeammateIdle': if (!Object.keys(actor.activeTools).length) set('resting', 'campfire'); break;
    case 'SubagentStop': actor.activeTools = {}; actor.toolName = undefined; actor.finishedAt = now; set('celebrating', 'campfire'); break;
    case 'TaskCompleted': completedQuests++; if (!Object.keys(actor.activeTools).length) set('celebrating', 'board'); break;
    case 'StopFailure': set('interrupted', 'campfire'); break;
    case 'SessionEnd': actor.activeTools = {}; set('leaving', 'gate'); break;
    case 'PreCompact': case 'InstructionsLoaded': set('thinking', 'library'); break;
    case 'Setup': case 'ConfigChange': case 'FileChanged': if (!Object.keys(actor.activeTools).length) set('thinking', 'forge'); break;
    case 'CwdChanged': case 'DirectoryAdded': case 'PreModelSwitch': case 'PostModelSwitch': set('thinking', 'board'); break;
  }
  if (previous.activity === 'waiting') {
    const responseEvents = ['UserPromptSubmit', 'ElicitationResult', 'Stop', 'StopFailure', 'SubagentStop', 'SessionEnd'];
    const completion = /^(PostToolUse|PostToolUseFailure)$/.test(event.hook_event_name) && (!previous.pendingWait || previous.pendingWait === event.tool_use_id);
    if (responseEvents.includes(event.hook_event_name) || completion) actor.pendingWait = undefined;
    else { actor.activity = 'waiting'; actor.station = previous.station; }
  }
  actors[key] = actor;
  while (Object.keys(actors).length > 100) {
    const oldest = Object.values(actors).filter(a => a.id !== key).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (!oldest) break;
    delete actors[oldest.id];
  }
  return finish();
}
export function tickSnapshot(state: Snapshot, now = Date.now()): Snapshot {
  const actors = { ...state.actors };
  const closedActors: NonNullable<Snapshot['closedActors']> = Object.assign(Object.create(null), state.closedActors);
  let changed = false;
  for (const [key, previous] of Object.entries(actors)) {
    if (!previous.stale && !['leaving', 'resting', 'sleeping'].includes(previous.activity) && now - (previous.lastObservedAt ?? previous.updatedAt) >= STALE_SESSION_MS) {
      actors[key] = { ...previous, stale: true }; changed = true; continue;
    }
    // Migrate completed companions from older saved snapshots as well.
    const finishedAt = previous.finishedAt ?? (previous.kind === 'companion' && previous.lastEvent === 'SubagentStop' ? previous.updatedAt : undefined);
    if (previous.activity === 'leaving') {
      if (!Object.hasOwn(closedActors, key)) { closedActors[key] = { event: previous.kind === 'companion' && previous.lastEvent === 'SubagentStop' ? 'SubagentStop' : 'SessionEnd', at: previous.updatedAt }; changed = true; }
      if (now - previous.updatedAt > DEPARTURE_MS) { delete actors[key]; changed = true; }
    }
    else if (finishedAt !== undefined && now - finishedAt >= COMPANION_RETURN_MS) {
      closedActors[key] ??= { event: previous.kind === 'companion' ? 'SubagentStop' : 'SessionEnd', at: finishedAt };
      actors[key] = { ...previous, finishedAt, activity: 'leaving', station: 'gate', activeTools: {}, toolName: undefined, updatedAt: now }; changed = true;
    }
    else if (previous.activity === 'thinking' && !Object.keys(previous.activeTools).length && ['Setup', 'ConfigChange', 'FileChanged', 'InstructionsLoaded', 'CwdChanged', 'DirectoryAdded', 'PostModelSwitch'].includes(previous.lastEvent) && now - previous.updatedAt > 6000) { actors[key] = { ...previous, activity: 'resting', station: 'campfire', updatedAt: now }; changed = true; }
    else if (previous.activity === 'celebrating' && now - previous.updatedAt > 3500) { actors[key] = { ...previous, activity: 'resting', station: 'campfire', updatedAt: now }; changed = true; }
    else if (previous.activity === 'resting' && now - previous.updatedAt > 18000) { actors[key] = { ...previous, activity: 'sleeping', station: 'beds', updatedAt: now }; changed = true; }
  }
  return changed ? { ...state, sequence: state.sequence + 1, actors, closedActors: Object.fromEntries(Object.entries(closedActors).sort((a, b) => b[1].at - a[1].at).slice(0, 500)) } : state;
}
