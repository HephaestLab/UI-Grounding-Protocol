import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runConformance } from './runner.js';

describe('UGP conformance runner', () => {
  it('passes every committed schema fixture', async () => {
    const report = await runConformance({
      workspaceRoot: resolve(import.meta.dirname, '../../..'),
    });

    expect(report.summary.positive).toBeGreaterThanOrEqual(20);
    expect(report.summary.negative).toBeGreaterThanOrEqual(20);
    expect(report.summary.failed).toBe(0);
  });
});
