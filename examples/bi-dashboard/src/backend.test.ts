import type { ResolvedReferent } from '@ui-grounding/protocol';
import { describe, expect, it } from 'vitest';

import { BiScenarioBackend, createScenarioFetch } from './backend.js';

describe('BI deterministic backend', () => {
  it('generates a repeatable 10,000-record scenario', () => {
    const first = new BiScenarioBackend();
    const second = new BiScenarioBackend();
    expect(first.data.records).toHaveLength(10_000);
    expect(first.data.months).toHaveLength(24);
    expect(first.data.regions).toHaveLength(6);
    expect(first.data.products).toHaveLength(4);
    expect(first.data.segments).toHaveLength(2);
    expect(first.data.records.slice(0, 20)).toEqual(
      second.data.records.slice(0, 20),
    );
  });

  it('supports reset, mutation, sorting, and query revisions', () => {
    const backend = new BiScenarioBackend();
    expect(backend.state.queryRevision).toBe('q-001');
    const east = backend.mutate({ regionId: 'east' });
    expect(east.state.queryRevision).toBe('q-002');
    expect(east.records.every((record) => record.regionId === 'east')).toBe(
      true,
    );
    const ascending = backend.mutate({ sort: 'revenue-asc' });
    expect(ascending.records[0]!.revenue).toBeLessThanOrEqual(
      ascending.records[1]!.revenue,
    );
    expect(ascending.state.regionId).toBe('east');
    expect(
      ascending.records.every((record) => record.regionId === 'east'),
    ).toBe(true);
    expect(backend.mutate({ regionId: null }).state.regionId).toBeUndefined();
    expect(backend.reset().state.regionId).toBeUndefined();
    expect(() => backend.mutate({ unknown: true })).toThrow('Invalid');
  });

  it('enforces analyst and viewer context projections', () => {
    const backend = new BiScenarioBackend();
    const referent: ResolvedReferent = {
      nodeId: 'metric:revenue',
      type: 'org.ugp.demo.bi.metric',
      entityRef: { namespace: 'metrics', id: 'revenue' },
      label: 'Revenue',
      authority: 'authoritative' as const,
      confidence: 1,
      relation: 'exact' as const,
      evidence: [
        {
          kind: 'semantic-selector' as const,
          authority: 'authoritative' as const,
          score: 1,
        },
      ],
      surfaceRevision: 'q-001',
    };
    const viewer = backend.context(referent, 'viewer');
    const analyst = backend.context(referent, 'analyst');
    expect(viewer.projection).not.toHaveProperty('formula');
    expect(viewer.omittedFields).toContain('formula');
    expect(analyst.projection).toHaveProperty('formula');
    expect(JSON.stringify(analyst)).not.toContain('@example.invalid');
  });

  it('exposes deterministic request handlers for every reference endpoint', async () => {
    const backend = new BiScenarioBackend();
    const fetchScenario = createScenarioFetch(backend);
    const endpoints: Array<[string, RequestInit | undefined]> = [
      ['/api/scenario', undefined],
      ['/api/dashboard', undefined],
      ['/api/query/timeseries', { method: 'POST' }],
      ['/api/query/breakdown', { method: 'POST' }],
      ['/api/query/records', { method: 'POST' }],
      [
        '/api/scenario/mutate',
        { method: 'POST', body: JSON.stringify({ regionId: 'east' }) },
      ],
      ['/api/scenario/reset', { method: 'POST' }],
    ];
    for (const [endpoint, init] of endpoints) {
      const response = await fetchScenario(endpoint, init);
      expect(response.ok, endpoint).toBe(true);
    }
    const missing = await fetchScenario('/api/missing');
    expect(missing.status).toBe(404);
  });
});
