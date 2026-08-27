import { resolve } from 'node:path';

import { runCoreConformance } from './core-profile.js';
import { runConformance } from './runner.js';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const report = await runConformance({ workspaceRoot, writeReports: true });
const coreReport = await runCoreConformance({
  workspaceRoot,
  writeReports: true,
});

console.log(
  `Conformance: ${report.summary.passed}/${report.summary.total} passed ` +
    `(${report.summary.positive} positive, ${report.summary.negative} negative).`,
);
console.log(
  `Core/Profile: ${coreReport.summary.passed}/${coreReport.summary.total} passed.`,
);

if (report.summary.failed > 0 || coreReport.summary.failed > 0) {
  process.exitCode = 1;
}
