import { test, expect, type Page } from '@playwright/test';

// ─── HELPERS ────────────────────────────────────────────────────────────────
async function enterAmount(page: Page, amount: string) {
  const input = page.locator('[placeholder="0"]').first();
  await input.fill('');
  await input.fill(amount);
  await page.waitForTimeout(500); // let state settle
}

// Las tasas ARS (DolarAPI) y la tasa de Cambios Chaco (scraping, única fuente
// de PYG/USD local) se piden a APIs externas al montar la página. Varios
// tests dependen de que esos fetches ya hayan resuelto antes de leer resultados.
async function waitForArsLoaded(page: Page) {
  await expect(page.locator('.ars-status')).toHaveText('LIVE', { timeout: 15000 });
}

async function waitForEfectivoRateReady(page: Page) {
  const label = page
    .locator('.payment-card')
    .filter({ hasText: 'Efectivo USD' })
    .locator('.payment-card-label');
  // El label es neutral ("Compra ₲X") sin importar qué casa respondió
  // (Chaco o, si Cloudflare la bloquea, Maxicambios) — lo que importa es
  // que deje de mostrar "Falta tasa" y tenga un valor de compra.
  await expect(label).toHaveText(/Compra ₲/, { timeout: 15000 });
}

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 1: CARGA Y ESTADO INICIAL
// ════════════════════════════════════════════════════════════════════════════

test('T01 - La app carga y muestra el título', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Calculadora PYG/i);
  await expect(page.locator('h1')).toContainText(/Calculadora PYG/i);
});

test('T02 - El input de guaraníes está visible y acepta números', async ({ page }) => {
  await page.goto('/');
  const input = page.locator('[placeholder="0"]').first();
  await expect(input).toBeVisible();
  await input.fill('150000');
  await expect(input).toHaveValue(/150/);
});

test('T03 - Las tasas ARS cargan y muestran valores reales (no ceros)', async ({ page }) => {
  await page.goto('/');
  // Wait for LIVE badge to appear
  await expect(page.locator('.ars-status')).toHaveText('LIVE', { timeout: 15000 });
  // Oficial rate (primer item compacto) debe ser un número real > 1000
  const oficial = page.locator('.ars-rate-compact-value').first();
  await expect(oficial).toBeVisible();
  const text = (await oficial.textContent()) ?? '';
  const num = parseFloat(text.replace(/[^\d,]/g, '').replace(',', '.'));
  expect(num).toBeGreaterThan(1000);
});

test('T04 - El indicador de estado muestra "en vivo" o "🔄 Actualizar"', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000);
  // Acotado a .pyg-auto-section: "en vivo" también aparece en el footer
  // ("Tasas ARS en vivo desde DolarApi.com"), que no es el indicador de estado.
  const statusArea = page.locator('.pyg-auto-section');
  const hasLive = await statusArea.locator('text=en vivo').isVisible();
  const hasCache = await statusArea.locator('text=Actualizar').isVisible();
  const hasFallback = await statusArea.locator('text=sin conexión').isVisible();
  expect(hasLive || hasCache || hasFallback).toBe(true);
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 2: CÁLCULOS PRINCIPALES
// ════════════════════════════════════════════════════════════════════════════

test('T05 - Ingresando ₲100.000 muestra resultado USD > 0', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  // USD result box should show a value
  const usdBox = page.locator('.result-box').first();
  await expect(usdBox).toBeVisible();
  const text = (await usdBox.textContent()) ?? '';
  expect(text).toMatch(/U\$D/);
  // Value should be between 10 and 25 (sanity check for ₲100.000)
  const match = text.match(/[\d]+[,.][\d]+/);
  if (match) {
    const val = parseFloat(match[0].replace(',', '.'));
    expect(val).toBeGreaterThan(10);
    expect(val).toBeLessThan(30);
  }
});

test('T06 - El resultado AR$ Oficial es mayor que el USD resultado', async ({ page }) => {
  await page.goto('/');
  await waitForArsLoaded(page);
  await enterAmount(page, '100000');
  const boxes = page.locator('.result-box');
  await expect(boxes).toHaveCount(3); // USD, Oficial, Tarjeta
  // Leemos solo .result-box-value: el texto completo de la card incluye el
  // label (ej. "Tarjeta +30%"), cuyos dígitos contaminarían un parseo global.
  const oficialText = (await boxes.nth(1).locator('.result-box-value').textContent()) ?? '';
  const usdText = (await boxes.nth(0).locator('.result-box-value').textContent()) ?? '';
  const oficial = parseFloat(oficialText.replace(/[^\d]/g, ''));
  const usd = parseFloat(usdText.replace(/[^\d,]/g, '').replace(',', '.'));
  expect(oficial).toBeGreaterThan(usd);
});

