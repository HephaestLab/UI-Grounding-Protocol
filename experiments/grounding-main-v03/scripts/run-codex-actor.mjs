import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  assert,
  canonicalJson,
  parseArgs,
  readJson,
  required,
  resolveInput,
  schemaValidators,
  sha256,
  validateOrThrow,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const requestPath = resolveInput(required(args, 'request'));
const episodeRoot = dirname(requestPath);
const request = await readJson(requestPath);
const validators = await schemaValidators();
validateOrThrow(
  validators['actor-request.schema.json'],
  request,
  'actor request',
);

function toolEvent(value) {
  if (Array.isArray(value)) return value.some(toolEvent);
  if (!value || typeof value !== 'object') return false;
  if (
    typeof value.type === 'string' &&
    /(command_execution|tool_call|function_call|web_search|mcp_tool)/u.test(
      value.type,
    )
  ) {
    return true;
  }
  return Object.values(value).some(toolEvent);
}

function usageFromEvents(events) {
  let inputTokens = null;
  let outputTokens = null;
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (
        ['input_tokens', 'inputTokens'].includes(key) &&
        Number.isInteger(item)
      ) {
        inputTokens = Math.max(inputTokens ?? 0, item);
      }
      if (
        ['output_tokens', 'outputTokens'].includes(key) &&
        Number.isInteger(item)
      ) {
        outputTokens = Math.max(outputTokens ?? 0, item);
      }
      visit(item);
    }
  }
  events.forEach(visit);
  return { inputTokens, outputTokens };
}

const observation = request.actor.observation;
const imagePaths = Array.isArray(observation.imagePaths)
  ? observation.imagePaths.map((path) => resolve(path))
  : [];
for (const imagePath of imagePaths) await readFile(imagePath);

const actorRoot = resolve(
  String(
    args['actor-root'] ??
      process.env.UGP_ACTOR_ROOT ??
      'E:/UGP-exp-data/actor-work',
  ),
  request.episodeId,
);
await mkdir(actorRoot, { recursive: true });
const outputSchemaPath = join(actorRoot, 'response.schema.json');
const rawResponsePath = join(actorRoot, 'last-message.json');
await writeJson(outputSchemaPath, request.actor.responseSchema);

const prompt = [
  request.actor.system,
  '',
  'Public task:',
  request.actor.task,
  '',
  'Current observation:',
  JSON.stringify(observation),
  '',
  'Public action history:',
  JSON.stringify(request.actor.publicHistory),
  '',
  `Allowed actions: ${request.actor.allowedActions.join(', ')}`,
  `Remaining steps: ${request.actor.remainingSteps}`,
  'Set episodeId to FROM_REQUEST.',
].join('\n');

const codexArguments = [
  'exec',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '--skip-git-repo-check',
  '--sandbox',
  'read-only',
  '--model',
  request.condition.model,
  '--config',
  `model_reasoning_effort=${JSON.stringify(request.condition.reasoningEffort)}`,
  '--config',
  'approval_policy="never"',
  '--cd',
  actorRoot,
  ...imagePaths.flatMap((imagePath) => ['--image', imagePath]),
  '--output-schema',
  outputSchemaPath,
  '--output-last-message',
  rawResponsePath,
  '--json',
  '-',
];

const command =
  process.env.UGP_CODEX_EXE ??
  (process.platform === 'win32'
    ? join(
        dirname(process.execPath),
        'node_modules',
        '@openai',
        'codex',
        'node_modules',
        '@openai',
        'codex-win32-x64',
        'vendor',
        'x86_64-pc-windows-msvc',
        'bin',
        'codex.exe',
      )
    : 'codex');
const started = Date.now();
const child = spawn(command, codexArguments, {
  cwd: actorRoot,
  env: process.env,
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
child.stdin.end(prompt);
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
const exitCode = await new Promise((complete, reject) => {
  child.once('error', reject);
  child.once('close', complete);
});
const wallTimeMs = Date.now() - started;
const transcriptPath = join(episodeRoot, 'runner-transcript.jsonl');
const stderrPath = join(episodeRoot, 'runner-stderr.txt');
await Promise.all([
  writeFile(transcriptPath, stdout, 'utf8'),
  writeFile(stderrPath, stderr, 'utf8'),
]);

const events = stdout
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { type: 'invalid-jsonl', raw: line };
    }
  });
const toolsEnforcedOff = !events.some(toolEvent);
assert(exitCode === 0, `codex exec failed (${exitCode}): ${stderr.trim()}`);
const rawResponse = JSON.parse(await readFile(rawResponsePath, 'utf8'));
const rawOutput = rawResponse.output ?? {};
const output = { kind: rawOutput.kind };
if (rawOutput.kind === 'answer') output.answer = rawOutput.answer;
if (rawOutput.kind === 'click') {
  output.target = rawOutput.target;
  if (rawOutput.x !== null) output.x = rawOutput.x;
  if (rawOutput.y !== null) output.y = rawOutput.y;
}
if (rawOutput.kind === 'type') {
  output.target = rawOutput.target;
  output.text = rawOutput.text;
}
if (rawOutput.kind === 'scroll') {
  output.direction = rawOutput.direction;
  if (rawOutput.amount !== null) output.amount = rawOutput.amount;
}
if (rawOutput.kind === 'select') {
  output.target = rawOutput.target;
  output.value = rawOutput.value;
}
if (rawOutput.kind === 'stop' && rawOutput.reason !== null) {
  output.reason = rawOutput.reason;
}
const response = {
  schemaVersion: rawResponse.schemaVersion,
  episodeId: rawResponse.episodeId,
  output,
  confidence: rawResponse.confidence,
};
const usage = usageFromEvents(events);
response.runnerAudit = {
  wallTimeMs,
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  toolsEnforcedOff,
  transcriptDigest: sha256(stdout),
};
const responsePath = join(episodeRoot, 'response.json');
await writeJson(responsePath, response);

const version = spawnSync(command, ['--version'], {
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
});
await writeJson(join(episodeRoot, 'runner.json'), {
  schemaVersion: '0.3.0',
  runner: 'codex-exec',
  version: version.stdout.trim(),
  model: request.condition.model,
  reasoningEffort: request.condition.reasoningEffort,
  authMode: 'ChatGPT OAuth',
  ephemeral: true,
  ignoreUserConfig: true,
  ignoreRules: true,
  sandbox: 'read-only',
  approvalPolicy: 'never',
  workingDirectory: actorRoot,
  imageCount: imagePaths.length,
  imageDigests: await Promise.all(
    imagePaths.map(async (imagePath) => sha256(await readFile(imagePath))),
  ),
  outputSchemaDigest: sha256(canonicalJson(request.actor.responseSchema)),
  transcriptDigest: sha256(stdout),
  toolsEnforcedOff,
  exitCode,
  wallTimeMs,
});
console.log(
  JSON.stringify({
    episodeId: request.episodeId,
    response: responsePath,
    toolsEnforcedOff,
    wallTimeMs,
  }),
);
