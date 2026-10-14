import { test, expect, type Page } from '@playwright/test';
import { RATE_OK, fulfillJson, enterAmount, expectFitsViewport } from './helpers';

/**
 * Quality checks for the external review: error states never render
 * NaN/Infinity, the layout fits 375px and 430px phones, and the CSP still
 * lets the two exchange-house iframes load.
 */

async function expectNoBrokenNumbers(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/NaN|Infinity|undefined/);
}

test.describe('error states', () => {
  test('pyg-rates API returns 500 → "sin conexión", U$D "-", clear hint, no NaN', async ({ page }) => {
    await page.route('**/api/pyg-rates', fulfillJson({ error: 'boom' }, 500));
    await page.goto('/');
    await enterAmount(page, '550000');

    await expect(page.locator('.result-box').first().locator('.result-box-value')).toHaveText('-', { timeout: 15000 });
    await expect(page.locator('.result-box').first().locator('.result-box-label')).toContainText('sin conexión');
    await expect(page.locator('.rate-missing-hint')).toContainText('No se pudo obtener la tasa de cambio');
    await expectNoBrokenNumbers(page);
  });

  test('pyg-rates request aborted (network down) → same clear state, no NaN', async ({ page }) => {
    await page.route('**/api/pyg-rates', (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await enterAmount(page, '550000');

    await expect(page.locator('.result-box').first().locator('.result-box-value')).toHaveText('-', { timeout: 15000 });
    await expect(page.locator('.result-box').first().locator('.result-box-label')).toContainText('sin conexión');
    await expect(page.locator('.rate-missing-hint')).toBeVisible();
    await expectNoBrokenNumbers(page);
  });

  test('both houses failed (source "none") → no NaN anywhere', async ({ page }) => {
    await page.route('**/api/pyg-rates', fulfillJson({
      rate: { compra: null, venta: null, updatedAt: null },
      source: 'none',
      chacoError: 'push_missing; HTTP 403',
      cachedAt: new Date().toISOString(),
    }));
    await page.goto('/');
    await enterAmount(page, '550000');

    await expect(page.locator('.result-box').first().locator('.result-box-value')).toHaveText('-', { timeout: 15000 });
    await expect(page.locator('.rate-missing-hint')).toBeVisible();
    await expectNoBrokenNumbers(page);
  });

  test('DolarAPI down → ARS status shows an error, AR$ values never NaN', async ({ page }) => {
    await page.route('**/api/pyg-rates', fulfillJson(RATE_OK));
    await page.route('https://dolarapi.com/**', (route) => route.abort('internetdisconnected'));
    await page.goto('/');
    await enterAmount(page, '550000');

    await expect(page.locator('.result-box').first().locator('.result-box-value')).toHaveText('96,49', { timeout: 15000 });
    await expect(page.locator('.rate-missing-hint')).toHaveCount(0);
    await expect(page.locator('.ars-status')).not.toHaveText('LIVE', { timeout: 15000 });
    await expectNoBrokenNumbers(page);
  });
});

test.describe('mobile layout (Chromium)', () => {
  for (const width of [375, 430]) {
    test(`${width}px: no horizontal scroll, nothing cut off`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expectFitsViewport(page, width);
    });
  }
});

test('no-rate hint never flashes while a valid rate is loading (CLS regression)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __hintSeen: boolean }).__hintSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('.rate-missing-hint')) {
        (window as unknown as { __hintSeen: boolean }).__hintSeen = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route('**/api/pyg-rates', fulfillJson(RATE_OK));
  await page.goto('/');
  await expect(page.locator('.result-box').first().locator('.result-box-label')).toHaveText('🟢 en vivo', { timeout: 15000 });
  expect(await page.evaluate(() => (window as unknown as { __hintSeen: boolean }).__hintSeen)).toBe(false);
});

test('security headers present and CSP allows both exchange-house iframes', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to (frame|load|connect)/i.test(msg.text())) violations.push(msg.text());
  });

  const response = await page.goto('/');
  const headers = response!.headers();
  const csp = headers['content-security-policy'];
  expect(csp).toBeTruthy();
  for (const origin of [
    'https://cambioschaco.com.py',
    'https://www.cambioschaco.com.py',
    'https://maxicambios.com.py',
    'https://www.maxicambios.com.py',
  ]) {
    expect(csp).toContain(origin);
  }
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');

  await page.locator('.casa-cambio-header').click();
  await page.locator('.casa-cambio-widget-toggle', { hasText: 'Cambios Chaco' }).click();
  await page.locator('.casa-cambio-widget-toggle', { hasText: 'Maxicambios' }).click();

  await expect
    .poll(() => page.frames().map((f) => new URL(f.url() || 'about:blank').hostname), { timeout: 20000 })
    .toEqual(expect.arrayContaining(['www.cambioschaco.com.py', 'www.maxicambios.com.py']));
  await expect(page.frameLocator('iframe[title="Cambios Chaco"]').locator('body')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.frameLocator('iframe[title="Maxicambios"]').locator('body')).not.toBeEmpty({ timeout: 20000 });
  expect(violations, violations.join('\n')).toEqual([]);
});
