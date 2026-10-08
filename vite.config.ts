import { defineConfig } from 'vite';
export default defineConfig({
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  server: { host: '127.0.0.1', fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.village/**', '**/.claude/**'] } },
});
