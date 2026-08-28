import type { SemanticNode } from '@ui-grounding/protocol';

import type { SemanticFrame } from './generated/semantic-frame.js';
import type { SemanticValue } from './generated/semantic-value.js';
import type { ProfileRegistry } from './profile.js';

type Authority = SemanticNode['authority'];

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
  return {
    bindingId: binding.bindingId,
    profile: binding.profile,
    nodeId: binding.nodeId(value),
    frame,
    summary: profiles.renderSummary(binding.profile, frame),
    ...(binding.revision ? { revision: binding.revision(value) } : {}),
    authority: binding.authority ?? 'authoritative',
    capabilities: uniqueCapabilities,
  };
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
