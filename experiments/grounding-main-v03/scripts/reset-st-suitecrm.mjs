import { access, readFile } from 'node:fs/promises';
import { get } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  parseArgs,
  required,
  resolveInput,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const baselinePath = resolveInput(
  String(
    args.baseline ??
      process.env.UGP_ST_SUITECRM_BASELINE ??
      'E:/UGP-exp-data/st-suitecrm/baseline-v1.sql',
  ),
);
const evidencePath = resolveInput(required(args, 'evidence'));
await access(baselinePath);

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

const databaseContainer = 'ugp-st-suitecrm-mariadb-1';
const applicationContainer = 'ugp-st-suitecrm-suitecrm-1';
const containerBaseline = '/tmp/ugp-suitecrm-baseline-v1.sql';
const startedAt = new Date().toISOString();
await run('docker', ['stop', applicationContainer]);
try {
  await run('docker', [
    'cp',
    baselinePath,
    `${databaseContainer}:${containerBaseline}`,
  ]);
  await run('docker', [
    'exec',
    databaseContainer,
    '/opt/bitnami/mariadb/bin/mariadb',
    '-uroot',
    '-e',
    'DROP DATABASE IF EXISTS bitnami_suitecrm; CREATE DATABASE bitnami_suitecrm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  ]);
  await run('docker', [
    'exec',
    databaseContainer,
    '/opt/bitnami/mariadb/bin/mariadb',
    '-uroot',
    '-e',
    `source ${containerBaseline}`,
  ]);
  await run('docker', [
    'exec',
    '-u',
    '0',
    databaseContainer,
    'rm',
    '-f',
    containerBaseline,
  ]);
} finally {
  await run('docker', ['start', applicationContainer]);
}

let ready = false;
let status = null;
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
for (let attempt = 1; attempt <= 60; attempt += 1) {
  status = await httpStatus('http://localhost:8080');
  if (status !== null && status >= 200 && status < 500) {
    ready = true;
    break;
  }
  await delay(1_000);
}
if (!ready)
  throw new Error(`SuiteCRM did not become ready; last HTTP status ${status}`);
const baselineDigest = sha256(await readFile(baselinePath));
const evidence = {
  schemaVersion: '0.3.0',
  startedAt,
  completedAt: new Date().toISOString(),
  baselinePath,
  baselineDigest,
  databaseContainer,
  applicationContainer,
  httpStatus: status,
  ready,
};
await writeJson(evidencePath, evidence);
console.log(JSON.stringify(evidence));
