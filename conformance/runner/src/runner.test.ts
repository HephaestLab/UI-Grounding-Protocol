import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCoreConformance } from './core-profile.js';
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

  it('passes every Core/Profile runtime fixture', async () => {
    const report = await runCoreConformance({
      workspaceRoot: resolve(import.meta.dirname, '../../..'),
    });

    expect(report.summary.total).toBeGreaterThanOrEqual(11);
    expect(report.summary.failed).toBe(0);
  });
});
