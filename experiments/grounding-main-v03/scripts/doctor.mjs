import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { experimentRoot, parseArgs, runsRoot, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));

function probe(command, commandArgs = ['--version']) {
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return {
    available: result.status === 0,
    status: result.status,
    version: text.split(/\r?\n/u).find(Boolean)?.slice(0, 300) ?? null,
  };
}

function parseMajorMinor(text) {
  const match = String(text ?? '').match(/(\d+)\.(\d+)/u);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

const tools = {
  node: probe(process.execPath, ['--version']),
  git: probe('git', ['--version']),
  python: probe('python', ['--version']),
  python312: probe('uv', ['python', 'find', '3.12']),
  uv: probe('uv', ['--version']),
  dockerClient: probe('docker', ['--version']),
  dockerServer: probe('docker', ['version', '--format', '{{.Server.Version}}']),
  wsl: probe('wsl.exe', ['--status']),
  gitLfs: probe('git', ['lfs', 'version']),
};
const pythonVersion = parseMajorMinor(tools.python.version);
const webMallPythonCompatible =
  (Boolean(pythonVersion) &&
    pythonVersion[0] === 3 &&
    [11, 12].includes(pythonVersion[1])) ||
  tools.python312.available;
const isWindows = process.platform === 'win32';

const environment = {
  hfTokenPresent: Boolean(
    process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN,
  ),
  workArenaAccessDeclared: process.env.UGP_WORKARENA_ACCESS === 'approved',
  stWebAgentBenchAccessDeclared:
    process.env.UGP_ST_WEBAGENTBENCH_ACCESS === 'approved',
  stWebAgentBenchTasksPresent: existsSync(
    join(
      experimentRoot,
      'vendor',
      'st-webagentbench',
      'stwebagentbench',
      'test.raw.json',
    ),
  ),
  benchmarkServicesDeclared: process.env.UGP_BENCHMARK_SERVICES_READY === '1',
  actorIsolationEnforced: process.env.UGP_ACTOR_ISOLATED === '1',
  runnerIdentity: process.env.UGP_ACTOR_RUNNER_ID ?? null,
  exactUsageExposed: process.env.UGP_EXACT_USAGE === '1',
  multimodalActorTransport: process.env.UGP_ACTOR_MULTIMODAL_TRANSPORT === '1',
};

const gates = {
  baseToolchain: tools.node.available && tools.git.available,
  pythonAvailable: tools.python.available,
  webMallPythonCompatible,
  containerRuntime:
    tools.dockerClient.available && tools.dockerServer.available,
  linuxContainerHost: !isWindows || tools.wsl.available,
  huggingFaceAuthentication: environment.hfTokenPresent,
  workArenaExternalAccess:
    environment.hfTokenPresent && environment.workArenaAccessDeclared,
  stWebAgentBenchExternalAccess:
    environment.stWebAgentBenchTasksPresent ||
    environment.stWebAgentBenchAccessDeclared,
  benchmarkServices: environment.benchmarkServicesDeclared,
  actorIsolationEnforced: environment.actorIsolationEnforced,
  exactRunnerIdentityRecorded: Boolean(environment.runnerIdentity),
  multimodalActorTransportVerified: environment.multimodalActorTransport,
};

const report = {
  schemaVersion: '0.3.0',
  generatedAt: new Date().toISOString(),
  platform: { platform: process.platform, arch: process.arch },
  tools,
  environment,
  gates,
  note: 'Environment values record presence/status only; secret values are never written.',
};
const output =
  typeof args.output === 'string'
    ? args.output
    : join(runsRoot, 'preflight', 'environment.json');
await writeJson(output, report);
console.log(JSON.stringify({ output, gates }));