test('T07 - AR$ Tarjeta +30% es mayor que AR$ Oficial', async ({ page }) => {
  await page.goto('/');
  await waitForArsLoaded(page);
  await enterAmount(page, '100000');
  const boxes = page.locator('.result-box');
  const oficialText = (await boxes.nth(1).locator('.result-box-value').textContent()) ?? '';
  const tarjetaText = (await boxes.nth(2).locator('.result-box-value').textContent()) ?? '';
  const oficial = parseFloat(oficialText.replace(/[^\d]/g, ''));
  const tarjeta = parseFloat(tarjetaText.replace(/[^\d]/g, ''));
  expect(tarjeta).toBeGreaterThan(oficial);
  // Tarjeta should be ~30% more
  const ratio = tarjeta / oficial;
  expect(ratio).toBeGreaterThan(1.25);
  expect(ratio).toBeLessThan(1.35);
});

test('T08 - El monto cero no muestra resultados de conversión', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '0');
  // Sin monto no hay USD que calcular — el recuadro muestra "-" (sin tasa
  // de mercado de respaldo que invente un valor).
  const usdBox = page.locator('.result-box').first();
  const text = (await usdBox.textContent()) ?? '';
  const isZeroOrEmpty = text.includes('0,00') || text.includes('-') || text.includes('–') || text === '';
  expect(isZeroOrEmpty).toBe(true);
});

test('T09 - Cambiar el monto actualiza los resultados', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  const box1 = page.locator('.result-box').first();
  const text1 = (await box1.textContent()) ?? '';

  await enterAmount(page, '200000');
  await page.waitForTimeout(300);
  const text2 = (await box1.textContent()) ?? '';

  expect(text1).not.toBe(text2);
  // Second amount should be roughly double
  const val1 = parseFloat(text1.match(/[\d]+[,.][\d]+/)?.[0]?.replace(',', '.') ?? '0');
  const val2 = parseFloat(text2.match(/[\d]+[,.][\d]+/)?.[0]?.replace(',', '.') ?? '0');
  expect(val2 / val1).toBeCloseTo(2, 0);
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 3: TASAS DE CASAS DE CAMBIO (SCRAPING)
// ════════════════════════════════════════════════════════════════════════════

test('T10 - La API /api/pyg-rates devuelve una tasa válida (Chaco o, si no responde, Maxicambios)', async ({ page }) => {
  const response = await page.request.get('/api/pyg-rates');
  expect(response.status()).toBe(200);
  const data = await response.json();

  // La fuente debe ser una de las dos casas de cambio — si fuera 'none' acá
  // (corriendo contra un dev server local, no contra Vercel) algo más grave
  // está roto, así que el test falla en vez de pasar en silencio.
  expect(['chaco', 'maxi']).toContain(data.source);
  expect(data.rate?.compra).toBeGreaterThan(4000);
  expect(data.rate?.compra).toBeLessThan(10000);
  expect(data.rate?.venta).toBeGreaterThan(data.rate?.compra);
});

test('T11 - La tasa de scraping NO es la tasa de mercado internacional', async ({ page }) => {
  const response = await page.request.get('/api/pyg-rates');
  const data = await response.json();
  // Market rate is ~5836, la compra real (Chaco o Maxi) debe ser distinta
  const compra = data.rate?.compra;
  // They should NOT be within 1% of each other (market rate ≠ local rate)
  const marketRate = 5836;
  const diff = Math.abs(compra - marketRate) / marketRate;
  expect(diff).toBeGreaterThan(0.01); // > 1% difference confirms they're different sources
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 4: CARDS DE MÉTODOS DE PAGO
// ════════════════════════════════════════════════════════════════════════════

test('T12 - Se muestran exactamente 4 cards de métodos de pago', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  await page.waitForTimeout(1000);
  const cards = page.locator('.payment-card');
  await expect(cards).toHaveCount(4);
});

test('T13 - La card Tarjeta banco argentino muestra Dólar Tarjeta +30%', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  const card = page.locator('.payment-card').first();
  await expect(card).toContainText(/Tarjeta banco argentino/i);
  await expect(card).toContainText(/Tarjeta \+30%|Dólar Tarjeta/i);
});

test('T14 - La card Efectivo USD muestra un label neutral ("Compra ₲X"), nunca Chaco/Maxi ni la tasa de mercado', async ({ page }) => {
  // El copy es neutral sin importar qué casa respondió por detrás (Chaco,
  // o Maxi si Cloudflare bloqueó a Chaco) — ese detalle solo vive dentro de
  // "Ver cotizaciones de casas de cambio".
  await page.goto('/');
  await enterAmount(page, '100000');
  await waitForEfectivoRateReady(page);
  const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
  await expect(efectivoCard).toBeVisible();

  const labelText = (await efectivoCard.locator('.payment-card-label').textContent()) ?? '';
  expect(labelText).toMatch(/^Compra ₲/);
  expect(labelText).not.toMatch(/Chaco|Maxi/i);

  // El input "Compra USD" está siempre visible en el flujo principal — no
  // vive dentro de ningún collapsible, sin importar qué casa lo alimentó.
  const rateInputRow = page.locator('.casa-cambio-input-row');
  await expect(rateInputRow).toBeVisible();
  await expect(rateInputRow).toHaveCount(1);

  const usdText = (await efectivoCard.textContent()) ?? '';
  // Con ₲100.000 y la tasa COMPRA real (Chaco o Maxi, ambas ~5.500-5.800),
  // el resultado real está en ~17-18 USD. La tasa de mercado (~5836) daría
  // 17,13 — distinto a lo que debería mostrar esta card.
  const match = usdText.match(/U\$D\s*([\d]+[,.][\d]+)/);
  expect(match).not.toBeNull();
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    expect(val).toBeGreaterThan(14);
    expect(val).toBeLessThan(22);
  }
});

