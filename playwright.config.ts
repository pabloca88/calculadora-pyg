import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // live-rates.spec.ts pega contra producción (sitio real de Cambios Chaco +
  // ${LIVE_BASE_URL}), no contra el dev server local — corre aparte con
  // `npm run test:live` (ver playwright.live.config.ts), nunca en este run
  // normal ni en el pre-push hook.
  testIgnore: ['**/live-rates.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
