import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const source = resolve(workspaceRoot, 'spec/schemas');
const destination = resolve(workspaceRoot, 'packages/protocol/dist/schemas');

await mkdir(destination, { recursive: true });

for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.schema.json')) {
    await cp(resolve(source, entry.name), resolve(destination, entry.name));
  }
}
