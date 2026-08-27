import type {
  Anchor,
  GroundingBundle,
  GroundingProblem,
  ResolvedReferent,
  Selection,
  SemanticNode,
} from '@ui-grounding/protocol';

import {
  geometriesIntersect,
  geometryBounds,
  isPoint,
  isRect,
  pointInPolygon,
  pointInRect,
  rectIntersection,
  visibleRatio,
  type Geometry,
} from './geometry.js';
import type { RegistrySnapshot } from './registry.js';

type Authority = SemanticNode['authority'];
type Relation = ResolvedReferent['relation'];
type Evidence = ResolvedReferent['evidence'][number];
type OmittedReason =
  | 'stale'
  | 'invisible'
  | 'occluded'
  | 'duplicate'
  | 'parent-collapsed'
  | 'limit';

interface Candidate {
  node: SemanticNode;
  evidence: Evidence[];
  relation: Relation;
  score: number;
  priority: number;
}

interface Omitted {
  nodeId: string;
  reason: OmittedReason;
}

const authorityRank: Record<Authority, number> = {
  authoritative: 3,
  derived: 2,
  inferred: 1,
};

const relationRank: Record<Relation, number> = {
  exact: 6,
  'text-overlap': 5,
  'contains-selection': 4,
  'contained-by-selection': 3,
  intersects: 2,
  nearest: 1,
};

