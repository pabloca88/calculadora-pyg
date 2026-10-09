import { test, expect, type Page } from '@playwright/test';

/**
 * Test LIVE contra producción real — no usa fixtures ni mocks, así que SÍ
 * detecta si el deploy está devolviendo null o una tasa vieja (algo que los
 * tests normales, corridos contra fixtures/localhost, no pueden ver).
 *
 * Cambios Chaco es la fuente primaria, con fallback automático a
 * Maxicambios si Chaco no responde (Cloudflare bloquea las IPs de
 * datacenter de Vercel con un 403 challenge). Este test compara la API
 * contra el sitio de la fuente que la API REPORTA — si source=maxi, lee
 * Maxicambios, no Chaco — y falla fuerte si source='none'.
 *
 * No corre en `npm test` / `npm run test:e2e` / el pre-push hook — se invoca
 * a mano con `npm run test:live` (usa playwright.live.config.ts).
 * BASE_URL por defecto: https://calculadora-pyg.vercel.app (override con
 * la env var LIVE_BASE_URL).
 */

const CHACO_WIDGET_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const MAXI_URL = 'https://www.maxicambios.com.py/share';
const CACHE_TOLERANCE_GS = 50; // la caché de 30 min del backend puede desalinear un poco

const parseGs = (raw: string): number =>
  parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'));

async function readChacoCompra(page: Page): Promise<number> {
  await page.goto(CHACO_WIDGET_URL);
  const row = page.locator('tr', { hasText: 'Dólar Americano' });
  await expect(row).toBeVisible({ timeout: 20000 });
  const compraText = (await row.locator('td').nth(1).textContent()) ?? '';
  return parseGs(compraText);
}

// Misma lógica que parseMaxi en pygScraping.ts: ancla en el ícono de
// flags/USD.png y corta en la bandera siguiente — Maxicambios lista Dólar
// Canadiense y Dólar Australiano con el mismo texto visible "Dólar", así
// que leer "el primer Dólar" da la moneda equivocada.
async function readMaxiCompra(page: Page): Promise<number> {
  await page.goto(MAXI_URL);
  await page.waitForSelector('#cotizacion-carousel', { timeout: 20000 });
  const html = await page.content();

  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = html.indexOf('id="cotizacion-cd"', startIdx);
  const section = html.slice(startIdx, endIdx);

  const usdFlagIdx = section.indexOf('flags/USD.png');
  expect(usdFlagIdx, 'no se encontró flags/USD.png en la sección cotizacion-carousel').toBeGreaterThanOrEqual(0);
  const nextFlagIdx = section.indexOf('flags/', usdFlagIdx + 1);
  const usdBlock = section.slice(usdFlagIdx, nextFlagIdx > 0 ? nextFlagIdx : usdFlagIdx + 2500);

  const match = usdBlock.match(
    /Dólar<\/p>[\s\S]{0,500}?Compra<\/p>\s*<p[^>]*>\s*([\d.,]+)/
  );
  expect(match, 'no se pudo extraer Compra del bloque USD de Maxicambios').not.toBeNull();
  return parseGs(match![1]);
}

test.describe('Live rates — producción', () => {
  test('la API /api/pyg-rates coincide con el sitio de la fuente que reporta', async ({ page, request, baseURL }) => {
    const apiRes = await request.get(`${baseURL}/api/pyg-rates`);
    expect(apiRes.ok()).toBe(true);
    const apiData = await apiRes.json();
    const apiCompra = apiData.rate?.compra;
    console.log(`[live] API ${baseURL}/api/pyg-rates: source=${apiData.source} compra=${apiCompra} chacoError=${apiData.chacoError ?? '-'}`);

    // Si ni Chaco ni Maxi respondieron, no hay nada que comparar — y es un
    // fallo real, no algo que deba pasar en silencio.
    expect(apiData.source, `la API devolvió source='none' (chacoError: ${apiData.chacoError})`).not.toBe('none');
    expect(apiCompra).not.toBeNull();
    expect(apiCompra).toBeGreaterThan(4000);
    expect(apiCompra).toBeLessThan(10000);

    const siteCompra = apiData.source === 'maxi'
      ? await readMaxiCompra(page)
      : await readChacoCompra(page);
    console.log(`[live] ${apiData.source === 'maxi' ? 'Maxicambios' : 'Cambios Chaco'} (sitio real): compra=${siteCompra}`);

    const diff = Math.abs(apiCompra - siteCompra);
    console.log(`[live] diferencia sitio vs API: ${diff} Gs (tolerancia ±${CACHE_TOLERANCE_GS} por caché de 30 min)`);
    expect(diff).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  });

  test('la UI en producción muestra el mismo valor y la misma fuente que la API', async ({ page, request, baseURL }) => {
    const apiRes = await request.get(`${baseURL}/api/pyg-rates`);
    const apiData = await apiRes.json();
    expect(apiData.source, `la API devolvió source='none' (chacoError: ${apiData.chacoError})`).not.toBe('none');

    await page.goto('/');
    const input = page.locator('[placeholder="0"]').first();
    await input.fill('100000');

    const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
    const label = efectivoCard.locator('.payment-card-label');
    await expect(label).toHaveText(/(Chaco|Maxi) compra ₲/, { timeout: 30000 });

    const labelText = (await label.textContent()) ?? '';
    console.log(`[live] UI label Efectivo USD: "${labelText}"`);

    // La fuente que muestra la UI debe coincidir con la que reportó la API
    // leída en este mismo test (puede haber cambiado entre ambos requests,
    // pero normalmente no en el margen de unos segundos).
    if (apiData.source === 'chaco') {
      expect(labelText).toMatch(/^Chaco compra ₲/);
    } else if (apiData.source === 'maxi') {
      expect(labelText).toMatch(/^Maxi compra ₲.*\(Chaco no disponible\)/);
    }

    const uiMatch = labelText.match(/compra ₲([\d.]+)/);
    expect(uiMatch).not.toBeNull();
    if (uiMatch) {
      const uiCompra = parseGs(uiMatch[1]);
      const apiCompra = apiData.rate?.compra ?? 0;
      console.log(`[live] UI compra=${uiCompra} vs API compra=${apiCompra}`);
      expect(Math.abs(uiCompra - apiCompra)).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
    }
  });
});
