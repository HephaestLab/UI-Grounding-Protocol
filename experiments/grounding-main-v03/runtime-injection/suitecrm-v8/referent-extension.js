const REFERENT_PROFILE = 'profile:crm';
const SUMMARY_PLANS = Object.freeze({
  'crm.module': ['moduleName', 'recordType', 'returnedRecordCount'],
  'crm.record': ['recordType', 'currentModule'],
  'crm.field': [
    'propertyName',
    'propertyLabel',
    'owningRecordType',
    'valueType',
    'editability',
    'currentValue',
    'selectionState',
    'constraint',
  ],
  'crm.application-action': [
    'actionLabel',
    'actionKind',
    'scope',
    'consequenceClass',
  ],
});
const referentState = { capsules: new Map(), revision: null };

const humanizeRole = (role) =>
  String(role)
    .replace(/[._-]+/gu, ' ')
    .replace(/^\p{Ll}/u, (initial) => initial.toLocaleUpperCase('en-US'));

const semanticValue = (value) => {
  if (
    value === null ||
    ['boolean', 'number', 'string'].includes(typeof value)
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return { kind: 'collection', items: value.map(semanticValue) };
  }
  if (
    value &&
    typeof value === 'object' &&
    [
      'collection',
      'entity',
      'frame',
      'instant',
      'interval',
      'quantity',
    ].includes(value.kind)
  ) {
    return plainClone(value);
  }
  return JSON.stringify(value).slice(0, MAX_ATTRIBUTE_LENGTH);
};

const summaryValue = (value) => {
  if (value === null) return 'null';
  if (['boolean', 'number', 'string'].includes(typeof value)) {
    return String(value);
  }
  if (value.kind === 'entity') return value.label || value.ref;
  if (value.kind === 'quantity') return `${value.value} ${value.unit}`;
  if (value.kind === 'instant') return value.value;
  if (value.kind === 'interval') {
    return value.label || `${value.start}..${value.endExclusive || ''}`;
  }
  if (value.kind === 'collection') {
    return value.items.map(summaryValue).join(', ');
  }
  if (value.kind === 'frame') {
    return value.value.subject.label || value.value.subject.ref;
  }
  return String(value);
};

const renderSummary = (frame) => {
  const plan = SUMMARY_PLANS[frame.type];
  if (!plan) throw new Error(`Unknown summary plan: ${frame.type}`);
  const subject = frame.subject.label || frame.subject.ref;
  return `${subject} — ${plan
    .map((role) => `${humanizeRole(role)}: ${summaryValue(frame.roles[role])}`)
    .join('; ')}`;
};

const uniqueSources = (...groups) =>
  [...new Set(groups.flat().filter(Boolean))].sort();

const makeCapsule = ({ nodeId, revision, surface, frame, capabilities }) => ({
  v: '0.2-draft',
  id: `capsule:${nodeId}`,
  at: { surface, revision },
  referent: { nodeId, revision },
  description: {
    profile: REFERENT_PROFILE,
    summary: renderSummary(frame),
    frame,
  },
  can: [...new Set(capabilities)].sort(),
});

const parseInventory = (legacyRoles) => {
  const output = new Map();
  const items = legacyRoles?.fieldInventory?.items || [];
  for (const item of items) {
    try {
      const inventory = JSON.parse(item);
      if (inventory?.field) output.set(inventory.field, inventory);
    } catch {
      // Legacy inventory is bounded JSON. Invalid entries fail closed below.
    }
  }
  return output;
};

const fieldCapabilities = (definition, bindings) => {
  const capabilities = [];
  if (bindings.some((binding) => binding.operations.includes('ui.field.set'))) {
    capabilities.push('crm.field.propose-value');
  }
  if (
    bindings.some((binding) =>
      binding.operations.includes('ui.selection.change'),
    )
  ) {
    capabilities.push('crm.field.choose-value');
  }
  if (
    definition?.type === 'relate' ||
    bindings.some((binding) => binding.relationshipValueState)
  ) {
    capabilities.push('crm.field.choose-related-record');
  }
  return capabilities;
};