function problem(
  code: GroundingProblem['code'],
  title: string,
  detail: string,
  retryable: boolean,
): GroundingProblem {
  return {
    type: `https://ui-grounding.org/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title,
    status: code.includes('STALE') ? 409 : 422,
    detail,
    code,
    retryable,
  };
}

function entityKey(node: SemanticNode): string {
  const entityRef = node.entityRef;
  return entityRef
    ? `${entityRef.namespace}\u0000${entityRef.id}`
    : `node\u0000${node.nodeId}`;
}

function toGeometry(
  geometry: Selection['geometry'] | Anchor['geometry'],
): Geometry | undefined {
  if (!geometry) return undefined;
  if (geometry.kind === 'point') return { x: geometry.x, y: geometry.y };
  if (geometry.kind === 'rect') {
    return {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
    };
  }
  return { points: geometry.points };
}

function compareCandidates(first: Candidate, second: Candidate): number {
  return (
    authorityRank[second.node.authority] -
      authorityRank[first.node.authority] ||
    second.score - first.score ||
    second.priority - first.priority ||
    relationRank[second.relation] - relationRank[first.relation] ||
    first.node.nodeId.localeCompare(second.node.nodeId)
  );
}

function addCandidate(
  candidates: Map<string, Candidate>,
  candidate: Candidate,
): void {
  const previous = candidates.get(candidate.node.nodeId);
  if (!previous) {
    candidates.set(candidate.node.nodeId, candidate);
    return;
  }
  previous.evidence.push(...candidate.evidence);
  if (compareCandidates(candidate, previous) < 0) {
    previous.relation = candidate.relation;
    previous.score = candidate.score;
    previous.priority = candidate.priority;
  }
}

function nodeIsStale(node: SemanticNode, at: string): boolean {
  const timestamp = Date.parse(at);
  return Boolean(
    (node.validAt && Date.parse(node.validAt) > timestamp) ||
    (node.expiresAt && Date.parse(node.expiresAt) <= timestamp),
  );
}

function semanticCandidates(
  snapshot: RegistrySnapshot,
  selection: Selection,
  omitted: Omitted[],
): Candidate[] {
  const output = new Map<string, Candidate>();
  for (const selector of selection.selectors) {
    if (selector.type !== 'UGPSemanticSelector') continue;
    for (const node of snapshot.nodes) {
      if (nodeIsStale(node, selection.createdAt)) {
        omitted.push({ nodeId: node.nodeId, reason: 'stale' });
        continue;
      }
      const matchesNode = selector.nodeId === node.nodeId;
      const matchesType = selector.semanticType === node.type;
      const matchesEntity = Boolean(
        selector.entityRef &&
        node.entityRef &&
        selector.entityRef.namespace === node.entityRef.namespace &&
        selector.entityRef.id === node.entityRef.id,
      );
      if (!matchesNode && !matchesType && !matchesEntity) continue;
      addCandidate(output, {
        node,
        relation: 'exact',
        score: 1,
        priority: 0,
        evidence: [
          {
            kind: 'semantic-selector',
            authority: node.authority,
            score: 1,
          },
        ],
      });
    }
  }
  return [...output.values()];
}

function geometryCandidate(
  node: SemanticNode,
  anchor: Anchor,
  selection: Selection,
): Candidate | undefined {
  const selectionGeometry = toGeometry(selection.geometry);
  const anchorGeometry = toGeometry(anchor.geometry);
  if (!selectionGeometry || !anchorGeometry) return undefined;
  if (
    selection.geometry?.coordinateSpace !== anchor.geometry?.coordinateSpace
  ) {
    return undefined;
  }

  let relation: Relation;
  let score: number;
  if (isPoint(selectionGeometry)) {
    const hit = isPoint(anchorGeometry)
      ? anchorGeometry.x === selectionGeometry.x &&
        anchorGeometry.y === selectionGeometry.y
      : isRect(anchorGeometry)
        ? pointInRect(selectionGeometry, anchorGeometry)
        : pointInPolygon(selectionGeometry, anchorGeometry);
    if (!hit) return undefined;
    relation = isPoint(anchorGeometry) ? 'exact' : 'contains-selection';
    score = 1;
  } else {
    if (!geometriesIntersect(selectionGeometry, anchorGeometry))
      return undefined;
    const selectionBounds = geometryBounds(selectionGeometry);
    const anchorBounds = geometryBounds(anchorGeometry);
    const intersection = rectIntersection(selectionBounds, anchorBounds);
    const anchorRatio = intersection
      ? visibleRatio(anchorBounds, selectionBounds)
      : 0;
    const selectionRatio = intersection
      ? visibleRatio(selectionBounds, anchorBounds)
      : 0;
    relation =
      anchorRatio === 1
        ? 'contained-by-selection'
        : selectionRatio === 1
          ? 'contains-selection'
          : 'intersects';
    score = Math.max(anchorRatio, selectionRatio, 0.01);
  }

  return {
    node,
    relation,
    score,
    priority: anchor.priority ?? 0,
    evidence: [
      {
        kind:
          anchor.kind === 'accessibility'
            ? 'accessibility-inference'
            : anchor.kind === 'canvas' || anchor.kind === 'svg'
              ? 'adapter-hit'
              : selection.mode === 'point'
                ? 'anchor-hit'
                : 'geometry-overlap',
        authority:
          anchor.kind === 'accessibility' ? 'inferred' : node.authority,
        anchorId: anchor.anchorId,
        score,
        visibleRatio: score,
      },
    ],
  };
}

function textCandidate(
  node: SemanticNode,
  anchor: Anchor,
  selection: Selection,
): Candidate | undefined {
  if (selection.mode !== 'text' || anchor.kind !== 'text') return undefined;
  const selectionQuote = selection.selectors.find(
    (selector) => selector.type === 'TextQuoteSelector',
  );
  const anchorQuote = anchor.selectors.find(
    (selector) => selector.type === 'TextQuoteSelector',
  );
  const selectionPosition = selection.selectors.find(
    (selector) => selector.type === 'TextPositionSelector',
  );
  const anchorPosition = anchor.selectors.find(
    (selector) => selector.type === 'TextPositionSelector',
  );
  const quoteMatch = Boolean(
    selectionQuote &&
    anchorQuote &&
    (selectionQuote.exact === anchorQuote.exact ||
      anchorQuote.exact.includes(selectionQuote.exact) ||
      selectionQuote.exact.includes(anchorQuote.exact)),
  );
  const positionMatch = Boolean(
    selectionPosition &&
    anchorPosition &&
    selectionPosition.start < anchorPosition.end &&
    selectionPosition.end > anchorPosition.start,
  );
  if (!quoteMatch && !positionMatch) return undefined;
  const score = quoteMatch && positionMatch ? 1 : 0.75;
  return {
    node,
    relation: 'text-overlap',
    score,
    priority: anchor.priority ?? 0,
    evidence: [
      {
        kind: 'text-match',
        authority: node.authority,
        anchorId: anchor.anchorId,
        score,
        details: { positionMatch, quoteMatch },
      },
    ],
  };
}

function anchorCandidates(
  snapshot: RegistrySnapshot,
  selection: Selection,
  omitted: Omitted[],
): Candidate[] {
  const nodes = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
  const output = new Map<string, Candidate>();
  for (const anchor of snapshot.anchors) {
    const node = nodes.get(anchor.nodeId);
    if (!node) continue;
    if (nodeIsStale(node, selection.createdAt)) {
      omitted.push({ nodeId: node.nodeId, reason: 'stale' });
      continue;
    }
    if (
      anchor.surfaceRevision !== selection.surfaceRevision ||
      ('expiresAt' in anchor &&
        anchor.expiresAt !== undefined &&
        Date.parse(anchor.expiresAt) <= Date.parse(selection.createdAt))
    ) {
      omitted.push({ nodeId: node.nodeId, reason: 'stale' });
      continue;
    }
    if (anchor.visibility === 'offscreen') {
      omitted.push({ nodeId: node.nodeId, reason: 'invisible' });
      continue;
    }
    if (anchor.visibility === 'occluded') {
      omitted.push({ nodeId: node.nodeId, reason: 'occluded' });
      continue;
    }
    const candidate =
      textCandidate(node, anchor, selection) ??
      geometryCandidate(node, anchor, selection);
    if (candidate) addCandidate(output, candidate);
  }
  return [...output.values()];
}

function collapseHierarchy(
  candidates: Candidate[],
  snapshot: RegistrySnapshot,
  selection: Selection,
  omitted: Omitted[],
): Candidate[] {
  const byId = new Map(
    candidates.map((candidate) => [candidate.node.nodeId, candidate]),
  );
  const childIds = new Map<string, string[]>();
  for (const node of snapshot.nodes) {
    if (!node.parentNodeId) continue;
    const children = childIds.get(node.parentNodeId) ?? [];
    children.push(node.nodeId);
    childIds.set(node.parentNodeId, children);
  }
  const removed = new Set<string>();
  for (const parent of candidates) {
    const children = childIds.get(parent.node.nodeId) ?? [];
    const selectedChildren = children.filter((id) => byId.has(id));
    if (selectedChildren.length === 0) continue;
    const collapseToParent =
      (selection.mode === 'region' || selection.mode === 'lasso') &&
      selectedChildren.length === children.length;
    if (collapseToParent) {
      for (const childId of selectedChildren) {
        removed.add(childId);
        omitted.push({ nodeId: childId, reason: 'parent-collapsed' });
      }
    } else {
      removed.add(parent.node.nodeId);
      omitted.push({
        nodeId: parent.node.nodeId,
        reason: 'parent-collapsed',
      });
    }
  }
  return candidates.filter((candidate) => !removed.has(candidate.node.nodeId));
}

function deduplicateEntities(
  candidates: Candidate[],
  omitted: Omitted[],
): Candidate[] {
  const output = new Map<string, Candidate>();
  for (const candidate of candidates.sort(compareCandidates)) {
    const key = entityKey(candidate.node);
    const previous = output.get(key);
    if (!previous) {
      output.set(key, candidate);
      continue;
    }
    previous.evidence.push(...candidate.evidence);
    omitted.push({ nodeId: candidate.node.nodeId, reason: 'duplicate' });
  }
  return [...output.values()].sort(compareCandidates);
}

function toReferent(
  candidate: Candidate,
  surfaceRevision: string,
): ResolvedReferent {
  const evidence = candidate.evidence as ResolvedReferent['evidence'];
  return {
    nodeId: candidate.node.nodeId,
    type: candidate.node.type,
    ...(candidate.node.entityRef
      ? { entityRef: candidate.node.entityRef }
      : {}),
    label: candidate.node.label,
    authority: candidate.node.authority,
    confidence: Math.max(0, Math.min(1, candidate.score)),
    relation: candidate.relation,
    evidence,
    surfaceRevision,
    ...(candidate.node.revision
      ? { nodeRevision: candidate.node.revision }
      : {}),
  };
}

export function resolveSelection(
  snapshot: RegistrySnapshot,
  selection: Selection,
): GroundingBundle {
  const base = {
    groundingId: `grounding:${selection.selectionId}:r${snapshot.semanticRevision}`,
    selection: structuredClone(
      selection,
    ) as unknown as GroundingBundle['selection'],
    generatedAt: selection.createdAt,
  };
  if (
    selection.surfaceId !== snapshot.surfaceId ||
    selection.surfaceRevision !== snapshot.surfaceRevision
  ) {
    return {
      ...base,
      referents: [],
      problem: problem(
        'SURFACE_STALE',
        'Surface state is stale',
        `Selection ${selection.selectionId} does not match the current Surface revision.`,
        true,
      ),
    };
  }

  const omitted: Omitted[] = [];
  const candidates = new Map<string, Candidate>();
  for (const candidate of semanticCandidates(snapshot, selection, omitted)) {
    addCandidate(candidates, candidate);
  }
  for (const candidate of anchorCandidates(snapshot, selection, omitted)) {
    addCandidate(candidates, candidate);
  }
  const collapsed = collapseHierarchy(
    [...candidates.values()],
    snapshot,
    selection,
    omitted,
  );
  const deduplicated = deduplicateEntities(collapsed, omitted);
  const limited = deduplicated.slice(0, 20);
  for (const candidate of deduplicated.slice(20)) {
    omitted.push({ nodeId: candidate.node.nodeId, reason: 'limit' });
  }
  const referents = limited.map((candidate) =>
    toReferent(candidate, snapshot.surfaceRevision),
  ) as GroundingBundle['referents'];
  const first = limited[0];
  const second = limited[1];
  const requiresDisambiguation = Boolean(
    first &&
    second &&
    selection.mode !== 'region' &&
    selection.mode !== 'lasso' &&
    authorityRank[first.node.authority] ===
      authorityRank[second.node.authority] &&
    Math.abs(first.score - second.score) < 1e-9 &&
    first.priority === second.priority &&
    entityKey(first.node) !== entityKey(second.node),
  );
  const relationships = limited
    .filter((candidate) => candidate.node.parentNodeId)
    .map((candidate) => ({
      sourceNodeId: candidate.node.parentNodeId as string,
      targetNodeId: candidate.node.nodeId,
      relation: 'parent' as const,
    }));

  return {
    ...base,
    referents,
    ...(relationships.length > 0 ? { relationships } : {}),
    ...(omitted.length > 0 ? { omitted } : {}),
    ...(requiresDisambiguation
      ? {
          ambiguity: {
            requiresDisambiguation: true,
            candidates: referents.slice(0, 2),
            reason: 'Equally ranked referents require explicit disambiguation.',
          },
          problem: problem(
            'AMBIGUOUS_REFERENT',
            'Referent is ambiguous',
            'Multiple equally ranked application referents match the Selection.',
            false,
          ),
        }
      : { ambiguity: { requiresDisambiguation: false } }),
    ...(referents.length === 0
      ? {
          problem: problem(
            'NO_REFERENT',
            'No referent found',
            'No current visible authoritative or derived referent matched the Selection.',
            false,
          ),
        }
      : {}),
  };
}
