import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['packages', 'examples'];

for (const root of roots) {
  const directory = await import('node:fs/promises').then(({ readdir }) =>
    readdir(root, { withFileTypes: true }),
  );

  for (const entry of directory) {
    if (entry.isDirectory()) {
      await rm(join(root, entry.name, 'dist'), {
        force: true,
        recursive: true,
      });
    }
  }
}

await rm('coverage', { force: true, recursive: true });