const actionDescriptor = (binding) => {
  const label = firstText(binding.label);
  if (!label) return null;
  const normalized = label.toLocaleLowerCase('en-US');
  if (commitBinding(binding)) {
    return {
      actionKind: 'commit-record-changes',
      consequenceClass: 'state-mutation',
      capability: 'crm.record.commit',
    };
  }
  if (binding.role === 'tab') {
    return {
      actionKind: 'open-record-section',
      consequenceClass: 'view-transition',
      capability: 'crm.view.open-section',
    };
  }
  if (/^(?:create|new)(?:\b|\s|$)/iu.test(normalized)) {
    return {
      actionKind: 'open-record-creation',
      consequenceClass: 'workflow-transition',
      capability: 'crm.application.invoke',
    };
  }
  if (/^(?:edit)(?:\b|\s|$)/iu.test(normalized)) {
    return {
      actionKind: 'open-record-editor',
      consequenceClass: 'workflow-transition',
      capability: 'crm.application.invoke',
    };
  }
  if (/^(?:delete|remove)(?:\b|\s|$)/iu.test(normalized)) {
    return {
      actionKind: 'delete-record',
      consequenceClass: 'destructive-mutation',
      capability: 'crm.application.invoke',
    };
  }
  if (binding.href || ['button', 'link', 'menuitem'].includes(binding.role)) {
    return {
      actionKind: 'invoke-application-action',
      consequenceClass: binding.href
        ? 'application-navigation'
        : 'application-operation',
      capability: 'crm.application.invoke',
    };
  }
  return null;
};

const moduleFromBinding = (binding, modules) => {
  const label = normalizedIdentity(binding.label);
  return (
    modules.find((moduleName) => {
      const normalized = normalizedIdentity(moduleName);
      return (
        label === normalized ||
        normalizedIdentity(binding.href).includes(`/${normalized}`)
      );
    }) || null
  );
};

