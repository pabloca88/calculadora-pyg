import { defineConfig } from '@playwright/test';

// Config separada para e2e/live-rates.spec.ts: pega contra producción real
// (el sitio público de Cambios Chaco + la API deployada), no contra un dev
// server local, así que no hay webServer acá — se corre a mano con
// `npm run test:live`, nunca como parte de `npm test`/`npm run test:e2e`
// ni del pre-push hook.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['live-rates.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.LIVE_BASE_URL || 'https://calculadora-pyg.vercel.app',
  },
});
