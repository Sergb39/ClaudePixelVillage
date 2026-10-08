import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const file = resolve(process.argv[2] ?? resolve(root, 'fixtures/village-day.json'));
  const input = JSON.parse(await readFile(file, 'utf8'));
  const records = Array.isArray(input) ? input : input.journal;
  if (!Array.isArray(records)) throw new Error('Use a village fixture array or a saved snapshot with a journal.');
  const token = (await readFile(resolve(root, '.village/token'), 'utf8')).trim();
  const runId = Date.now().toString(36);
  const sessions = new Map();
  let previousTime;
  let count = 0;
  for (const record of records.slice(-300)) {
    const raw = record.event ?? record;
    if (!raw || typeof raw.session_id !== 'string' || typeof raw.hook_event_name !== 'string') continue;
    if (!sessions.has(raw.session_id)) sessions.set(raw.session_id, `demo-replay-${runId}-${sessions.size + 1}`);
    const event = { session_id: sessions.get(raw.session_id) };
    for (const key of ['hook_event_name', 'agent_id', 'agent_type', 'tool_name', 'tool_use_id', 'notification_type', 'source']) {
      if (typeof raw[key] === 'string') event[key] = raw[key].replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);
    }
    const gap = typeof record.delay === 'number' ? record.delay : previousTime === undefined ? 0 : Number(record.receivedAt) - previousTime;
    if (Number.isFinite(record.receivedAt)) previousTime = record.receivedAt;
    await pause(Math.max(0, Math.min(Number.isFinite(gap) ? gap : 500, 8000)));
    const response = await fetch('http://127.0.0.1:4317/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Village-Token': token }, body: JSON.stringify(event), signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error(`The local receiver returned ${response.status}.`);
    count++;
  }
  console.log(`Replayed ${count} events as ${sessions.size} new demo sessions. Original sessions were preserved.`);
} catch (error) {
  console.error(`Replay could not finish: ${error.message} Start the local village server first.`);
  process.exitCode = 1;
}
