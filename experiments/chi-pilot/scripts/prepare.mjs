import { Buffer } from 'node:buffer';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
const taskId = requireString(args, 'task');
const condition = requireString(args, 'condition');
const replicate = requirePositiveInteger(args, 'replicate');
const model = requireString(args, 'model');
const reasoning = requireString(args, 'reasoning');
const taskDirectory = join(experimentRoot, 'tasks', taskId);
const task = await readJson(join(taskDirectory, 'task.json'));
const arm = task.conditions[condition];
if (!arm) throw new Error(`Unknown condition ${condition} for ${taskId}`);

const runId = newRunId(replicate);
const runDirectory = join(experimentRoot, '.runs', runId);
const participantDirectory = join(runDirectory, 'participant');
await mkdir(participantDirectory, { recursive: true });

const prompt = await readFile(join(taskDirectory, task.prompt), 'utf8');
const input = await readFile(join(taskDirectory, arm.input), 'utf8');
const schema = await readFile(join(taskDirectory, task.answerSchema), 'utf8');
const guide = arm.guide
  ? await readFile(join(taskDirectory, arm.guide), 'utf8')
  : '';
await writeFile(join(participantDirectory, 'TASK.md'), prompt);
await writeFile(join(participantDirectory, 'input.json'), input);
await writeFile(join(participantDirectory, 'answer.schema.json'), schema);
if (guide) await writeFile(join(participantDirectory, 'GUIDE.md'), guide);

const armCode = `arm-${sha256(`${runId}:${condition}`).slice(0, 12)}`;
const startedAt = new Date().toISOString();
const publicManifest = {
  runId,
  armCode,
  taskId: sha256(taskId).slice(0, 16),
  replicate,
  inputSha256: sha256(input),
  promptSha256: sha256(prompt),
  answerSchemaSha256: sha256(schema),
  guideSha256: guide ? sha256(guide) : null,
};
const privateManifest = {
  ...publicManifest,
  taskId,
  condition,
  phase: task.phase,
  model,
  reasoning,
  forkTurns: 'none',
  startedAt,
  exactTokenUsageObservable: false,
  inputBytes: {
    task: Buffer.byteLength(prompt),
    artifact: Buffer.byteLength(input),
    answerSchema: Buffer.byteLength(schema),
    adaptationGuide: Buffer.byteLength(guide),
    total:
      Buffer.byteLength(prompt) +
      Buffer.byteLength(input) +
      Buffer.byteLength(schema) +
      Buffer.byteLength(guide),
  },
};
await writeFile(
  join(participantDirectory, 'run.json'),
  stableStringify(publicManifest),
);
await writeFile(
  join(runDirectory, 'private-run.json'),
  stableStringify(privateManifest),
);
await copyFile(
  join(taskDirectory, 'task.json'),
  join(runDirectory, 'task.json'),
);

console.log(
  stableStringify({
    runId,
    participantDirectory,
    privateManifest: join(runDirectory, 'private-run.json'),
  }),
);
