import { spawnSync } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assert,
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
const vendorRoot = join(experimentRoot, 'vendor');
await mkdir(vendorRoot, { recursive: true });

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function git(commandArgs, cwd, timeout = 180_000) {
  const result = spawnSync('git', commandArgs, {
    cwd,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `git ${commandArgs.join(' ')} failed in ${cwd}:\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

const selected = manifest.sources.filter(
  (source) =>
    source.repository &&
    (!args.id || String(args.id).split(',').includes(source.id)),
);
assert(selected.length > 0, 'No repositories selected');

const records = [];
for (const source of selected) {
  const localPath = join(vendorRoot, source.id);
  if (!(await exists(localPath))) {
    git(
      [
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        source.repository,
        localPath,
      ],
      vendorRoot,
    );
  }
  assert(
    await exists(join(localPath, '.git')),
    `${localPath} exists but is not a Git checkout; refusing to overwrite it`,
  );
  const current = git(['rev-parse', 'HEAD'], localPath);
  const worktreeStatus = git(['status', '--porcelain'], localPath);
  const noCheckoutMaterialized =
    worktreeStatus.length > 0 &&
    worktreeStatus
      .split(/\r?\n/u)
      .every((line) => line.trimStart().startsWith('D  '));
  assert(
    !worktreeStatus || noCheckoutMaterialized,
    `${source.id} vendor checkout has local changes; refusing to overwrite them`,
  );
  if (current !== source.commit) {
    git(['fetch', '--depth', '1', 'origin', source.commit], localPath);
  }
  if (current !== source.commit || noCheckoutMaterialized) {
    git(['checkout', '--detach', '--force', source.commit], localPath);
  }
  const finalCommit = git(['rev-parse', 'HEAD'], localPath);
  assert(
    finalCommit === source.commit,
    `${source.id} did not reach its pinned commit`,
  );
  records.push({ sourceId: source.id, localPath, commit: finalCommit });
  console.log(JSON.stringify({ sourceId: source.id, commit: finalCommit }));
}

await writeJson(join(runsRoot, 'preflight', 'vendor-sync.json'), {
  schemaVersion: '0.3.0',
  generatedAt: new Date().toISOString(),
  records,
});
