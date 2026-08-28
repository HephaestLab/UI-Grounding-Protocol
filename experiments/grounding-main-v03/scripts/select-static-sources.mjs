import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

import {
  assert,
  canonicalJson,
  experimentRoot,
  readJson,
  runsRoot,
  sha256,
  writeJson,
} from './lib.mjs';

const plan = await readJson(
  join(experimentRoot, 'sampling', 'static-sources.json'),
);
const outputRoot = join(runsRoot, 'source-data');

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function questionLead(question) {
  const lead = String(question)
    .trim()
    .toLowerCase()
    .match(/^[a-z]+/u)?.[0];
  return ['what', 'which', 'how', 'where', 'who', 'when'].includes(lead)
    ? lead
    : 'yes-no-or-other';
}

function proportionalQuotas(groups, total) {
  const population = [...groups.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );
  const rows = [...groups.entries()].map(([stratum, items]) => {
    const exact = (items.length * total) / population;
    return {
      stratum,
      population: items.length,
      quota: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = total - rows.reduce((sum, row) => sum + row.quota, 0);
  for (const row of [...rows].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      left.stratum.localeCompare(right.stratum),
  )) {
    if (remaining === 0) break;
    row.quota += 1;
    remaining -= 1;
  }
  return rows;
}

const screenprRepo = join(experimentRoot, 'vendor', 'screenpr-data');
assert(
  git(screenprRepo, ['rev-parse', 'HEAD']) === plan.screenpr.datasetRevision,
  'ScreenPR dataset checkout is not at the frozen revision',
);
const publishedScreenprFiles = git(screenprRepo, [
  'ls-tree',
  '-r',
  '--name-only',
  'HEAD',
  '--',
  'test/screenshots',
])
  .split(/\r?\n/u)
  .filter(Boolean);
assert(
  publishedScreenprFiles.length === plan.screenpr.expectedTasks,
  `Expected ${plan.screenpr.expectedTasks} ScreenPR screenshots, found ${publishedScreenprFiles.length}`,
);
const screenprMetadata = (
  await readFile(join(screenprRepo, 'test', 'metadata.jsonl'), 'utf8')
)
  .trim()
  .split(/\r?\n/u)
  .map((line) => JSON.parse(line));
const screenprByFile = new Map(
  screenprMetadata.map((row) => [posix.join('test', row.file_name), row]),
);
const screenprTasks = publishedScreenprFiles.map((fileName) => {
  const source = screenprByFile.get(fileName);
  assert(source, `No ScreenPR metadata for ${fileName}`);
  return {
    sourceTaskId: `screenpr:${source.modality}:${source.id}`,
    modality: source.modality,
    sourceId: source.id,
    image: fileName,
    point: source.point,
    metadataDigest: sha256(canonicalJson(source)),
  };
});
await writeJson(join(outputRoot, 'screenpr', 'selection.json'), {
  schemaVersion: '0.3.0',
  benchmarkId: 'screenpr-referent',
  sourceRevision: plan.screenpr.datasetRevision,
  selectionRule: plan.screenpr.selection,
  count: screenprTasks.length,
  selectionDigest: sha256(canonicalJson(screenprTasks)),
  tasks: screenprTasks,
});

const screenqaRepo = join(experimentRoot, 'vendor', 'screenqa');
assert(
  git(screenqaRepo, ['rev-parse', 'HEAD']) === plan.screenqa.repositoryRevision,
  'ScreenQA checkout is not at the frozen revision',
);
const screenqaRows = await readJson(
  join(screenqaRepo, 'short_answers', 'test.json'),
);
const eligible = screenqaRows
  .map((row, sourceIndex) => ({
    ...row,
    sourceIndex,
    stratum: questionLead(row.question),
  }))
  .filter((row) => row.ground_truth.some((answer) => answer !== '<no answer>'));
const groups = new Map();
for (const row of eligible) {
  const items = groups.get(row.stratum) ?? [];
  items.push(row);
  groups.set(row.stratum, items);
}
const quotas = proportionalQuotas(groups, plan.screenqa.expectedTasks);
const screenqaTasks = quotas
  .flatMap(({ stratum, quota }) =>
    groups
      .get(stratum)
      .map((row) => ({
        ...row,
        rank: sha256(
          `${plan.seed}:${row.image_id}:${row.sourceIndex}:${row.question}`,
        ),
      }))
      .sort((left, right) => left.rank.localeCompare(right.rank))
      .slice(0, quota),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank))
  .map((row) => ({
    sourceTaskId: `screenqa:test:${row.sourceIndex}`,
    sourceIndex: row.sourceIndex,
    imageId: row.image_id,
    questionLead: row.stratum,
    questionDigest: sha256(row.question),
    sourceRowDigest: sha256(
      canonicalJson({
        image_id: row.image_id,
        question: row.question,
        ground_truth: row.ground_truth,
      }),
    ),
  }));
assert(
  screenqaTasks.length === plan.screenqa.expectedTasks,
  `Expected ${plan.screenqa.expectedTasks} ScreenQA tasks, selected ${screenqaTasks.length}`,
);
await writeJson(join(outputRoot, 'screenqa', 'selection.json'), {
  schemaVersion: '0.3.0',
  benchmarkId: 'screenqa-visible',
  sourceRevision: plan.screenqa.repositoryRevision,
  sourceSplit: plan.screenqa.split,
  selectionRule: plan.screenqa.selection,
  eligibility: plan.screenqa.eligibility,
  seed: plan.seed,
  population: screenqaRows.length,
  eligiblePopulation: eligible.length,
  count: screenqaTasks.length,
  uniqueImages: new Set(screenqaTasks.map((row) => row.imageId)).size,
  quotas,
  selectionDigest: sha256(canonicalJson(screenqaTasks)),
  tasks: screenqaTasks,
});
const ricoMembers = [
  ...new Set(
    screenqaTasks.flatMap(({ imageId }) => [
      `combined/${imageId}.jpg`,
      `combined/${imageId}.json`,
    ]),
  ),
].sort();
await mkdir(join(outputRoot, 'screenqa'), { recursive: true });
await writeFile(
  join(outputRoot, 'screenqa', 'rico-members.txt'),
  `${ricoMembers.join('\n')}\n`,
);

console.log(
  JSON.stringify({
    screenpr: {
      count: screenprTasks.length,
      digest: sha256(canonicalJson(screenprTasks)),
    },
    screenqa: {
      count: screenqaTasks.length,
      uniqueImages: new Set(screenqaTasks.map((row) => row.imageId)).size,
      digest: sha256(canonicalJson(screenqaTasks)),
    },
  }),
);
