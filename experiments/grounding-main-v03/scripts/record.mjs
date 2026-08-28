import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  canonicalJson,
  parseArgs,
  readJson,
  required,
  resolveInput,
  schemaValidators,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const requestPath = resolveInput(required(args, 'request'));
const responsePath = resolveInput(required(args, 'response'));
const episodeRoot = dirname(requestPath);
const [request, privateRecord, responseText, validators] = await Promise.all([
  readJson(requestPath),
  readJson(join(episodeRoot, 'private.json')),
  readFile(responsePath, 'utf8'),
  schemaValidators(),
]);

let response;
let parseError = null;
try {
  response = JSON.parse(responseText);
  if (response?.episodeId === 'FROM_REQUEST')
    response.episodeId = request.episodeId;
} catch (error) {
  parseError = String(error.message ?? error);
  response = { rawText: responseText };
}

const validateResponse = validators['actor-response.schema.json'];
const valid = !parseError && validateResponse(response);
const errors = parseError
  ? [parseError]
  : valid
    ? []
    : (validateResponse.errors ?? []).map(
        (error) => `${error.instancePath || '$'} ${error.message}`,
      );

if (valid && !request.actor.allowedActions.includes(response.output.kind)) {
  errors.push(
    `Output kind ${response.output.kind} is not allowed for this task`,
  );
}
const fullyValid = valid && errors.length === 0;
const runnerAudit = valid ? (response.runnerAudit ?? {}) : {};
const trajectory = {
  schemaVersion: '0.3.0',
  episodeId: request.episodeId,
  condition: request.condition,
  benchmarkId: privateRecord.benchmarkId,
  domain: privateRecord.domain,
  taskFamily: privateRecord.taskFamily,
  taskOpaqueId: privateRecord.taskOpaqueId,
  requestDigest: sha256(canonicalJson(request)),
  responseDigest: sha256(responseText),
  response,
  validation: { valid: fullyValid, errors },
  usage: {
    inputBytes: Buffer.byteLength(canonicalJson(request)),
    outputBytes: Buffer.byteLength(responseText),
    wallTimeMs: runnerAudit.wallTimeMs ?? null,
    inputTokens: runnerAudit.inputTokens ?? null,
    outputTokens: runnerAudit.outputTokens ?? null,
  },
  sealedAt: new Date().toISOString(),
};

await writeJson(join(episodeRoot, 'trajectory.json'), trajectory);
console.log(
  JSON.stringify({ episodeId: request.episodeId, valid: fullyValid, errors }),
);
