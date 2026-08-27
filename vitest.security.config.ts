import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ui-grounding/core': new URL(
        './packages/core/src/index.ts',
        import.meta.url,
      ).pathname,
      '@ui-grounding/protocol': new URL(
        './packages/protocol/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['tests/security/**/*.test.ts'],
  },
});
