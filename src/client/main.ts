import './style.css';
import { createWorld } from './world';
import { actorKey, type ActorState, type Snapshot, type VillageEvent } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const hookNames = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'SubagentStart', 'SubagentStop', 'TaskCreated', 'TaskCompleted', 'Stop', 'StopFailure', 'TeammateIdle', 'Setup', 'InstructionsLoaded', 'UserPromptExpansion', 'PostToolBatch', 'PermissionDenied', 'ConfigChange', 'CwdChanged', 'DirectoryAdded', 'FileChanged', 'PreCompact', 'PostCompact', 'PreModelSwitch', 'PostModelSwitch', 'Elicitation', 'ElicitationResult', 'MessageDisplay', 'SessionEnd'];
const hookSelect = $<HTMLSelectElement>('hook-select');
hookSelect.innerHTML = hookNames.map(name => `<option>${name}</option>`).join('');
const actorSelect = $<HTMLSelectElement>('actor-select');
let snapshot: Snapshot = { sequence: 0, actors: {}, journal: [] };
let selectedId: string | undefined;
let demoGeneration = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let toolSerial = Date.now();
let newSerial = 0;
let questSerial = 0;
let lastSeed = false;
const { scene, game } = createWorld();
scene.onSelect = selectResident;
scene.onReady = () => render();

