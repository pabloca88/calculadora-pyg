import { test, expect } from '@playwright/test';

/**
 * Test LIVE contra producción real — no usa fixtures ni mocks, así que SÍ
 * detecta si el deploy está devolviendo null o una tasa vieja (algo que los
 * tests normales, corridos contra fixtures/localhost, no pueden ver).
 *
 * No corre en `npm test` / `npm run test:e2e` / el pre-push hook — se invoca
 * a mano con `npm run test:live` (usa playwright.live.config.ts).
 * BASE_URL por defecto: https://calculadora-pyg.vercel.app (override con
 * la env var LIVE_BASE_URL).
 */

const CHACO_WIDGET_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const CACHE_TOLERANCE_GS = 50; // la caché de 30 min del backend puede desalinear un poco

const parseGs = (raw: string): number =>
  parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'));

test.describe('Live rates — producción', () => {
  test('la API /api/pyg-rates coincide con el sitio real de Cambios Chaco', async ({ page, request, baseURL }) => {
    // 1. Leer el valor real directo del DOM del widget público de Cambios Chaco
    await page.goto(CHACO_WIDGET_URL);
    const row = page.locator('tr', { hasText: 'Dólar Americano' });
    await expect(row).toBeVisible({ timeout: 20000 });
    const compraText = (await row.locator('td').nth(1).textContent()) ?? '';
    const siteCompra = parseGs(compraText);
    expect(siteCompra).toBeGreaterThan(0);
    console.log(`[live] Cambios Chaco (sitio real): compra=${siteCompra}`);

    // 2. Pedir la API deployada
    const apiRes = await request.get(`${baseURL}/api/pyg-rates`);
    expect(apiRes.ok()).toBe(true);
    const apiData = await apiRes.json();
    const apiCompra = apiData.chaco?.compra;
    console.log(`[live] API ${baseURL}/api/pyg-rates: compra=${apiCompra}`);

    expect(apiCompra).not.toBeNull();
    expect(apiCompra).toBeGreaterThan(4000);
    expect(apiCompra).toBeLessThan(10000);

    const diff = Math.abs(apiCompra - siteCompra);
    console.log(`[live] diferencia sitio vs API: ${diff} Gs (tolerancia ±${CACHE_TOLERANCE_GS} por caché de 30 min)`);
    expect(diff).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  });

  test('la UI en producción muestra el mismo valor de Chaco en la card Efectivo USD', async ({ page, request, baseURL }) => {
    await page.goto('/');

    const input = page.locator('[placeholder="0"]').first();
    await input.fill('100000');

    const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
    const label = efectivoCard.locator('.payment-card-label');
    await expect(label).toHaveText(/Chaco compra ₲/, { timeout: 30000 });

    const labelText = (await label.textContent()) ?? '';
    console.log(`[live] UI label Efectivo USD: "${labelText}"`);

    const apiRes = await request.get(`${baseURL}/api/pyg-rates`);
    const apiData = await apiRes.json();
    const apiCompra = apiData.chaco?.compra;

    const uiMatch = labelText.match(/Chaco compra ₲([\d.]+)/);
    expect(uiMatch).not.toBeNull();
    if (uiMatch) {
      const uiCompra = parseGs(uiMatch[1]);
      console.log(`[live] UI compra=${uiCompra} vs API compra=${apiCompra}`);
      expect(Math.abs(uiCompra - (apiCompra ?? 0))).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
    }
  });
});
