export const scenarioMutationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    regionId: { type: ['string', 'null'] },
    sort: { enum: ['revenue-desc', 'revenue-asc', 'id'] },
  },
} as const;

export const contextRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['referent', 'principal', 'purpose'],
  properties: {
    referent: { type: 'object' },
    principal: { enum: ['analyst', 'viewer'] },
    purpose: { type: 'string', minLength: 1 },
  },
} as const;

export const contextResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['projection', 'omittedFields'],
  properties: {
    projection: { type: 'object' },
    omittedFields: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function isScenarioMutation(value: unknown): value is {
  regionId?: string | null;
  sort?: 'revenue-desc' | 'revenue-asc' | 'id';
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !['regionId', 'sort'].includes(key)))
    return false;
  return (
    (record.regionId === undefined ||
      record.regionId === null ||
      typeof record.regionId === 'string') &&
    (record.sort === undefined ||
      ['revenue-desc', 'revenue-asc', 'id'].includes(String(record.sort)))
  );
}

export function isContextRequest(value: unknown): value is {
  referent: ResolvedReferent;
  principal: 'analyst' | 'viewer';
  purpose: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !['referent', 'principal', 'purpose'].includes(key),
    )
  ) {
    return false;
  }
  const referent = record.referent as Record<string, unknown> | undefined;
  const entityRef = referent?.entityRef as Record<string, unknown> | undefined;
  return (
    Boolean(referent) &&
    !Array.isArray(referent) &&
    typeof referent?.nodeId === 'string' &&
    typeof referent.type === 'string' &&
    typeof referent.label === 'string' &&
    ['authoritative', 'derived', 'inferred'].includes(
      String(referent.authority),
    ) &&
    Boolean(entityRef) &&
    typeof entityRef?.namespace === 'string' &&
    typeof entityRef.id === 'string' &&
    ['analyst', 'viewer'].includes(String(record.principal)) &&
    typeof record.purpose === 'string' &&
    record.purpose.length > 0 &&
    record.purpose.length <= 128
  );
}
import type { ResolvedReferent } from '@ui-grounding/protocol';
