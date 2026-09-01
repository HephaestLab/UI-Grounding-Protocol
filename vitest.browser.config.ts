import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ui-grounding/authoring': new URL(
        './packages/authoring/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/core': new URL(
        './packages/core/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/dom': new URL(
        './packages/dom/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/inspector': new URL(
        './packages/inspector/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/overlay': new URL(
        './packages/overlay/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/protocol': new URL(
        './packages/protocol/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/react': new URL(
        './packages/react/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    browser: {
      api: {
        host: '127.0.0.1',
      },
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
      provider: playwright(),
    },
    include: ['tests/browser/**/*.test.ts'],
  },
});
