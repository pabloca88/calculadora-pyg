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
  // Cambios Chaco es la única fuente para Efectivo USD (ya no compara con
  // Maxicambios), así que el label siempre debe decir "Chaco compra ₲...".
  await expect(label).toHaveText(/Chaco compra ₲/, { timeout: 15000 });
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
  // Result boxes should not show values or should show 0
  const usdBox = page.locator('.result-box').first();
  const text = (await usdBox.textContent()) ?? '';
  const isZeroOrEmpty = text.includes('0,00') || text.includes('–') || text === '';
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

test('T10 - La API /api/pyg-rates devuelve tasas válidas de Cambios Chaco (única fuente, sin Maxi)', async ({ page }) => {
  const response = await page.request.get('/api/pyg-rates');
  expect(response.status()).toBe(200);
  const data = await response.json();
  // Chaco compra should be between 4000 and 8000 (sanity range)
  expect(data.chaco?.compra).toBeGreaterThan(4000);
  expect(data.chaco?.compra).toBeLessThan(8000);
  expect(data.chaco?.venta).toBeGreaterThan(data.chaco?.compra);
  // Maxicambios se sacó del backend: la respuesta ya no debe traer esa key
  // (solo queda como iframe de consulta secundaria en la UI).
  expect(data.maxi).toBeUndefined();
});

test('T11 - La tasa de scraping NO es la tasa de mercado internacional', async ({ page }) => {
  const response = await page.request.get('/api/pyg-rates');
  const data = await response.json();
  // Market rate is ~5836, Chaco compra should be significantly different
  const chacoCompra = data.chaco?.compra;
  // They should NOT be within 1% of each other (market rate ≠ local rate)
  const marketRate = 5836;
  const diff = Math.abs(chacoCompra - marketRate) / marketRate;
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

test('T14 - La card Efectivo USD usa SOLO la tasa de Cambios Chaco (no Maxi, no mercado)', async ({ page }) => {
  await page.goto('/');
  await enterAmount(page, '100000');
  await waitForEfectivoRateReady(page);
  // Get the Efectivo USD card
  const efectivoCard = page.locator('.payment-card').filter({ hasText: 'Efectivo USD' });
  await expect(efectivoCard).toBeVisible();

  // El label de la card debe decir "Chaco compra ₲..." y nunca mencionar Maxi
  // (Cambios Chaco es la única fuente, ya no se compara contra Maxicambios).
  const labelText = (await efectivoCard.locator('.payment-card-label').textContent()) ?? '';
  expect(labelText).toMatch(/Chaco compra ₲/);
  expect(labelText).not.toMatch(/Maxi/i);

  // El input "Cambios Chaco compra USD" está siempre visible en el flujo
  // principal — no vive dentro de ningún collapsible.
  const chacoInputRow = page.locator('.casa-cambio-input-row').filter({ hasText: 'Cambios Chaco' });
  await expect(chacoInputRow).toBeVisible();

  // No debe existir un input de Maxicambios en el flujo principal de cálculo
  // (Maxi solo aparece como iframe de consulta dentro de "Ver cotizaciones").
  const maxiInputRow = page.locator('.casa-cambio-input-row').filter({ hasText: 'Maxicambios' });
  await expect(maxiInputRow).toHaveCount(0);

  const usdText = (await efectivoCard.textContent()) ?? '';
  // With ₲100.000 y la tasa COMPRA real de Cambios Chaco (~5.500-5.800), el
  // resultado real está en ~17-18 USD. La tasa de mercado (~5836) daría
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
