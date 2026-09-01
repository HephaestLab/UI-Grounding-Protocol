import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  canonicalJson,
  experimentRoot,
  parseArgs,
  readJson,
  resolveInput,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const container = String(
  args.container ??
    process.env.UGP_ST_SUITECRM_APPLICATION_CONTAINER ??
    'ugp-st-suitecrm-suitecrm-1',
);
if (!/^[A-Za-z0-9_.-]+$/u.test(container))
  throw new Error('Unsafe SuiteCRM container name');
const evidencePath = args.evidence ? resolveInput(String(args.evidence)) : null;
const adapterRoot = join(experimentRoot, 'runtime-injection', 'suitecrm-v8');
const adapterSource = await readFile(join(adapterRoot, 'adapter.js'), 'utf8');
const manifest = await readJson(join(adapterRoot, 'authority-manifest.json'));
const metadata = await readJson(join(adapterRoot, 'adapter-metadata.json'));
const adapterDigest = sha256(adapterSource);
const authorityManifestDigest = sha256(canonicalJson(manifest));
const installedSource = adapterSource
  .replaceAll('__ADAPTER_DIGEST__', adapterDigest)
  .replaceAll('__AUTHORITY_MANIFEST_DIGEST__', authorityManifestDigest);
const remoteDist = '/bitnami/suitecrm/public/dist';
const remoteAdapter = `${remoteDist}/ugp/adapter.js`;
const remoteIndex = `${remoteDist}/index.html`;
const scriptTag = `<script src="dist/ugp/adapter.js?v=${adapterDigest.slice(0, 16)}" data-ugp-sidecar="suitecrm"></script>`;

function run(command, commandArgs) {
  return new Promise((complete, reject) => {
    const child = spawn(command, commandArgs, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) complete(stdout.trim());
      else
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `${command} exited ${code}`,
          ),
        );
    });
  });
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'ugp-suitecrm-sidecar-'));
try {
  const localAdapter = join(temporaryRoot, 'adapter.js');
  const localIndex = join(temporaryRoot, 'index.html');
  await Promise.all([
    writeFile(localAdapter, installedSource, 'utf8'),
    run('docker', ['cp', `${container}:${remoteIndex}`, localIndex]),
  ]);
  const originalIndex = await readFile(localIndex, 'utf8');
  const cleanIndex = originalIndex.replace(
    /\s*<script[^>]*data-ugp-sidecar=["']suitecrm["'][^>]*><\/script>\s*/giu,
    '\n',
  );
  const firstScript = cleanIndex.search(/<script\b/iu);
  if (firstScript < 0)
    throw new Error('SuiteCRM index has no script insertion point');
  const installedIndex = `${cleanIndex.slice(0, firstScript)}${scriptTag}\n${cleanIndex.slice(firstScript)}`;
  await writeFile(localIndex, installedIndex, 'utf8');
  await run('docker', [
    'exec',
    '-u',
    '0',
    container,
    'mkdir',
    '-p',
    `${remoteDist}/ugp`,
  ]);
  await run('docker', ['cp', localAdapter, `${container}:${remoteAdapter}`]);
  await run('docker', ['cp', localIndex, `${container}:${remoteIndex}`]);
  await run('docker', [
    'exec',
    '-u',
    '0',
    container,
    'chmod',
    '0644',
    remoteAdapter,
    remoteIndex,
  ]);
  const installedAdapterDigest = await run('docker', [
    'exec',
    container,
    'sha256sum',
    remoteAdapter,
  ]);
  const verifiedIndex = await run('docker', [
    'exec',
    container,
    'grep',
    '-c',
    'data-ugp-sidecar="suitecrm"',
    remoteIndex,
  ]);
  if (Number(verifiedIndex) !== 1)
    throw new Error('SuiteCRM sidecar loader was not installed exactly once');
  const evidence = {
    schemaVersion: '0.3.0',
    installedAt: new Date().toISOString(),
    container,
    application: metadata.application,
    applicationVersion: metadata.applicationVersion,
    adapterId: metadata.adapterId,
    adapterDigest,
    installedFileDigest: installedAdapterDigest.split(/\s+/u)[0],
    authorityManifestDigest,
    remoteAdapter,
    remoteIndex,
    loaderCount: Number(verifiedIndex),
    installation: metadata.binding.installation,
  };
  if (evidencePath) await writeJson(evidencePath, evidence);
  console.log(JSON.stringify(evidence));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
