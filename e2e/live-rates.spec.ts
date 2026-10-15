import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCloudflareChallenge } from '../src/lib/cloudflareChallenge';
import { isPyBusinessHours } from '../src/lib/businessHours';

/**
 * LIVE test against real production: no fixtures or mocks, so it DOES catch a
 * deploy returning null or a stale rate (which fixture/localhost tests can't).
 *
 * Primary source: Cambios Chaco pushed from the maintainer's Mac (launchd,
 * Mon–Sat 08:00–19:00 PY) to /api/pyg-rates/push, because Cloudflare blocks
 * Vercel and GitHub runners. So when the API says source=chaco this test does
 * NOT re-read Chaco (the runner is blocked): it checks the value's sanity and,
 * during business hours, that the push has readAt < 3 h.
 *
 * - Business hours (Mon–Sat 08–19 PY): source=chaco is required. Maxi during
 *   that window means the push from the Mac is not arriving → fail.
 * - Outside business hours: Maxi is accepted as fallback (compared against
 *   the Maxicambios site) without failing.
 *
 * Not part of `npm test` / `npm run test:e2e` / the pre-push hook. Run it with
 * `npm run test:live` (playwright.live.config.ts) or via
 * .github/workflows/live-rates.yml (cron + workflow_dispatch).
 * Default BASE_URL: https://calculadora-pyg.vercel.app (override with
 * LIVE_BASE_URL).
 *
 * Writes test-results/live-summary.json, which the workflow uses for the
 * $GITHUB_STEP_SUMMARY table and the issue/comment body.
 */

const MAXI_URL = 'https://www.maxicambios.com.py/share';
const CACHE_TOLERANCE_GS = 50; // la caché de 30 min del backend puede desalinear un poco
const PUSH_MAX_AGE_MS = 3 * 60 * 60 * 1000;

const parseGs = (raw: string): number =>
  parseFloat(raw.trim().replace(/\./g, '').replace(',', '.'));

interface SiteReadResult {
  venta: number | null;
  blocked: boolean;
}

