import test from 'node:test';
import assert from 'node:assert/strict';
import { createHookConfig, mergeHookConfig } from '../scripts/hooks-config.mjs';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

test('macOS hook paths with spaces, quotes and shell characters stay literal executable arguments', () => {
  const root = "/Users/O'Brien/Pixel $Village `fun`";
  const config = createHookConfig({ root, nodePath: '/opt/homebrew/bin/node', platform: 'darwin' });
  const handler = config.hooks.SessionStart[0].hooks[0];
  assert.equal(handler.command, '/opt/homebrew/bin/node');
  assert.deepEqual(handler.args, [root + '/scripts/hook-bridge.mjs']);
  assert.equal(handler.shell, undefined);
  assert.equal(Object.keys(config.hooks).length, 11);
});
test('Windows exec form preserves actual executable paths without embedding shell syntax', () => {
  const config = createHookConfig({ root: 'C:\\Pixel Village', nodePath: 'C:\\Program Files\\nodejs\\node.exe', platform: 'win32' });
  const handler = config.hooks.SessionStart[0].hooks[0];
  assert.equal(handler.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(handler.args, ['C:\\Pixel Village\\scripts\\hook-bridge.mjs']);
});
test('reinstallation updates old machine paths, preserves grouped unrelated hooks and other settings', () => {
  const old = { permissions: { deny: ['Read(.env)'] }, hooks: { SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: 'echo existing', timeout: 1 }, { type: 'command', command: 'node C:/old/scripts/hook-bridge.mjs', timeout: 2 }] }] } };
  const config = createHookConfig({ root: '/Users/test/Pixel Village', nodePath: '/usr/local/bin/node', platform: 'darwin' });
  const merged = mergeHookConfig(old, config);
  assert.deepEqual(merged.permissions, old.permissions);
  assert.deepEqual(merged.hooks.SessionStart[0], { matcher: 'startup', hooks: [{ type: 'command', command: 'echo existing', timeout: 1 }] });
  assert.equal(merged.hooks.SessionStart.length, 2);
  assert.deepEqual(mergeHookConfig(merged, config), merged);
  assert.equal(old.hooks.SessionStart[0].hooks.length, 2);
  assert.throws(() => mergeHookConfig({ hooks: 'broken' }, config));
});
test('installer backs up settings, preserves permissions, is idempotent and refuses invalid JSON', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'village-install-'));
  const target = join(directory, 'settings.json');
  const run = () => new Promise<number | null>((done, reject) => {
    const child = spawn(process.execPath, [resolve('scripts/install-hooks.mjs'), '--settings', target], { stdio: 'ignore' });
    child.on('error', reject); child.on('close', done);
  });
  try {
    const before = JSON.stringify({ permissions: { deny: ['Bash(rm *)'] }, model: 'test-model' });
    writeFileSync(target, before);
    assert.equal(await run(), 0);
    const installed = readFileSync(target, 'utf8'); const settings = JSON.parse(installed);
    assert.deepEqual(settings.permissions, { deny: ['Bash(rm *)'] });
    assert.equal(settings.model, 'test-model');
    assert.equal(Object.keys(settings.hooks).length, 11);
    const backups = readdirSync(directory).filter(name => name.startsWith('settings.json.backup-'));
    assert.equal(backups.length, 1); assert.equal(readFileSync(join(directory, backups[0]), 'utf8'), before);
    assert.equal(await run(), 0); assert.equal(readFileSync(target, 'utf8'), installed);
    assert.equal(readdirSync(directory).filter(name => name.includes('backup')).length, 1);
    writeFileSync(target, '{invalid');
    assert.equal(await run(), 1); assert.equal(readFileSync(target, 'utf8'), '{invalid');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