function toast(message: string) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3400); }
function setConnection(connected: boolean) { const el = $('connection'); el.classList.toggle('offline', !connected); el.innerHTML = `<i></i>${connected ? 'Village connected' : 'Reconnecting…'}`; }
async function request(path: string, body?: unknown) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(response.status === 403 ? 'Refresh the page to reconnect to the local server.' : 'The local village could not receive that event.');
  return response.json();
}
async function send(event: VillageEvent) { return request('/api/events', event); }
async function emit(name: string, session = 'demo-willow', extras: Partial<VillageEvent> = {}) { return send({ hook_event_name: name, session_id: session, ...extras }); }
function useSnapshot(next: Snapshot) {
  if (next.sequence < snapshot.sequence) return;
  snapshot = next;
  scene.sync(next);
  if (!selectedId || !snapshot.actors[selectedId]) selectedId = Object.values(snapshot.actors).find(a => a.kind === 'hero' && a.activity !== 'leaving')?.id ?? Object.keys(snapshot.actors)[0];
  scene.select(selectedId);
  render();
}
function selectResident(id: string) {
  selectedId = id; scene.select(id);
  const actor = snapshot.actors[id];
  if (actor?.sessionId.startsWith('demo-')) actorSelect.value = actor.id;
  if (scene.zoomLevel > 1) scene.setZoom(scene.zoomLevel);
  render();
}
const activityLabel: Record<string, string> = { arriving: 'Just arrived', thinking: 'Planning a quest', working: 'On a quest', waiting: 'Needs your attention', celebrating: 'A little celebration', resting: 'By the campfire', sleeping: 'Dreaming peacefully', leaving: 'Heading home', interrupted: 'A bump in the road' };
const stationLabel: Record<string, string> = { gate: 'village gate', board: 'quest board', library: 'reading room', forge: 'little forge', training: 'training yard', observatory: 'star watch', campfire: 'campfire', beds: 'dream cottage' };
function render() {
  const residents = Object.values(snapshot.actors).filter(a => a.activity !== 'leaving');
  const heroes = residents.filter(a => a.kind === 'hero');
  const list = heroes.flatMap(hero => [hero, ...residents.filter(a => a.kind === 'companion' && a.sessionId === hero.sessionId)]);
  const orphaned = residents.filter(a => a.kind === 'companion' && !heroes.some(h => h.sessionId === a.sessionId));
  list.push(...orphaned);
  $('resident-count').textContent = String(residents.length);
  const companions = residents.length - heroes.length;
  $('world-count').textContent = `${heroes.length} adventurer${heroes.length === 1 ? '' : 's'}${companions ? ` · ${companions} companion${companions === 1 ? '' : 's'}` : ''}`;
  const onlyDemo = heroes.every(a => a.sessionId.startsWith('demo-'));
  $('world-mode').textContent = onlyDemo && residents.length ? 'A LITTLE DEMO WORLD' : 'YOUR LOCAL VILLAGE';
  const cards = list.map(actor => {
    const portrait = scene.portrait(actor);
    return `<button class="resident-card ${actor.kind} ${actor.id === selectedId ? 'selected' : ''}" data-resident="${escape(actor.id)}" aria-pressed="${actor.id === selectedId}"><span class="portrait">${portrait ? `<img src="${portrait}" alt="" />` : '✦'}</span><span class="resident-info"><strong>${escape(actor.name)}</strong><small>${escape(activityLabel[actor.activity])}</small></span><i class="resident-state ${actor.activity}" aria-hidden="true"></i></button>`;
  }).join('');
  $('residents').innerHTML = cards || '<p class="empty-note">It’s quiet here. Start a session or play a village day.</p>';
  $('residents').querySelectorAll<HTMLButtonElement>('[data-resident]').forEach(button => button.onclick = () => selectResident(button.dataset.resident!));
  const actor = selectedId ? snapshot.actors[selectedId] : undefined;
  if (actor) {
    const children = residents.filter(a => a.sessionId === actor.sessionId && a.kind === 'companion').length;
    const active = Object.keys(actor.activeTools).length;
    const description = actor.activity === 'waiting' ? 'A question is waiting for you. Your adventurer will continue when Claude receives your response.' : actor.activity === 'sleeping' ? 'The day’s work is done. A new prompt will wake this sleepy adventurer.' : actor.activity === 'working' ? `Making progress at the ${stationLabel[actor.station]}.${active > 1 ? ` ${active} tools are working together.` : ''}` : actor.activity === 'resting' ? 'A well-earned break. Soon the campfire stories will turn into dreams.' : actor.kind === 'companion' && actor.activity === 'celebrating' ? 'Bringing a little sparkle back to the main adventurer.' : `${activityLabel[actor.activity]} near the ${stationLabel[actor.station]}.`;
    $('character-detail').innerHTML = `<div class="detail-top"><strong>${escape(actor.name)}’s story</strong><span class="detail-label">${actor.kind === 'hero' ? 'ADVENTURER' : 'COMPANION'}</span></div><p>${escape(description)}</p><p class="detail-meta">${actor.sessionId.startsWith('demo-') ? 'DEMO' : 'CLAUDE SESSION'} · ${actor.kind === 'hero' ? `${children} companion${children === 1 ? '' : 's'}` : escape(actor.agentId ?? '')}${actor.toolName ? ` · ${escape(actor.toolName)}` : ''}</p>`;
  } else $('character-detail').innerHTML = '<p class="empty-note">Choose a resident to see their story.</p>';
  const currentOption = actorSelect.value;
  const demos = Object.values(snapshot.actors).filter(a => a.sessionId.startsWith('demo-') && a.activity !== 'leaving').sort((a, b) => a.kind.localeCompare(b.kind));
  actorSelect.innerHTML = demos.map(a => `<option value="${escape(a.id)}">${escape(a.name)}${a.kind === 'companion' ? ' · companion' : ''}</option>`).join('') || '<option value="demo-willow">Willow · new adventurer</option>';
  if (demos.some(a => a.id === currentOption)) actorSelect.value = currentOption;
  else if (selectedId && demos.some(a => a.id === selectedId)) actorSelect.value = selectedId;
  const recent = [...snapshot.journal].reverse().slice(0, 8);
  $('event-feed').innerHTML = recent.map(event => {
    const name = snapshot.actors[actorKey(event.session_id, event.agent_id)]?.name ?? 'An adventurer';
    const [icon, phrase] = eventDescription(event);
    return `<div class="feed-entry"><span class="feed-icon" aria-hidden="true">${icon}</span><span><strong>${escape(name)}</strong> ${escape(phrase)}</span><time datetime="${new Date(event.receivedAt).toISOString()}">${age(event.receivedAt)}</time></div>`;
  }).join('') || '<p class="empty-note">The next little adventure starts with you.</p>';
}
function age(timestamp: number) { const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`; }
function eventDescription(event: VillageEvent): [string, string] {
  const items: Record<string, [string, string]> = { SessionStart: ['+', 'arrived in the village'], UserPromptSubmit: ['⚑', 'picked up a new quest'], PreToolUse: ['◇', `set off for the ${stationLabel[stationForTool(event.tool_name)]}`], PostToolUse: ['✓', 'made a little progress'], PostToolUseFailure: ['!', 'hit a bump in the road'], SubagentStart: ['♧', 'joined the adventure'], SubagentStop: ['✦', 'brought back their findings'], Stop: ['☾', 'took a well-earned break'], PermissionRequest: ['?', 'is waiting for your help'], PermissionDenied: ['!', 'found a locked gate'], Elicitation: ['?', 'has a question for you'], TaskCompleted: ['✦', 'finished a quest'], SessionEnd: ['↗', 'waved goodbye'], StopFailure: ['!', 'needs a moment to recover'], PreCompact: ['▤', 'organized their backpack'], PostCompact: ['✧', 'is ready to continue'], Notification: ['♬', 'heard a little bell'] };
  return items[event.hook_event_name] ?? ['·', event.hook_event_name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()];
}
function stationForTool(tool = '') { if (/read|glob|grep/i.test(tool)) return 'library'; if (/edit|write/i.test(tool)) return 'forge'; if (/web|fetch|search|mcp/i.test(tool)) return 'observatory'; if (/bash|shell|test/i.test(tool)) return 'training'; return 'board'; }
function chosen() {
  const id = actorSelect.value;
  const actor = snapshot.actors[id];
  return actor ?? { id: 'demo-willow', sessionId: 'demo-willow', agentId: undefined, activeTools: {}, kind: 'hero' };
}
const tools = ['Read', 'Edit', 'WebSearch', 'Bash'];
async function startQuest(actor = chosen()) {
  await emit('UserPromptSubmit', actor.sessionId, { agent_id: actor.agentId });
  await emit('PreToolUse', actor.sessionId, { agent_id: actor.agentId, tool_name: tools[questSerial++ % tools.length], tool_use_id: `demo-tool-${++toolSerial}` });
}
async function complete(actor = chosen()) {
  for (const [id, tool] of Object.entries(actor.activeTools)) await emit('PostToolUse', actor.sessionId, { agent_id: actor.agentId, tool_name: tool, tool_use_id: id });
  await emit(actor.kind === 'companion' ? 'SubagentStop' : 'TaskCompleted', actor.sessionId, { agent_id: actor.agentId });
}
async function action(name: string) {
  const actor = chosen();
  if (name === 'new') {
    const names = ['rowan', 'hazel', 'fern', 'sage', 'juniper', 'clover'];
    const base = names[newSerial++ % names.length]; const id = `demo-${base}-${newSerial}`;
    await emit('SessionStart', id); actorSelect.value = id; selectResident(id); toast('A new adventurer has moved in.');
  } else if (name === 'quest') { await startQuest(actor); toast('A new quest is underway.'); }
  else if (name === 'companion') {
    const id = `sprout-${++toolSerial}`;
    await emit('SubagentStart', actor.sessionId, { agent_id: id, agent_type: 'explorer' });
    await emit('PreToolUse', actor.sessionId, { agent_id: id, tool_name: tools[(questSerial++ + 1) % tools.length], tool_use_id: `demo-tool-${++toolSerial}` });
    toast('A little companion is off to help.');
  } else if (name === 'complete') { await complete(actor); toast('Time for a tiny celebration.'); }
  else if (name === 'rest') {
    for (const [id, tool] of Object.entries(actor.activeTools)) await emit('PostToolUse', actor.sessionId, { agent_id: actor.agentId, tool_name: tool, tool_use_id: id });
    await emit('Stop', actor.sessionId, { agent_id: actor.agentId }); toast('Campfire first. A cozy nap in a little while.');
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.onclick = () => void action(button.dataset.action!).catch(error => toast(error.message)));
actorSelect.onchange = () => { if (snapshot.actors[actorSelect.value]) selectResident(actorSelect.value); };
$('send-hook').onclick = () => void (async () => {
  const actor = chosen(); const hook = hookSelect.value;
  let extras: Partial<VillageEvent> = { agent_id: actor.agentId };
  if (hook === 'SubagentStart') extras = { agent_id: `pip-${++toolSerial}`, agent_type: 'helper' };
  if (hook === 'SubagentStop' && !actor.agentId) { const companion = Object.values(snapshot.actors).find(a => a.sessionId === actor.sessionId && a.kind === 'companion'); if (!companion) { toast('Send a companion first, or select one from the list.'); return; } extras.agent_id = companion.agentId; }
  if (/ToolUse|Permission/.test(hook)) { const existing = Object.keys(actor.activeTools)[0]; extras.tool_name = $<HTMLSelectElement>('tool-select').value; extras.tool_use_id = hook === 'PreToolUse' ? `demo-tool-${++toolSerial}` : existing ?? `demo-tool-${++toolSerial}`; }
  if (hook === 'Notification') extras.notification_type = 'idle_prompt';
  await emit(hook, actor.sessionId, extras); toast(`${hook} reached the village.`);
})().catch(error => toast(error.message));

const playButton = $<HTMLButtonElement>('play-demo');
function stopDemo() { demoGeneration++; playButton.classList.remove('running'); playButton.innerHTML = '<span aria-hidden="true">▶</span> Play a village day'; }
async function playDay() {
  if (playButton.classList.contains('running')) { stopDemo(); toast('The story is paused. You can keep playing with the hooks.'); return; }
  const generation = ++demoGeneration;
  playButton.classList.add('running'); playButton.innerHTML = '<span aria-hidden="true">■</span> Stop the story';
  const events: { delay: number; event: VillageEvent }[] = [
    { delay: 0, event: { hook_event_name: 'SessionStart', session_id: 'demo-willow' } },
    { delay: 0, event: { hook_event_name: 'SessionStart', session_id: 'demo-rowan' } },
    { delay: 1000, event: { hook_event_name: 'UserPromptSubmit', session_id: 'demo-willow' } },
    { delay: 0, event: { hook_event_name: 'PreToolUse', session_id: 'demo-willow', tool_name: 'Read', tool_use_id: `day-read-${generation}` } },
    { delay: 2000, event: { hook_event_name: 'PreToolUse', session_id: 'demo-rowan', tool_name: 'Bash', tool_use_id: `day-test-${generation}` } },
    { delay: 3500, event: { hook_event_name: 'SubagentStart', session_id: 'demo-willow', agent_id: 'sprout', agent_type: 'explorer' } },
    { delay: 0, event: { hook_event_name: 'PreToolUse', session_id: 'demo-willow', agent_id: 'sprout', tool_name: 'WebSearch', tool_use_id: `day-search-${generation}` } },
    { delay: 6000, event: { hook_event_name: 'PostToolUse', session_id: 'demo-willow', tool_name: 'Read', tool_use_id: `day-read-${generation}` } },
    { delay: 0, event: { hook_event_name: 'PreToolUse', session_id: 'demo-willow', tool_name: 'Edit', tool_use_id: `day-edit-${generation}` } },
    { delay: 2500, event: { hook_event_name: 'PermissionRequest', session_id: 'demo-rowan', tool_name: 'Bash', tool_use_id: `day-test-${generation}` } },
    { delay: 4000, event: { hook_event_name: 'PostToolUse', session_id: 'demo-rowan', tool_name: 'Bash', tool_use_id: `day-test-${generation}` } },
    { delay: 0, event: { hook_event_name: 'Stop', session_id: 'demo-rowan' } },
    { delay: 3500, event: { hook_event_name: 'PostToolUse', session_id: 'demo-willow', agent_id: 'sprout', tool_name: 'WebSearch', tool_use_id: `day-search-${generation}` } },
    { delay: 0, event: { hook_event_name: 'SubagentStop', session_id: 'demo-willow', agent_id: 'sprout' } },
    { delay: 6500, event: { hook_event_name: 'PostToolUse', session_id: 'demo-willow', tool_name: 'Edit', tool_use_id: `day-edit-${generation}` } },
    { delay: 0, event: { hook_event_name: 'TaskCompleted', session_id: 'demo-willow' } },
    { delay: 3500, event: { hook_event_name: 'Stop', session_id: 'demo-willow' } },
  ];
  try {
    // Restart only the demo cast; real Claude sessions keep their village state.
    await request('/api/reset', {});
    for (const item of events) {
      if (item.delay) await new Promise(resolve => setTimeout(resolve, item.delay));
      if (generation !== demoGeneration) return;
      await send(item.event);
    }
    if (generation === demoGeneration) { stopDemo(); toast('A lovely day’s work. Watch the village settle down for a nap.'); }
  } catch (error) { stopDemo(); toast((error as Error).message); }
}
playButton.onclick = () => void playDay();
$('reset-demo').onclick = () => void (async () => { stopDemo(); await request('/api/reset', {}); toast('A fresh start for the demo village. Real sessions stay put.'); })().catch(error => toast(error.message));
$('setup-open').onclick = () => $<HTMLDialogElement>('setup-dialog').showModal();
$('zoom-in').onclick = () => { scene.setZoom(scene.zoomLevel + .25); $('zoom-value').textContent = `${scene.zoomLevel}×`; };
$('zoom-out').onclick = () => { scene.setZoom(scene.zoomLevel - .25); $('zoom-value').textContent = `${scene.zoomLevel}×`; };
const motionButton = $<HTMLButtonElement>('motion-toggle');
motionButton.setAttribute('aria-pressed', String(scene.reducedMotion));
motionButton.onclick = () => { scene.setMotion(!scene.reducedMotion); motionButton.setAttribute('aria-pressed', String(scene.reducedMotion)); motionButton.innerHTML = `${scene.reducedMotion ? '◍' : '◌'} <span>${scene.reducedMotion ? 'Calm' : 'Motion'}</span>`; };
const stream = new EventSource('/api/stream');
stream.addEventListener('snapshot', event => { setConnection(true); try { useSnapshot(JSON.parse((event as MessageEvent).data)); } catch { toast('Could not read a village update. Refresh to reconnect.'); } });
stream.onerror = () => setConnection(false);
stream.onopen = () => setConnection(true);
void (async () => {
  try {
    const initial = await request('/api/state') as Snapshot; useSnapshot(initial);
    if (!Object.keys(initial.actors).length && !lastSeed) {
      lastSeed = true;
      await emit('SessionStart', 'demo-willow'); await emit('SessionStart', 'demo-rowan');
      await emit('Stop', 'demo-rowan'); await emit('UserPromptSubmit', 'demo-willow');
      await emit('PreToolUse', 'demo-willow', { tool_name: 'Read', tool_use_id: `welcome-${++toolSerial}` });
    }
  } catch (error) { setConnection(false); toast((error as Error).message); }
})();
setInterval(() => { if (!document.hidden) render(); }, 10000);
window.addEventListener('pagehide', () => { stopDemo(); stream.close(); game.destroy(true); });
