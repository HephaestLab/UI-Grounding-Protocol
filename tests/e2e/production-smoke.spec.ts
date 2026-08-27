import { expect, test } from '@playwright/test';

test('M5-10 production bundle boots without runtime disclosure or errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  await page.goto('/');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => Boolean(window.ugpBiLab))).toBe(true);
});
