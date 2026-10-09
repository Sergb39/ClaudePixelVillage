import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { createVillageServer } from '../src/server/app';

const root = mkdtempSync(join(tmpdir(), 'pixel-village-e2e-'));
cpSync(resolve('dist'), join(root, 'dist'), { recursive: true });
const port = 4319;
const { server, close } = createVillageServer({ root, port });
server.listen(port, '127.0.0.1', () => console.log(`E2E village ready at http://127.0.0.1:${port}`));
const shutdown = async () => {
  await close();
  if (resolve(root).startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith('pixel-village-e2e-')) rmSync(root, { recursive: true, force: true });
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
