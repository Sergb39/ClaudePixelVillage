import { readFile, copyFile, rename, lstat, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeVillageHooks } from './legacy-cleanup.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pathIndex = args.indexOf('--settings');
try {
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: npm run hooks:uninstall -- --global\nOr: npm run hooks:uninstall -- --settings /absolute/path/to/settings.local.json');
  } else {
    if (args.includes('--global') && pathIndex >= 0) throw new Error('Choose --global or --settings.');
    if (args.includes('--global') ? args.length !== 1 : pathIndex !== 0 || args.length !== 2 || !args[1]) throw new Error('Usage: --global or --settings /absolute/path');
    const target = pathIndex >= 0 ? resolve(args[1]) : resolve(process.env.CLAUDE_CONFIG_DIR || resolve(homedir(), '.claude'), 'settings.json');
    const info = await lstat(target);
    if (info.isSymbolicLink()) throw new Error('Settings is a symlink; edit its managed source instead.');
    const before = await readFile(target, 'utf8');
    const settings = JSON.parse(before);
    const cleaned = removeVillageHooks(settings, root);
    if (JSON.stringify(settings) === JSON.stringify(cleaned)) {
      console.log('No legacy hooks for this Pixel Village checkout were found.');
    } else {
      const after = JSON.stringify(cleaned, null, 2) + '\n';
      const temporary = `${target}.village-${process.pid}.tmp`;
      try {
        await writeFile(temporary, after, { mode: info.mode & 0o777, flag: 'wx' });
        if (await readFile(target, 'utf8') !== before) throw new Error('Settings changed during migration; retry with the latest file.');
        const backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        await copyFile(target, backup);
        await rename(temporary, target);
        console.log(`Removed this checkout's legacy hooks from ${target}. Backup: ${backup}`);
      } finally { await unlink(temporary).catch(() => {}); }
    }
  }
} catch (error) { console.error(`Could not remove legacy hooks: ${error.message}`); process.exitCode = 1; }
