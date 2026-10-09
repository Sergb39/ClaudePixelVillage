import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4319', ...devices['Desktop Chrome'] },
  webServer: { command: 'npx tsx scripts/e2e-server.ts', url: 'http://127.0.0.1:4319/api/health', reuseExistingServer: false, timeout: 30000 },
});
