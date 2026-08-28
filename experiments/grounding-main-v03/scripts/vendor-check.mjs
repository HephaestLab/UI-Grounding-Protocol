import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  experimentRoot,
  parseArgs,
  readJson,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const manifest = await readJson(
  join(experimentRoot, 'benchmark-manifest.json'),
);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function git(argsList, cwd) {
  return spawnSync('git', argsList, {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
}

const records = [];
for (const source of manifest.sources.filter((item) => item.repository)) {
  const localPath = join(experimentRoot, 'vendor', source.id);
  const localPresent = await exists(localPath);
  let localCommit = null;
  if (localPresent) {
    const result = git(['rev-parse', 'HEAD'], localPath);
    if (result.status === 0) localCommit = result.stdout.trim();
  }
  let remoteHead = null;
  let remoteReachable = null;
  let remoteError = null;
  if (args.remote) {
    const result = git(
      ['ls-remote', source.repository, 'HEAD'],
      experimentRoot,
    );
    if (result.status === 0) {
      remoteHead = result.stdout.trim().split(/\s+/u)[0] ?? null;
      remoteReachable = Boolean(remoteHead);
    } else {
      remoteReachable = false;
      remoteError = `${result.stderr ?? result.stdout}`.trim().slice(0, 500);
    }
  }
  records.push({
    sourceId: source.id,
    repository: source.repository,
    pinnedCommit: source.commit,
    localPath,
    localPresent,
    localCommit,
    localMatchesPin: localCommit === source.commit,
    remoteChecked: Boolean(args.remote),
    remoteReachable,
    remoteHead,
    remoteHeadMatchesPin: remoteHead === source.commit,
    remoteError,
  });
}

const report = {
  schemaVersion: '0.3.0',
  generatedAt: new Date().toISOString(),
  note: 'A changed remote HEAD does not invalidate a reachable pinned commit. Publication runs use a local checkout that exactly matches the pin.',
  records,
};
const output = join(runsRoot, 'preflight', 'vendor-check.json');
await writeJson(output, report);
console.log(
  JSON.stringify({
    output,
    repositories: records.length,
    localPinned: records.filter((item) => item.localMatchesPin).length,
    remoteReachable: records.filter((item) => item.remoteReachable).length,
  }),
);
