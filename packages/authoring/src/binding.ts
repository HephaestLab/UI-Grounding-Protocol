import type { SemanticNode } from '@ui-grounding/protocol';

import type { AuthorityManifest } from './generated/authority-manifest.js';
import type { SemanticFrame } from './generated/semantic-frame.js';
import type { SemanticValue } from './generated/semantic-value.js';
import type { ProfileRegistry } from './profile.js';

type Authority = SemanticNode['authority'];

export interface BindingProvenance {
  nodeId: readonly string[];
  subject: readonly string[];
  roles: Readonly<Record<string, readonly string[]>>;
  revision?: readonly string[];
  capabilities?: Readonly<Record<string, readonly string[]>>;
}

export interface ProvenanceAuditResult {
  valid: boolean;
  issues: string[];
}

export interface SemanticBinding<T> {
  bindingId: string;
  profile: string;
  frameType: string;
  nodeId(value: T): string;
  subject(value: T): SemanticFrame['subject'];
  roles(value: T): Record<string, SemanticValue>;
  revision?(value: T): string;
  authority?: Authority;
  capabilities?: readonly string[] | ((value: T) => readonly string[]);
  provenance: BindingProvenance | ((value: T) => BindingProvenance);
}

export interface MaterializedBinding {
  bindingId: string;
  profile: string;
  nodeId: string;
  frame: SemanticFrame;
  summary: string;
  revision?: string;
  authority: Authority;
  capabilities: string[];
  provenance: BindingProvenance;
}

const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._~:/@-]*$/u;

function normalizeSources(fact: string, sources: readonly string[]): string[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(`Missing authority source for ${fact}`);
  }
  const normalized = [
    ...new Set(sources.map((source) => source.trim())),
  ].sort();
  if (normalized.some((source) => !SOURCE_ID.test(source))) {
    throw new Error(`Invalid authority source for ${fact}`);
  }
  return normalized;
}

function materializeProvenance(
  frame: SemanticFrame,
  revision: string | undefined,
  capabilities: readonly string[],
  provenance: BindingProvenance,
): BindingProvenance {
  const roleNames = Object.keys(frame.roles).sort();
  const provenanceRoleNames = Object.keys(provenance.roles).sort();
  const missingRoles = roleNames.filter(
    (role) => !provenanceRoleNames.includes(role),
  );
  const unknownRoles = provenanceRoleNames.filter(
    (role) => !roleNames.includes(role),
  );
  if (missingRoles.length > 0 || unknownRoles.length > 0) {
    throw new Error(
      `Binding provenance roles do not match frame roles: missing=${missingRoles.join(',') || 'none'} unknown=${unknownRoles.join(',') || 'none'}`,
    );
  }
  const capabilitySources = provenance.capabilities ?? {};
  const capabilityNames = Object.keys(capabilitySources).sort();
  const missingCapabilities = capabilities.filter(
    (capability) => !capabilityNames.includes(capability),
  );
  const unknownCapabilities = capabilityNames.filter(
    (capability) => !capabilities.includes(capability),
  );
  if (missingCapabilities.length > 0 || unknownCapabilities.length > 0) {
    throw new Error(
      `Binding provenance capabilities do not match capabilities: missing=${missingCapabilities.join(',') || 'none'} unknown=${unknownCapabilities.join(',') || 'none'}`,
    );
  }
  if (revision && !provenance.revision) {
    throw new Error('Missing authority source for revision');
  }
  if (!revision && provenance.revision) {
    throw new Error('Binding provenance cites a revision that is not emitted');
  }
  return {
    nodeId: normalizeSources('nodeId', provenance.nodeId),
    subject: normalizeSources('subject', provenance.subject),
    roles: Object.fromEntries(
      roleNames.map((role) => [
        role,
        normalizeSources(`roles.${role}`, provenance.roles[role]!),
      ]),
    ),
    ...(revision
      ? { revision: normalizeSources('revision', provenance.revision!) }
      : {}),
    ...(capabilities.length > 0
      ? {
          capabilities: Object.fromEntries(
            capabilities.map((capability) => [
              capability,
              normalizeSources(
                `capabilities.${capability}`,
                capabilitySources[capability]!,
              ),
            ]),
          ),
        }
      : {}),
  };
}

export function defineBinding<T>(
  binding: SemanticBinding<T>,
): SemanticBinding<T> {
  return binding;
}

export function materializeBinding<T>(
  profiles: ProfileRegistry,
  binding: SemanticBinding<T>,
  value: T,
): MaterializedBinding {
  const frame: SemanticFrame = {
    type: binding.frameType,
    subject: structuredClone(binding.subject(value)),
    roles: structuredClone(binding.roles(value)),
  };
  const validation = profiles.validateFrame(binding.profile, frame);
  if (!validation.valid) {
    throw new Error(
      `Binding ${binding.bindingId} produced an invalid frame: ${validation.issues.join('; ')}`,
    );
  }
  const capabilities =
    typeof binding.capabilities === 'function'
      ? binding.capabilities(value)
      : (binding.capabilities ?? []);
  const uniqueCapabilities = [...new Set(capabilities)].sort();
  const capabilityValidation = profiles.validateCapabilities(
    binding.profile,
    binding.frameType,
    uniqueCapabilities,
  );
  if (!capabilityValidation.valid) {
    throw new Error(
      `Binding ${binding.bindingId} produced invalid capabilities: ${capabilityValidation.issues.join('; ')}`,
    );
  }
  const revision = binding.revision?.(value);
  const rawProvenance =
    typeof binding.provenance === 'function'
      ? binding.provenance(value)
      : binding.provenance;
  const provenance = materializeProvenance(
    frame,
    revision,
    uniqueCapabilities,
    rawProvenance,
  );
  return {
    bindingId: binding.bindingId,
    profile: binding.profile,
    nodeId: binding.nodeId(value),
    frame,
    summary: profiles.renderSummary(binding.profile, frame),
    ...(revision ? { revision } : {}),
    authority: binding.authority ?? 'authoritative',
    capabilities: uniqueCapabilities,
    provenance,
  };
}

export function auditBindingProvenance(
  binding: MaterializedBinding,
  manifest: AuthorityManifest,
): ProvenanceAuditResult {
  const sourceIds = manifest.sources.map((source) => source.id);
  const duplicateSources = sourceIds.filter(
    (source, index) => sourceIds.indexOf(source) !== index,
  );
  const declared = new Set(sourceIds);
  const cited = [
    ...binding.provenance.nodeId,
    ...binding.provenance.subject,
    ...Object.values(binding.provenance.roles).flat(),
    ...(binding.provenance.revision ?? []),
    ...Object.values(binding.provenance.capabilities ?? {}).flat(),
  ];
  const issues = [
    ...[...new Set(duplicateSources)]
      .sort()
      .map((source) => `Duplicate authority source: ${source}`),
    ...[...new Set(cited.filter((source) => !declared.has(source)))]
      .sort()
      .map((source) => `Undeclared authority source: ${source}`),
  ];
  return { valid: issues.length === 0, issues };
}

export function entityRefFromSubject(
  subject: SemanticFrame['subject'],
): NonNullable<SemanticNode['entityRef']> {
  const separator = subject.ref.indexOf('/');
  if (separator < 1 || separator === subject.ref.length - 1) {
    throw new Error(`Subject ref must use namespace/id form: ${subject.ref}`);
  }
  return {
    namespace: subject.ref.slice(0, separator),
    id: subject.ref.slice(separator + 1),
    ...(subject.type ? { type: subject.type } : {}),
  };
}
