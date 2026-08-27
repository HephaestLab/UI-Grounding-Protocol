import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  retries: process.env.CI ? 2 : 0,
  testDir: './tests/e2e',
  webServer: {
    command:
      'pnpm --filter @ui-grounding/example-bi-dashboard dev --host 127.0.0.1 --port 4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    url: 'http://127.0.0.1:4173',
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { height: 900, width: 1440 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
