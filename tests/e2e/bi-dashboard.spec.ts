import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.ugpBiLab));
});

test('BI-01 click Revenue KPI resolves authoritative metric', async ({
  page,
}) => {
  await page.locator('[data-metric-id="revenue"]').click({
    position: { x: 18, y: 82 },
  });
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]).toMatchObject({
    nodeId: 'metric:revenue',
    authority: 'authoritative',
    entityRef: { namespace: 'metrics', id: 'revenue' },
  });
});

test('BI-02 click KPI value resolves derived value and metric relationship', async ({
  page,
}) => {
  await page.locator('[data-metric-value="revenue"]').click();
  const result = await page.evaluate(() => window.ugpBiLab!.grounding);
  expect(result?.referents[0]?.nodeId).toBe('metric-value:revenue');
  expect(result?.relationships).toContainEqual({
    sourceNodeId: 'metric:revenue',
    targetNodeId: 'metric-value:revenue',
    relation: 'parent',
  });
});

test('BI-03 Canvas point resolves the correct month data point', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectCanvasPoint(14),
  );
  expect(result.referents[0]?.nodeId).toBe('point:revenue:2026-03:all');
  expect(result.referents[0]?.evidence[0]?.kind).toBe('adapter-hit');
});

test('BI-04 Canvas brush returns one interval referent', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectCanvasInterval(14, 16),
  );
  expect(result.referents).toHaveLength(1);
  expect(result.referents[0]?.nodeId).toBe('interval:revenue:2026-03..2026-05');
});

test('BI-05 SVG bar resolves its region dimension member', async ({ page }) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectRegions(['east']),
  );
  expect(result.referents[0]).toMatchObject({
    nodeId: 'region:east:chart',
    entityRef: { namespace: 'regions', id: 'east' },
  });
});

test('BI-06 region over two SVG bars returns deterministic members', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectRegions(['west', 'east']),
  );
  expect(result.referents.map((item) => item.nodeId)).toEqual([
    'region:east:chart',
    'region:west:chart',
  ]);
});

test('BI-07 visible virtual row resolves the current order ID', async ({
  page,
}) => {
  await page.locator('.virtual-viewport').scrollIntoViewIfNeeded();
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectVisibleRecord(),
  );
  expect(result.referents[0]?.type).toBe('org.ugp.demo.bi.record');
  expect(result.referents[0]?.entityRef?.namespace).toBe('orders');
});

test('BI-08 sorted and recycled row never returns an old record', async ({
  page,
}) => {
  await page.locator('.virtual-viewport').scrollIntoViewIfNeeded();
  const expectedId = await page.evaluate(() =>
    window.ugpBiLab!.sortAndScroll(500),
  );
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectVisibleRecord(),
  );
  expect(result.referents[0]?.entityRef?.id).toBe(expectedId);
});

test('BI-09 chart and table views deduplicate the same region', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectSameRegionViews('east'),
  );
  expect(result.referents).toHaveLength(1);
  expect(result.referents[0]?.entityRef).toEqual({
    namespace: 'regions',
    id: 'east',
  });
  expect(result.referents[0]?.evidence).toHaveLength(2);
});

test('BI-10 selecting the whole KPI collapses children to the metric', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]', 'region'),
  );
  expect(result.referents.map((item) => item.nodeId)).toEqual([
    'metric:revenue',
  ]);
});

test('BI-11 selected narrative sentence returns fragment with parent insight', async ({
  page,
}) => {
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectTextFragment(
      'Revenue softened in the East region between March and May',
    ),
  );
  expect(result.referents[0]?.type).toBe('ugp.ui.text-fragment');
  expect(result.relationships?.[0]?.sourceNodeId).toBe('insight:revenue-drop');
});

test('BI-12 changing a filter makes the previous selection stale', async ({
  page,
}) => {
  await page.evaluate(() =>
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]'),
  );
  const stale = await page.evaluate(() =>
    window.ugpBiLab!.mutateFilter('east'),
  );
  expect(stale?.problem?.code).toBe('SURFACE_STALE');
  expect(stale?.referents).toEqual([]);
});