// Misma lógica que parseMaxi en pygScraping.ts: ancla en el ícono de
// flags/USD.png y corta en la bandera siguiente — Maxicambios lista Dólar
// Canadiense y Dólar Australiano con el mismo texto visible "Dólar", así
// que leer "el primer Dólar" da la moneda equivocada.
async function readMaxiVenta(page: Page): Promise<SiteReadResult> {
  const response = await page.goto(MAXI_URL, { timeout: 20000 }).catch(() => null);
  const htmlCheck = await page.content().catch(() => '');
  if (isCloudflareChallenge(response?.status(), htmlCheck)) {
    return { venta: null, blocked: true };
  }
  try {
    await page.waitForSelector('#cotizacion-carousel', { timeout: 15000 });
  } catch {
    return { venta: null, blocked: true };
  }
  const html = await page.content();
  const startIdx = html.indexOf('id="cotizacion-carousel"');
  const endIdx = html.indexOf('id="cotizacion-cd"', startIdx);
  const section = html.slice(startIdx, endIdx);

  const usdFlagIdx = section.indexOf('flags/USD.png');
  if (usdFlagIdx < 0) return { venta: null, blocked: false };
  const nextFlagIdx = section.indexOf('flags/', usdFlagIdx + 1);
  const usdBlock = section.slice(usdFlagIdx, nextFlagIdx > 0 ? nextFlagIdx : usdFlagIdx + 2500);

  const match = usdBlock.match(/Dólar<\/p>[\s\S]{0,500}?Compra<\/p>[\s\S]{0,1500}?Venta<\/p>\s*<p[^>]*>\s*([\d.,]+)/);
  return { venta: match ? parseGs(match[1]) : null, blocked: false };
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
  const apiVenta: number | null = apiData?.rate?.venta ?? null;
  const houseUpdatedAt: string | null = apiData?.rate?.updatedAt ?? null;
  const chacoVia: string | null = apiData?.chacoVia ?? null;
  const readAt: string | null = apiData?.readAt ?? null;
  const chacoError: string | null = apiData?.chacoError ?? null;
  const businessHours = isPyBusinessHours();
  const readAgeMin = readAt ? Math.round((Date.now() - Date.parse(readAt)) / 60000) : null;

  console.log(`[live] API ${baseURL}/api/pyg-rates: source=${source} via=${chacoVia ?? '-'} venta=${apiVenta} readAt=${readAt ?? '-'} chacoError=${chacoError ?? '-'} businessHours=${businessHours}`);

  // source=chaco: NO se re-lee Chaco (Cloudflare bloquea al runner) — se
  // valida el valor de la API. source=maxi: se compara contra Maxicambios.
  let siteResult: SiteReadResult = { venta: null, blocked: false };
  if (source === 'maxi') {
    siteResult = await readMaxiVenta(page);
  }

  // Leer la UI en producción
  await page.goto('/');
  const input = page.locator('[placeholder="0"]').first();
  await input.fill('100000');
  const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
  const label = efectivoCard.locator('.payment-card-label');

  let uiVenta: number | null = null;
  let uiLabelText = '';
  try {
    // Copy neutral: la card siempre dice "Venta ₲X" (tasa única de
    // referencia = venta, decidido 13/10/2026), nunca el nombre de la
    // casa (Chaco/Maxi) — ese detalle vive solo en "Ver cotizaciones".
    await expect(label).toHaveText(/^Venta ₲/, { timeout: 30000 });
    uiLabelText = (await label.textContent()) ?? '';
    const uiMatch = uiLabelText.match(/Venta ₲([\d.]+)/);
    uiVenta = uiMatch ? parseGs(uiMatch[1]) : null;
  } catch {
    uiLabelText = (await label.textContent().catch(() => '')) ?? '';
  }

  const siteVsApiDiffGs = siteResult.venta != null && apiVenta != null
    ? Math.abs(siteResult.venta - apiVenta)
    : null;
  const uiVsApiDiffGs = uiVenta != null && apiVenta != null
    ? Math.abs(uiVenta - apiVenta)
    : null;

  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: baseURL,
    businessHours,
    source,
    chacoVia,
    readAt,
    readAgeMin,
    houseUpdatedAt,
    chacoError,
    siteVenta: siteResult.venta,
    apiCompra,
    apiVenta,
    uiVenta,
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
  expect(apiVenta, 'la API devolvió venta null').not.toBeNull();
  expect(apiVenta).toBeGreaterThanOrEqual(4000);
  expect(apiVenta).toBeLessThanOrEqual(10000);
  // Integridad del dato de la casa (no se usa compra en ningún cálculo).
  expect(apiVenta, 'venta debe ser mayor que compra').toBeGreaterThan(apiCompra ?? Infinity);

  if (businessHours) {
    expect(
      source,
      `horario hábil PY y la API no usa Chaco (chacoError: ${chacoError}) — ¿la Mac dejó de pushear? ver ~/Library/Logs/calculadora-pyg-chaco.log`
    ).toBe('chaco');
    if (chacoVia === 'push') {
      expect(readAgeMin, 'push sin readAt').not.toBeNull();
      expect(readAgeMin!, `push de Chaco viejo: readAt hace ${readAgeMin} min`).toBeLessThan(PUSH_MAX_AGE_MS / 60000);
    }
  }

  // Maxi (fuera de horario) se compara contra el propio sitio de Maxicambios,
  // que nunca debería estar bloqueado.
  if (source === 'maxi') {
    expect(siteResult.venta, 'no se pudo leer la venta de Maxicambios para comparar contra la API').not.toBeNull();
    expect(siteVsApiDiffGs, `diferencia Maxicambios vs API: ${siteVsApiDiffGs} Gs`).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  }

  expect(uiLabelText, 'el label de Efectivo USD debe decir "Venta"').toMatch(/^Venta ₲/);
  expect(uiVenta, `la UI no muestra ningún valor de venta (label: "${uiLabelText}")`).not.toBeNull();
  expect(uiVsApiDiffGs, `diferencia UI vs API: ${uiVsApiDiffGs} Gs`).toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
});

// The native apps read /api/v1/rates (frozen contract, src/lib/ratesV1.ts).
// It must serve the same rate as /api/pyg-rates; its CDN cache (60 s) can lag
// a fresh push, hence the same tolerance as the UI check.
test('live v1: /api/v1/rates for the native apps matches /api/pyg-rates', async ({ request, baseURL }) => {
  const [v1Res, webRes] = await Promise.all([
    request.get(`${baseURL}/api/v1/rates`),
    request.get(`${baseURL}/api/pyg-rates`),
  ]);
  expect(v1Res.ok(), `/api/v1/rates HTTP ${v1Res.status()}`).toBe(true);
  const v1 = await v1Res.json();
  const web = await webRes.json();
  console.log('[live] v1:', JSON.stringify(v1));

  expect(v1.schemaVersion).toBe(1);
  expect(v1.pyg, 'v1 devolvió pyg null').not.toBeNull();
  expect(v1.pyg.venta).toBeGreaterThanOrEqual(4000);
  expect(v1.pyg.venta).toBeLessThanOrEqual(10000);
  expect(v1.pyg.venta).toBeGreaterThan(v1.pyg.compra);
  expect(Math.abs(v1.pyg.venta - (web.rate?.venta ?? Infinity)), 'v1 vs /api/pyg-rates').toBeLessThanOrEqual(CACHE_TOLERANCE_GS);
  expect(v1.ars, 'v1 devolvió ars null (¿DolarAPI caído?)').not.toBeNull();
  expect(v1.ars.oficial).toBeGreaterThan(0);
  expect(v1.ars.tarjeta).toBeGreaterThan(v1.ars.oficial);
});
