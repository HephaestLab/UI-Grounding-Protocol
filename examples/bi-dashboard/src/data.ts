import type {
  DimensionMember,
  Metric,
  OrderRecord,
  ScenarioData,
} from './model.js';

const metrics: Metric[] = [
  {
    id: 'revenue',
    key: 'revenue',
    label: 'Revenue',
    unit: 'currency',
    formula: 'SUM(order.revenue)',
    sensitivity: 'internal',
  },
  {
    id: 'orders',
    key: 'orders',
    label: 'Orders',
    unit: 'count',
    formula: 'COUNT_DISTINCT(order.id)',
    sensitivity: 'public',
  },
  {
    id: 'conversion_rate',
    key: 'conversion_rate',
    label: 'Conversion rate',
    unit: 'percent',
    formula: 'orders / qualified_sessions',
    sensitivity: 'internal',
  },
  {
    id: 'refund_rate',
    key: 'refund_rate',
    label: 'Refund rate',
    unit: 'percent',
    formula: 'refunded_orders / orders',
    sensitivity: 'confidential',
  },
];

function members(
  dimensionId: DimensionMember['dimensionId'],
  values: Array<[string, string]>,
): DimensionMember[] {
  return values.map(([id, label]) => ({ dimensionId, id, label }));
}

const regions = members('region', [
  ['east', 'East'],
  ['west', 'West'],
  ['north', 'North'],
  ['south', 'South'],
  ['central', 'Central'],
  ['international', 'International'],
]);
const products = members('product', [
  ['analytics', 'Analytics'],
  ['automation', 'Automation'],
  ['security', 'Security'],
  ['platform', 'Platform'],
]);
const segments = members('segment', [
  ['enterprise', 'Enterprise'],
  ['smb', 'SMB'],
]);

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

export function createScenarioData(seed = 20_260_827): ScenarioData {
  const next = random(seed);
  const months = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(2025, index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const records: OrderRecord[] = Array.from({ length: 10_000 }, (_, index) => {
    const region = regions[Math.floor(next() * regions.length)]!;
    const product = products[Math.floor(next() * products.length)]!;
    const segment = segments[Math.floor(next() * segments.length)]!;
    const period = months[index % months.length]!;
    const base = segment.id === 'enterprise' ? 4_800 : 1_350;
    const revenue = Math.round(base * (0.55 + next() * 1.9));
    const costRatio = 0.51 + next() * 0.22;
    const cost = Math.round(revenue * costRatio);
    return {
      id: `order-${String(index + 1).padStart(6, '0')}`,
      period,
      regionId: region.id,
      productId: product.id,
      segmentId: segment.id,
      revenue,
      cost,
      margin: Number(((revenue - cost) / revenue).toFixed(4)),
      customerEmail: `customer-${String(index + 1).padStart(6, '0')}@example.invalid`,
      revision: 'data-001',
    };
  });
  return {
    seed,
    metrics: structuredClone(metrics),
    regions: structuredClone(regions),
    products: structuredClone(products),
    segments: structuredClone(segments),
    months,
    records,
  };
}
