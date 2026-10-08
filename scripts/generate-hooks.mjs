import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHookConfig } from './hooks-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = process.argv.includes('--legacy');
await mkdir(resolve(root, 'config'), { recursive: true });
for (const name of ['core', 'expanded']) {
  const config = createHookConfig({ root, nodePath: process.execPath, expanded: name === 'expanded', legacy });
  await writeFile(resolve(root, `config/hooks.${name}.json`), JSON.stringify(config, null, 2) + '\n');
}
console.log(`Generated core and expanded hook examples for ${process.platform} using this machine's Node and village paths. Regenerate after moving the project. ${legacy ? 'Legacy shell form enabled.' : 'Direct executable form enabled (current Claude Code).'} These examples do not edit settings. To install core hooks globally: npm run hooks:install -- --global. WorktreeCreate/Remove, FileChanged and MessageDisplay are excluded.`);
