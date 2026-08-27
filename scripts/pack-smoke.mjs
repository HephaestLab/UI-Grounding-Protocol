import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const workspaceRoot = resolve(import.meta.dirname, '..');
const packageRoot = join(workspaceRoot, 'packages');
const destination = await mkdtemp(join(tmpdir(), 'ugp-pack-'));
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('pack:smoke must run through pnpm');
}

try {
  const packages = await readdir(packageRoot, { withFileTypes: true });

  for (const entry of packages) {
    if (!entry.isDirectory()) continue;

    const directory = join(packageRoot, entry.name);
    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8'),
    );
    const result = spawnSync(
      process.execPath,
      [pnpmCli, 'pack', '--pack-destination', destination],
      { cwd: directory, encoding: 'utf8' },
    );

    if (result.status !== 0) {
      throw new Error(
        `Could not pack ${manifest.name}:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }

  const tarballs = (await readdir(destination)).filter((file) =>
    file.endsWith('.tgz'),
  );

  if (
    tarballs.length !== packages.filter((entry) => entry.isDirectory()).length
  ) {
    throw new Error(
      `Expected one tarball per package, found ${tarballs.length}`,
    );
  }

  console.log(`Packed ${tarballs.length} packages: ${tarballs.join(', ')}`);
} finally {
  await rm(destination, { force: true, recursive: true });
}
