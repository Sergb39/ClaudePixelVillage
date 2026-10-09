import test from 'node:test';
import assert from 'node:assert/strict';
import { removeVillageHooks } from '../scripts/legacy-cleanup.mjs';

test('migration removes only this checkout bridge and preserves other hooks and settings', () => {
  const root = 'C:\\Pixel Village';
  const own = { type: 'command', command: 'node', args: ['C:\\Pixel Village\\scripts\\hook-bridge.mjs'] };
  const other = { type: 'command', command: 'node', args: ['C:\\Other Village\\scripts\\hook-bridge.mjs'] };
  const settings = { permissions: { allow: ['Read'] }, hooks: { SessionStart: [{ matcher: 'start', hooks: [own, other] }], Stop: [{ hooks: [own] }] } };
  assert.deepEqual(removeVillageHooks(settings, root, 'win32'), { permissions: settings.permissions, hooks: { SessionStart: [{ matcher: 'start', hooks: [other] }] } });
  assert.equal(settings.hooks.Stop.length, 1);
});
