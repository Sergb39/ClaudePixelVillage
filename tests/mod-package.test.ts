import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareMod } from '../scripts/prepare-mod.mjs';

test('prepared mod retains the original token path after caching and excludes credentials/settings/state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'village-mod-package-'));
  try {
    const villageRoot = join(directory, "O'Brien $Village `fun`");
    await mkdir(join(villageRoot, '.village'), { recursive: true });
    await writeFile(join(villageRoot, '.village/token'), 'never-package-this-secret');
    await writeFile(join(villageRoot, '.village/snapshot.json'), '{"private":"journal"}');
    await mkdir(join(villageRoot, '.claude'), { recursive: true });
    const settings = '{"hooks":{"SessionStart":[]},"model":"unchanged"}';
    await writeFile(join(villageRoot, '.claude/settings.json'), settings);
    const output = join(directory, 'marketplace');
    const prepared = await prepareMod({ villageRoot, output });
    const configPath = join(prepared.pluginRoot, 'hooks/connection.js');
    const config = await import(pathToFileURL(configPath).href);
    assert.equal(config.tokenPath, resolve(villageRoot, '.village/token'));
    const market = JSON.parse(await readFile(join(output, '.claude-plugin/marketplace.json'), 'utf8'));
    assert.equal(market.plugins[0].name, 'pixel-village');
    assert.equal(resolve(output, market.plugins[0].source), prepared.pluginRoot);
    assert.equal(await readFile(join(villageRoot, '.claude/settings.json'), 'utf8'), settings);
    const entries = await readdir(output, { recursive: true, withFileTypes: true });
    const fileEntries = entries.filter(entry => entry.isFile());
    assert.equal(fileEntries.length, 5, 'package is a strict allowlist of four plugin files and the marketplace');
    for (const file of fileEntries) {
      const content = await readFile(join(file.parentPath, file.name), 'utf8');
      assert.ok(!content.includes('never-package-this-secret'));
      assert.ok(!content.includes('"private":"journal"'));
    }
    const hookConfig = JSON.parse(await readFile(join(prepared.pluginRoot, 'hooks/hooks.json'), 'utf8'));
    assert.deepEqual(hookConfig.modules, ['./register.js']);
    assert.equal(hookConfig.hooks, undefined, 'native mod contains no settings-hook commands');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('mod packaging is repeatable and moving the village creates a new package version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'village-mod-version-'));
  try {
    const output = join(directory, 'marketplace');
    const first = await prepareMod({ villageRoot: join(directory, 'one'), output });
    const second = await prepareMod({ villageRoot: join(directory, 'one'), output });
    assert.equal(first.version, second.version);
    const moved = await prepareMod({ villageRoot: join(directory, 'two'), output });
    assert.notEqual(first.version, moved.version);
    const connection = await readFile(join(moved.pluginRoot, 'hooks/connection.js'), 'utf8');
    assert.ok(connection.includes(JSON.stringify(resolve(directory, 'two/.village/token'))));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
