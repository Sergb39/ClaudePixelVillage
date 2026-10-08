import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const settingsPath = resolve(process.env.CLAUDE_CONFIG_DIR || resolve(homedir(), '.claude'), 'settings.json');
  let configured = false;
  try {
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    const bridge = resolve(root, 'scripts/hook-bridge.mjs').replaceAll('\\', '/');
    configured = (settings.hooks?.SessionStart ?? []).some(group => (group.hooks ?? []).some(hook => (hook.args ?? []).some(arg => typeof arg === 'string' && arg.replaceAll('\\', '/') === bridge) || typeof hook.command === 'string' && hook.command.replaceAll('\\', '/').includes(bridge)));
  } catch { /* Report missing or invalid global settings separately. */ }
  console.log(`Global SessionStart hook for this village: ${configured ? 'found' : 'not found (run npm run hooks:install -- --global)'}`);
  const health = await fetch('http://127.0.0.1:4317/api/health', { signal: AbortSignal.timeout(2000) });
  if (!health.ok) throw new Error(`Local server returned ${health.status}.`);
  const token = (await readFile(resolve(root, '.village/token'), 'utf8')).trim();
  const session = 'demo-hook-check';
  const sent = await fetch('http://127.0.0.1:4317/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Village-Token': token }, body: JSON.stringify({ hook_event_name: 'SessionStart', session_id: session }), signal: AbortSignal.timeout(2000) });
  if (sent.status !== 202) throw new Error(`Receiver rejected the test event (${sent.status}).`);
  const stateResponse = await fetch('http://127.0.0.1:4317/api/state', { signal: AbortSignal.timeout(2000) });
  const state = await stateResponse.json();
  if (!state.actors?.[session]) throw new Error('Test event was accepted but no actor appeared in server state.');
  console.log('Server and authenticated event delivery: OK. A demo test adventurer is in the village.');
  console.log('This checks the local receiver; start a fresh local Claude Code session to verify Claude itself fires the hooks.');
  if (!configured) process.exitCode = 1;
} catch (error) { console.error(`Hook check failed: ${error.message} Ensure npm start or npm run dev is running in this village directory.`); process.exitCode = 1; }
