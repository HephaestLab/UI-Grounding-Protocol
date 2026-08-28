import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const experimentRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const workspaceRoot = resolve(experimentRoot, '..', '..');
export const runsRoot = join(experimentRoot, '.runs');

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function stableStringify(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stableStringify(value));
}

export function parseArgs(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === '--' || !token?.startsWith('--')) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith('--')) {
      output[key] = true;
    } else {
      output[key] = next;
      index += 1;
    }
  }
  return output;
}

export function required(args, key) {
  const value = args[key];
  if (!value || value === true) throw new Error(`Missing --${key}`);
  return value;
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function resolveInput(path) {
  return resolve(process.cwd(), path);
}

export async function schemaValidators() {
  const names = [
    'task-envelope.schema.json',
    'actor-request.schema.json',
    'actor-response.schema.json',
    'trajectory.schema.json',
    'gold.schema.json',
    'score.schema.json',
  ];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of names) {
    ajv.addSchema(await readJson(join(experimentRoot, 'schemas', name)));
  }
  return Object.fromEntries(
    names.map((name) => {
      const id = `https://ui-grounding.org/experiments/v0.3/${name}`;
      return [name, ajv.getSchema(id)];
    }),
  );
}

export function validateOrThrow(validator, value, label) {
  assert(validator, `Missing validator for ${label}`);
  if (!validator(value)) {
    throw new Error(
      `${label} failed schema validation:\n${JSON.stringify(validator.errors, null, 2)}`,
    );
  }
}

export function sameSet(left, right) {
  return canonicalJson([...left].sort()) === canonicalJson([...right].sort());
}

export function normalizeAnswer(value) {
  return String(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
}

export async function episodeDirectories(runId) {
  const root = join(runsRoot, runId, 'episodes');
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export const responseSchemaForActor = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'episodeId', 'output', 'confidence'],
  properties: {
    schemaVersion: { const: '0.3.0' },
    episodeId: { type: 'string' },
    output: {
      type: 'object',
      description:
        'One answer, click, type, scroll, select, or stop output matching an allowed action.',
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const fixedSystemInstruction = [
  'You are the actor in a controlled UI-grounding experiment.',
  'Use only the task and current observation in this packet.',
  'Do not use tools, files, network access, prior conversations, hidden state, or outside knowledge about this benchmark.',
  'Return exactly one JSON object matching responseSchema; do not add prose or Markdown.',
  'Do not repair, retry, plan across hidden steps, or invent unavailable UI facts.',
].join(' ');

export function findForbiddenKeys(value, path = '$') {
  const forbidden = new Set([
    'gold',
    'answerKey',
    'accepted',
    'expected',
    'scorer',
    'sourceTaskId',
    'taskId',
    'benchmarkId',
  ]);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenKeys(item, `${path}[${index}]`),
    );
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbidden.has(key) ? [`${path}.${key}`] : []),
    ...findForbiddenKeys(item, `${path}.${key}`),
  ]);
}
