import { test, devices } from '@playwright/test';
import { expectFitsViewport } from './helpers';

// WebKit (iOS Safari engine) applies the iOS-only 16px form-field rule in
// globals.css, so the layout is checked here as well as in Chromium.
test.use({ ...devices['iPhone SE'], browserName: 'webkit' });

for (const width of [375, 430]) {
  test(`WebKit ${width}px: no horizontal scroll, nothing cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expectFitsViewport(page, width);
  });
}
