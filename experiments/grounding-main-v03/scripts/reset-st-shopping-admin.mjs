import { get } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { parseArgs, required, resolveInput, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const evidencePath = resolveInput(required(args, 'evidence'));
const image =
  process.env.UGP_ST_SHOPPING_ADMIN_BASELINE_IMAGE ??
  'ugp-st-shopping-admin-baseline:v2';
const container = 'shopping_admin';
const experimentLabel = 'grounding-main-v03';

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
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
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

async function inspectContainer(format) {
  try {
    return await run('docker', ['inspect', '--format', format, container]);
  } catch (error) {
    if (String(error.message).includes('No such object')) return null;
    throw error;
  }
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

await run('docker', ['image', 'inspect', image]);
const existingLabel = await inspectContainer(
  '{{ index .Config.Labels "ugp.experiment" }}',
);
if (existingLabel !== null) {
  if (existingLabel !== experimentLabel) {
    throw new Error(
      `Refusing to replace unowned container ${container}; ugp.experiment=${existingLabel}`,
    );
  }
  await run('docker', ['rm', '--force', container]);
}

const startedAt = new Date().toISOString();
await run('docker', [
  'run',
  '--detach',
  '--name',
  container,
  '--label',
  `ugp.experiment=${experimentLabel}`,
  '--publish',
  '7780:80',
  image,
]);

let ready = false;
let status;
let searchStatus = null;
for (let attempt = 1; attempt <= 180; attempt += 1) {
  try {
    const health = JSON.parse(
      await run('docker', [
        'exec',
        container,
        'curl',
        '--fail',
        '--silent',
        '--max-time',
        '2',
        'http://127.0.0.1:9200/_cluster/health',
      ]),
    );
    searchStatus = health.status ?? null;
  } catch {
    searchStatus = null;
  }
  if (['green', 'yellow'].includes(searchStatus)) break;
  await delay(1_000);
}
if (!['green', 'yellow'].includes(searchStatus)) {
  throw new Error(
    `ShoppingAdmin search service did not become ready; last status ${searchStatus}`,
  );
}

status = await httpStatus('http://localhost:7780/admin');
let cacheFlushed = false;
if (status !== 200) {
  await run('docker', [
    'exec',
    container,
    '/var/www/magento2/bin/magento',
    'cache:flush',
  ]);
  cacheFlushed = true;
}
for (let attempt = 1; attempt <= 120; attempt += 1) {
  status = await httpStatus('http://localhost:7780/admin');
  if (status === 200) {
    ready = true;
    break;
  }
  await delay(1_000);
}
if (!ready)
  throw new Error(
    `ShoppingAdmin did not become ready; last HTTP status ${status}`,
  );

const imageId = await run('docker', [
  'image',
  'inspect',
  '--format',
  '{{.Id}}',
  image,
]);
const evidence = {
  schemaVersion: '0.3.0',
  startedAt,
  completedAt: new Date().toISOString(),
  container,
  image,
  imageId,
  httpStatus: status,
  searchStatus,
  cacheFlushed,
  ready,
};
await writeJson(evidencePath, evidence);
console.log(JSON.stringify(evidence));
