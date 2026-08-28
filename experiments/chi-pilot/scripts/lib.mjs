import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const experimentRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);

export function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item?.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      result[item.slice(2)] = true;
      continue;
    }
    result[item.slice(2)] = value;
    index += 1;
  }
  return result;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableJson(item)]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return `${JSON.stringify(stableJson(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function newRunId(replicate) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  return `run-r${replicate}-${suffix}`;
}

export function requireString(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required --${name}`);
  }
  return value;
}

export function requirePositiveInteger(args, name) {
  const value = Number(requireString(args, name));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}
