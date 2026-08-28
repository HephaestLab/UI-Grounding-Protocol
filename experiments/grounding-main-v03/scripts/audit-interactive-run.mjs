import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import {
  canonicalJson,
  parseArgs,
  readJson,
  required,
  runsRoot,
  sameSet,
  schemaValidators,
  sha256,
  validateOrThrow,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run-id');
const runRoot = join(runsRoot, runId);
const validators = await schemaValidators();

async function taskFiles(root) {
  const output = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        basename(directory) === 'tasks' &&
        /^step-\d+\.json$/u.test(entry.name)
      ) {
        output.push(path);
      }
    }
  }
  await visit(root);
  return output;
}

const failures = [];
const records = [];
for (const path of await taskFiles(join(runRoot, 'tasks'))) {
  const task = await readJson(path);
  try {
    validateOrThrow(validators['task-envelope.schema.json'], task, path);
    const expectedDigest = sha256(
      canonicalJson(task.sourceObservation.factKeys),
    );
    if (expectedDigest !== task.sourceObservation.factBundleDigest) {
      failures.push({ path, kind: 'fact-digest-mismatch' });
    }
    const methods = Object.keys(task.sourceObservation.channels).sort();
    if (methods.length !== 8) {
      failures.push({ path, kind: 'method-count', observed: methods.length });
    }
    for (const method of methods) {
      if (
        !sameSet(
          task.sourceObservation.channels[method].factKeys,
          task.sourceObservation.factKeys,
        )
      ) {
        failures.push({ path, kind: 'fact-parity', method });
      }
    }
    records.push({
      path,
      taskId: task.taskId,
      step: task.step,
      methods,
      factBundleDigest: task.sourceObservation.factBundleDigest,
    });
  } catch (error) {
    failures.push({
      path,
      kind: 'schema',
      error: String(error.message ?? error),
    });
  }
}
records.sort((left, right) => left.path.localeCompare(right.path));
const report = {
  schemaVersion: '0.3.0',
  runId,
  valid: failures.length === 0,
  taskPackets: records.length,
  methodFactParityChecks: records.reduce(
    (sum, record) => sum + record.methods.length,
    0,
  ),
  recordsDigest: sha256(canonicalJson(records)),
  failures,
};
await writeJson(join(runRoot, 'audits', 'fact-parity.json'), report);
console.log(JSON.stringify(report));
if (!report.valid) process.exitCode = 1;
