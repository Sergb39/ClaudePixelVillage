import { createVillageServer } from './app';

const dev = process.argv.includes('--dev');
const vite = dev ? await (await import('vite')).createServer({ server: { middlewareMode: true }, appType: 'spa' }) : undefined;
const { server } = createVillageServer({ middleware: vite?.middlewares });
server.listen(4317, '127.0.0.1', () => console.log('Pixel Village is ready at http://127.0.0.1:4317'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; void vite?.close(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); void vite?.close(); });
