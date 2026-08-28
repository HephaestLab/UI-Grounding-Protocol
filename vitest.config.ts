import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ui-grounding/authoring': new URL(
        './packages/authoring/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'packages/core/src/context.ts',
        'packages/core/src/geometry.ts',
        'packages/core/src/registry.ts',
        'packages/core/src/resolver.ts',
      ],
      thresholds: {
        branches: 95,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
    include: ['packages/**/*.test.ts'],
  },
});
