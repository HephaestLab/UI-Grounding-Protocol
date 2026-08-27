import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.ugpBiLab));
});

test('M5-01 build, protocol, and scenario revisions are visible', async ({
  page,
}) => {
  await expect(page.locator('.revision')).toContainText('UGP 0.1');
  await expect(page.locator('.revision')).toContainText('build');
  await expect(page.locator('.revision strong')).toHaveText('q-001');
});

test('M5-02 production API does not expose registries or raw scenario data', async ({
  page,
}) => {
  const exposure = await page.evaluate(() => ({
    backend: Object.hasOwn(window.ugpBiLab!, 'backend'),
    debugEnabled: window.ugpBiLab!.debugEnabled,
    registry: Object.hasOwn(window.ugpBiLab!, 'registry'),
  }));
  expect(exposure).toEqual({
    backend: false,
    debugEnabled: false,
    registry: false,
  });
  await expect(page.locator('[data-action="bundle"]')).toBeHidden();
});

test('M5-03 Escape cancels an active region without trapping focus', async ({
  page,
}) => {
  await page.getByRole('button', { name: '▱ Region' }).click();
  const box = await page.locator('.trend-panel').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 40, box!.y + 70);
  await page.mouse.down();
  await page.mouse.move(box!.x + 180, box!.y + 150, { steps: 4 });
  await expect(page.locator('.ugp-selection-region')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ugp-selection-region')).toBeHidden();
  await page.mouse.up();
  await page.getByRole('button', { name: '↖ Point' }).focus();
  await expect(page.getByRole('button', { name: '↖ Point' })).toBeFocused();
});

test('M5-04 overlay activation p95 stays within 50ms', async ({ page }) => {
  const durations = await page.evaluate(() => {
    const values: number[] = [];
    for (let index = 0; index < 100; index += 1) {
      const started = performance.now();
      window.ugpBiLab!.toggleOverlay(false);
      window.ugpBiLab!.toggleOverlay(true);
      values.push(performance.now() - started);
    }
    return values.sort((first, second) => first - second);
  });
  const p95 = durations[Math.floor(durations.length * 0.95)]!;
  expect(p95).toBeLessThan(50);
});

test('M5-05 virtual scrolling adds no long task', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'Long Task API is Chromium-only');
  await page.locator('.virtual-viewport').scrollIntoViewIfNeeded();
  const durations = await page.evaluate(async () => {
    const output: number[] = [];
    const observer = new PerformanceObserver((list) => {
      output.push(...list.getEntries().map((entry) => entry.duration));
    });
    observer.observe({ entryTypes: ['longtask'] });
    const viewport = document.querySelector<HTMLElement>('.virtual-viewport')!;
    for (let index = 0; index < 60; index += 1) {
      viewport.scrollTop = index * 240;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    observer.disconnect();
    return output;
  });
  expect(durations.filter((duration) => duration > 50)).toEqual([]);
});

test('M5-06 toolbar remains usable at 200% page zoom', async ({ page }) => {
  await page.evaluate(() => {
    document.body.style.zoom = '2';
  });
  const point = page.getByRole('button', { name: '↖ Point' });
  await expect(point).toBeVisible();
  await point.click();
  await expect(point).toHaveClass(/active/u);
});

test('M5-07 reduced motion has no active UI animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const activeAnimations = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === 'running').length,
  );
  expect(activeAnimations).toBe(0);
});

test('M5-08 fresh production page has no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.ugpBiLab));
  expect(errors).toEqual([]);
});

test('M5-09 disabling UGP preserves business layout and controls', async ({
  page,
}) => {
  const before = await page.locator('.shell').boundingBox();
  const heading = await page
    .getByRole('heading', { name: 'Revenue intelligence' })
    .textContent();
  await page.evaluate(() => window.ugpBiLab!.toggleOverlay(false));
  const after = await page.locator('.shell').boundingBox();
  expect(after).toEqual(before);
  await expect(page.getByRole('heading', { name: heading! })).toBeVisible();
  await page.locator('[data-action="filter"]').click();
  await expect(page.locator('.revision strong')).toHaveText('q-002');
  await page.locator('[data-action="sort"]').click();
  await expect(page.locator('[data-action="filter"]')).toContainText(
    'East region',
  );
  await expect(page.locator('.table-row .region-cell').first()).toHaveText(
    'east',
  );
});
