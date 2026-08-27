import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(
  new URL('../packages/overlay/', import.meta.url),
);

await mkdir(join(packageRoot, 'dist'), { recursive: true });
await copyFile(
  join(packageRoot, 'src/styles.css'),
  join(packageRoot, 'dist/styles.css'),
);
await writeFile(
  join(packageRoot, 'dist/styles.css.d.ts'),
  'declare const stylesheet: string;\nexport default stylesheet;\n',
);
