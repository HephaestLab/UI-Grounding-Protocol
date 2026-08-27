import { Buffer } from 'node:buffer';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
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
  const tarballByPackage = new Map();

  for (const entry of packages) {
    if (!entry.isDirectory()) continue;

    const directory = join(packageRoot, entry.name);
    const manifest = JSON.parse(
      await readFile(join(directory, 'package.json'), 'utf8'),
    );
    const before = new Set(await readdir(destination));
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
    const packed = (await readdir(destination)).find(
      (file) => file.endsWith('.tgz') && !before.has(file),
    );
    if (!packed) throw new Error(`No tarball produced for ${manifest.name}`);
    tarballByPackage.set(manifest.name, join(destination, packed));
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

  for (const tarball of tarballs) {
    const listing = spawnSync('tar', ['-tf', join(destination, tarball)], {
      encoding: 'utf8',
    });
    if (listing.status !== 0) {
      throw new Error(`Could not inspect ${tarball}:\n${listing.stderr}`);
    }
    const entries = listing.stdout.split(/\r?\n/u).filter(Boolean);
    const forbidden = entries.filter(
      (entry) =>
        /(?:^|\/)(?:src|test|tests|fixtures)(?:\/|$)/u.test(entry) ||
        /(?:^|\/)\.env(?:\.|$)/u.test(entry) ||
        (/\.ts$/u.test(entry) && !/\.d\.ts$/u.test(entry)),
    );
    if (forbidden.length > 0) {
      throw new Error(
        `${tarball} contains forbidden files: ${forbidden.join(', ')}`,
      );
    }
    for (const entry of entries.filter((name) =>
      /\.(?:css|d\.ts|js|json|map)$/u.test(name),
    )) {
      const extracted = spawnSync(
        'tar',
        ['-xOf', join(destination, tarball), entry],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      );
      const content = extracted.stdout.replaceAll('\\', '/');
      if (
        content.includes(workspaceRoot.replaceAll('\\', '/')) ||
        content.includes('-----BEGIN PRIVATE KEY-----')
      ) {
        throw new Error(
          `${tarball} leaks a local path or private key in ${entry}`,
        );
      }
    }
  }

  const consumer = join(destination, 'consumer');
  await mkdir(join(consumer, 'src'), { recursive: true });
  const localDependencies = Object.fromEntries(
    [...tarballByPackage.entries()].map(([name, tarball]) => [
      name,
      `file:${tarball.replaceAll('\\', '/')}`,
    ]),
  );
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'ugp-clean-consumer',
        private: true,
        type: 'module',
        scripts: {
          build: 'vite build',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {
          ...localDependencies,
          react: '19.2.8',
          'react-dom': '19.2.8',
        },
        devDependencies: {
          '@types/react': '19.2.18',
          '@types/react-dom': '19.2.5',
          typescript: '6.0.3',
          vite: '8.2.2',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumer, 'pnpm-workspace.yaml'),
    `packages:\n  - .\noverrides:\n${Object.entries(localDependencies)
      .map(
        ([name, tarball]) =>
          `  ${JSON.stringify(name)}: ${JSON.stringify(tarball)}`,
      )
      .join('\n')}\n`,
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          jsx: 'react-jsx',
          lib: ['ES2023', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2023',
        },
        include: ['src'],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumer, 'index.html'),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n',
  );
  await writeFile(
    join(consumer, 'src', 'main.ts'),
    `import { UGP_PROTOCOL_VERSION } from '@ui-grounding/protocol';\nimport '@ui-grounding/overlay/styles.css';\ndocument.querySelector('#app')!.textContent = UGP_PROTOCOL_VERSION;\n`,
  );
  await writeFile(
    join(consumer, 'src', 'types.tsx'),
    `import type { Selection } from '@ui-grounding/protocol';\nimport { SemanticRegistry } from '@ui-grounding/core';\nimport { DomAnchorRegistry } from '@ui-grounding/dom';\nimport { SelectionOverlay } from '@ui-grounding/overlay';\nimport { GroundingSurfaceProvider } from '@ui-grounding/react';\nimport '@ui-grounding/testing';\nvoid ([SemanticRegistry, DomAnchorRegistry, SelectionOverlay, GroundingSurfaceProvider] satisfies unknown[]);\nexport const selection = undefined as Selection | undefined;\n`,
  );
  await writeFile(
    join(consumer, 'runtime.mjs'),
    `const names = ${JSON.stringify([...tarballByPackage.keys()])};\nfor (const name of names) await import(name);\nconsole.log('ESM imports passed');\n`,
  );

  const runPnpm = (args) =>
    spawnSync(process.execPath, [pnpmCli, ...args], {
      cwd: consumer,
      encoding: 'utf8',
    });
  const install = runPnpm([
    'install',
    '--prefer-offline',
    '--ignore-scripts',
    '--frozen-lockfile=false',
  ]);
  if (install.status !== 0) {
    throw new Error(
      `Consumer install failed:\n${install.stdout}\n${install.stderr}`,
    );
  }
  const typecheck = runPnpm(['typecheck']);
  if (typecheck.status !== 0) {
    throw new Error(
      `Consumer typecheck failed:\n${typecheck.stdout}\n${typecheck.stderr}`,
    );
  }
  const runtime = spawnSync(process.execPath, ['runtime.mjs'], {
    cwd: consumer,
    encoding: 'utf8',
  });
  if (runtime.status !== 0) {
    throw new Error(
      `Consumer ESM import failed:\n${runtime.stdout}\n${runtime.stderr}`,
    );
  }
  const build = runPnpm(['build']);
  if (build.status !== 0) {
    throw new Error(`Consumer build failed:\n${build.stdout}\n${build.stderr}`);
  }
  const assets = await readdir(join(consumer, 'dist', 'assets'));
  const javascript = assets.find((file) => file.endsWith('.js'));
  const css = assets.find((file) => file.endsWith('.css'));
  if (!javascript || !css) {
    throw new Error(
      'Consumer build did not emit tree-shaken JS and explicit CSS',
    );
  }
  const bundledJavaScript = await readFile(
    join(consumer, 'dist', 'assets', javascript),
    'utf8',
  );
  if (
    Buffer.byteLength(bundledJavaScript) > 3000 ||
    bundledJavaScript.includes('SelectionOverlay')
  ) {
    throw new Error('Consumer bundle did not tree-shake unused UGP features');
  }

  console.log(
    `Packed and consumed ${tarballs.length} packages: ${tarballs.join(', ')}`,
  );
} finally {
  await rm(destination, { force: true, recursive: true });
}
