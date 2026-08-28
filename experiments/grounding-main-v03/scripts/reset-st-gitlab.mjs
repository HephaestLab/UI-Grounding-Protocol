import { get } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { parseArgs, required, resolveInput, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const evidencePath = resolveInput(required(args, 'evidence'));
const resetKey = required(args, 'reset-key');
const image =
  process.env.UGP_ST_GITLAB_BASELINE_IMAGE ?? 'ugp-st-gitlab-baseline:v1';
const container = 'gitlab';
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

async function inspectContainer() {
  try {
    return JSON.parse(await run('docker', ['inspect', container]))[0];
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
    request.setTimeout(10_000, () => request.destroy());
    request.on('error', () => complete(null));
  });
}

async function waitUntilReady() {
  let status = null;
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    status = await httpStatus('http://localhost:8023/users/sign_in');
    if (status !== null && status >= 200 && status < 500 && status !== 502)
      return status;
    await delay(5_000);
  }
  throw new Error(`GitLab did not become ready; last HTTP status ${status}`);
}

await run('docker', ['image', 'inspect', image]);
const startedAt = new Date().toISOString();
const existing = await inspectContainer();
let reused = false;
if (existing) {
  if (existing.Config?.Labels?.['ugp.experiment'] !== experimentLabel) {
    throw new Error(`Refusing to replace unowned container ${container}`);
  }
  if (
    existing.State?.Running &&
    existing.Config?.Labels?.['ugp.reset-key'] === resetKey
  ) {
    reused = true;
  } else {
    await run('docker', ['rm', '--force', container]);
  }
}
if (!reused) {
  await run('docker', [
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    `ugp.experiment=${experimentLabel}`,
    '--label',
    `ugp.reset-key=${resetKey}`,
    '--publish',
    '8023:8023',
    image,
    '/opt/gitlab/embedded/bin/runsvdir-start',
  ]);
}
const status = await waitUntilReady();
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
  resetKey,
  reused,
  httpStatus: status,
  ready: true,
};
await writeJson(evidencePath, evidence);
console.log(JSON.stringify(evidence));
