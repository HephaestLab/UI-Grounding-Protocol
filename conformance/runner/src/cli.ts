import { resolve } from 'node:path';

import { runConformance } from './runner.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const report = await runConformance({ workspaceRoot, writeReports: true });

console.log(
  `Conformance: ${report.summary.passed}/${report.summary.total} passed ` +
    `(${report.summary.positive} positive, ${report.summary.negative} negative).`,
);

if (report.summary.failed > 0) process.exitCode = 1;
