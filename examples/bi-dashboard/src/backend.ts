import type { ResolvedReferent } from '@ui-grounding/protocol';

import { isScenarioMutation } from './api-schemas.js';
import { createScenarioData } from './data.js';
import type {
  DashboardResponse,
  OrderRecord,
  Role,
  ScenarioData,
  ScenarioState,
} from './model.js';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function revenue(records: readonly OrderRecord[]): number {
  return records.reduce((sum, record) => sum + record.revenue, 0);
}

export class BiScenarioBackend {
  readonly data: ScenarioData;
  #revision = 1;
  #state: Omit<ScenarioState, 'queryRevision' | 'adapterRevision'> = {
    sort: 'revenue-desc',
  };

  constructor(seed = 20_260_827) {
    this.data = createScenarioData(seed);
  }

  get state(): ScenarioState {
    const revision = String(this.#revision).padStart(3, '0');
    return {
      ...this.#state,
      queryRevision: `q-${revision}`,
      adapterRevision: `adapter-${revision}`,
    };
  }

  reset(): DashboardResponse {
    this.#revision += 1;
    this.#state = { sort: 'revenue-desc' };
    return this.dashboard();
  }

  mutate(value: unknown): DashboardResponse {
    if (!isScenarioMutation(value))
      throw new TypeError('Invalid scenario mutation');
    this.#revision += 1;
    this.#state = {
      sort: value.sort ?? this.#state.sort,
      ...(value.regionId ? { regionId: value.regionId } : {}),
    };
    return this.dashboard();
  }

  records(): OrderRecord[] {
    const filtered = this.#state.regionId
      ? this.data.records.filter(
          (record) => record.regionId === this.#state.regionId,
        )
      : [...this.data.records];
    return filtered.sort((first, second) => {
      if (this.#state.sort === 'id') return first.id.localeCompare(second.id);
      return this.#state.sort === 'revenue-asc'
        ? first.revenue - second.revenue
        : second.revenue - first.revenue;
    });
  }

  dashboard(): DashboardResponse {
    const records = this.records();
    const queryRevision = this.state.queryRevision;
    const totalRevenue = revenue(records);
    const revenueSeries = this.data.months.map((period) => ({
      metricId: 'revenue',
      period,
      dimensionMembers: this.#state.regionId ? [this.#state.regionId] : [],
      value: revenue(records.filter((record) => record.period === period)),
      revision: queryRevision,
    }));
    const regionBreakdown = this.data.regions.map((region) => ({
      ...region,
      value: revenue(
        this.data.records.filter((record) => record.regionId === region.id),
      ),
    }));
    return {
      state: this.state,
      metrics: this.data.metrics.map((metric) => ({
        ...metric,
        value:
          metric.id === 'revenue'
            ? totalRevenue
            : metric.id === 'orders'
              ? records.length
              : metric.id === 'conversion_rate'
                ? 0.0384
                : 0.0216,
        change:
          metric.id === 'revenue'
            ? 0.124
            : metric.id === 'orders'
              ? 0.081
              : metric.id === 'conversion_rate'
                ? -0.017
                : -0.004,
      })),
      revenueSeries,
      regionBreakdown,
      records: records.slice(0, 100),
      totalRecords: records.length,
      insight: {
        id: 'revenue-drop',
        text: 'Revenue softened in the East region between March and May, driven by inventory constraints in the Enterprise segment. Conversion recovered after the June restock.',
        anomalyPeriods: ['2026-03', '2026-04', '2026-05'],
        causes: [
          'inventory-stockout',
          'advertising-channel-mix',
          'refund-increase',
        ],
      },
    };
  }

  context(
    referent: ResolvedReferent,
    role: Role,
  ): { projection: Record<string, unknown>; omittedFields: string[] } {
    const projection: Record<string, unknown> = {
      entityRef: referent.entityRef,
      label: referent.label,
      queryRevision: this.state.queryRevision,
    };
    const omittedFields = ['customerEmail'];
    if (referent.type.endsWith('.metric')) {
      const metric = this.data.metrics.find(
        (item) => item.id === referent.entityRef?.id,
      );
      if (metric) {
        projection.unit = metric.unit;
        if (role === 'analyst') projection.formula = metric.formula;
        else omittedFields.push('formula', 'cost', 'margin', 'anomalyCauses');
      }
    }
    if (referent.type.endsWith('.record')) {
      const record = this.data.records.find(
        (item) => item.id === referent.entityRef?.id,
      );
      if (record) {
        projection.customerRef = `customer:${record.id.slice(-6)}`;
        projection.revenue = record.revenue;
        if (role === 'analyst') {
          projection.cost = record.cost;
          projection.margin = record.margin;
        } else omittedFields.push('cost', 'margin');
      }
    }
    if (role === 'analyst' && referent.entityRef?.id === 'revenue-drop') {
      projection.anomalyCauses = this.dashboard().insight.causes;
    }
    return { projection, omittedFields: [...new Set(omittedFields)].sort() };
  }

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url, 'http://ugp.local');
    try {
      if (request.method === 'GET' && url.pathname === '/api/scenario') {
        return json({ seed: this.data.seed, state: this.state });
      }
      if (request.method === 'POST' && url.pathname === '/api/scenario/reset') {
        return json(this.reset());
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/api/scenario/mutate'
      ) {
        return json(this.mutate(await request.json()));
      }
      if (request.method === 'GET' && url.pathname === '/api/dashboard') {
        return json(this.dashboard());
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/api/query/timeseries'
      ) {
        return json(this.dashboard().revenueSeries);
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/api/query/breakdown'
      ) {
        return json(this.dashboard().regionBreakdown);
      }
      if (request.method === 'POST' && url.pathname === '/api/query/records') {
        return json({
          records: this.records().slice(0, 100),
          total: this.records().length,
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/context') {
        const body = (await request.json()) as {
          referent: ResolvedReferent;
          principal: Role;
        };
        return json(this.context(body.referent, body.principal));
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : 'Invalid request' },
        400,
      );
    }
  }
}

export function createScenarioFetch(backend: BiScenarioBackend) {
  return (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const request =
      input instanceof Request
        ? input
        : new Request(new URL(String(input), 'http://ugp.local'), init);
    return backend.handle(request);
  };
}
