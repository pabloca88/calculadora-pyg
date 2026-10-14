import { expect, type Page, type Route } from '@playwright/test';

export const RATE_OK = {
  rate: { compra: 5600, venta: 5700, updatedAt: '13/10/2026 17:00' },
  source: 'chaco',
  chacoVia: 'push',
  cachedAt: '2026-10-13T20:00:00.000Z',
};

export const fulfillJson = (body: unknown, status = 200) => (route: Route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function enterAmount(page: Page, amount: string) {
  await page.locator('[placeholder="0"]').first().fill(amount);
}

export async function expectFitsViewport(page: Page, width: number) {
  await page.route('**/api/pyg-rates', fulfillJson(RATE_OK));
  await page.goto('/');
  // Wait until the app is hydrated and the mocked rate is applied before
  // typing; on a cold WebKit start, typing earlier gets wiped by hydration.
  await expect(page.locator('.result-box').first().locator('.result-box-label')).toHaveText('🟢 en vivo', { timeout: 30000 });
  await enterAmount(page, '1550000');
  await expect(page.locator('.result-box').first().locator('.result-box-value')).not.toHaveText('-', { timeout: 15000 });

  // Expand every payment card and the exchange-house section (worst case).
  for (const header of await page.locator('.payment-card-header').all()) await header.click();
  await page.locator('.casa-cambio-header').click();

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(overflow.clientWidth);

  const selectors = ['.header', '.header-title-row', '.result-box', '.payment-card', '.casa-cambio-input-row', 'input', 'select'];
  for (const selector of selectors) {
    for (const el of await page.locator(selector).all()) {
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      expect(box, selector).not.toBeNull();
      expect(box!.x, `${selector} cut off on the left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${selector} cut off on the right at ${width}px`).toBeLessThanOrEqual(width + 0.5);
    }
  }
}
