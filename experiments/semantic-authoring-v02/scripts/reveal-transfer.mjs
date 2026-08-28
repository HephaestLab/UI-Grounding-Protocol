import { copyFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  stableStringify,
  taskById,
} from './lib.mjs';

const runId = required(parseArgs(process.argv.slice(2)), 'run');
if (!/^[a-z0-9-]+$/u.test(runId)) throw new Error('Invalid run ID');
const runDirectory = join(experimentRoot, '.runs', runId);
const participant = join(runDirectory, 'participant');
const privateRun = await readJson(join(runDirectory, 'private-run.json'));
if (privateRun.study !== 'RQ2-transfer') throw new Error('Not a transfer run');
await stat(join(participant, 'answer.initial.json'));
await copyFile(
  join(experimentRoot, 'shared', 'transfer-phase-two.md'),
  join(participant, 'PHASE-TWO.md'),
);
if (privateRun.condition === 'adhoc') {
  const bank = await readJson(join(experimentRoot, 'task-bank.json'));
  const task = taskById(bank, privateRun.heldOutTask);
  await writeFile(
    join(participant, 'held-out', 'GUIDE.md'),
    `# ${task.title} local schema\n\n\`record\` is the canonical selected object. \`state\` contains current values, \`context\` contains scope or provenance, and \`operations\` lists discoverable operations without granting execution authority. Field names are local to this application.\n`,
  );
}
privateRun.phaseTwoRevealedAt = new Date().toISOString();
await writeFile(
  join(runDirectory, 'private-run.json'),
  stableStringify(privateRun),
);
console.log(stableStringify({ runId, phase: 2 }));
