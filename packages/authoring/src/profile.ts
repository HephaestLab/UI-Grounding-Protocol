import type { ProfileDefinition } from './generated/profile-definition.js';
import type { SemanticFrame } from './generated/semantic-frame.js';
import type { SemanticValue } from './generated/semantic-value.js';

type FrameDefinition = ProfileDefinition['frames'][number];
type ValueKind = FrameDefinition['roles'][string]['valueKinds'][number];
type CompetencyQuestion = FrameDefinition['competencyQuestions'][number];

export interface FrameValidationResult {
  valid: boolean;
  issues: string[];
}

function semanticValueKind(value: SemanticValue): ValueKind {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return value.kind;
}

function formatSemanticValue(value: SemanticValue): string {
  if (value === null) return 'null';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  switch (value.kind) {
    case 'entity':
      return value.label ?? value.ref;
    case 'quantity':
      return `${value.value} ${value.unit}`;
    case 'instant':
      return value.value;
    case 'interval':
      return value.label ?? `${value.start}..${value.endExclusive ?? ''}`;
    case 'collection':
      return value.items.map(formatSemanticValue).join(', ');
    case 'frame':
      return value.value.subject.label ?? value.value.subject.ref;
  }
}

function frameKey(profileId: string, frameType: string): string {
  return `${profileId}\u0000${frameType}`;
}

function answerRole(path: string): string | undefined {
  return path.startsWith('roles.') ? path.slice('roles.'.length) : undefined;
}

function summaryRoleLabel(role: string): string {
  return role
    .replace(/[._-]+/gu, ' ')
    .replace(/^\p{Ll}/u, (initial) => initial.toLocaleUpperCase('en-US'));
}

function answerPathIssue(
  question: CompetencyQuestion,
  frame: SemanticFrame,
): string | undefined {
  for (const path of question.answerPaths) {
    if (path === 'subject' || path === 'subject.ref') continue;
    if (path === 'subject.type' || path === 'subject.label') {
      const key = path.slice('subject.'.length) as 'type' | 'label';
      if (!frame.subject[key]?.trim())
        return `Missing competency answer: ${path}`;
      continue;
    }
    const role = answerRole(path);
    if (!role || !(role in frame.roles)) {
      return `Missing competency answer: ${path}`;
    }
    const value = frame.roles[role];
    if (typeof value === 'string' && value.trim().length === 0) {
      return `Blank competency answer: ${path}`;
    }
  }
  return undefined;
}

function profileIssues(profile: ProfileDefinition): string[] {
  const issues: string[] = [];
  const frameTypes = new Set<string>();
  for (const frame of profile.frames) {
    if (frameTypes.has(frame.type)) {
      issues.push(`duplicate frame type: ${frame.type}`);
    }
    frameTypes.add(frame.type);
    for (const role of frame.requiredRoles) {
      if (!frame.roles[role]) {
        issues.push(`${frame.type}: required role is not defined: ${role}`);
      }
    }
    const competencyQuestions = frame.competencyQuestions ?? [];
    const questionIds = new Set<string>();
    const questionsById = new Map(
      competencyQuestions.map((question) => [question.id, question]),
    );
    const summaryRoles = frame.summaryPlan?.roles ?? [];
    if (summaryRoles.length === 0) {
      issues.push(`${frame.type}: missing summary plan roles`);
    }
    if (new Set(summaryRoles).size !== summaryRoles.length) {
      issues.push(`${frame.type}: duplicate summary role`);
    }
    for (const question of competencyQuestions) {
      if (questionIds.has(question.id)) {
        issues.push(
          `${frame.type}: duplicate competency question: ${question.id}`,
        );
      }
      questionIds.add(question.id);
      for (const path of question.answerPaths) {
        const role = answerRole(path);
        if (role && !frame.roles[role]) {
          issues.push(
            `${frame.type}: competency ${question.id} references unknown role: ${role}`,
          );
        } else if (role && !frame.requiredRoles.includes(role)) {
          issues.push(
            `${frame.type}: competency ${question.id} answer role must be required: ${role}`,
          );
        }
        if (question.includeInSummary) {
          const included =
            path === 'subject' || (role ? summaryRoles.includes(role) : false);
          if (!included) {
            issues.push(
              `${frame.type}: summary omits competency answer: ${path}`,
            );
          }
        }
      }
    }
    for (const requiredQuestion of ['identity', 'meaning']) {
      const question = questionsById.get(requiredQuestion);
      if (!question) {
        issues.push(
          `${frame.type}: missing competency question: ${requiredQuestion}`,
        );
      } else if (!question.includeInSummary) {
        issues.push(
          `${frame.type}: ${requiredQuestion} must be included in the summary`,
        );
      }
    }
    const meaning = questionsById.get('meaning');
    if (meaning && !meaning.answerPaths.some((path) => answerRole(path))) {
      issues.push(
        `${frame.type}: meaning must be answered by at least one semantic role`,
      );
    }
    const identity = questionsById.get('identity');
    if (identity && !identity.answerPaths.includes('subject')) {
      issues.push(`${frame.type}: identity must include the canonical subject`);
    }
    for (const role of summaryRoles) {
      if (!frame.roles[role]) {
        issues.push(`${frame.type}: unknown summary role: ${role}`);
      } else if (!frame.requiredRoles.includes(role)) {
        issues.push(`${frame.type}: summary role must be required: ${role}`);
      }
    }
  }
  return issues;
}

