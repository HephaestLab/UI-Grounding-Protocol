import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
  join(experimentRoot, 'sampling', 'interactive-sources.json'),
);
const outputRoot = join(runsRoot, 'source-data');

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function proportionalQuotas(groups, total, { coverNonempty = false } = {}) {
  const population = [...groups.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );
  const rows = [...groups.entries()].map(([stratum, items]) => {
    const exact = (items.length * total) / population;
    return {
      stratum,
      population: items.length,
      quota: Math.max(coverNonempty ? 1 : 0, Math.floor(exact)),
      remainder: Number((exact - Math.floor(exact)).toFixed(12)),
    };
  });
  let remaining = total - rows.reduce((sum, row) => sum + row.quota, 0);
  assert(
    !coverNonempty || total >= rows.length,
    'Cannot cover every nonempty stratum with the requested sample size',
  );
  if (remaining > 0) {
    for (const row of [...rows].sort(
      (left, right) =>
        right.remainder - left.remainder ||
        left.stratum.localeCompare(right.stratum),
    )) {
      if (remaining === 0) break;
      row.quota += 1;
      remaining -= 1;
    }
  } else if (remaining < 0) {
    for (const row of [...rows].sort(
      (left, right) =>
        left.remainder - right.remainder ||
        right.stratum.localeCompare(left.stratum),
    )) {
      if (remaining === 0) break;
      if (row.quota <= 1) continue;
      row.quota -= 1;
      remaining += 1;
    }
  }
  assert(remaining === 0, 'Could not allocate the requested sample size');
  return rows;
}

function policyCountBand(count) {
  if (count <= 4) return 'low-0-4';
  if (count <= 8) return 'medium-5-8';
  return 'high-9-plus';
}

const webmallRepo = join(experimentRoot, 'vendor', 'webmall');
assert(
  git(webmallRepo, ['rev-parse', 'HEAD']) === plan.webmall.repositoryRevision,
  'WebMall checkout is not at the frozen revision',
);
const webmallSets = await readJson(
  join(webmallRepo, ...plan.webmall.sourceFile.split('/')),
);
const webmallTasks = Object.entries(webmallSets)
  .flatMap(([sourceSetIndex, sourceSet]) =>
    sourceSet.tasks.map((task, sourceTaskIndex) => ({
      sourceTaskId: task.id,
      sourceSetIndex: Number(sourceSetIndex),
      sourceTaskIndex,
      taskSetId: sourceSet.id,
      category: task.category,
      sourceRowDigest: sha256(canonicalJson(task)),
    })),
  )
  .sort((left, right) => left.sourceTaskId.localeCompare(right.sourceTaskId));
assert(
  webmallTasks.length === plan.webmall.expectedTasks,
  `Expected ${plan.webmall.expectedTasks} WebMall tasks, found ${webmallTasks.length}`,
);
assert(
  new Set(webmallTasks.map((task) => task.sourceTaskId)).size ===
    webmallTasks.length,
  'WebMall source task ids are not unique',
);
await writeJson(join(outputRoot, 'webmall', 'selection.json'), {
  schemaVersion: '0.3.0',
  benchmarkId: 'webmall-action',
  sourceRevision: plan.webmall.repositoryRevision,
  selectionRule: plan.webmall.selection,
  population: webmallTasks.length,
  count: webmallTasks.length,
  selectionDigest: sha256(canonicalJson(webmallTasks)),
  tasks: webmallTasks,
});

const stRepo = join(experimentRoot, 'vendor', 'st-webagentbench');
assert(
  git(stRepo, ['rev-parse', 'HEAD']) ===
    plan.stWebAgentBench.repositoryRevision,
  'ST-WebAgentBench checkout is not at the frozen revision',
);
const stRows = await readJson(
  join(stRepo, ...plan.stWebAgentBench.sourceFile.split('/')),
);
const stCandidates = stRows.map((row, sourceIndex) => {
  assert(
    Array.isArray(row.sites) && row.sites.length === 1,
    `ST task ${row.task_id} does not have exactly one site`,
  );
  const site = row.sites[0];
  const band = policyCountBand(row.policies.length);
  return {
    row,
    sourceIndex,
    site,
    band,
    stratum: `${site}:${band}`,
    rank: sha256(`${plan.seed}:${site}:${row.task_id}:${row.intent}`),
  };
});
const stSiteGroups = new Map();
const stGroups = new Map();
for (const candidate of stCandidates) {
  const siteItems = stSiteGroups.get(candidate.site) ?? [];
  siteItems.push(candidate);
  stSiteGroups.set(candidate.site, siteItems);
  const items = stGroups.get(candidate.stratum) ?? [];
  items.push(candidate);
  stGroups.set(candidate.stratum, items);
}
const stSiteQuotas = proportionalQuotas(
  stSiteGroups,
  plan.stWebAgentBench.expectedTasks,
);
const stQuotas = stSiteQuotas.flatMap(({ stratum: site, quota }) => {
  const siteBandGroups = new Map(
    [...stGroups.entries()].filter(([stratum]) =>
      stratum.startsWith(`${site}:`),
    ),
  );
  return proportionalQuotas(siteBandGroups, quota, { coverNonempty: true });
});
const selectedStTasks = stQuotas
  .flatMap(({ stratum, quota }) =>
    stGroups
      .get(stratum)
      .sort((left, right) => left.rank.localeCompare(right.rank))
      .slice(0, quota),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank))
  .map(({ row, sourceIndex, site, band }) => ({
    sourceTaskId: `st:${row.task_id}`,
    sourceIndex,
    taskId: row.task_id,
    site,
    policyCountBand: band,
    policyCount: row.policies.length,
    evalTypes: [...row.eval.eval_types].sort(),
    intentTemplateId: row.intent_template_id,
    sourceRowDigest: sha256(canonicalJson(row)),
  }));
assert(
  selectedStTasks.length === plan.stWebAgentBench.expectedTasks,
  `Expected ${plan.stWebAgentBench.expectedTasks} ST tasks, selected ${selectedStTasks.length}`,
);
await writeJson(join(outputRoot, 'st-webagentbench', 'selection.json'), {
  schemaVersion: '0.3.0',
  benchmarkId: 'st-webagentbench',
  sourceRevision: plan.stWebAgentBench.repositoryRevision,
  selectionRule: plan.stWebAgentBench.selection,
  seed: plan.seed,
  population: stRows.length,
  count: selectedStTasks.length,
  siteQuotas: stSiteQuotas,
  stratumQuotas: stQuotas,
  selectionDigest: sha256(canonicalJson(selectedStTasks)),
  tasks: selectedStTasks,
});

console.log(
  JSON.stringify({
    webmall: {
      count: webmallTasks.length,
      digest: sha256(canonicalJson(webmallTasks)),
    },
    stWebAgentBench: {
      count: selectedStTasks.length,
      digest: sha256(canonicalJson(selectedStTasks)),
      siteQuotas: stSiteQuotas,
      stratumQuotas: stQuotas,
    },
  }),
);
