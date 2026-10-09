import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const moduleFiles = ['.claude-plugin/plugin.json', 'hooks/hooks.json', 'hooks/register.js'];

/** Package only mod source and a token-file path, never the token or village state. */
export async function prepareMod({ villageRoot = projectRoot, output = resolve(projectRoot, 'config/mod-marketplace') } = {}) {
  const marketplaceRoot = resolve(output);
  const pluginRoot = resolve(marketplaceRoot, 'plugins/pixel-village');
  const tokenPath = resolve(villageRoot, '.village/token');
  const files = new Map(await Promise.all(moduleFiles.map(async name => [name, await readFile(resolve(projectRoot, 'mod', name), 'utf8')])));
  // JSON string encoding preserves spaces, quotes, backslashes and shell characters literally.
  files.set('hooks/connection.js', `// Generated for this computer. Contains a file path, never a credential.\nexport const tokenPath = ${JSON.stringify(tokenPath)};\n`);
  const fingerprint = createHash('sha256');
  for (const [name, content] of files) fingerprint.update(name).update('\0').update(content).update('\0');
  const manifest = JSON.parse(files.get('.claude-plugin/plugin.json'));
  manifest.version = `${manifest.version.split('-')[0]}-local.${fingerprint.digest('hex').slice(0, 12)}`;
  files.set('.claude-plugin/plugin.json', JSON.stringify(manifest, null, 2) + '\n');
  for (const [name, content] of files) {
    const target = resolve(pluginRoot, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  const marketplace = {
    name: 'pixel-village-local',
    description: 'Pixel Village on this computer',
    owner: manifest.author,
    plugins: [{ name: manifest.name, source: './plugins/pixel-village', description: manifest.description }],
  };
  await mkdir(resolve(marketplaceRoot, '.claude-plugin'), { recursive: true });
  await writeFile(resolve(marketplaceRoot, '.claude-plugin/marketplace.json'), JSON.stringify(marketplace, null, 2) + '\n');
  return { marketplaceRoot, pluginRoot, version: manifest.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--output')) throw new Error('Usage: npm run mod:prepare -- [--output /path/to/marketplace]');
    const result = await prepareMod(args.length ? { output: args[1] } : {});
    const displayPath = result.marketplaceRoot.replaceAll('\\', '/');
    console.log(`Pixel Village mod prepared (${result.version}).`);
    console.log('Keep the village server running, then run these inside a local Claude Code session:');
    console.log(`/plugin marketplace add ${JSON.stringify(displayPath)}`);
    console.log('/plugin install pixel-village@pixel-village-local');
    console.log('Choose user scope, then start a fresh session and run /village to check delivery.');
    console.log('No Claude settings or hook entries were changed. The package contains a token-file path, not the token.');
  } catch (error) { console.error(`Could not prepare mod: ${error.message}`); process.exitCode = 1; }
}