const realignSnapshot = () => {
  const raw = buildSnapshot();
  const legacyCapsule = raw.capsule;
  const base = { ...raw };
  delete base.capsule;
  const legacyDescription = legacyCapsule?.description;
  if (!legacyDescription) {
    referentState.capsules = new Map();
    referentState.revision = legacyCapsule?.at?.revision || null;
    return {
      ...base,
      referentIndex: [],
      referentProvenance: [],
      problem: legacyCapsule?.problem || {
        code: 'no-description',
        message: 'No authoritative component Description is available.',
        retryable: true,
      },
      quality: {
        ...raw.quality,
        referentCount: 0,
        independentlyDescribedReferentCount: 0,
        descriptionProblemCount: 1,
        componentDescriptionCoverage: 0,
      },
    };
  }

  const legacyRoles = legacyDescription.frame.roles;
  const moduleName = String(legacyRoles.module);
  const moduleType = `crm.${cleanIdentifier(
    moduleName.replace(/s$/u, ''),
    'record',
  )}`;
  const revision = legacyCapsule.at.revision;
  const surface = legacyCapsule.at.surface;
  const factByKey = new Map(raw.authorityFacts.map((fact) => [fact.key, fact]));
  const inventoryByField = parseInventory(legacyRoles);
  const capsules = new Map();
  const provenance = new Map();
  const indexMetadata = new Map();

  const addReferent = (capsule, sourceMap, metadata = {}) => {
    const nodeId = capsule.referent.nodeId;
    if (capsules.has(nodeId)) return;
    capsules.set(nodeId, capsule);
    provenance.set(nodeId, {
      nodeId: uniqueSources(sourceMap.nodeId),
      subject: uniqueSources(sourceMap.subject),
      roles: Object.fromEntries(
        Object.keys(capsule.description.frame.roles).map((role) => [
          role,
          uniqueSources(sourceMap.roles[role]),
        ]),
      ),
      revision: uniqueSources(sourceMap.revision),
      capabilities: Object.fromEntries(
        capsule.can.map((capability) => [
          capability,
          uniqueSources(sourceMap.capabilities?.[capability]),
        ]),
      ),
    });
    indexMetadata.set(nodeId, metadata);
  };

  const moduleSources = uniqueSources(
    factByKey.get('module.current')?.sourceIds,
    ['suitecrm.module-domain', 'suitecrm.graphql-live-state'],
  );
  const recordItems = legacyRoles.records?.items || [];
  const moduleNodeId = `suitecrm:module:${cleanIdentifier(moduleName, 'module')}`;
  const moduleFrame = {
    type: 'crm.module',
    subject: {
      kind: 'entity',
      ref: moduleNodeId,
      type: 'crm.module',
      label: moduleName,
    },
    roles: {
      moduleName,
      recordType: moduleType,
      returnedRecordCount: recordItems.length,
    },
  };
  addReferent(
    makeCapsule({
      nodeId: moduleNodeId,
      revision,
      surface,
      frame: moduleFrame,
      capabilities: ['crm.read'],
    }),
    {
      nodeId: moduleSources,
      subject: moduleSources,
      roles: {
        moduleName: moduleSources,
        recordType: moduleSources,
        returnedRecordCount: ['suitecrm.graphql-live-state'],
      },
      revision: ['suitecrm.graphql-live-state'],
      capabilities: { 'crm.read': ['suitecrm.api-v8'] },
    },
    { visible: true, routeLabels: [] },
  );

  for (const item of recordItems) {
    const recordFrame = item?.kind === 'frame' ? item.value : null;
    if (!recordFrame?.subject?.ref) continue;
    const nodeId = `suitecrm:record:${cleanIdentifier(
      recordFrame.subject.ref,
      'record',
    )}`;
    const recordId = String(recordFrame.subject.ref).split(':').at(-1);
    const recordSources = uniqueSources(
      factByKey.get(`record.${recordId}.canonical-id`)?.sourceIds,
      ['suitecrm.api-v8', 'suitecrm.graphql-live-state'],
    );
    const frame = {
      type: 'crm.record',
      subject: plainClone(recordFrame.subject),
      roles: {
        recordType: recordFrame.subject.type || moduleType,
        currentModule: moduleName,
        attributes: semanticValue(recordFrame.roles.attributes),
      },
    };
    addReferent(
      makeCapsule({
        nodeId,
        revision,
        surface,
        frame,
        capabilities: ['crm.read'],
      }),
      {
        nodeId: recordSources,
        subject: recordSources,
        roles: {
          recordType: uniqueSources(recordSources, ['suitecrm.module-domain']),
          currentModule: moduleSources,
          attributes: [
            'suitecrm.field-definitions',
            'suitecrm.api-v8',
            'suitecrm.graphql-live-state',
          ],
        },
        revision: ['suitecrm.graphql-live-state'],
        capabilities: { 'crm.read': ['suitecrm.api-v8'] },
      },
      { visible: true, routeLabels: [] },
    );
  }

  const bindingsByField = new Map();
  for (const binding of raw.interactionBindings) {
    if (!binding.fieldName) continue;
    const entries = bindingsByField.get(binding.fieldName) || [];
    entries.push(binding);
    bindingsByField.set(binding.fieldName, entries);
  }
  const fieldNames = [
    ...new Set([...inventoryByField.keys(), ...bindingsByField.keys()]),
  ].sort();
  for (const fieldName of fieldNames) {
    const inventory = inventoryByField.get(fieldName) || {};
    const fieldBindings = bindingsByField.get(fieldName) || [];
    const definitionFact = factByKey.get(
      `module.fields.${fieldName}.definition`,
    );
    const definition = definitionFact?.value || {};
    const currentFact = factByKey.get(
      `form.fields.${cleanIdentifier(fieldName, 'field')}.current-value`,
    );
    const selectedBinding = fieldBindings.find(
      (binding) => binding.relationshipValueState === 'selected',
    );
    const currentBinding =
      selectedBinding ||
      fieldBindings.find((binding) => binding.currentValue !== null);
    const relationshipStates = fieldBindings
      .map((binding) => binding.relationshipValueState)
      .filter(Boolean);
    const selectionState = relationshipStates.includes('unresolved')
      ? 'unresolved'
      : relationshipStates.includes('query')
        ? 'query-in-progress'
        : relationshipStates.includes('selected')
          ? 'selected'
          : relationshipStates.includes('unselected')
            ? 'unselected'
            : relationshipStates.includes('candidate')
              ? 'candidate-visible'
              : 'not-applicable';
    const readonly = Boolean(
      definition.readonly || fieldBindings.some((binding) => binding.readonly),
    );
    const editable = fieldBindings.some((binding) =>
      binding.operations.some((operation) =>
        [
          'ui.choice.open',
          'ui.choice.query',
          'ui.field.set',
          'ui.selection.change',
        ].includes(operation),
      ),
    );
    const required = Boolean(
      definition.required || fieldBindings.some((binding) => binding.required),
    );
    const constraint = ['query-in-progress', 'unresolved'].includes(
      selectionState,
    )
      ? 'relationship-selection-must-resolve-before-commit'
      : readonly
        ? 'read-only'
        : required
          ? 'required'
          : 'none';
    const propertyLabel = firstText(
      inventory.label,
      fieldBindings[0]?.label,
      humanizeFieldName(fieldName),
    );
    if (!propertyLabel) continue;
    const nodeId = `suitecrm:${cleanIdentifier(
      moduleName,
      'module',
    )}:field:${cleanIdentifier(fieldName, 'field')}`;
    const roles = {
      propertyName: fieldName,
      propertyLabel,
      owningRecordType: moduleType,
      valueType: semanticValue(definition.type || inventory.type || null),
      editability: readonly
        ? 'read-only'
        : editable
          ? 'editable'
          : 'not-currently-bound',
      currentValue: semanticValue(
        currentBinding?.currentValue ?? currentFact?.value ?? null,
      ),
      relationshipTargetType: semanticValue(
        definition.module || inventory.relatedModule || null,
      ),
      selectionState,
      constraint,
    };
    const frame = {
      type: 'crm.field',
      subject: {
        kind: 'entity',
        ref: nodeId,
        type: 'crm.record-property',
        label: propertyLabel,
      },
      roles,
    };
    const capabilities = fieldCapabilities(definition, fieldBindings);
    const definitionSources = uniqueSources(definitionFact?.sourceIds, [
      'suitecrm.field-definitions',
      'suitecrm.module-domain',
    ]);
    const stateSources = ['suitecrm.angular-field-binding'];
    addReferent(
      makeCapsule({
        nodeId,
        revision,
        surface,
        frame,
        capabilities,
      }),
      {
        nodeId: definitionSources,
        subject: definitionSources,
        roles: {
          propertyName: definitionSources,
          propertyLabel: uniqueSources(definitionSources, stateSources),
          owningRecordType: moduleSources,
          valueType: definitionSources,
          editability: uniqueSources(definitionSources, stateSources),
          currentValue: uniqueSources(currentFact?.sourceIds, stateSources),
          relationshipTargetType: definitionSources,
          selectionState: stateSources,
          constraint: uniqueSources(definitionSources, stateSources),
        },
        revision: ['suitecrm.graphql-live-state'],
        capabilities: Object.fromEntries(
          capabilities.map((capability) => [capability, stateSources]),
        ),
      },
      {
        visible: fieldBindings.length > 0,
        routeLabels: (inventory.panels || [])
          .map((panel) => firstText(panel.panelLabel, panel.panelKey))
          .filter(Boolean),
      },
    );
  }

  const availableModules = [
    ...new Set([
      moduleName,
      ...(legacyRoles.availableModules?.items || []).map(String),
    ]),
  ];
  for (const availableModule of availableModules) {
    const nodeId = `suitecrm:module:${cleanIdentifier(
      availableModule,
      'module',
    )}`;
    if (capsules.has(nodeId)) continue;
    const sources = uniqueSources(
      factByKey.get(`navigation.module.${availableModule}`)?.sourceIds,
      ['suitecrm.module-domain', 'suitecrm.graphql-live-state'],
    );
    const frame = {
      type: 'crm.module',
      subject: {
        kind: 'entity',
        ref: nodeId,
        type: 'crm.module',
        label: availableModule,
      },
      roles: {
        moduleName: availableModule,
        recordType: `crm.${cleanIdentifier(
          availableModule.replace(/s$/u, ''),
          'record',
        )}`,
        returnedRecordCount: 0,
      },
    };
    addReferent(
      makeCapsule({
        nodeId,
        revision,
        surface,
        frame,
        capabilities: ['crm.module.open'],
      }),
      {
        nodeId: sources,
        subject: sources,
        roles: {
          moduleName: sources,
          recordType: sources,
          returnedRecordCount: ['suitecrm.graphql-live-state'],
        },
        revision: ['suitecrm.graphql-live-state'],
        capabilities: { 'crm.module.open': ['suitecrm.module-domain'] },
      },
      { visible: false, routeLabels: [] },
    );
  }

  const mappedBindings = raw.interactionBindings.map((binding) => {
    if (binding.fieldName) {
      const nodeId = `suitecrm:${cleanIdentifier(
        moduleName,
        'module',
      )}:field:${cleanIdentifier(binding.fieldName, 'field')}`;
      const capsule = capsules.get(nodeId);
      return {
        ...binding,
        referentNodeId: capsule ? nodeId : null,
        compatibleCapabilities: capsule?.can || [],
      };
    }
    const targetModule = moduleFromBinding(binding, availableModules);
    if (targetModule) {
      const nodeId = `suitecrm:module:${cleanIdentifier(
        targetModule,
        'module',
      )}`;
      return {
        ...binding,
        referentNodeId: nodeId,
        compatibleCapabilities: ['crm.module.open'],
      };
    }
    const descriptor = actionDescriptor(binding);
    if (!descriptor) {
      return {
        ...binding,
        referentNodeId: null,
        compatibleCapabilities: [],
      };
    }
    const semanticKey = cleanIdentifier(
      `${descriptor.actionKind}:${binding.label}:${binding.href || ''}`,
      'action',
    );
    const nodeId = `suitecrm:${cleanIdentifier(
      moduleName,
      'module',
    )}:action:${semanticKey}`;
    const frame = {
      type: 'crm.application-action',
      subject: {
        kind: 'entity',
        ref: nodeId,
        type: 'crm.application-action',
        label: binding.label,
      },
      roles: {
        actionLabel: binding.label,
        actionKind: descriptor.actionKind,
        scope: moduleType,
        consequenceClass: descriptor.consequenceClass,
      },
    };
    addReferent(
      makeCapsule({
        nodeId,
        revision,
        surface,
        frame,
        capabilities: [descriptor.capability],
      }),
      {
        nodeId: ['suitecrm.angular-actions'],
        subject: ['suitecrm.angular-actions'],
        roles: {
          actionLabel: ['suitecrm.angular-actions'],
          actionKind: ['suitecrm.angular-actions'],
          scope: moduleSources,
          consequenceClass: ['suitecrm.angular-actions'],
        },
        revision: ['suitecrm.graphql-live-state'],
        capabilities: {
          [descriptor.capability]: ['suitecrm.angular-actions'],
        },
      },
      { visible: true, routeLabels: [] },
    );
    return {
      ...binding,
      referentNodeId: nodeId,
      compatibleCapabilities: [descriptor.capability],
    };
  });

  const referentIndex = [...capsules.values()]
    .map((capsule) => {
      const metadata = indexMetadata.get(capsule.referent.nodeId) || {};
      return {
        nodeId: capsule.referent.nodeId,
        label:
          capsule.description.frame.subject.label ||
          capsule.description.frame.subject.ref,
        subjectRef: capsule.description.frame.subject.ref,
        profile: capsule.description.profile,
        frameType: capsule.description.frame.type,
        summary: capsule.description.summary,
        capsuleHandle: capsule.referent.nodeId,
        visible: Boolean(metadata.visible),
        routeLabels: metadata.routeLabels || [],
      };
    })
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const referentProvenance = [...provenance.entries()]
    .map(([referentNodeId, facts]) => ({ referentNodeId, ...facts }))
    .sort((left, right) =>
      left.referentNodeId.localeCompare(right.referentNodeId),
    );
  referentState.capsules = capsules;
  referentState.revision = revision;
  return {
    ...base,
    interactionBindings: mappedBindings,
    referentIndex,
    referentProvenance,
    quality: {
      ...raw.quality,
      referentCount: referentIndex.length,
      independentlyDescribedReferentCount: capsules.size,
      descriptionProblemCount: 0,
      componentDescriptionCoverage:
        referentIndex.length === 0 ? 1 : capsules.size / referentIndex.length,
    },
  };
};

