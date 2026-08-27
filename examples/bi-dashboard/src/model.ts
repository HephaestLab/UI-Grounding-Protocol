export type Role = 'analyst' | 'viewer';
export type MetricKey =
  'revenue' | 'orders' | 'conversion_rate' | 'refund_rate';

export interface Metric {
  id: string;
  key: MetricKey;
  label: string;
  unit: 'currency' | 'count' | 'percent';
  formula: string;
  sensitivity: 'public' | 'internal' | 'confidential';
}

export interface DimensionMember {
  dimensionId: 'region' | 'product' | 'segment';
  id: string;
  label: string;
}

export interface DataPoint {
  metricId: string;
  period: string;
  dimensionMembers: string[];
  value: number;
  revision: string;
}

export interface OrderRecord {
  id: string;
  period: string;
  regionId: string;
  productId: string;
  segmentId: string;
  revenue: number;
  cost: number;
  margin: number;
  customerEmail: string;
  revision: string;
}

export interface ScenarioData {
  seed: number;
  metrics: Metric[];
  regions: DimensionMember[];
  products: DimensionMember[];
  segments: DimensionMember[];
  months: string[];
  records: OrderRecord[];
}

export interface ScenarioState {
  queryRevision: string;
  adapterRevision: string;
  regionId?: string;
  sort: 'revenue-desc' | 'revenue-asc' | 'id';
}

export interface DashboardResponse {
  state: ScenarioState;
  metrics: Array<Metric & { value: number; change: number }>;
  revenueSeries: DataPoint[];
  regionBreakdown: Array<DimensionMember & { value: number }>;
  records: OrderRecord[];
  totalRecords: number;
  insight: {
    id: string;
    text: string;
    anomalyPeriods: string[];
    causes: string[];
  };
}
