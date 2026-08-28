import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  experimentRoot,
  parseArgs,
  readJson,
  requireString,
  sha256,
  stableStringify,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = requireString(args, 'run');
const runDirectory = join(experimentRoot, '.runs', runId);
const participantDirectory = join(runDirectory, 'participant');
const manifestPath = join(runDirectory, 'private-run.json');
const manifest = await readJson(manifestPath);
const session = await readJson(join(runDirectory, 'session.json'));
const sessionDirectory = join(experimentRoot, 'sessions', manifest.sessionId);
const phaseTwoPrompt = await readFile(
  join(sessionDirectory, session.phaseTwoPrompt),
  'utf8',
);
await writeFile(join(participantDirectory, 'PHASE-TWO.md'), phaseTwoPrompt);

let adaptationBytes = 0;
let adaptationSha256 = null;
if (manifest.revealHeldOutGuide) {
  const heldOutDirectory = join(experimentRoot, 'tasks', manifest.heldOutTask);
  const heldOutTask = await readJson(join(heldOutDirectory, 'task.json'));
  const heldOutArm = heldOutTask.conditions[manifest.taskCondition];
  if (!heldOutArm.guide) {
    throw new Error('The held-out arm has no adaptation guide to reveal');
  }
  const adaptation = await readFile(
    join(heldOutDirectory, heldOutArm.guide),
    'utf8',
  );
  await writeFile(join(participantDirectory, 'ADAPTATION.md'), adaptation);
  adaptationBytes = Buffer.byteLength(adaptation);
  adaptationSha256 = sha256(adaptation);
}

const nextManifest = {
  ...manifest,
  phaseTwoRevealedAt: manifest.phaseTwoRevealedAt ?? new Date().toISOString(),
  phaseTwoInstructionBytes: Buffer.byteLength(phaseTwoPrompt),
  adaptationBytes,
  adaptationSha256,
};
await writeFile(manifestPath, stableStringify(nextManifest));

console.log(
  stableStringify({
    runId,
    phaseTwoPrompt: join(participantDirectory, 'PHASE-TWO.md'),
    adaptationProvided: adaptationBytes > 0,
    adaptationBytes,
  }),
);
