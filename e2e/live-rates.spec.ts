import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCloudflareChallenge } from '../src/lib/cloudflareChallenge';

/**
 * Test LIVE contra producción real — no usa fixtures ni mocks, así que SÍ
 * detecta si el deploy está devolviendo null o una tasa vieja (algo que los
 * tests normales, corridos contra fixtures/localhost, no pueden ver).
 *
 * Cambios Chaco es la fuente primaria, con fallback automático a
 * Maxicambios si Chaco no responde (Cloudflare bloquea las IPs de
 * datacenter con un 403 challenge "Just a moment..."). Este test corre
 * tanto a mano como en un runner de GitHub Actions — que también es una IP
 * de datacenter — así que si justo este runner intenta verificar Chaco
 * directamente y Cloudflare lo bloquea, NO es un fallo real: se anota
 * "chaco: blocked" y se sigue. Lo que sí es un fallo real es que la API
 * (que ya tiene su propio fallback a Maxi) no entregue una tasa sana, o que
 * la UI no coincida con lo que la API reportó.
 *
 * No corre en `npm test` / `npm run test:e2e` / el pre-push hook — se invoca
 * a mano con `npm run test:live` (usa playwright.live.config.ts), o vía el
 * workflow .github/workflows/live-rates.yml (cron + workflow_dispatch).
 * BASE_URL por defecto: https://calculadora-pyg.vercel.app (override con
 * la env var LIVE_BASE_URL).
 *
 * Escribe un resumen en test-results/live-summary.json — el workflow lo usa
 * para armar la tabla de $GITHUB_STEP_SUMMARY y el cuerpo del issue/comentario.
 */

const CHACO_WIDGET_URL = 'https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es';
const MAXI_URL = 'https://www.maxicambios.com.py/share';
const CACHE_TOLERANCE_GS = 50; // la caché de 30 min del backend puede desalinear un poco

const parseGs = (raw: string): number =>
  parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'));

interface SiteReadResult {
  compra: number | null;
  blocked: boolean;
}

async function readChacoCompra(page: Page): Promise<SiteReadResult> {
  const response = await page.goto(CHACO_WIDGET_URL, { timeout: 20000 }).catch(() => null);
  const html = await page.content().catch(() => '');
  if (isCloudflareChallenge(response?.status(), html)) {
    return { compra: null, blocked: true };
  }
  try {
    const row = page.locator('tr', { hasText: 'Dólar Americano' });
    await expect(row).toBeVisible({ timeout: 10000 });
    const compraText = (await row.locator('td').nth(1).textContent()) ?? '';
    return { compra: parseGs(compraText), blocked: false };
  } catch {
    return { compra: null, blocked: true };
  }
}

// Misma lógica que parseMaxi en pygScraping.ts: ancla en el ícono de
// flags/USD.png y corta en la bandera siguiente — Maxicambios lista Dólar
// Canadiense y Dólar Australiano con el mismo texto visible "Dólar", así
// que leer "el primer Dólar" da la moneda equivocada.
async function readMaxiCompra(page: Page): Promise<SiteReadResult> {
  const response = await page.goto(MAXI_URL, { timeout: 20000 }).catch(() => null);
  const htmlCheck = await page.content().catch(() => '');
  if (isCloudflareChallenge(response?.status(), htmlCheck)) {
    return { compra: null, blocked: true };
  }
  try {
    await page.waitForSelector('#cotizacion-carousel', { timeout: 15000 });
  } catch {
    return { compra: null, blocked: true };
  }
  const html = await page.content();
  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = html.indexOf('id="cotizacion-cd"', startIdx);
  const section = html.slice(startIdx, endIdx);

  const usdFlagIdx = section.indexOf('flags/USD.png');
  if (usdFlagIdx < 0) return { compra: null, blocked: false };
  const nextFlagIdx = section.indexOf('flags/', usdFlagIdx + 1);
  const usdBlock = section.slice(usdFlagIdx, nextFlagIdx > 0 ? nextFlagIdx : usdFlagIdx + 2500);

  const match = usdBlock.match(/Dólar<\/p>[\s\S]{0,500}?Compra<\/p>\s*<p[^>]*>\s*([\d.,]+)/);
  return { compra: match ? parseGs(match[1]) : null, blocked: false };
}

