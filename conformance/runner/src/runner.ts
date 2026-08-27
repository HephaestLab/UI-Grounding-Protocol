import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ErrorObject, ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

type JsonObject = Record<string, unknown>;

interface PatchOperation {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: unknown;
}

interface FixtureCase {
  id: string;
  profiles: string[];
  base: string;
  patch?: PatchOperation[];
  expected: {
    valid: boolean;
    keywords?: string[];
  };
  normativeRequirements: string[];
}

interface FixtureBase {
  schema: string;
  data: unknown;
}

interface FixtureSuite {
  suiteVersion: '0.1';
  bases: Record<string, FixtureBase>;
  fixtures: FixtureCase[];
}

export interface ConformanceCaseResult {
  id: string;
  passed: boolean;
  expectedValid: boolean;
  actualValid: boolean;
  schema: string;
  profiles: string[];
  normativeRequirements: string[];
  errors: Array<Pick<ErrorObject, 'instancePath' | 'keyword' | 'message'>>;
}

export interface ConformanceReport {
  generatedAt: string;
  schemaDialect: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    positive: number;
    negative: number;
  };
  cases: ConformanceCaseResult[];
}

const schemaDialect = 'https://json-schema.org/draft/2020-12/schema';

function decodePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function applyPatch(value: unknown, operations: PatchOperation[]): unknown {
  const document = structuredClone(value);

  for (const operation of operations) {
    const tokens = operation.path.split('/').slice(1).map(decodePointerToken);
    const key = tokens.pop();
    let parent: unknown = document;

    if (key === undefined) throw new Error('A patch path must not be empty');

    for (const token of tokens) {
      if (typeof parent !== 'object' || parent === null) {
        throw new Error(`Patch path does not exist: ${operation.path}`);
      }
      parent = (parent as JsonObject)[token];
    }

    if (typeof parent !== 'object' || parent === null) {
      throw new Error(`Patch parent does not exist: ${operation.path}`);
    }

    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(index)) {
        throw new Error(`Invalid array index in patch: ${operation.path}`);
      }
      if (operation.op === 'remove') parent.splice(index, 1);
      else if (operation.op === 'add') parent.splice(index, 0, operation.value);
      else parent[index] = operation.value;
    } else if (operation.op === 'remove') {
      delete (parent as JsonObject)[key];
    } else {
      (parent as JsonObject)[key] = operation.value;
    }
  }

  return document;
}

function invariantErrors(schema: string, data: unknown): ErrorObject[] {
  if (typeof data !== 'object' || data === null) return [];
  const value = data as JsonObject;
  const errors: ErrorObject[] = [];
  const add = (instancePath: string, message: string): void => {
    errors.push({
      instancePath,
      keyword: 'ugpInvariant',
      message,
      params: {},
      schemaPath: '#/ugpInvariant',
    });
  };

  if (
    schema === 'selector.schema.json' &&
    value.type === 'TextPositionSelector'
  ) {
    if (typeof value.start === 'number' && typeof value.end === 'number') {
      if (value.end < value.start)
        add('/end', 'must be greater than or equal to start');
    }
  }

  if (schema === 'semantic-node.schema.json') {
    if (
      typeof value.validAt === 'string' &&
      typeof value.expiresAt === 'string'
    ) {
      if (Date.parse(value.expiresAt) <= Date.parse(value.validAt)) {
        add('/expiresAt', 'must be later than validAt');
      }
    }
    if (value.parentNodeId === value.nodeId) {
      add('/parentNodeId', 'must not equal nodeId');
    }
  }

  if (schema === 'context-bundle.schema.json') {
    const budget = value.budget;
    if (typeof budget === 'object' && budget !== null) {
      const { emittedBytes, requestedBytes } = budget as JsonObject;
      if (
        typeof emittedBytes === 'number' &&
        typeof requestedBytes === 'number' &&
        emittedBytes > requestedBytes
      ) {
        add('/budget/emittedBytes', 'must not exceed requestedBytes');
      }
    }
  }

  if (schema === 'grounding-bundle.schema.json') {
    const selection = value.selection as JsonObject | undefined;
    const referents = value.referents;
    if (selection && Array.isArray(referents)) {
      for (const [index, referent] of referents.entries()) {
        if (
          typeof referent === 'object' &&
          referent !== null &&
          (referent as JsonObject).surfaceRevision !== selection.surfaceRevision
        ) {
          add(
            `/referents/${index}/surfaceRevision`,
            'must equal selection.surfaceRevision',
          );
        }
      }
    }
  }

  return errors;
}

