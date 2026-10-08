import { readFile, mkdir, writeFile, copyFile, rename, lstat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHookConfig, mergeHookConfig } from './hooks-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const settingsIndex = args.indexOf('--settings');
const knownFlags = new Set(['--global', '--settings', '--expanded', '--legacy']);
try {
  if (!args.includes('--global') && settingsIndex < 0) {
    console.log('Usage: npm run hooks:install -- --global [--expanded] [--legacy]\nOr: npm run hooks:install -- --settings /absolute/path/to/settings.local.json');
  } else {
    for (let i = 0; i < args.length; i++) {
      if (!knownFlags.has(args[i])) throw new Error(`Unknown option: ${args[i]}`);
      if (args[i] === '--settings') { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--settings requires a file path.'); i++; }
    }
    if (args.includes('--global') && settingsIndex >= 0) throw new Error('Choose --global or --settings, not both.');
    const target = settingsIndex >= 0 ? resolve(args[settingsIndex + 1]) : resolve(process.env.CLAUDE_CONFIG_DIR || resolve(homedir(), '.claude'), 'settings.json');
    let before; let settings = {};
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw new Error('Settings is a symlink; merge into its managed source manually.');
      before = await readFile(target, 'utf8'); settings = JSON.parse(before);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const config = createHookConfig({ root, nodePath: process.execPath, expanded: args.includes('--expanded'), legacy: args.includes('--legacy') });
    const after = JSON.stringify(mergeHookConfig(settings, config), null, 2) + '\n';
    if (before === after) console.log('Village hooks are already installed for this machine.');
    else {
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.village-${process.pid}.tmp`;
      try {
        await writeFile(temporary, after, { mode: 0o600, flag: 'wx' });
        // Detect a concurrent edit before replacing a user-owned settings file.
        let current;
        try { current = await readFile(target, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (current !== before) throw new Error('Settings changed while installing; rerun to merge the latest version.');
        if (before !== undefined) {
          const backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
          await copyFile(target, backup);
          console.log(`Backup: ${backup}`);
        }
        await rename(temporary, target);
      } finally { await unlink(temporary).catch(() => {}); }
      console.log(`Installed ${Object.keys(config.hooks).length} village hook events in ${target}. Other settings and hooks were preserved. Start a fresh local Claude Code session.`);
    }
  }
} catch (error) { console.error(`Hooks were not installed: ${error.message}`); process.exitCode = 1; }
