import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(
  new URL('../packages/overlay/', import.meta.url),
);

await mkdir(join(packageRoot, 'dist'), { recursive: true });
await copyFile(
  join(packageRoot, 'src/styles.css'),
  join(packageRoot, 'dist/styles.css'),
);
