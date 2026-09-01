import { readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const basePath = join(root, '..', 'suitecrm', 'adapter.js');
const extensionPath = join(root, 'referent-extension.js');
const outputPath = join(root, 'adapter.js');
const [base, extension] = await Promise.all([
  readFile(basePath, 'utf8'),
  readFile(extensionPath, 'utf8'),
]);
const registration = `  Object.defineProperty(globalThis, '__UGP_EXPERIMENT_BRIDGE__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ snapshot: async () => plainClone(buildSnapshot()) }),
  });`;
if (!base.includes(registration)) {
  throw new Error('Frozen v7 adapter registration marker was not found');
}
const generated = base
  .replace(
    "const ADAPTER_ID = 'suitecrm-8.8.1-runtime-v7';",
    "const ADAPTER_ID = 'suitecrm-8.8.1-runtime-v8';",
  )
  .replace(registration, extension.trimEnd());
await writeFile(outputPath, generated, 'utf8');
console.log(
  JSON.stringify({ outputPath, bytes: Buffer.byteLength(generated) }),
);
