import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { brotliCompressSync } from 'node:zlib';

import { transform } from 'esbuild';

import {
  ContextRegistry,
  resolveSelection,
  SemanticRegistry,
} from '../../packages/core/dist/index.js';

const clock = () => performance.now();
const mib = 1024 * 1024;

function node(index) {
  const id = `metric:${String(index).padStart(5, '0')}`;
  return {
    nodeId: id,
    type: 'org.ugp.performance.metric',
    label: id,
    authority: 'authoritative',
    entityRef: { namespace: 'metrics', id },
    anchorIds: [],
    revision: '1',
  };
}

function anchor(index) {
  const column = index % 100;
  const row = Math.floor(index / 100);
  return {
    anchorId: `anchor:${String(index).padStart(5, '0')}`,
    nodeId: `metric:${String(index).padStart(5, '0')}`,
    kind: 'canvas',
    adapterId: 'adapter:performance',
    surfaceRevision: '1',
    geometry: {
      kind: 'rect',
      coordinateSpace: 'viewport',
      x: column * 12,
      y: row * 12,
      width: 10,
      height: 10,
    },
  };
}

function registry(count, withAnchors = false) {
  const value = new SemanticRegistry({
    surfaceId: 'surface:performance',
    surfaceRevision: '1',
  });
  const handles = [];
  for (let index = 0; index < count; index += 1) {
    handles.push(value.registerNode(node(index)));
    if (withAnchors) handles.push(value.registerAnchor(anchor(index)));
  }
  return { handles, value };
}

function percentile(values, ratio) {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function distribution(values) {
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
  };
}

function measureResolution(snapshot, selection, samples = 1000) {
  for (let index = 0; index < 50; index += 1) {
    resolveSelection(snapshot, selection);
  }
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const started = clock();
    resolveSelection(snapshot, selection);
    durations.push(clock() - started);
  }
  return distribution(durations);
}

async function packageSize(name) {
  const source = await readFile(
    resolve(`packages/${name}/dist/index.js`),
    'utf8',
  );
  const minified = await transform(source, {
    format: 'esm',
    minify: true,
    target: 'es2023',
  });
  return {
    minifiedBytes: Buffer.byteLength(minified.code),
    brotliBytes: brotliCompressSync(minified.code).byteLength,
  };
}

const registrationSamples = [];
for (let sample = 0; sample < 5; sample += 1) {
  const started = clock();
  const current = registry(1000);
  registrationSamples.push(clock() - started);
  current.value.dispose();
}
const registrationAverageMs =
  registrationSamples.reduce((sum, value) => sum + value, 0) /
  registrationSamples.length;

globalThis.gc?.();
const memoryBefore = process.memoryUsage().heapUsed;
const oneThousand = registry(1000);
globalThis.gc?.();
const memoryAfter = process.memoryUsage().heapUsed;
const additionalMemoryBytes = Math.max(0, memoryAfter - memoryBefore);

const tenThousandStarted = clock();
const tenThousand = registry(10_000);
const tenThousandRegistrationMs = clock() - tenThousandStarted;

const resolutionRegistry = registry(1000, true);
const snapshot = resolutionRegistry.value.getSnapshot();
const pointGeometry = {
  kind: 'point',
  coordinateSpace: 'viewport',
  x: 5,
  y: 5,
};
const pointSelection = {
  selectionId: 'selection:performance:point',
  surfaceId: 'surface:performance',
  mode: 'point',
  selectors: [{ type: 'UGPGeometrySelector', geometry: pointGeometry }],
  geometry: pointGeometry,
  surfaceRevision: '1',
  createdAt: '2026-08-28T00:00:00Z',
  source: 'application',
};
const regionGeometry = {
  kind: 'rect',
  coordinateSpace: 'viewport',
  x: 0,
  y: 0,
  width: 120,
  height: 120,
};
const regionSelection = {
  ...pointSelection,
  selectionId: 'selection:performance:region',
  mode: 'region',
  selectors: [{ type: 'UGPGeometrySelector', geometry: regionGeometry }],
  geometry: regionGeometry,
};
const point = measureResolution(snapshot, pointSelection);
const region = measureResolution(snapshot, regionSelection);

