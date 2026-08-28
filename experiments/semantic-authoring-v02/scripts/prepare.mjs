import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { captureBaseline } from './browser.mjs';

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
  workspaceRoot,
  writePacket,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const study = required(args, 'study').toUpperCase();
const taskId = required(args, 'task');
const condition = required(args, 'condition');
const replicate = Number(required(args, 'replicate'));
const model = required(args, 'model');
const reasoning = required(args, 'reasoning');
if (!Number.isSafeInteger(replicate) || replicate < 1) {
  throw new Error('--replicate must be a positive integer');
}

const design = await readJson(join(experimentRoot, 'design.json'));
if (!design.conditions[study]?.includes(condition)) {
  throw new Error(`Unknown ${study} condition: ${condition}`);
}
const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const task = taskById(bank, taskId);
const runId = newRunId(study, replicate);
const runDirectory = join(experimentRoot, '.runs', runId);
await mkdir(runDirectory, { recursive: true });

const armCode = `arm-${sha256(`${runId}:${condition}`).slice(0, 12)}`;
const publicRun = {
  runId,
  armCode,
  study,
  task: sha256(taskId).slice(0, 16),
  replicate,
};

if (study === 'RQ1') {
  await writePacket({
    directory: runDirectory,
    task,
    condition,
    publicRun,
    skillRoot: join(workspaceRoot, 'skills'),
  });
  if (task.workflow === 'retrofit') {
    await mkdir(join(runDirectory, 'private'), { recursive: true });
    await captureBaseline(
      join(runDirectory, 'participant', 'app'),
      join(runDirectory, 'private', 'baseline.png'),
    );
  }
} else {
  const participant = join(runDirectory, 'participant');
  await mkdir(participant, { recursive: true });
  const artifact = stableStringify(readerArtifact(task, condition));
  const prompt = await readFile(
    join(experimentRoot, 'shared', 'reader-task.md'),
    'utf8',
  );
  const schema = await readFile(
    join(experimentRoot, 'schemas', 'reader-answer.schema.json'),
    'utf8',
  );
  await writeFile(join(participant, 'TASK.md'), prompt);
  await writeFile(join(participant, 'input.json'), artifact);
  await writeFile(join(participant, 'answer.schema.json'), schema);
  await writeFile(join(participant, 'run.json'), stableStringify(publicRun));
  if (condition === 'ugp') {
    await writeFile(
      join(participant, 'GUIDE.md'),
      await readFile(
        join(experimentRoot, 'shared', 'ugp-reader-guide.md'),
        'utf8',
      ),
    );
  } else if (condition === 'adhoc') {
    await writeFile(
      join(participant, 'GUIDE.md'),
      `# ${task.title} selection-context guide\n\nThe application emits one selected \`record\`; \`state\` contains current values, \`context\` contains scope or provenance, and \`operations\` lists discoverable operation IDs. Field names are local to this application and have their ordinary domain meaning. An operation ID does not grant execution authority.\n`,
    );
  }
}

const participantDirectory = join(runDirectory, 'participant');
const packetHash = await directoryDigest(
  participantDirectory,
  new Set(['run.json']),
);
const startedAt = new Date().toISOString();
const privateRun = {
  ...publicRun,
  taskId,
  domain: task.domain,
  workflow: task.workflow,
  condition,
  model,
  reasoning,
  forkTurns: 'none',
  startedAt,
  designStatus: design.status,
  inferential: design.status === 'frozen',
  exactTokenUsageObservable: design.exactTokenUsageObservable,
  hardFilesystemIsolation: design.hardFilesystemIsolation,
  controlledFactIds: task.controlledFacts.map((fact) => fact.id),
  packetSha256ExcludingRunMetadata: packetHash,
  inputBytes: Buffer.byteLength(
    await readFile(
      join(participantDirectory, study === 'RQ1' ? 'TASK.md' : 'input.json'),
    ),
  ),
};
await writeFile(
  join(runDirectory, 'private-run.json'),
  stableStringify(privateRun),
);

console.log(
  stableStringify({
    runId,
    participantDirectory,
    inferential: privateRun.inferential,
  }),
);