test('BI-13 viewer cost context is unauthorized and never materialized', async ({
  page,
}) => {
  const context = await page.evaluate(async () => {
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]', 'region');
    window.ugpBiLab!.setRole('viewer');
    return window.ugpBiLab!.requestContext(['cost'], 4096);
  });
  expect(context.referentContexts[0]?.omitted).toContainEqual({
    name: 'cost',
    reason: 'unauthorized',
  });
  expect(JSON.stringify(context)).not.toContain('customerEmail');
});

test('BI-14 analyst receives approved cost projection without email', async ({
  page,
}) => {
  const context = await page.evaluate(async () => {
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]', 'region');
    window.ugpBiLab!.setRole('analyst');
    return window.ugpBiLab!.requestContext(['cost'], 4096);
  });
  expect(context.referentContexts[0]?.contexts.cost).toHaveProperty('formula');
  expect(JSON.stringify(context)).not.toContain('@example.invalid');
});

test('BI-15 responsive reflow preserves semantic identity', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]', 'region'),
  );
  expect(result.referents[0]?.entityRef).toEqual({
    namespace: 'metrics',
    id: 'revenue',
  });
});

test('BI-16 CSS zoom and backing-store DPR do not change Canvas hit identity', async ({
  page,
}) => {
  await page.evaluate(() => {
    document.body.style.zoom = '1.5';
  });
  await page.waitForTimeout(50);
  const result = await page.evaluate(() =>
    window.ugpBiLab!.selectCanvasPoint(14),
  );
  expect(result.referents[0]?.entityRef?.id).toBe('revenue:2026-03:all');
});

test('BI-17 selecting two parent widgets requires disambiguation', async ({
  page,
}) => {
  const result = await page.evaluate(() => window.ugpBiLab!.selectTwoWidgets());
  const ambiguity = result.ambiguity as {
    requiresDisambiguation?: boolean;
  };
  expect(ambiguity.requiresDisambiguation).toBe(true);
  expect(result.problem?.code).toBe('AMBIGUOUS_REFERENT');
});

test('BI-18 disabling UGP leaves dashboard controls operational', async ({
  page,
}) => {
  const before = await page.locator('.revision strong').innerText();
  await page.evaluate(() => window.ugpBiLab!.toggleOverlay(false));
  await page.locator('[data-action="sort"]').click();
  const after = await page.locator('.revision strong').innerText();
  expect(after).not.toBe(before);
  expect(await page.evaluate(() => window.ugpBiLab!.overlayEnabled)).toBe(
    false,
  );
  await expect(page.locator('.inspector')).toBeHidden();
});

test('BI-19 aborting Context prevents late state replacement', async ({
  page,
}) => {
  const outcome = await page.evaluate(async () => {
    window.ugpBiLab!.selectElement('[data-metric-id="revenue"]');
    window.ugpBiLab!.setRole('analyst');
    const controller = new AbortController();
    const pending = window
      .ugpBiLab!.requestContext(['cost'], 4096, controller.signal)
      .then(() => 'resolved')
      .catch((error: unknown) =>
        error instanceof DOMException ? error.name : 'unknown',
      );
    controller.abort();
    return pending;
  });
  expect(outcome).toBe('AbortError');
  expect(await page.evaluate(() => window.ugpBiLab!.context)).toBeUndefined();
});

test('BI-20 10K records stay virtualized and repeated regions meet budget', async ({
  page,
}) => {
  const result = await page.evaluate(() => ({
    records: window.ugpBiLab!.backend.data.records.length,
    benchmark: window.ugpBiLab!.benchmark(500),
    registeredNodes: window.ugpBiLab!.registry.getSnapshot().nodes.length,
    visibleRows: document.querySelectorAll('[data-record-id]').length,
  }));
  expect(result.records).toBe(10_000);
  expect(result.visibleRows).toBeLessThanOrEqual(8);
  expect(result.registeredNodes).toBeLessThan(100);
  expect(result.benchmark.durationMs).toBeLessThan(500);
});
