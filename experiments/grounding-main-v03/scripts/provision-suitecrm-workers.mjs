import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { get } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

import { experimentRoot, parseArgs, resolveInput, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const workerCount = Number(args.workers ?? 4);
const basePort = Number(args['base-port'] ?? 8180);
const projectPrefix = String(args.prefix ?? 'ugp-st-suitecrm-w');
const outputPath = resolveInput(
  String(args.output ?? 'E:/UGP-exp-data/st-suitecrm/workers-v2.json'),
);
if (
  !Number.isInteger(workerCount) ||
  workerCount < 1 ||
  workerCount > 8 ||
  !Number.isInteger(basePort) ||
  basePort < 1024 ||
  basePort + workerCount > 65535 ||
  !/^[A-Za-z0-9_.-]+$/u.test(projectPrefix)
) {
  throw new Error('Invalid SuiteCRM worker provisioning arguments');
}
const composePath = join(
  experimentRoot,
  'runtime',
  'st-suitecrm-workers.compose.yaml',
);
const installer = join(
  experimentRoot,
  'scripts',
  'install-suitecrm-ugp-sidecar.mjs',
);
const resetter = join(experimentRoot, 'scripts', 'reset-st-suitecrm.mjs');
const evidenceRoot = resolveInput(
  String(
    args['evidence-root'] ?? 'E:/UGP-exp-data/st-suitecrm/workers-v2-evidence',
  ),
);

function run(command, commandArgs, options = {}) {
  return new Promise((complete, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: experimentRoot,
      env: { ...process.env, ...options.env },
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

function httpStatus(url) {
  return new Promise((complete) => {
    const request = get(url, (response) => {
      response.resume();
      complete(response.statusCode ?? null);
    });
    request.setTimeout(5_000, () => request.destroy());
    request.on('error', () => complete(null));
  });
}

async function applicationInstalled(worker) {
  try {
    await run('docker', [
      'exec',
      worker.applicationContainer,
      'test',
      '-f',
      '/bitnami/suitecrm/public/dist/index.html',
    ]);
    return true;
  } catch {
    return false;
  }
}

const workers = Array.from({ length: workerCount }, (_, index) => {
  const project = `${projectPrefix}${index}`;
  return {
    index,
    project,
    port: basePort + index,
    url: `http://localhost:${basePort + index}`,
    applicationContainer: `${project}-suitecrm-1`,
    databaseContainer: `${project}-mariadb-1`,
  };
});

await Promise.all(
  workers.map((worker) =>
    run(
      'docker',
      ['compose', '-p', worker.project, '-f', composePath, 'up', '-d'],
      { env: { UGP_SUITECRM_PORT: String(worker.port) } },
    ),
  ),
);

for (let attempt = 1; attempt <= 180; attempt += 1) {
  const statuses = await Promise.all(
    workers.map((worker) => httpStatus(worker.url)),
  );
  const installed = await Promise.all(workers.map(applicationInstalled));
  if (
    statuses.every((status) => status && status >= 200 && status < 500) &&
    installed.every(Boolean)
  )
    break;
  if (attempt === 180)
    throw new Error(
      `SuiteCRM workers did not become ready: HTTP=${statuses}, installed=${installed}`,
    );
  await delay(2_000);
}

await Promise.all(
  workers.map((worker) =>
    run(process.execPath, [
      installer,
      '--container',
      worker.applicationContainer,
      '--evidence',
      join(evidenceRoot, `worker-${worker.index}-sidecar.json`),
    ]),
  ),
);
await Promise.all(
  workers.map((worker) =>
    run(process.execPath, [
      resetter,
      '--application-container',
      worker.applicationContainer,
      '--database-container',
      worker.databaseContainer,
      '--url',
      worker.url,
      '--evidence',
      join(evidenceRoot, `worker-${worker.index}-reset.json`),
    ]),
  ),
);
const manifest = {
  schemaVersion: '0.3.0',
  provisionedAt: new Date().toISOString(),
  workerCount,
  basePort,
  composePath,
  workers,
};
await writeJson(outputPath, manifest);
console.log(JSON.stringify({ outputPath, ...manifest }));
