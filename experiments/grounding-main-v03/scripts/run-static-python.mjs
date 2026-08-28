import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { assert, experimentRoot } from './lib.mjs';

const script = process.argv[2];
assert(script, 'Usage: run-static-python.mjs <script.py> [args...]');

const project = join(experimentRoot, 'static-tools');
const environment = join(experimentRoot, '.runs', 'python-static');
const commonEnvironment = {
  ...process.env,
  UV_PROJECT_ENVIRONMENT: environment,
};

const sync = spawnSync('uv', ['sync', '--project', project, '--frozen'], {
  encoding: 'utf8',
  env: commonEnvironment,
  shell: false,
  stdio: 'inherit',
  windowsHide: true,
});
assert(sync.status === 0, `uv sync failed with status ${sync.status}`);

const run = spawnSync(
  'uv',
  [
    'run',
    '--project',
    project,
    '--frozen',
    '--no-sync',
    'python',
    join(project, script),
    ...process.argv.slice(3),
  ],
  {
    env: commonEnvironment,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  },
);
assert(run.status === 0, `Static Python tool failed with status ${run.status}`);
