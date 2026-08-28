import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  experimentRoot,
  newRunId,
  parseArgs,
  readJson,
  requirePositiveInteger,
  requireString,
  sha256,
  stableStringify,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const sessionId = requireString(args, 'session');
const condition = requireString(args, 'condition');
const replicate = requirePositiveInteger(args, 'replicate');
const model = requireString(args, 'model');
const reasoning = requireString(args, 'reasoning');
const sessionDirectory = join(experimentRoot, 'sessions', sessionId);
const session = await readJson(join(sessionDirectory, 'session.json'));
const arm = session.conditions[condition];
if (!arm) throw new Error(`Unknown condition ${condition} for ${sessionId}`);

const runId = newRunId(replicate);
const runDirectory = join(experimentRoot, '.runs', runId);
const participantDirectory = join(runDirectory, 'participant');
await mkdir(join(participantDirectory, 'examples'), { recursive: true });
await mkdir(join(participantDirectory, 'held-out'), { recursive: true });

const copiedContents = [];
async function copyText(source, destination) {
  const content = await readFile(source, 'utf8');
  await writeFile(destination, content);
  copiedContents.push(content);
  return content;
}

await copyText(
  join(sessionDirectory, session.phaseOnePrompt),
  join(participantDirectory, 'TASK.md'),
);
const phaseTwoPrompt = await readFile(
  join(sessionDirectory, session.phaseTwoPrompt),
  'utf8',
);

let sharedGuideBytes = 0;
if (arm.sharedGuide) {
  const sharedGuide = await copyText(
    join(sessionDirectory, arm.sharedGuide),
    join(participantDirectory, 'GUIDE.md'),
  );
  sharedGuideBytes = Buffer.byteLength(sharedGuide);
}

let exampleGuideBytes = 0;
for (const [index, taskId] of session.examples.entries()) {
  const taskDirectory = join(experimentRoot, 'tasks', taskId);
  const task = await readJson(join(taskDirectory, 'task.json'));
  const taskArm = task.conditions[arm.taskCondition];
  if (!taskArm) {
    throw new Error(`${taskId} does not define ${arm.taskCondition}`);
  }
  const exampleDirectory = join(
    participantDirectory,
    'examples',
    `example-${index + 1}`,
  );
  await mkdir(exampleDirectory, { recursive: true });
  await copyText(
    join(taskDirectory, taskArm.input),
    join(exampleDirectory, 'input.json'),
  );
  await copyText(
    join(taskDirectory, task.oracle),
    join(exampleDirectory, 'answer.json'),
  );
  if (!arm.sharedGuide && taskArm.guide) {
    const guide = await copyText(
      join(taskDirectory, taskArm.guide),
      join(exampleDirectory, 'GUIDE.md'),
    );
    exampleGuideBytes += Buffer.byteLength(guide);
  }
}

const heldOutDirectory = join(experimentRoot, 'tasks', session.heldOutTask);
const heldOutTask = await readJson(join(heldOutDirectory, 'task.json'));
const heldOutArm = heldOutTask.conditions[arm.taskCondition];
if (!heldOutArm) {
  throw new Error(
    `${session.heldOutTask} does not define ${arm.taskCondition}`,
  );
}
await copyText(
  join(heldOutDirectory, heldOutArm.input),
  join(participantDirectory, 'held-out', 'input.json'),
);
await copyText(
  join(heldOutDirectory, heldOutTask.answerSchema),
  join(participantDirectory, 'answer.schema.json'),
);

const armCode = `arm-${sha256(`${runId}:${condition}`).slice(0, 12)}`;
const phaseOneInputBytes = copiedContents.reduce(
  (sum, content) => sum + Buffer.byteLength(content),
  0,
);
const publicManifest = {
  runId,
  armCode,
  sessionId: sha256(sessionId).slice(0, 16),
  replicate,
  exampleCount: session.examples.length,
  phaseOneInputSha256: sha256(copiedContents.join('\n---\n')),
};
const privateManifest = {
  ...publicManifest,
  sessionId,
  condition,
  phase: session.phase,
  model,
  reasoning,
  forkTurns: 'none',
  startedAt: new Date().toISOString(),
  exactTokenUsageObservable: false,
  examples: session.examples,
  heldOutTask: session.heldOutTask,
  taskCondition: arm.taskCondition,
  revealHeldOutGuide: arm.revealHeldOutGuide,
  phaseOneInputBytes,
  sharedGuideBytes,
  exampleGuideBytes,
  phaseTwoPromptSha256: sha256(phaseTwoPrompt),
};
await writeFile(
  join(participantDirectory, 'run.json'),
  stableStringify(publicManifest),
);
await writeFile(
  join(runDirectory, 'private-run.json'),
  stableStringify(privateManifest),
);
await writeFile(join(runDirectory, 'session.json'), stableStringify(session));

console.log(
  stableStringify({
    runId,
    participantDirectory,
    privateManifest: join(runDirectory, 'private-run.json'),
  }),
);