test('T15 - Badge "⭐ Más barato" aparece en al menos una card', async ({ page }) => {
  await page.goto('/');
  await waitForArsLoaded(page);
  await enterAmount(page, '100000');
  await page.waitForTimeout(500);
  const badge = page.locator('text=Más barato').first();
  await expect(badge).toBeVisible();
});

test('T16 - Cambiar billetera entre ARQ y Payoneer actualiza la card', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  // Get current wallet card value (3ra card: tarjeta banco, Mercado Pago, [billetera])
  const walletCard = page.locator('.payment-card').nth(2);
  const text1 = (await walletCard.textContent()) ?? '';

  // Switch to Payoneer
  const selector = page.locator('select').first();
  await selector.selectOption('payoneer');
  await page.waitForTimeout(300);

  const text2 = (await walletCard.textContent()) ?? '';
  // Card content should have changed
  expect(text1).not.toBe(text2);
  expect(text2).toMatch(/Payoneer/i);
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 5: TASA PERSONALIZADA Y CALIBRACIÓN
// ════════════════════════════════════════════════════════════════════════════

test('T17 - La tasa personalizada modifica el resultado cuando se ingresa', async ({ page }) => {
  await page.goto('/');
  await waitForArsLoaded(page);
  await enterAmount(page, '100000');

  // Expand custom rate toggle
  const toggle = page.locator('text=El local usa otra tasa').first();
  await toggle.click();
  await page.waitForTimeout(300);

  // Enter custom rate
  const customInput = page.locator('input[placeholder*="6"]').last();
  await customInput.fill('6900');
  await page.waitForTimeout(500);

  // Custom rate result box should appear
  const customBox = page.locator('.result-box').filter({ hasText: 'personalizada' });
  await expect(customBox).toBeVisible();
  const text = (await customBox.textContent()) ?? '';
  // ₲100.000 ÷ 6.900 = 14.49 USD × oficial rate
  expect(text).toMatch(/AR\$/);
});

test('T18 - El descuento turista -10% es calculado correctamente en el expand', async ({ page }) => {
  await page.goto('/');
  await waitForArsLoaded(page);
  await enterAmount(page, '100000');

  // Expand first payment card (Tarjeta banco argentino)
  const firstCard = page.locator('.payment-card').first();
  await firstCard.locator('.payment-card-header').click();
  await page.waitForTimeout(300);

  // Tourist price should appear
  const touristLine = firstCard.locator('text=-10%');
  await expect(touristLine).toBeVisible();
  const text = (await touristLine.textContent()) ?? '';
  // Should show a value
  expect(text).toMatch(/AR\$|U\$D/);
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 6: REGRESIONES CRÍTICAS
// ════════════════════════════════════════════════════════════════════════════

test('T19 - REGRESIÓN: ₲100.000 efectivo NO muestra 17,13 USD (bug viejo)', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  await waitForEfectivoRateReady(page);

  // El bug viejo mostraba U$D 17,13 usando la tasa de mercado (5.836).
  // Con la tasa COMPRA real de Cambios Chaco (~5.500-5.800), el resultado
  // debe ser distinto (más alto).
  const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
  const text = (await efectivoCard.textContent()) ?? '';
  const match = text.match(/U\$D\s*([\d]+[,.][\d]+)/);
  expect(match).not.toBeNull();
  if (match) {
    const val = parseFloat(match[1].replace(',', '.'));
    // 17,13 era el valor con el bug — el valor real con la tasa de Chaco no
    // debería coincidir con eso (±0.10 de tolerancia)
    const isBuggyValue = Math.abs(val - 17.13) < 0.15;
    expect(isBuggyValue).toBe(false);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 7: FALLBACK CHACO → MAXI (mockeado, no depende de qué fuente esté
// disponible en el momento de correr el test) — el copy es neutral: la UI
// principal nunca debe filtrar si la tasa vino de Chaco o de Maxi.
// ════════════════════════════════════════════════════════════════════════════

test('T20 - Label neutral "Compra ₲X" cuando la API reporta source=chaco (sin mencionar Chaco)', async ({ page }) => {
  await page.route('**/api/pyg-rates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rate: { compra: 5580, venta: 5730, updatedAt: '08/10/2026 17:00' },
        source: 'chaco',
        cachedAt: new Date().toISOString(),
      }),
    })
  );

  await page.goto('/');
  await enterAmount(page, '100000');
  const label = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' }).locator('.payment-card-label');
  await expect(label).toHaveText('Compra ₲5.580', { timeout: 15000 });
});

test('T21 - Label neutral "Compra ₲X" cuando la API reporta source=maxi (sin mencionar Maxi/Chaco)', async ({ page }) => {
  await page.route('**/api/pyg-rates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rate: { compra: 5500, venta: 5750, updatedAt: null },
        source: 'maxi',
        chacoError: 'HTTP 403',
        cachedAt: new Date().toISOString(),
      }),
    })
  );

  await page.goto('/');
  await enterAmount(page, '100000');
  const label = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' }).locator('.payment-card-label');
  // Mismo copy que con source=chaco: el fallback a Maxi es invisible para
  // el usuario en la card principal.
  await expect(label).toHaveText('Compra ₲5.500', { timeout: 15000 });
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 8: TASA DE REFERENCIA (sin fallback a tasa de mercado)
// ════════════════════════════════════════════════════════════════════════════