const contextRegistry = new ContextRegistry({
  clock: () => new Date('2026-08-28T00:00:00Z'),
});
const referents = [];
for (let index = 0; index < 20; index += 1) {
  const current = node(index);
  referents.push({
    ...current,
    confidence: 1,
    relation: 'exact',
    evidence: [{ kind: 'semantic-selector', authority: 'authoritative' }],
    surfaceRevision: '1',
    nodeRevision: '1',
  });
  contextRegistry.register(
    current.nodeId,
    {
      name: 'summary',
      description: 'Performance summary',
      schema: { type: 'object' },
      sensitivity: 'internal',
      freshness: 'snapshot',
    },
    () => ({ value: index, note: 'deterministic context' }),
  );
}
const context = await contextRegistry.materialize({
  grounding: {
    groundingId: 'grounding:performance',
    selection: pointSelection,
    referents,
    ambiguity: { requiresDisambiguation: false },
    generatedAt: '2026-08-28T00:00:00Z',
  },
  purpose: 'explain',
  requestedContexts: ['summary'],
  budgetBytes: 32_768,
  signal: new globalThis.AbortController().signal,
  authorize: () => true,
});
const contextBundleBytes = Buffer.byteLength(JSON.stringify(context));

for (let cycle = 0; cycle < 100; cycle += 1) {
  const temporary = registry(1000);
  for (const handle of [...temporary.handles].reverse()) handle.dispose();
  const clean = temporary.value.getSnapshot();
  assert.equal(clean.nodes.length, 0);
  assert.equal(clean.anchors.length, 0);
  temporary.value.dispose();
}

const packageSizes = {
  core: await packageSize('core'),
  dom: await packageSize('dom'),
  react: await packageSize('react'),
};
const commit = spawnSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).stdout.trim();
const report = {
  environment: {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: cpus().length,
    memoryBytes: { free: freemem(), total: totalmem() },
    node: process.version,
    commit,
    buildMode: 'production',
    viewport: 'browser gate: 1440x900 / 1024x768',
    dpr: 'browser gate: 1 / 2',
    inspector: false,
  },
  registry: {
    registration1kAverageMs: registrationAverageMs,
    additionalMemory1kBytes: additionalMemoryBytes,
    registration10kMs: tenThousandRegistrationMs,
  },
  resolution: { point, region },
  context: {
    bytes: contextBundleBytes,
    referents: context.referentContexts.length,
  },
  packageSizes,
  leakCycles: 100,
};

assert.ok(registrationAverageMs < 100, '1K registration budget exceeded');
assert.ok(additionalMemoryBytes < 2 * mib, '1K memory budget exceeded');
assert.ok(point.p95Ms < 8, 'Point p95 budget exceeded');
assert.ok(region.p95Ms < 16, 'Region p95 budget exceeded');
assert.ok(contextBundleBytes <= 32 * 1024, 'ContextBundle budget exceeded');
assert.ok(context.referentContexts.length <= 20, 'Referent limit exceeded');
assert.ok(
  packageSizes.core.brotliBytes <= 15 * 1024,
  'Core size budget exceeded',
);
assert.ok(
  packageSizes.dom.brotliBytes <= 12 * 1024,
  'DOM size budget exceeded',
);
assert.ok(
  packageSizes.react.brotliBytes <= 5 * 1024,
  'React size budget exceeded',
);

if (process.env.UGP_PERFORMANCE_REPORT) {
  await writeFile(
    resolve(process.env.UGP_PERFORMANCE_REPORT),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
console.log(JSON.stringify(report, null, 2));

oneThousand.value.dispose();
tenThousand.value.dispose();
resolutionRegistry.value.dispose();
contextRegistry.dispose();
