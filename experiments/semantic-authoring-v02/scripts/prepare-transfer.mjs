import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  directoryDigest,
  experimentRoot,
  newRunId,
  parseArgs,
  readerArtifact,
  readJson,
  required,
  sha256,
  stableStringify,
  taskById,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const condition = required(args, 'condition');
const replicate = Number(required(args, 'replicate'));
const model = required(args, 'model');
const reasoning = required(args, 'reasoning');
if (!Number.isSafeInteger(replicate) || replicate < 1) {
  throw new Error('--replicate must be a positive integer');
}

const design = await readJson(join(experimentRoot, 'design.json'));
const transfer = await readJson(join(experimentRoot, 'transfer.json'));
if (!transfer.conditions.includes(condition)) {
  throw new Error(`Unknown transfer condition: ${condition}`);
}
const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const runId = newRunId('rq2-transfer', replicate);
const runDirectory = join(experimentRoot, '.runs', runId);
const participant = join(runDirectory, 'participant');
await mkdir(join(participant, 'examples'), { recursive: true });
await mkdir(join(participant, 'held-out'), { recursive: true });

const publicRun = {
  runId,
  armCode: `arm-${sha256(`${runId}:${condition}`).slice(0, 12)}`,
  study: 'RQ2-transfer',
  session: sha256(transfer.sessionId).slice(0, 16),
  replicate,
};
await writeFile(
  join(participant, 'TASK.md'),
  await readFile(
    join(experimentRoot, 'shared', 'transfer-phase-one.md'),
    'utf8',
  ),
);
await writeFile(
  join(participant, 'answer.schema.json'),
  await readFile(
    join(experimentRoot, 'schemas', 'reader-answer.schema.json'),
    'utf8',
  ),
);
await writeFile(join(participant, 'run.json'), stableStringify(publicRun));

for (const taskId of transfer.examples) {
  const task = taskById(bank, taskId);
  const directory = join(participant, 'examples', sha256(taskId).slice(0, 10));
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'input.json'),
    stableStringify(readerArtifact(task, condition)),
  );
  const facts = Object.fromEntries(
    task.controlledFacts.map((fact) => [fact.id, fact.value]),
  );
  await writeFile(
    join(directory, 'answer.json'),
    stableStringify({
      referent: facts.identity,
      facts,
      capability: facts.capability,
      shouldInvoke: false,
      uncertainties: [],
    }),
  );
  if (condition === 'adhoc') {
    await writeFile(join(directory, 'GUIDE.md'), applicationGuide(task));
  }
}

const heldOut = taskById(bank, transfer.heldOutTask);
await writeFile(
  join(participant, 'held-out', 'input.json'),
  stableStringify(readerArtifact(heldOut, condition)),
);
if (condition === 'ugp') {
  await writeFile(
    join(participant, 'GUIDE.md'),
    await readFile(
      join(experimentRoot, 'shared', 'ugp-reader-guide.md'),
      'utf8',
    ),
  );
}

const packetHash = await directoryDigest(participant, new Set(['run.json']));
const privateRun = {
  ...publicRun,
  sessionId: transfer.sessionId,
  condition,
  model,
  reasoning,
  forkTurns: 'none',
  designStatus: design.status,
  inferential: design.status === 'frozen',
  examples: transfer.examples,
  heldOutTask: transfer.heldOutTask,
  heldOutGuideInitiallyPresent: false,
  startedAt: new Date().toISOString(),
  packetSha256ExcludingRunMetadata: packetHash,
  inputBytes: Buffer.byteLength(
    await readFile(join(participant, 'held-out', 'input.json')),
  ),
};
await writeFile(
  join(runDirectory, 'private-run.json'),
  stableStringify(privateRun),
);
console.log(
  stableStringify({
    runId,
    participantDirectory: participant,
    inferential: false,
  }),
);

function applicationGuide(task) {
  return `# ${task.title} local schema\n\n\`record\` is the canonical selected object. \`state\` contains current values, \`context\` contains scope or provenance, and \`operations\` lists discoverable operations without granting execution authority. Field names are local to this application.\n`;
}