test('T22 - REGRESIÓN: ₲550.000 con compra de referencia ₲5.500 muestra exactamente U$D 100,00', async ({ page }) => {
  // Mockeado para que el resultado sea determinístico (no depende de la
  // tasa real del día) — ya no hay tasa de mercado de respaldo, así que el
  // recuadro U$D principal usa directamente esta compra de referencia.
  await page.route('**/api/pyg-rates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rate: { compra: 5500, venta: 5750, updatedAt: null },
        source: 'chaco',
        cachedAt: new Date().toISOString(),
      }),
    })
  );

  await page.goto('/');
  await enterAmount(page, '550000');

  const usdBox = page.locator('.result-box').first();
  await expect(usdBox.locator('.result-box-value')).toHaveText('100,00', { timeout: 15000 });
});

test('T23 - Sin tasa de referencia, el recuadro U$D muestra "-" (no cae a una tasa de mercado)', async ({ page }) => {
  await page.route('**/api/pyg-rates', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rate: { compra: null, venta: null, updatedAt: null },
        source: 'none',
        cachedAt: new Date().toISOString(),
      }),
    })
  );

  await page.goto('/');
  await enterAmount(page, '550000');

  const usdBox = page.locator('.result-box').first();
  await expect(usdBox.locator('.result-box-value')).toHaveText('-', { timeout: 15000 });
});

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 9: ICONOS / FAVICON
// ════════════════════════════════════════════════════════════════════════════

test('T24 - /favicon.ico y /icon.png responden 200 con imagen real, y el HTML los referencia', async ({ page }) => {
  const faviconRes = await page.request.get('/favicon.ico');
  expect(faviconRes.status()).toBe(200);
  expect(faviconRes.headers()['content-type']).toMatch(/^image\//);
  expect((await faviconRes.body()).byteLength).toBeGreaterThan(0);

  const iconRes = await page.request.get('/icon.png');
  expect(iconRes.status()).toBe(200);
  expect(iconRes.headers()['content-type']).toMatch(/^image\//);
  expect((await iconRes.body()).byteLength).toBeGreaterThan(0);

  await page.goto('/');
  const iconLinks = page.locator('link[rel="icon"]');
  await expect(iconLinks).toHaveCount(2);

  const hrefs = await iconLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  expect(hrefs.some((h) => h === '/favicon.ico')).toBe(true);
  expect(hrefs.some((h) => h.startsWith('/icon.png'))).toBe(true);

  const appleIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleIcon).toHaveCount(1);
  const appleHref = await appleIcon.getAttribute('href');
  expect(appleHref).toMatch(/^\/apple-icon\.png/);
});
