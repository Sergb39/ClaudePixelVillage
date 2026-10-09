import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { prepareMod } from './prepare-mod.mjs';

const root = resolve(import.meta.dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Node.js 22.12+ is required. Current version: ${process.version}`);
  process.exitCode = 1;
} else {
  try {
    const prepared = await prepareMod();
    const marketplace = prepared.marketplaceRoot.replaceAll('\\', '/');
    console.log(`Pixel Village mod prepared at ${marketplace}`);
    let receiver = false;
    try {
      const response = await fetch('http://127.0.0.1:4317/api/health', { signal: AbortSignal.timeout(1500) });
      receiver = response.ok;
    } catch { /* The receiver has not started yet. */ }
    let token = false;
    try { token = (await stat(resolve(root, '.village/token'))).isFile(); } catch { /* Created by the server on first start. */ }
    const claude = process.platform === 'win32'
      ? spawnSync('where.exe', ['claude'], { encoding: 'utf8', timeout: 3000 })
      : spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 3000 });
    console.log(`Receiver: ${receiver ? 'ready' : 'not running — run npm run dev in another terminal'}`);
    console.log(`Delivery token: ${token ? 'ready' : 'not created — starting the receiver creates it'}`);
    console.log(`Claude Code CLI: ${claude.status === 0 ? process.platform === 'win32' ? 'found on PATH' : claude.stdout.trim() : 'not found on PATH — install or open Claude Code Desktop'}`);
    console.log('In a local Claude Code session, run:');
    console.log(`/plugin marketplace add ${JSON.stringify(marketplace)}`);
    console.log('/plugin install pixel-village@pixel-village-local');
    console.log('/reload-plugins');
    console.log('Then run /village and submit a tool-using prompt. The browser should show Claude events flowing.');
  } catch (error) { console.error(`Setup could not prepare the mod: ${error.message}`); process.exitCode = 1; }
}