test('live rates: API vs sitio de la fuente reportada vs UI', async ({ page, request, baseURL }) => {
  // Solo para probar a propósito el camino de alerta del workflow
  // (workflow_dispatch con force_fail=true) — el cron nunca lo setea.
  if (process.env.FORCE_FAIL === 'true') {
    throw new Error('forced failure — alert test (workflow_dispatch force_fail=true)');
  }

  const apiRes = await request.get(`${baseURL}/api/pyg-rates`);
  const apiOk = apiRes.ok();
  const apiData = apiOk ? await apiRes.json() : null;
  const source: string = apiData?.source ?? 'none';
  const apiCompra: number | null = apiData?.rate?.compra ?? null;
  const chacoError: string | null = apiData?.chacoError ?? null;

  console.log(`[live] API ${baseURL}/api/pyg-rates: source=${source} compra=${apiCompra} chacoError=${chacoError ?? '-'}`);

  // Compara SIEMPRE contra el sitio de la fuente que la API reportó.
  let siteResult: SiteReadResult = { compra: null, blocked: false };
  if (source === 'chaco') {
    siteResult = await readChacoCompra(page);
    if (siteResult.blocked) {
      test.info().annotations.push({ type: 'chaco', description: 'blocked' });
      console.log('[live] chaco: blocked — Cloudflare le dio 403/challenge a este runner al intentar leer el sitio directamente');
    }
  } else if (source === 'maxi') {
    siteResult = await readMaxiCompra(page);
  }

  // Leer la UI en producción
  await page.goto('/');
  const input = page.locator('[placeholder="0"]').first();
  await input.fill('100000');
  const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
  const label = efectivoCard.locator('.payment-card-label');

  let uiCompra: number | null = null;
  let uiLabelText = '';
  try {
    await expect(label).toHaveText(/(Chaco|Maxi) compra ₲/, { timeout: 30000 });
    uiLabelText = (await label.textContent()) ?? '';
    const uiMatch = uiLabelText.match(/compra ₲([\d.]+)/);
    uiCompra = uiMatch ? parseGs(uiMatch[1]) : null;
  } catch {
    uiLabelText = (await label.textContent().catch(() => '')) ?? '';
  }

  const siteVsApiDiffGs = siteResult.compra != null && apiCompra != null
    ? Math.abs(siteResult.compra - apiCompra)
    : null;
  const uiVsApiDiffGs = uiCompra != null && apiCompra != null
    ? Math.abs(uiCompra - apiCompra)
    : null;

  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: baseURL,
    source,
    chacoError,
    chacoBlockedOnRunner: source === 'chaco' && siteResult.blocked,
    siteCompra: siteResult.compra,
    apiCompra,
    uiCompra,
    uiLabel: uiLabelText,
    siteVsApiDiffGs,
    uiVsApiDiffGs,
    toleranceGs: CACHE_TOLERANCE_GS,
  };
  console.log('[live] summary:', JSON.stringify(summary));

  // Escribe el resumen ANTES de las aserciones, para que quede disponible
  // en test-results/live-summary.json incluso si el test termina fallando.
  const outDir = join(process.cwd(), 'test-results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'live-summary.json'), JSON.stringify(summary, null, 2));

  // ─── Fallos reales ──────────────────────────────────────────────────────
  expect(source, `la API devolvió source='none' (chacoError: ${chacoError})`).not.toBe('none');
  expect(apiCompra, 'la API devolvió compra null').not.toBeNull();
  expect(apiCompra).toBeGreaterThan(4000);
  expect(apiCompra).toBeLessThan(10000);

  // Maxi nunca debería estar bloqueado (ver diagnóstico) — si lo está, es un
  // fallo real. Chaco bloqueado en este runner se tolera (ya anotado arriba).
  if (source === 'maxi') {
    expect(siteResult.compra, 'no se pudo leer Maxicambios para comparar contra la API').not.toBeNull();
    expect(siteVsApiDiffGs, `diferencia Maxicambios vs API: ${siteVsApiDiffGs} Gs`).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  } else if (source === 'chaco' && !siteResult.blocked) {
    expect(siteResult.compra, 'no se pudo leer Cambios Chaco para comparar contra la API').not.toBeNull();
    expect(siteVsApiDiffGs, `diferencia Cambios Chaco vs API: ${siteVsApiDiffGs} Gs`).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  }

  expect(uiCompra, `la UI no muestra ningún valor de compra (label: "${uiLabelText}")`).not.toBeNull();
  expect(uiVsApiDiffGs, `diferencia UI vs API: ${uiVsApiDiffGs} Gs`).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
});
