import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { compileFromFile } from 'json-schema-to-typescript';

const check = process.argv.includes('--check');
const workspaceRoot = resolve(import.meta.dirname, '..');
const ignored = new Set(['common.schema.json']);
const changed = [];

const targets = [
  {
    schemaRoot: resolve(workspaceRoot, 'spec/schemas'),
    outputRoot: resolve(workspaceRoot, 'packages/protocol/src/generated'),
    banner: '/* Generated from spec/schemas. Do not edit directly. */',
  },
  {
    schemaRoot: resolve(workspaceRoot, 'spec/drafts/v0.2/schemas'),
    outputRoot: resolve(workspaceRoot, 'packages/authoring/src/generated'),
    banner:
      '/* Generated from spec/drafts/v0.2/schemas. Do not edit directly. */',
  },
];

for (const target of targets) {
  await mkdir(target.outputRoot, { recursive: true });
  const schemas = (await readdir(target.schemaRoot))
    .filter((file) => file.endsWith('.schema.json') && !ignored.has(file))
    .sort();

  for (const schema of schemas) {
    const output = resolve(
      target.outputRoot,
      basename(schema, '.schema.json') + '.ts',
    );
    const generated = await compileFromFile(
      resolve(target.schemaRoot, schema),
      {
        bannerComment: target.banner,
        cwd: target.schemaRoot,
        style: {
          bracketSpacing: true,
          printWidth: 80,
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'all',
          useTabs: false,
        },
      },
    );
    const existing = await readFile(output, 'utf8').catch(() => undefined);

    if (existing !== generated) {
      changed.push(`${target.schemaRoot}:${schema}`);
      if (!check) await writeFile(output, generated);
    }
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
