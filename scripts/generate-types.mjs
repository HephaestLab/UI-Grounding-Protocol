import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { compileFromFile } from 'json-schema-to-typescript';

const check = process.argv.includes('--check');
const workspaceRoot = resolve(import.meta.dirname, '..');
const schemaRoot = resolve(workspaceRoot, 'spec/schemas');
const outputRoot = resolve(workspaceRoot, 'packages/protocol/src/generated');
const ignored = new Set(['common.schema.json']);
await mkdir(outputRoot, { recursive: true });
const schemas = (await readdir(schemaRoot))
  .filter((file) => file.endsWith('.schema.json') && !ignored.has(file))
  .sort();
const changed = [];

for (const schema of schemas) {
  const output = resolve(outputRoot, basename(schema, '.schema.json') + '.ts');
  const generated = await compileFromFile(resolve(schemaRoot, schema), {
    bannerComment: '/* Generated from spec/schemas. Do not edit directly. */',
    cwd: schemaRoot,
    style: {
      bracketSpacing: true,
      printWidth: 80,
      semi: true,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'all',
      useTabs: false,
    },
  });
  const existing = await readFile(output, 'utf8').catch(() => undefined);

  if (existing !== generated) {
    changed.push(schema);
    if (!check) await writeFile(output, generated);
  }
}

if (check && changed.length > 0) {
  throw new Error(`Generated protocol types are stale: ${changed.join(', ')}`);
}

console.log(
  changed.length === 0
    ? 'Generated protocol types are current.'
    : `Generated ${changed.length} protocol type files.`,
);
