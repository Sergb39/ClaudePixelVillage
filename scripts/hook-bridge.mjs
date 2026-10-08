import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Fail open: observer hooks must never influence Claude's decisions or output.
const deadline = setTimeout(() => process.exit(0), 1200);
deadline.unref();
try {
  let body = ''; let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1048576) process.exit(0);
    body += chunk;
  }
  const raw = JSON.parse(body); const event = {};
  for (const key of ['hook_event_name', 'session_id', 'agent_id', 'agent_type', 'tool_name', 'tool_use_id', 'notification_type', 'source']) {
    if (typeof raw[key] === 'string') event[key] = raw[key].replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160);
  }
  if (event.hook_event_name && event.session_id) {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const token = (await readFile(resolve(root, '.village/token'), 'utf8')).trim();
    await fetch('http://127.0.0.1:4317/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Village-Token': token }, body: JSON.stringify(event), signal: AbortSignal.timeout(700) });
  }
} catch { /* Missing token, invalid stdin, stopped server: silently ignore. */ }
clearTimeout(deadline);
process.exitCode = 0;