async function createValidators(
  schemaRoot: string,
): Promise<Map<string, ValidateFunction>> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const files = (await readdir(schemaRoot))
    .filter((file) => file.endsWith('.schema.json'))
    .sort();
  const schemas = await Promise.all(
    files.map(async (file) => ({
      file,
      schema: JSON.parse(await readFile(resolve(schemaRoot, file), 'utf8')),
    })),
  );

  for (const { file, schema } of schemas) {
    if (!ajv.validateSchema(schema)) {
      throw new Error(`Invalid meta-schema for ${file}: ${ajv.errorsText()}`);
    }
    ajv.addSchema(schema);
  }

  return new Map(
    schemas.map(({ file, schema }) => {
      const validator = ajv.getSchema(schema.$id);
      if (!validator) throw new Error(`Could not compile ${file}`);
      return [file, validator];
    }),
  );
}

export async function runConformance(options: {
  workspaceRoot: string;
  writeReports?: boolean;
}): Promise<ConformanceReport> {
  const schemaRoot = resolve(options.workspaceRoot, 'spec/schemas');
  const fixtureRoot = resolve(options.workspaceRoot, 'conformance/fixtures');
  const reportRoot = resolve(options.workspaceRoot, 'conformance/reports');
  const validators = await createValidators(schemaRoot);
  const fixtureFiles = (await readdir(fixtureRoot))
    .filter((file) => file.endsWith('.fixtures.json'))
    .sort();
  const cases: ConformanceCaseResult[] = [];

  for (const fixtureFile of fixtureFiles) {
    const suite = JSON.parse(
      await readFile(resolve(fixtureRoot, fixtureFile), 'utf8'),
    ) as FixtureSuite;

    if (suite.suiteVersion !== '0.1') {
      throw new Error(`Unsupported fixture suite version in ${fixtureFile}`);
    }

    for (const fixture of suite.fixtures) {
      const base = suite.bases[fixture.base];
      if (!base)
        throw new Error(`Unknown base ${fixture.base} in ${fixture.id}`);
      const validator = validators.get(base.schema);
      if (!validator) throw new Error(`Unknown schema ${base.schema}`);
      const data = applyPatch(base.data, fixture.patch ?? []);
      const schemaValid = validator(data);
      const errors = [
        ...((validator.errors ?? []) as ErrorObject[]),
        ...(schemaValid ? invariantErrors(base.schema, data) : []),
      ];
      const actualValid = schemaValid && errors.length === 0;
      const keywords = new Set(errors.map((error) => error.keyword));
      const expectedKeywordsPresent = (fixture.expected.keywords ?? []).every(
        (keyword) => keywords.has(keyword),
      );

      cases.push({
        id: fixture.id,
        passed:
          actualValid === fixture.expected.valid && expectedKeywordsPresent,
        expectedValid: fixture.expected.valid,
        actualValid,
        schema: base.schema,
        profiles: fixture.profiles,
        normativeRequirements: fixture.normativeRequirements,
        errors: errors.map(({ instancePath, keyword, message }) => ({
          instancePath,
          keyword,
          message: message ?? '',
        })),
      });
    }
  }

  const report: ConformanceReport = {
    generatedAt: new Date().toISOString(),
    schemaDialect,
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.passed).length,
      failed: cases.filter((item) => !item.passed).length,
      positive: cases.filter((item) => item.expectedValid).length,
      negative: cases.filter((item) => !item.expectedValid).length,
    },
    cases,
  };

  if (options.writeReports) {
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      resolve(reportRoot, 'conformance-v0.1.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    const rows = cases.map(
      (item) =>
        `| ${item.passed ? 'PASS' : 'FAIL'} | ${item.id} | ${item.schema} | ${item.expectedValid ? 'valid' : 'invalid'} |`,
    );
    const markdown = [
      '# UGP v0.1 Conformance Report',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      `Passed ${report.summary.passed}/${report.summary.total} fixtures (${report.summary.positive} positive, ${report.summary.negative} negative).`,
      '',
      '| Result | Fixture | Schema | Expected |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n');
    await writeFile(resolve(reportRoot, 'conformance-v0.1.md'), markdown);
  }

  return report;
}
