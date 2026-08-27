import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
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
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: 'chromium-compact',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { height: 768, width: 1024 },
      },
    },
    {
      name: 'chromium-dpr2',
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 2,
        viewport: { height: 900, width: 1440 },
      },
    },
  ],
});
