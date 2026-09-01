import { readdir } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import {
  canonicalJson,
  episodeDirectories,
  findForbiddenKeys,
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

async function namedFiles(root, name) {
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
      else if (entry.name === name) output.push(path);
    }
  }
  await visit(root);
  return output;
}

const failures = [];
const matrixPlan = await readJson(join(runRoot, 'matrix-plan.json'));
const activeEpisodeIds = new Set();
let scoredJobs = 0;
if (matrixPlan.kind === 'interactive-matrix') {
  const officialScorePaths = await namedFiles(
    join(runRoot, 'tasks'),
    'official-score.json',
  );
  scoredJobs = officialScorePaths.length;
  for (const path of officialScorePaths) {
    const score = await readJson(path);
    if (!Array.isArray(score.episodeIds) || score.episodeIds.length === 0) {
      failures.push({ path, kind: 'missing-episode-ids' });
      continue;
    }
    score.episodeIds.forEach((episodeId) => activeEpisodeIds.add(episodeId));
  }
} else if (matrixPlan.kind === 'static-matrix') {
  for (const directory of await episodeDirectories(runId)) {
    try {
      await readJson(join(directory, 'score.json'));
      scoredJobs += 1;
      activeEpisodeIds.add(basename(directory));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
} else {
  failures.push({
    path: join(runRoot, 'matrix-plan.json'),
    kind: 'unsupported-matrix-kind',
    observed: matrixPlan.kind,
  });
}
if (scoredJobs !== matrixPlan.episodeCount) {
  failures.push({
    path: join(runRoot, 'matrix-plan.json'),
    kind: 'incomplete-matrix',
    expected: matrixPlan.episodeCount,
    observed: scoredJobs,
  });
}

const activeEpisodes = [];
const allowedTaskRoots = [
  resolve(runRoot, 'tasks'),
  resolve(runsRoot, 'materialized-static'),
];
for (const episodeId of [...activeEpisodeIds].sort()) {
  const directory = join(runRoot, 'episodes', episodeId);
  const privatePath = join(directory, 'private.json');
  try {
    const privateRecord = await readJson(privatePath);
    const taskPath = resolve(privateRecord.taskPath);
    const taskPathAllowed = allowedTaskRoots.some((root) => {
      const candidate = relative(root, taskPath);
      return !candidate.startsWith('..') && !isAbsolute(candidate);
    });
    if (!taskPathAllowed) {
      failures.push({ path: privatePath, kind: 'task-path-outside-run' });
      continue;
    }
    activeEpisodes.push({ episodeId, directory, taskPath });
  } catch (error) {
    failures.push({
      path: privatePath,
      kind: 'private-packet',
      error: String(error.message ?? error),
    });
  }
}

const records = [];
const semanticMethods = ['rag-context', 'mcp-resource', 'nlweb-context', 'ugp'];
const structuralMethods = ['vision-only', 'html-ax', 'tree-of-lens', 'iai-p4'];
for (const { taskPath: path } of activeEpisodes) {
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
    const ugpChannel = task.sourceObservation.channels.ugp;
    const authorityFactKeys = ugpChannel?.factKeys ?? [];
    for (const method of semanticMethods) {
      const channel = task.sourceObservation.channels[method];
      if (!channel || !sameSet(channel.factKeys, authorityFactKeys)) {
        failures.push({ path, kind: 'semantic-authority-parity', method });
      }
    }
    for (const method of structuralMethods) {
      const channel = task.sourceObservation.channels[method];
      if (
        !channel ||
        channel.factKeys.some((factKey) => factKey.startsWith('authority:'))
      ) {
        failures.push({ path, kind: 'structural-authority-leak', method });
      }
      if (canonicalJson(channel?.representation ?? {}).includes('data-ugp-')) {
        failures.push({ path, kind: 'structural-ugp-attribute-leak', method });
      }
    }
    const provenance = ugpChannel?.representation?.runtimeProvenance;
    const ugpRepresentation = ugpChannel?.representation;
    const referentIndex = ugpRepresentation?.referentIndex;
    const capsules = ugpRepresentation?.capsules;
    const indexedNodeIds = new Set(
      Array.isArray(referentIndex)
        ? referentIndex.map((referent) => referent.nodeId)
        : [],
    );
    const capsuleNodeIds = new Set(
      Array.isArray(capsules)
        ? capsules.map((capsule) => capsule?.referent?.nodeId)
        : [],
    );
    if (
      ugpRepresentation?.kind !== 'ugp-referent-set' ||
      !Array.isArray(referentIndex) ||
      !Array.isArray(capsules) ||
      indexedNodeIds.size !== referentIndex.length ||
      capsuleNodeIds.size !== capsules.length ||
      ![...capsuleNodeIds].every((nodeId) => indexedNodeIds.has(nodeId)) ||
      ugpRepresentation?.capsuleSelection?.policy !==
        'visible-then-frame-type-then-node-id' ||
      ugpRepresentation?.capsuleSelection?.indexed !== referentIndex.length ||
      ugpRepresentation?.capsuleSelection?.selected !== capsules.length ||
      !capsules.every(
        (capsule) =>
          capsule?.description?.frame?.subject?.ref &&
          capsule?.description?.summary,
      )
    ) {
      failures.push({ path, kind: 'runtime-referent-set-integrity' });
    }
    if (
      provenance?.origin !== 'application-runtime' ||
      !/^[a-f0-9]{64}$/u.test(provenance?.adapterDigest ?? '') ||
      !/^[a-f0-9]{64}$/u.test(provenance?.authorityManifestDigest ?? '') ||
      provenance?.taskSpecificInputsExcluded !== true ||
      provenance?.goldAccess !== false ||
      !Number.isInteger(provenance?.referentCount) ||
      provenance?.referentCount !== referentIndex?.length ||
      !Number.isInteger(provenance?.selectedCapsuleCount) ||
      provenance?.selectedCapsuleCount !== capsules?.length ||
      !/^[a-f0-9]{64}$/u.test(provenance?.profileDigest ?? '') ||
      !/^[a-f0-9]{64}$/u.test(provenance?.referentProvenanceDigest ?? '') ||
      !/^[a-f0-9]{64}$/u.test(provenance?.capsuleSelectionDigest ?? '') ||
      provenance?.capsuleSelectionDigest !==
        sha256(canonicalJson(ugpRepresentation?.capsuleSelection))
    ) {
      failures.push({ path, kind: 'runtime-capsule-provenance' });
    }
    if (
      matrixPlan.runtimeAdapter &&
      (provenance?.adapterId !== matrixPlan.runtimeAdapter.adapterId ||
        provenance?.adapterDigest !== matrixPlan.runtimeAdapter.adapterDigest ||
        provenance?.authorityManifestDigest !==
          matrixPlan.runtimeAdapter.authorityManifestDigest ||
        provenance?.application !== matrixPlan.runtimeAdapter.application ||
        provenance?.applicationVersion !==
          matrixPlan.runtimeAdapter.applicationVersion)
    ) {
      failures.push({ path, kind: 'runtime-adapter-plan-mismatch' });
    }
    records.push({
      path,
      taskId: task.taskId,
      step: task.step,
      methods,
      factBundleDigest: task.sourceObservation.factBundleDigest,
      adapterDigest: provenance?.adapterDigest ?? null,
      authorityManifestDigest: provenance?.authorityManifestDigest ?? null,
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
const actorRecords = [];
for (const { directory } of activeEpisodes) {
  const requestPath = join(directory, 'request.json');
  try {
    const [request, response, runner] = await Promise.all([
      readJson(requestPath),
      readJson(join(directory, 'response.json')),
      readJson(join(directory, 'runner.json')),
    ]);
    validateOrThrow(
      validators['actor-request.schema.json'],
      request,
      requestPath,
    );
    const forbidden = findForbiddenKeys(request);
    if (forbidden.length > 0) {
      failures.push({ path: requestPath, kind: 'forbidden-actor-keys' });
    }
    if (
      request.audit.goldIncluded !== false ||
      request.audit.toolsAllowed !== false ||
      runner.toolsEnforcedOff !== true ||
      runner.exitCode !== 0
    ) {
      failures.push({ path: requestPath, kind: 'actor-isolation' });
    }
    if (
      runner.runner !== 'codex-exec' ||
      typeof runner.version !== 'string' ||
      runner.version.length === 0 ||
      runner.model !== request.condition.model ||
      runner.reasoningEffort !== request.condition.reasoningEffort ||
      runner.authMode !== 'ChatGPT OAuth' ||
      runner.ephemeral !== true ||
      runner.ignoreUserConfig !== true ||
      runner.ignoreRules !== true ||
      runner.sandbox !== 'read-only' ||
      runner.approvalPolicy !== 'never'
    ) {
      failures.push({ path: requestPath, kind: 'runner-identity' });
    }
    const expectedImageCount = Array.isArray(
      request.actor.observation.imagePaths,
    )
      ? request.actor.observation.imagePaths.length
      : 0;
    if (
      runner.imageCount !== expectedImageCount ||
      !Array.isArray(runner.imageDigests) ||
      runner.imageDigests.length !== expectedImageCount ||
      !runner.imageDigests.every((digest) => /^[a-f0-9]{64}$/u.test(digest))
    ) {
      failures.push({ path: requestPath, kind: 'multimodal-transport' });
    }
    if (
      typeof runner.transcriptDigest !== 'string' ||
      runner.transcriptDigest !== response.runnerAudit?.transcriptDigest ||
      runner.toolsEnforcedOff !== response.runnerAudit?.toolsEnforcedOff
    ) {
      failures.push({ path: requestPath, kind: 'transcript-integrity' });
    }
    actorRecords.push({
      episodeId: request.episodeId,
      packetDigest: sha256(canonicalJson(request)),
      historyLength: request.actor.publicHistory.length,
      toolsEnforcedOff: runner.toolsEnforcedOff,
      exitCode: runner.exitCode,
      runnerVersion: runner.version,
      model: runner.model,
      imageCount: runner.imageCount,
      transcriptDigest: runner.transcriptDigest,
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      failures.push({
        path: requestPath,
        kind: 'actor-packet',
        error: String(error.message ?? error),
      });
    }
  }
}
actorRecords.sort((left, right) =>
  left.episodeId.localeCompare(right.episodeId),
);
const report = {
  schemaVersion: '0.3.0',
  runId,
  valid: failures.length === 0,
  scoredJobs,
  taskPackets: records.length,
  semanticBaselineParityChecks: records.length * semanticMethods.length,
  structuralIsolationChecks: records.length * structuralMethods.length * 2,
  runtimeCapsuleProvenanceChecks: records.length * 5,
  actorPackets: actorRecords.length,
  actorIsolationChecks: actorRecords.length * 4,
  runnerIdentityChecks: actorRecords.length * 10,
  multimodalTransportChecks: actorRecords.length * 3,
  transcriptIntegrityChecks: actorRecords.length * 3,
  recordsDigest: sha256(canonicalJson(records)),
  actorRecordsDigest: sha256(canonicalJson(actorRecords)),
  failures,
};
await writeJson(join(runRoot, 'audits', 'fact-parity.json'), report);
console.log(JSON.stringify(report));
if (!report.valid) process.exitCode = 1;
