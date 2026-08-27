import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const packageRoot = process.cwd();

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: resolve(packageRoot, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
    minify: false,
    outDir: resolve(packageRoot, 'dist'),
    rollupOptions: {
      external: [/^@ui-grounding\//, /^react(?:\/.*)?$/],
    },
    sourcemap: true,
  },
});