const describeReferent = (nodeId) => {
  let capsule = referentState.capsules.get(String(nodeId));
  const snapshot = capsule ? null : realignSnapshot();
  capsule = referentState.capsules.get(String(nodeId));
  if (capsule) return plainClone(capsule);
  return {
    v: '0.2-draft',
    id: `capsule:${cleanIdentifier(nodeId, 'unknown-referent')}`,
    at: {
      surface: `suitecrm:${cleanIdentifier(currentModule(), 'unknown')}`,
      revision: referentState.revision || `${ADAPTER_ID}:unbound`,
    },
    referent: nodeId
      ? { nodeId: cleanIdentifier(nodeId, 'unknown-referent') }
      : null,
    description: null,
    can: [],
    problem: snapshot?.problem || {
      code: 'no-description',
      message: 'The requested referent is not in the current live index.',
      retryable: false,
    },
  };
};

Object.defineProperty(globalThis, '__UGP_EXPERIMENT_BRIDGE__', {
  configurable: false,
  enumerable: false,
  writable: false,
  value: Object.freeze({
    snapshot: async () => plainClone(realignSnapshot()),
    describe: async (nodeId) => describeReferent(nodeId),
  }),
});
/* global ADAPTER_ID, MAX_ATTRIBUTE_LENGTH, buildSnapshot, cleanIdentifier, commitBinding, currentModule, firstText, humanizeFieldName, normalizedIdentity, plainClone */
