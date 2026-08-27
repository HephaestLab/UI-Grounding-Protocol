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

test('M5-11 a real Canvas drag resolves an interval referent', async ({
  page,
}) => {
  await page.getByRole('button', { name: '▱ Region' }).click();
  await page.locator('#trend-chart').scrollIntoViewIfNeeded();
  const box = await page.locator('#trend-chart').boundingBox();
  expect(box).not.toBeNull();
  const xAt = (index: number) => box!.x + 28 + (index / 23) * (box!.width - 48);
  await page.mouse.move(xAt(14), box!.y + 45);
  await page.mouse.down();
  await page.mouse.move(xAt(16), box!.y + box!.height - 45, { steps: 6 });
  await page.mouse.up();
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]?.nodeId).toBe(
    'interval:revenue:2026-03..2026-05',
  );
});

test('M5-12 changing a filter visibly rejects the stale selection', async ({
  page,
}) => {
  await page.locator('[data-metric-id="revenue"]').click();
  await expect(page.locator('.referent-card h3')).toContainText('Revenue');
  await page.locator('[data-action="filter"]').click();
  await expect(page.locator('.problem-code')).toHaveText('SURFACE_STALE');
  await expect(page.locator('.referent-card h3')).toHaveText(
    'Surface state is stale',
  );
});

test('M5-13 role policy is visible and confidential context never leaks', async ({
  page,
}) => {
  await page.locator('[data-metric-id="revenue"]').click();
  await page.locator('[data-action="role"]').click();
  await page.locator('[data-action="context"]').click();
  await expect(page.locator('.context-summary')).toContainText('viewer');
  await expect(page.locator('.context-summary')).toContainText(
    'cost (unauthorized)',
  );

  await page.locator('[data-action="role"]').click();
  await page.locator('[data-action="context"]').click();
  await expect(page.locator('.context-summary')).toContainText(
    'analyst · approved: cost, summary',
  );
  await expect(page.locator('body')).not.toContainText('@example.invalid');
});

test('M5-14 chart tooltips work without conflicting with selection mode', async ({
  page,
}) => {
  const canvas = page.locator('#trend-chart');
  await canvas.scrollIntoViewIfNeeded();
  let canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(
    canvasBox!.x + canvasBox!.width / 2,
    canvasBox!.y + canvasBox!.height / 2,
  );
  await expect(page.locator('.chart-tooltip')).toContainText('Revenue');

  await page.getByRole('button', { name: '▱ Region' }).click();
  await canvas.scrollIntoViewIfNeeded();
  canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + 90, canvasBox!.y + 90);
  await expect(page.locator('.chart-tooltip')).toBeHidden();

  await page.evaluate(() => window.ugpBiLab!.toggleOverlay(false));
  await page.mouse.move(canvasBox!.x + 120, canvasBox!.y + 90);
  await expect(page.locator('.chart-tooltip')).toContainText('Revenue');
});

test('M5-15 real SVG clicks resolve the current dimension member', async ({
  page,
}) => {
  await page.locator('#bar-east').click();
  await expect(page.locator('.referent-card h3')).toHaveText('East');
  await page.locator('#bar-west').click();
  await expect(page.locator('.referent-card h3')).toHaveText('West');
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]?.entityRef).toEqual({
    namespace: 'regions',
    id: 'west',
  });
});

test('M5-16 a real SVG brush returns two stable members', async ({ page }) => {
  await page.getByRole('button', { name: '▱ Region' }).click();
  const chart = page.locator('.bar-chart');
  await chart.scrollIntoViewIfNeeded();
  const east = await page.locator('#bar-east').boundingBox();
  const west = await page.locator('#bar-west').boundingBox();
  expect(east).not.toBeNull();
  expect(west).not.toBeNull();
  await page.mouse.move(east!.x - 3, east!.y - 3);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(east!.x + east!.width, west!.x + west!.width) + 3,
    west!.y + west!.height + 3,
    { steps: 6 },
  );
  await page.mouse.up();
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents.map((referent) => referent.entityRef?.id)).toEqual([
    'east',
    'west',
  ]);
});

test('M5-17 a native text drag resolves a fragment with its parent insight', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'T Text' }).click();
  const mark = page.locator('[data-insight-id="revenue-drop"] mark');
  await mark.scrollIntoViewIfNeeded();
  const rects = await mark.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return [...range.getClientRects()].map((rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    }));
  });
  expect(rects.length).toBeGreaterThan(0);
  const first = rects[0]!;
  const last = rects.at(-1)!;
  await page.mouse.move(first.left + 2, (first.top + first.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(last.right - 2, (last.top + last.bottom) / 2, {
    steps: 10,
  });
  await page.mouse.up();
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]?.type).toBe('ugp.ui.text-fragment');
  expect(result?.relationships?.[0]?.sourceNodeId).toBe('insight:revenue-drop');
});

test('M5-18 recycled virtual rows resolve the currently visible record', async ({
  page,
}) => {
  const viewport = page.locator('.virtual-viewport');
  await viewport.scrollIntoViewIfNeeded();
  await viewport.evaluate(async (element) => {
    element.scrollTop = element.scrollHeight / 2;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(page.locator('.table-row').first()).toBeVisible();
  const row = page.locator('.table-row').first();
  const expectedId = await row.getAttribute('data-record-id');
  await row.click();
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]?.entityRef).toEqual({
    namespace: 'orders',
    id: expectedId,
  });
});