export function defineProfile<T extends ProfileDefinition>(profile: T): T {
  const issues = profileIssues(profile);
  if (issues.length > 0) {
    throw new Error(`Invalid UGP profile: ${issues.join('; ')}`);
  }
  return structuredClone(profile) as T;
}

export class ProfileRegistry {
  #profiles = new Map<string, ProfileDefinition>();
  #frames = new Map<string, FrameDefinition>();

  constructor(profiles: readonly ProfileDefinition[] = []) {
    for (const profile of profiles) this.register(profile);
  }

  register(profile: ProfileDefinition): () => void {
    if (this.#profiles.has(profile.profileId)) {
      throw new Error(`Profile already registered: ${profile.profileId}`);
    }
    const validated = defineProfile(profile);
    this.#profiles.set(validated.profileId, validated);
    for (const frame of validated.frames) {
      const key = frameKey(validated.profileId, frame.type);
      if (this.#frames.has(key)) {
        throw new Error(`Frame already registered: ${frame.type}`);
      }
      this.#frames.set(key, frame);
    }
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      this.#profiles.delete(validated.profileId);
      for (const frame of validated.frames) {
        this.#frames.delete(frameKey(validated.profileId, frame.type));
      }
    };
  }

  get(profileId: string): ProfileDefinition | undefined {
    const profile = this.#profiles.get(profileId);
    return profile ? structuredClone(profile) : undefined;
  }

  validateFrame(
    profileId: string,
    frame: SemanticFrame,
  ): FrameValidationResult {
    const definition = this.#frames.get(frameKey(profileId, frame.type));
    if (!definition) {
      return {
        valid: false,
        issues: [`Unknown frame ${frame.type} in profile ${profileId}`],
      };
    }
    const issues: string[] = [];
    for (const role of definition.requiredRoles) {
      if (!(role in frame.roles)) issues.push(`Missing required role: ${role}`);
    }
    for (const [role, value] of Object.entries(frame.roles)) {
      const roleDefinition = definition.roles[role];
      if (!roleDefinition) {
        issues.push(`Unknown role: ${role}`);
        continue;
      }
      const kind = semanticValueKind(value);
      if (!roleDefinition.valueKinds.includes(kind)) {
        issues.push(`Role ${role} does not allow ${kind}`);
      }
      if (
        roleDefinition.vocabulary &&
        typeof value === 'string' &&
        !roleDefinition.vocabulary.includes(value)
      ) {
        issues.push(`Role ${role} contains an unknown vocabulary value`);
      }
    }
    for (const question of definition.competencyQuestions) {
      const issue = answerPathIssue(question, frame);
      if (issue) issues.push(`${question.id}: ${issue}`);
    }
    return { valid: issues.length === 0, issues };
  }

  validateCapabilities(
    profileId: string,
    frameType: string,
    capabilities: readonly string[],
  ): FrameValidationResult {
    const definition = this.#frames.get(frameKey(profileId, frameType));
    if (!definition) {
      return {
        valid: false,
        issues: [`Unknown frame ${frameType} in profile ${profileId}`],
      };
    }
    const allowed = new Set(definition.capabilities ?? []);
    const issues = [...new Set(capabilities)]
      .filter((capability) => !allowed.has(capability))
      .sort()
      .map((capability) => `Undeclared capability: ${capability}`);
    return { valid: issues.length === 0, issues };
  }

  validateDescription(
    profileId: string,
    frame: SemanticFrame,
    summary: string,
  ): FrameValidationResult {
    const validation = this.validateFrame(profileId, frame);
    if (!validation.valid) return validation;
    const expected = this.renderSummary(profileId, frame);
    const issues =
      summary === expected
        ? []
        : ['Summary is not the canonical projection of the Frame'];
    return { valid: issues.length === 0, issues };
  }

  renderSummary(profileId: string, frame: SemanticFrame): string {
    const validation = this.validateFrame(profileId, frame);
    if (!validation.valid) {
      throw new Error(validation.issues.join('; '));
    }
    const definition = this.#frames.get(frameKey(profileId, frame.type))!;
    const subject = frame.subject.label ?? frame.subject.ref;
    const facts = definition.summaryPlan.roles.map((role) => {
      const label = summaryRoleLabel(role);
      return `${label}: ${formatSemanticValue(frame.roles[role]!)}`;
    });
    return `${subject} — ${facts.join('; ')}`;
  }
}
