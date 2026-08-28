import { access, readFile } from 'node:fs/promises';
import { get } from 'node:http';
import { join } from 'node:path';
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
const baselineRoot = resolveInput(
  String(
    args.baseline ??
      process.env.UGP_WEBMALL_BASELINE ??
      'E:/UGP-exp-data/webmall-baseline',
  ),
);
const evidencePath = resolveInput(required(args, 'evidence'));

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

const shops = [1, 2, 3, 4].map((shop) => ({
  shop,
  databaseContainer: `WebMall_mariadb_shop${shop}`,
  applicationContainer: `WebMall_wordpress_shop${shop}`,
  baselinePath: join(baselineRoot, `shop${shop}.sql`),
  containerBaseline: `/tmp/ugp-webmall-shop${shop}-baseline.sql`,
  url: `http://localhost:808${shop}`,
}));
for (const shop of shops) {
  await access(shop.baselinePath);
  const inspected = JSON.parse(
    await run('docker', ['inspect', shop.applicationContainer]),
  )[0];
  if (
    inspected?.Config?.Labels?.['com.docker.compose.project'] !== 'docker_all'
  ) {
    throw new Error(
      `Refusing to reset unrecognized container ${shop.applicationContainer}`,
    );
  }
}

const startedAt = new Date().toISOString();
await run('docker', [
  'stop',
  ...shops.map((shop) => shop.applicationContainer),
]);
try {
  for (const shop of shops) {
    await run('docker', [
      'cp',
      shop.baselinePath,
      `${shop.databaseContainer}:${shop.containerBaseline}`,
    ]);
    await run('docker', [
      'exec',
      shop.databaseContainer,
      '/opt/bitnami/mariadb/bin/mariadb',
      '-uroot',
      '-prootpassword',
      '-e',
      'DROP DATABASE IF EXISTS bitnami_wordpress; CREATE DATABASE bitnami_wordpress CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    ]);
    await run('docker', [
      'exec',
      shop.databaseContainer,
      '/opt/bitnami/mariadb/bin/mariadb',
      '-uroot',
      '-prootpassword',
      'bitnami_wordpress',
      '-e',
      `source ${shop.containerBaseline}`,
    ]);
    await run('docker', [
      'exec',
      '-u',
      '0',
      shop.databaseContainer,
      'rm',
      '-f',
      shop.containerBaseline,
    ]);
  }
} finally {
  await run('docker', [
    'start',
    ...shops.map((shop) => shop.applicationContainer),
  ]);
}

const statuses = {};
let ready = false;
for (let attempt = 1; attempt <= 180; attempt += 1) {
  for (const shop of shops) statuses[shop.shop] = await httpStatus(shop.url);
  if (
    shops.every(
      (shop) =>
        statuses[shop.shop] !== null &&
        statuses[shop.shop] >= 200 &&
        statuses[shop.shop] < 500,
    )
  ) {
    ready = true;
    break;
  }
  await delay(1_000);
}
if (!ready)
  throw new Error(
    `WebMall did not become ready; statuses ${JSON.stringify(statuses)}`,
  );

const baselines = await Promise.all(
  shops.map(async (shop) => ({
    shop: shop.shop,
    path: shop.baselinePath,
    digest: sha256(await readFile(shop.baselinePath)),
  })),
);
const evidence = {
  schemaVersion: '0.3.0',
  startedAt,
  completedAt: new Date().toISOString(),
  baselineRoot,
  baselines,
  statuses,
  ready,
};
await writeJson(evidencePath, evidence);
console.log(JSON.stringify(evidence));
