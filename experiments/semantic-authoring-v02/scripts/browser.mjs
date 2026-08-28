import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const hiddenOverlayCss = `
  [data-ugp-overlay-ui="true"],
  [data-experiment-inspector] { display: none !important; }
`;

async function withPage(appDirectory, action) {
  const server = await createServer({
    root: appDirectory,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    const url =
      server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];
    if (!url) throw new Error('Vite did not expose a local URL');
    await page.goto(url, { waitUntil: 'networkidle' });
    return await action(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function captureBaseline(appDirectory, destination) {
  return withPage(appDirectory, async (page) => {
    await page.reload({ waitUntil: 'networkidle' });
    await page.addStyleTag({ content: hiddenOverlayCss });
    await page.screenshot({ path: destination, animations: 'disabled' });
  });
}

export async function evaluateBrowser({
  appDirectory,
  task,
  condition,
  screenshot,
}) {
  return withPage(appDirectory, async (page) => {
    const target = page.getByTestId(task.target.testId);
    const targetPresent = (await target.count()) === 1;
    let targetKeyboardFocusable = false;
    let interactionChangedDom = false;
    if (targetPresent) {
      await target.focus();
      targetKeyboardFocusable = await target.evaluate(
        (element) => element.ownerDocument.activeElement === element,
      );
      const before = await page.locator('body').innerText();
      await target.click();
      const after = await page.locator('body').innerText();
      interactionChangedDom = before !== after;
    }

    let inspectorPresent = null;
    let semanticOutput = null;
    if (condition === 'ugp') {
      inspectorPresent =
        (await page.locator('.ugp-inspector-shell').count()) === 1;
      if (inspectorPresent && targetPresent) {
        const launcher = page.locator('.ugp-inspector-launcher');
        if ((await launcher.getAttribute('aria-expanded')) === 'false')
          await launcher.click();
        await target.click();
        const raw = page.locator('.ugp-inspector-panel pre');
        if ((await raw.count()) === 1) {
          try {
            semanticOutput = JSON.parse(await raw.innerText());
          } catch {
            semanticOutput = null;
          }
        }
      }
    } else if (condition === 'generic') {
      inspectorPresent =
        (await page.locator('[data-experiment-inspector]').count()) === 1;
      if (inspectorPresent && targetPresent) {
        await target.click();
        const raw = page.locator('[data-experiment-meaning-output]');
        if ((await raw.count()) === 1) {
          try {
            semanticOutput = JSON.parse(await raw.innerText());
          } catch {
            semanticOutput = null;
          }
        }
      }
    }

    await page.reload({ waitUntil: 'networkidle' });
    await page.addStyleTag({ content: hiddenOverlayCss });
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    return {
      targetPresent,
      targetKeyboardFocusable,
      interactionChangedDom,
      hasSearchInput: (await page.locator('input').count()) > 0,
      inspectorPresent,
      semanticOutput,
    };
  });
}

export async function screenshotsEqual(first, second) {
  return (await readFile(first)).equals(await readFile(second));
}
