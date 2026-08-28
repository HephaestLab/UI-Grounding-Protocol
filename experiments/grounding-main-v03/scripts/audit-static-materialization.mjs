import { access } from 'node:fs/promises';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  assert,
  canonicalJson,
  findForbiddenKeys,
  readJson,
  runsRoot,
  sameSet,
  schemaValidators,
  sha256,
  validateOrThrow,
  workspaceRoot,
  writeJson,
} from './lib.mjs';

const methods = [
  'vision-only',
  'html-ax',
  'tree-of-lens',
  'iai-p4',
  'rag-context',
  'mcp-resource',
  'nlweb-context',
  'ugp',
];
const benchmarkDirectories = ['screenpr-referent', 'screenqa-visible'];
const validators = await schemaValidators();
const semanticAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(semanticAjv);
for (const name of [
  'common.schema.json',
  'semantic-value.schema.json',
  'semantic-frame.schema.json',
  'grounding-capsule.schema.json',
]) {
  semanticAjv.addSchema(
    await readJson(
      join(workspaceRoot, 'spec', 'drafts', 'v0.2', 'schemas', name),
    ),
  );
}
const validateCapsule = semanticAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/grounding-capsule.schema.json',
);

function imagePaths(value) {
  if (Array.isArray(value)) return value.flatMap(imagePaths);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === 'imagePaths' && Array.isArray(item)
      ? item.filter((path) => typeof path === 'string')
      : imagePaths(item),
  );
}

const reports = [];
for (const directory of benchmarkDirectories) {
  const manifest = await readJson(
    join(runsRoot, 'materialized-static', directory, 'manifest.json'),
  );
  let imageReferenceCount = 0;
  const uniqueImages = new Set();
  for (const row of manifest.tasks) {
    const [task, gold] = await Promise.all([
      readJson(row.taskPath),
      readJson(row.goldPath),
    ]);
    assert(
      sha256(canonicalJson(task)) === row.taskDigest,
      `${task.taskId} task digest mismatch`,
    );
    assert(
      sha256(canonicalJson(gold)) === row.goldDigest,
      `${task.taskId} gold digest mismatch`,
    );
    validateOrThrow(
      validators['task-envelope.schema.json'],
      task,
      `${task.taskId} task`,
    );
    validateOrThrow(
      validators['gold.schema.json'],
      gold,
      `${task.taskId} gold`,
    );
    assert(gold.taskId === task.taskId, `${task.taskId} gold id mismatch`);
    assert(
      sha256(canonicalJson(task.sourceObservation.factKeys)) ===
        task.sourceObservation.factBundleDigest,
      `${task.taskId} fact digest mismatch`,
    );
    assert(
      methods.every((method) => task.sourceObservation.channels[method]),
      `${task.taskId} is missing a method channel`,
    );
    for (const method of methods) {
      const channel = task.sourceObservation.channels[method];
      assert(
        sameSet(channel.factKeys, task.sourceObservation.factKeys),
        `${task.taskId}/${method} failed fact-key parity`,
      );
      const forbidden = findForbiddenKeys(channel.representation);
      assert(
        forbidden.length === 0,
        `${task.taskId}/${method} leaked private keys: ${forbidden.join(', ')}`,
      );
      for (const imagePath of imagePaths(channel.representation)) {
        await access(imagePath);
        imageReferenceCount += 1;
        uniqueImages.add(imagePath);
      }
    }
    validateOrThrow(
      validateCapsule,
      task.sourceObservation.channels.ugp.representation.capsule,
      `${task.taskId} UGP capsule`,
    );
  }
  assert(
    sha256(canonicalJson(manifest.tasks)) === manifest.manifestDigest,
    `${manifest.benchmarkId} manifest digest mismatch`,
  );
  reports.push({
    benchmarkId: manifest.benchmarkId,
    tasks: manifest.tasks.length,
    methods: methods.length,
    factParityChecks: manifest.tasks.length * methods.length,
    imageReferenceCount,
    uniqueImages: uniqueImages.size,
    manifestDigest: manifest.manifestDigest,
  });
}

const report = {
  schemaVersion: '0.3.0',
  valid: true,
  generatedAt: new Date().toISOString(),
  reports,
  reportDigest: sha256(canonicalJson(reports)),
};
await writeJson(
  join(runsRoot, 'audits', 'static-materialization.json'),
  report,
);
console.log(JSON.stringify(report));
