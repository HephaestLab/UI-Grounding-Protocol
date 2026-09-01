(() => {
  'use strict';

  if (globalThis.__UGP_EXPERIMENT_BRIDGE__) return;

  const ADAPTER_ID = 'suitecrm-8.8.1-runtime-v7';
  const ADAPTER_DIGEST = '__ADAPTER_DIGEST__';
  const AUTHORITY_MANIFEST_DIGEST = '__AUTHORITY_MANIFEST_DIGEST__';
  const API_PATH = '/api/graphql';
  const MAX_RECORDS = 100;
  const MAX_ATTRIBUTE_LENGTH = 4096;
  const SECRET_MARKERS = [
    'password',
    'passwd',
    'secret',
    'token',
    'csrf',
    'session',
    'authenticity',
  ];
  const state = {
    responses: [],
    installedAt: Date.now(),
    relationshipSurface: null,
    pendingRelationshipFields: new Map(),
    relationshipCandidateBindings: new Map(),
    relationshipCandidateActivations: new Map(),
  };

  const plainClone = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  };

  const cleanIdentifier = (value, fallback) => {
    const cleaned = String(value ?? '')
      .replace(/[^A-Za-z0-9._~:/@-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 240);
    return cleaned || fallback;
  };

  const boundedValue = (key, value) => {
    const normalizedKey = String(key).toLowerCase();
    if (SECRET_MARKERS.some((marker) => normalizedKey.includes(marker))) {
      return '[redacted-sensitive-field]';
    }
    if (value === null || ['boolean', 'number'].includes(typeof value)) {
      return value;
    }
    if (typeof value === 'string') return value.slice(0, MAX_ATTRIBUTE_LENGTH);
    const serialized = JSON.stringify(value);
    return serialized.length <= MAX_ATTRIBUTE_LENGTH
      ? plainClone(value)
      : `${serialized.slice(0, MAX_ATTRIBUTE_LENGTH - 1)}…`;
  };

  const parseRequest = (input, init) => {
    let url = '';
    let body = null;
    try {
      url = typeof input === 'string' ? input : input?.url || '';
      const rawBody =
        init?.body ?? (typeof input === 'object' ? input?.body : null);
      if (typeof rawBody === 'string') body = JSON.parse(rawBody);
    } catch {
      body = null;
    }
    return { url, body };
  };

  const capture = (request, payload, status) => {
    try {
      const url = new globalThis.URL(request.url, globalThis.location.href);
      if (
        url.origin !== globalThis.location.origin ||
        url.pathname !== API_PATH ||
        status < 200 ||
        status >= 300 ||
        !payload ||
        typeof payload !== 'object'
      ) {
        return;
      }
      const body =
        request.body && typeof request.body === 'object' ? request.body : {};
      const variables =
        body.variables && typeof body.variables === 'object'
          ? body.variables
          : {};
      const operationName = String(body.operationName || 'anonymous').slice(
        0,
        128,
      );
      if (
        !['appMetadata', 'moduleMetadata', 'recordList', 'record'].includes(
          operationName,
        )
      ) {
        return;
      }
      state.responses.push({
        capturedAt: Date.now(),
        operationName,
        module: String(variables.module || variables.id || '')
          .toLowerCase()
          .slice(0, 128),
        payload: plainClone(payload),
      });
      if (state.responses.length > 80)
        state.responses.splice(0, state.responses.length - 80);
    } catch {
      // A failed capture never changes application behavior.
    }
  };

  if (typeof globalThis.fetch === 'function') {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (...args) => {
      const request = parseRequest(args[0], args[1]);
      const response = await nativeFetch(...args);
      try {
        response
          .clone()
          .json()
          .then(
            (payload) => capture(request, payload, response.status),
            () => {},
          );
      } catch {
        // Preserve native fetch behavior if a response cannot be cloned.
      }
      return response;
    };
  }

  if (typeof globalThis.XMLHttpRequest === 'function') {
    const nativeOpen = globalThis.XMLHttpRequest.prototype.open;
    const nativeSend = globalThis.XMLHttpRequest.prototype.send;
    globalThis.XMLHttpRequest.prototype.open = function open(
      method,
      url,
      ...rest
    ) {
      this.__ugpRequestUrl = String(url || '');
      return nativeOpen.call(this, method, url, ...rest);
    };
    globalThis.XMLHttpRequest.prototype.send = function send(body) {
      const request = parseRequest(this.__ugpRequestUrl || '', { body });
      this.addEventListener('load', () => {
        try {
          capture(request, JSON.parse(this.responseText), this.status);
        } catch {
          // Non-JSON responses are outside the adapter contract.
        }
      });
      return nativeSend.call(this, body);
    };
  }

  const currentModule = () => {
    const route = globalThis.location.hash
      .replace(/^#\/?/u, '')
      .split(/[/?]/u)[0];
    return String(route || 'home').toLowerCase();
  };

  const findObjects = (value, predicate, output = [], seen = new Set()) => {
    if (
      !value ||
      typeof value !== 'object' ||
      seen.has(value) ||
      output.length >= MAX_RECORDS
    ) {
      return output;
    }
    seen.add(value);
    if (predicate(value)) output.push(value);
    for (const nested of Array.isArray(value) ? value : Object.values(value)) {
      findObjects(nested, predicate, output, seen);
      if (output.length >= MAX_RECORDS) break;
    }
    return output;
  };

  const responsesForModule = (moduleName) => {
    const direct = state.responses.filter(
      (entry) => entry.module === moduleName,
    );
    const globalMetadata = state.responses.filter(
      (entry) => entry.operationName === 'appMetadata',
    );
    return [...globalMetadata, ...direct].sort(
      (left, right) => left.capturedAt - right.capturedAt,
    );
  };

  const authorityFact = (key, value, sourceIds) => ({ key, value, sourceIds });

  const firstText = (...values) => {
    for (const value of values) {
      const normalized = String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim();
      if (normalized) return normalized.slice(0, 512);
    }
    return '';
  };

  const opaqueLocalizationLabel = (value) =>
    /^(?:LBL|NTC|ERR|MSG)_[A-Z0-9_]+$/u.test(
      String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim(),
    );

  const semanticLabelText = (...values) =>
    firstText(
      ...values.map((value) => (opaqueLocalizationLabel(value) ? '' : value)),
    );

  const normalizedIdentity = (value) =>
    firstText(value).toLocaleLowerCase('en-US');

  const activationMatchesSelection = (activation, selectedValue) => {
    const activated = normalizedIdentity(activation?.label);
    const selected = normalizedIdentity(selectedValue);
    return Boolean(
      activated &&
      selected &&
      (activated === selected ||
        activated.startsWith(`${selected} `) ||
        selected.startsWith(`${activated} `)),
    );
  };

  globalThis.document?.addEventListener(
    'click',
    (event) => {
      const target = event.target?.closest?.('[bid]');
      const targetId = target?.getAttribute?.('bid');
      if (!targetId) return;
      const candidate = state.relationshipCandidateBindings.get(targetId);
      if (!candidate) return;
      state.relationshipCandidateActivations.set(candidate.fieldName, {
        ...candidate,
        activatedAt: Date.now(),
      });
    },
    true,
  );

  const humanizeFieldName = (value) =>
    String(value ?? '')
      .replaceAll('_', ' ')
      .replace(/\b\p{Ll}/gu, (character) =>
        character.toLocaleUpperCase('en-US'),
      );

  const relationshipPlaceholder = (value) =>
    /^(?:select an item|option list|empty|no (?:matching )?(?:items|options|results).*|no results matching your search criteria.*)$/iu.test(
      String(value ?? '')
        .replace(/\s+/gu, ' ')
        .trim(),
    );

  const commitBinding = (binding) =>
    binding.operations.includes('ui.activate') &&
    /^(save|submit|create|update|confirm|apply)(\b|\s|$)/iu.test(binding.label);

  const classValue = (element, prefixes) => {
    const container = element.closest(
      prefixes.map((prefix) => `[class*="${prefix}"]`).join(','),
    );
    if (!container) return null;
    for (const className of container.classList) {
      const prefix = prefixes.find((candidate) =>
        className.startsWith(candidate),
      );
      if (prefix) return className.slice(prefix.length) || null;
    }
    return null;
  };

  const interactionBindings = (
    fieldDefinitions = {},
    translateLabel = (value) => value,
  ) => {
    const candidates = [...globalThis.document.querySelectorAll('[bid]')];
    return candidates
      .filter((element) => {
        const rectangle = element.getBoundingClientRect();
        const style = globalThis.getComputedStyle(element);
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const interactive =
          ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
          [
            'button',
            'combobox',
            'link',
            'menuitem',
            'option',
            'tab',
            'textbox',
          ].includes(role) ||
          style.cursor === 'pointer';
        return (
          interactive &&
          rectangle.width > 0 &&
          rectangle.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          !element.disabled
        );
      })
      .map((element, documentOrder) => {
        const identifier = element.getAttribute('id');
        const semanticFieldName = classValue(element, [
          'dynamic-field-name-',
          'field-name-',
        ]);
        const semanticFieldType = classValue(element, [
          'dynamic-field-type-',
          'field-type-',
        ]);
        const semanticFieldMode = classValue(element, [
          'dynamic-field-mode-',
          'field-mode-',
        ]);
        const elementName = element.getAttribute('name');
        const fieldName = semanticFieldName || elementName || null;
        const definition = fieldName && fieldDefinitions[fieldName];
        const resolvedFieldType =
          definition?.type ||
          semanticFieldType ||
          element.getAttribute('type') ||
          (['select', 'textarea'].includes(element.tagName.toLowerCase())
            ? element.tagName.toLowerCase()
            : null);
        const explicitLabel = identifier
          ? globalThis.document.querySelector(
              `label[for="${globalThis.CSS.escape(identifier)}"]`,
            )
          : null;
        const authoritativeLabel = semanticLabelText(
          translateLabel(definition?.vname || definition?.label),
        );
        const elementTag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || elementTag;
        const relationshipField = resolvedFieldType === 'relate';
        const relationshipQuery =
          relationshipField &&
          ['input', 'textarea'].includes(elementTag) &&
          (element.classList.contains('p-dropdown-filter') ||
            element.classList.contains('p-autocomplete-input') ||
            element.hasAttribute('aria-autocomplete'));
        const relationshipOption = relationshipField && role === 'option';
        const relationshipCombobox =
          relationshipField && role === 'combobox' && elementTag !== 'select';
        const labelCandidates = [
          element.getAttribute('aria-label'),
          explicitLabel?.textContent,
          element.closest('label')?.textContent,
          ...(role === 'option'
            ? [element.textContent, authoritativeLabel]
            : [
                authoritativeLabel,
                element.getAttribute('placeholder'),
                element.textContent,
              ]),
          humanizeFieldName(fieldName),
          element.getAttribute('title'),
        ];
        const label = semanticLabelText(...labelCandidates);
        const options =
          elementTag === 'select'
            ? [...element.options].map((option) => ({
                label: semanticLabelText(
                  option.label,
                  option.textContent,
                  option.value,
                ),
                value: String(option.value).slice(0, MAX_ATTRIBUTE_LENGTH),
                actionArgument: String(option.value).slice(
                  0,
                  MAX_ATTRIBUTE_LENGTH,
                ),
              }))
            : [];
        const operations = [];
        if (['input', 'textarea'].includes(elementTag)) {
          operations.push(
            relationshipQuery ? 'ui.choice.query' : 'ui.field.set',
          );
        }
        if (elementTag === 'select') operations.push('ui.selection.change');
        if (role === 'combobox' && elementTag !== 'select')
          operations.push('ui.choice.open');
        if (
          ['a', 'button'].includes(elementTag) ||
          ['link', 'menuitem', 'option', 'tab'].includes(role)
        )
          operations.push('ui.activate');
        const commitLike =
          operations.includes('ui.activate') &&
          /^(save|submit|create|update|confirm|apply)(\b|\s|$)/iu.test(label);
        const relationshipChoice =
          relationshipQuery || relationshipOption || relationshipCombobox;
        const relationshipValueState = relationshipQuery
          ? 'query'
          : relationshipOption
            ? 'candidate'
            : relationshipCombobox
              ? 'unselected'
              : null;
        const rawCurrentValue =
          fieldName &&
          (['input', 'select', 'textarea'].includes(elementTag) ||
            role === 'combobox')
            ? boundedValue(
                fieldName,
                firstText(
                  element.value,
                  element.getAttribute('aria-valuetext'),
                  element.textContent,
                ),
              )
            : null;
        const currentValue =
          relationshipQuery || relationshipOption
            ? null
            : relationshipCombobox && relationshipPlaceholder(rawCurrentValue)
              ? null
              : rawCurrentValue;
        const priorityClass =
          operations.includes('ui.field.set') ||
          operations.includes('ui.selection.change') ||
          operations.includes('ui.choice.open') ||
          relationshipChoice
            ? 'editable-field'
            : commitLike
              ? 'commit'
              : role === 'tab'
                ? 'surface-route'
                : operations.length > 0
                  ? 'action'
                  : 'context';
        return {
          documentOrder,
          targetId: String(element.getAttribute('bid')),
          elementTag,
          role,
          label,
          labelSource: authoritativeLabel
            ? 'application-field-definition-and-live-anchor'
            : 'live-ui-anchor',
          href: element.getAttribute('href') || null,
          fieldName,
          fieldType: resolvedFieldType,
          fieldMode: semanticFieldMode,
          inputType: element.getAttribute('type') || null,
          required: Boolean(definition?.required || element.required),
          readonly: Boolean(definition?.readonly || element.readOnly),
          currentValue,
          queryValue: relationshipQuery ? rawCurrentValue : null,
          relationshipValueState:
            relationshipCombobox && currentValue
              ? 'selected'
              : relationshipValueState,
          options: options.slice(0, 100),
          operations,
          priorityClass,
        };
      })
      .filter(
        (binding) =>
          binding.operations.length > 0 &&
          binding.label.length > 0 &&
          !(
            binding.role === 'option' &&
            /^(?:empty|no (?:matching )?(?:items|options|results))$/iu.test(
              binding.label,
            )
          ),
      )
      .sort((left, right) => {
        const ranks = {
          'editable-field': 0,
          commit: 1,
          'surface-route': 2,
          action: 3,
          context: 4,
        };
        return (
          ranks[left.priorityClass] - ranks[right.priorityClass] ||
          left.documentOrder - right.documentOrder
        );
      })
      .slice(0, 100)
      .map((binding) => {
        const output = { ...binding };
        delete output.documentOrder;
        return output;
      });
  };

  const buildSnapshot = () => {
    const moduleName = currentModule();
    const relationshipSurface = `${moduleName}:${globalThis.location.hash.split('?')[0]}`;
    if (state.relationshipSurface !== relationshipSurface) {
      state.relationshipSurface = relationshipSurface;
      state.pendingRelationshipFields.clear();
      state.relationshipCandidateBindings.clear();
      state.relationshipCandidateActivations.clear();
    }
    const responses = responsesForModule(moduleName);
    let bindings = interactionBindings();
    if (responses.length === 0) {
      return {
        origin: 'application-runtime',
        adapterId: ADAPTER_ID,
        adapterDigest: ADAPTER_DIGEST,
        application: 'suitecrm',
        applicationVersion: '8.8.1',
        authorityManifestDigest: AUTHORITY_MANIFEST_DIGEST,
        authorityFacts: [],
        interactionBindings: bindings,
        quality: {
          bindingCount: bindings.length,
          blankLabelCount: bindings.filter((binding) => !binding.label).length,
          opaqueLocalizationLabelCount: bindings.filter((binding) =>
            opaqueLocalizationLabel(binding.label),
          ).length,
          duplicateTargetCount:
            bindings.length -
            new Set(bindings.map((binding) => binding.targetId)).size,
          relationshipChoiceBindingCount: 0,
          relationshipQueryBindingCount: 0,
          relationshipCandidateBindingCount: 0,
          relationshipSelectedValueBindingCount: 0,
          relationshipUnresolvedBindingCount: 0,
          pendingRelationshipSelectionCount: 0,
          hiddenPendingRelationshipSelectionCount: 0,
          ambiguousRelationshipValueCount: 0,
          nonActionableBindingCount: bindings.filter(
            (binding) => binding.operations.length === 0,
          ).length,
          editableControlCount: 0,
          typedEditableControlCount: 0,
          editableFieldCoverage: 1,
          commitBindingCount: 0,
          blockedCommitBindingCount: 0,
          relevantModuleCount: 0,
          layoutFieldCount: 0,
          reachableLayoutFieldCoverage: 1,
          recordAttributeWithoutUiRouteCount: 0,
          recordAttributesWithoutUiRoute: [],
        },
        capsule: {
          v: '0.2-draft',
          id: `suitecrm.${cleanIdentifier(moduleName, 'unknown')}.unbound`,
          at: {
            surface: `suitecrm:${cleanIdentifier(moduleName, 'unknown')}`,
            revision: `${ADAPTER_ID}:unbound`,
          },
          description: null,
          can: [],
          problem: {
            code: 'no-description',
            message:
              'No successful authoritative application response is bound to the current module.',
            retryable: true,
          },
        },
        taskSpecificInputsExcluded: true,
        goldAccess: false,
      };
    }

    const recordObjects = responses
      .flatMap((response) =>
        findObjects(
          response.payload,
          (candidate) =>
            typeof candidate.id === 'string' &&
            typeof candidate.module === 'string' &&
            candidate.attributes &&
            typeof candidate.attributes === 'object',
          [],
        ),
      )
      .filter((record) => record.module.toLowerCase() === moduleName)
      .filter(
        (record, index, all) =>
          all.findIndex((candidate) => candidate.id === record.id) === index,
      )
      .slice(0, MAX_RECORDS);
    const listObjects = responses.flatMap((response) =>
      findObjects(
        response.payload,
        (candidate) =>
          candidate.meta?.offsets && Array.isArray(candidate.records),
        [],
      ),
    );
    const navigationObjects = responses.flatMap((response) =>
      findObjects(
        response.payload,
        (candidate) =>
          candidate.modules &&
          typeof candidate.modules === 'object' &&
          !Array.isArray(candidate.modules),
        [],
      ),
    );
    const visibleFieldNames = new Set(
      bindings.map((binding) => binding.fieldName).filter(Boolean),
    );
    const metadataCandidates = responses
      .flatMap((response) =>
        findObjects(
          response.payload,
          (candidate) =>
            candidate.recordView?.vardefs &&
            !Array.isArray(candidate.recordView.vardefs) &&
            typeof candidate.recordView.vardefs === 'object',
          [],
        ).map((candidate) => ({ candidate, response })),
      )
      .map(({ candidate, response }) => ({
        candidate,
        score:
          1000 *
            Number(
              [candidate.id, candidate._id]
                .filter(Boolean)
                .some((identity) =>
                  String(identity).toLowerCase().includes(moduleName),
                ),
            ) +
          100 * Number(response.module === moduleName) +
          [...visibleFieldNames].filter(
            (fieldName) => candidate.recordView.vardefs[fieldName],
          ).length,
      }))
      .sort((left, right) => right.score - left.score);
    const vardefs = metadataCandidates[0]?.candidate?.recordView?.vardefs || {};
    const recordViewPanels =
      metadataCandidates[0]?.candidate?.recordView?.panels || [];
    const translationObjects = responses.flatMap((response) =>
      findObjects(
        response.payload,
        (candidate) =>
          candidate.items &&
          typeof candidate.items === 'object' &&
          !Array.isArray(candidate.items),
        [],
      ),
    );
    const translate = (key) => {
      if (!key) return null;
      const variants = [
        String(key),
        String(key).toUpperCase(),
        String(key).toLowerCase(),
      ];
      for (const candidate of translationObjects) {
        for (const variant of variants) {
          if (typeof candidate.items[variant] === 'string') {
            return opaqueLocalizationLabel(candidate.items[variant])
              ? null
              : candidate.items[variant];
          }
        }
      }
      return opaqueLocalizationLabel(key) ? null : key;
    };
    bindings = interactionBindings(vardefs, translate);
    const relationshipBindingsByField = new Map();
    const candidateBindings = new Map();
    for (const binding of bindings) {
      if (!binding.fieldName || !binding.relationshipValueState) continue;
      const fieldBindings =
        relationshipBindingsByField.get(binding.fieldName) || [];
      fieldBindings.push(binding);
      relationshipBindingsByField.set(binding.fieldName, fieldBindings);
      if (
        binding.relationshipValueState === 'candidate' &&
        binding.operations.includes('ui.activate')
      ) {
        candidateBindings.set(binding.targetId, {
          fieldName: binding.fieldName,
          label: binding.label,
        });
      }
    }
    state.relationshipCandidateBindings = candidateBindings;
    for (const [fieldName, fieldBindings] of relationshipBindingsByField) {
      const selectedBinding = fieldBindings.find(
        (binding) => binding.relationshipValueState === 'selected',
      );
      const queryBinding = fieldBindings.find(
        (binding) => binding.relationshipValueState === 'query',
      );
      const selectedValue = firstText(selectedBinding?.currentValue);
      const queryValue = firstText(queryBinding?.queryValue);
      let pending = state.pendingRelationshipFields.get(fieldName);
      if (queryBinding && queryValue) {
        if (!pending) {
          pending = {
            baselineSelectedValue: selectedValue,
            queryValue,
            startedAt: Date.now(),
          };
          state.pendingRelationshipFields.set(fieldName, pending);
          state.relationshipCandidateActivations.delete(fieldName);
        } else {
          pending.queryValue = queryValue;
        }
      } else if (queryBinding && pending && !queryValue) {
        state.pendingRelationshipFields.delete(fieldName);
        state.relationshipCandidateActivations.delete(fieldName);
        pending = null;
      }
      if (pending && selectedValue) {
        const selectionChanged =
          normalizedIdentity(selectedValue) !==
          normalizedIdentity(pending.baselineSelectedValue);
        const activation =
          state.relationshipCandidateActivations.get(fieldName);
        if (
          selectionChanged ||
          activationMatchesSelection(activation, selectedValue)
        ) {
          state.pendingRelationshipFields.delete(fieldName);
          state.relationshipCandidateActivations.delete(fieldName);
        }
      }
    }
    bindings = bindings.map((binding) =>
      binding.fieldName &&
      state.pendingRelationshipFields.has(binding.fieldName) &&
      binding.relationshipValueState === 'unselected'
        ? { ...binding, relationshipValueState: 'unresolved' }
        : binding,
    );
    const unresolvedRelationshipFields = [
      ...state.pendingRelationshipFields.keys(),
    ];
    const blockedCommitBindings =
      unresolvedRelationshipFields.length > 0
        ? bindings.filter(commitBinding)
        : [];
    if (blockedCommitBindings.length > 0) {
      bindings = bindings.filter((binding) => !commitBinding(binding));
    }
    const authorityFacts = [
      authorityFact('module.current', moduleName, [
        'suitecrm.module-domain',
        'suitecrm.graphql-live-state',
      ]),
    ];
    const recordFrames = [];
    const capabilities = new Set(['crm.read']);
    const fieldDefinitionItems = [];
    const layoutFieldItems = [];
    const layoutByField = new Map();
    for (const panel of recordViewPanels) {
      const panelKey = String(panel.key || 'unnamed-panel');
      const panelLabel = translate(panelKey);
      for (const row of Array.isArray(panel.rows) ? panel.rows : []) {
        for (const column of Array.isArray(row.cols) ? row.cols : []) {
          if (!column || typeof column.name !== 'string') continue;
          const publicLayoutField = {
            panelKey,
            panelLabel,
            field: column.name,
            label: translate(column.label || column.fieldDefinition?.vname),
            type: column.type || column.fieldDefinition?.type || null,
            required: Boolean(column.fieldDefinition?.required),
            readonly: Boolean(column.readonly),
            relatedModule: column.fieldDefinition?.module || null,
            options: column.fieldDefinition?.options || null,
          };
          authorityFacts.push(
            authorityFact(
              `module.layout.${cleanIdentifier(panelKey, 'panel')}.${column.name}`,
              publicLayoutField,
              [
                'suitecrm.field-definitions',
                'suitecrm.module-domain',
                'suitecrm.graphql-live-state',
              ],
            ),
          );
          layoutFieldItems.push(
            JSON.stringify(publicLayoutField).slice(0, MAX_ATTRIBUTE_LENGTH),
          );
          const fieldPanels = layoutByField.get(column.name) ?? [];
          fieldPanels.push({ panelKey, panelLabel });
          layoutByField.set(column.name, fieldPanels);
          if (layoutFieldItems.length >= 100) break;
        }
        if (layoutFieldItems.length >= 100) break;
      }
      if (layoutFieldItems.length >= 100) break;
    }
    for (const fieldName of [...visibleFieldNames].sort()) {
      const definition = vardefs[fieldName];
      if (!definition || typeof definition !== 'object') continue;
      const publicDefinition = Object.fromEntries(
        [
          'name',
          'type',
          'vname',
          'required',
          'options',
          'module',
          'rname',
          'id_name',
          'source',
          'readonly',
        ]
          .filter((key) => definition[key] !== undefined)
          .map((key) => [key, boundedValue(key, definition[key])]),
      );
      authorityFacts.push(
        authorityFact(
          `module.fields.${fieldName}.definition`,
          publicDefinition,
          [
            'suitecrm.field-definitions',
            'suitecrm.module-domain',
            'suitecrm.graphql-live-state',
          ],
        ),
      );
      fieldDefinitionItems.push(
        `${fieldName}=${JSON.stringify(publicDefinition)}`.slice(
          0,
          MAX_ATTRIBUTE_LENGTH,
        ),
      );
    }
    const recordAttributeNames = new Set(
      recordObjects.flatMap((record) => Object.keys(record.attributes || {})),
    );
    const inventoryFieldNames = [
      ...new Set([
        ...layoutByField.keys(),
        ...visibleFieldNames,
        ...recordAttributeNames,
      ]),
    ]
      .filter((fieldName) => vardefs[fieldName])
      .sort((left, right) => {
        const rank = (fieldName) =>
          visibleFieldNames.has(fieldName)
            ? 0
            : layoutByField.has(fieldName)
              ? 1
              : recordAttributeNames.has(fieldName)
                ? 2
                : 3;
        return rank(left) - rank(right) || left.localeCompare(right);
      })
      .slice(0, 100);
    const visibleNavigationText = [
      ...globalThis.document.querySelectorAll('a[bid]'),
    ]
      .map((element) =>
        `${element.textContent || ''} ${element.getAttribute('href') || ''}`.toLowerCase(),
      )
      .join(' ');
    const availableModules = Object.keys(navigationObjects[0]?.modules || {})
      .filter((module) =>
        visibleNavigationText.includes(String(module).toLowerCase()),
      )
      .sort();
    for (const availableModule of availableModules) {
      authorityFacts.push(
        authorityFact(`navigation.module.${availableModule}`, true, [
          'suitecrm.module-domain',
          'suitecrm.graphql-live-state',
        ]),
      );
    }

    const emittedFormFields = new Set();
    for (const binding of bindings) {
      if (!binding.fieldName || binding.currentValue === null) continue;
      if (emittedFormFields.has(binding.fieldName)) continue;
      emittedFormFields.add(binding.fieldName);
      authorityFacts.push(
        authorityFact(
          `form.fields.${cleanIdentifier(binding.fieldName, 'field')}.current-value`,
          binding.currentValue,
          ['suitecrm.angular-field-binding'],
        ),
      );
    }

    for (const record of recordObjects.slice(0, MAX_RECORDS)) {
      const recordId = cleanIdentifier(record.id, 'unknown-record');
      authorityFacts.push(
        authorityFact(`record.${recordId}.canonical-id`, record.id, [
          'suitecrm.api-v8',
          'suitecrm.graphql-live-state',
        ]),
      );
      authorityFacts.push(
        authorityFact(`record.${recordId}.type`, record.type || record.module, [
          'suitecrm.module-domain',
          'suitecrm.graphql-live-state',
        ]),
      );
      const roleAttributes = [];
      for (const [field, rawValue] of Object.entries(record.attributes || {})) {
        const value = boundedValue(field, rawValue);
        authorityFacts.push(
          authorityFact(`record.${recordId}.attributes.${field}`, value, [
            'suitecrm.field-definitions',
            'suitecrm.api-v8',
            'suitecrm.graphql-live-state',
          ]),
        );
        roleAttributes.push(
          `${field}=${JSON.stringify(value)}`.slice(0, MAX_ATTRIBUTE_LENGTH),
        );
      }
      for (const acl of Array.isArray(record.acls) ? record.acls : []) {
        const action = String(
          acl.action || acl.name || acl.key || '',
        ).toLowerCase();
        const allowed = Boolean(acl.access ?? acl.allowed ?? acl.value);
        if (!action) continue;
        authorityFacts.push(
          authorityFact(
            `record.${recordId}.acl.${cleanIdentifier(action, 'unknown')}`,
            allowed,
            ['suitecrm.graphql-live-state'],
          ),
        );
        if (allowed) capabilities.add(`crm.${cleanIdentifier(action, 'act')}`);
      }
      recordFrames.push({
        kind: 'frame',
        value: {
          type: 'crm.record',
          subject: {
            kind: 'entity',
            ref: `suitecrm:${cleanIdentifier(moduleName, 'module')}:${recordId}`,
            type: `crm.${cleanIdentifier(moduleName.replace(/s$/u, ''), 'record')}`,
            label: String(
              record.attributes?.name?.value ??
                record.attributes?.name ??
                record.id,
            ).slice(0, 1024),
          },
          roles: {
            module: moduleName,
            attributes: {
              kind: 'collection',
              items: roleAttributes.slice(0, 100),
            },
          },
        },
      });
    }
    const offsets = listObjects[0]?.meta?.offsets;
    if (offsets && typeof offsets === 'object') {
      for (const [name, value] of Object.entries(offsets)) {
        if (['boolean', 'number', 'string'].includes(typeof value)) {
          authorityFacts.push(
            authorityFact(`collection.pagination.${name}`, value, [
              'suitecrm.api-v8',
              'suitecrm.graphql-live-state',
            ]),
          );
        }
      }
    }

    const revision = `${ADAPTER_ID}:${responses[responses.length - 1].capturedAt}`;
    const bindingItems = bindings.map((binding) =>
      [
        `targetId=${binding.targetId}`,
        `role=${binding.role}`,
        `elementTag=${binding.elementTag}`,
        `label=${JSON.stringify(binding.label)}`,
        binding.href ? `href=${binding.href}` : null,
        binding.fieldName ? `fieldName=${binding.fieldName}` : null,
        binding.fieldType ? `fieldType=${binding.fieldType}` : null,
        binding.fieldMode ? `fieldMode=${binding.fieldMode}` : null,
        binding.inputType ? `inputType=${binding.inputType}` : null,
        binding.currentValue !== null
          ? `currentValue=${JSON.stringify(binding.currentValue)}`
          : null,
        binding.queryValue !== null
          ? `queryValue=${JSON.stringify(binding.queryValue)}`
          : null,
        binding.relationshipValueState
          ? `relationshipValueState=${binding.relationshipValueState}`
          : null,
        binding.options.length
          ? `selectionArguments=${binding.options
              .map(
                (option) =>
                  `${JSON.stringify(option.label)}=>${JSON.stringify(option.actionArgument)}`,
              )
              .join('|')}`
          : null,
        `priorityClass=${binding.priorityClass}`,
        binding.operations.length
          ? `operations=${binding.operations.join(',')}`
          : null,
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, MAX_ATTRIBUTE_LENGTH),
    );
    const commitBindings = bindings.filter(commitBinding);
    const controlFrames = bindings.map((binding) => ({
      kind: 'frame',
      value: {
        type: 'crm.control-binding',
        subject: {
          kind: 'entity',
          ref: `suitecrm:control:${cleanIdentifier(binding.targetId, 'target')}`,
          type: 'ui.control',
          label: binding.label,
        },
        roles: {
          targetId: binding.targetId,
          uiRole: binding.role,
          elementTag: binding.elementTag,
          operations: {
            kind: 'collection',
            items: binding.operations,
          },
          ...(binding.fieldName
            ? {
                fieldName: binding.fieldName,
                fieldType: binding.fieldType || 'unknown',
                fieldMode: binding.fieldMode || 'unknown',
                required: binding.required,
                readonly: binding.readonly,
                currentValue: binding.currentValue,
                ...(binding.queryValue !== null
                  ? { queryValue: binding.queryValue }
                  : {}),
                ...(binding.relationshipValueState
                  ? {
                      relationshipValueState: binding.relationshipValueState,
                      selectionConfirmed:
                        binding.relationshipValueState === 'selected',
                      selectionPending: ['query', 'unresolved'].includes(
                        binding.relationshipValueState,
                      ),
                      selectionRequirement:
                        'Query text is not the business-field value. Activate the canonical live candidate binding and verify a post-query selected-identity transition before commit; a pre-query selected value is not completion evidence, pending state survives local visibility changes, and non-actionable option descendants are context only.',
                    }
                  : {}),
                allowedValues: {
                  kind: 'collection',
                  items: binding.options.map(
                    (option) =>
                      `semanticLabel=${JSON.stringify(option.label)} exactActionArgument=${JSON.stringify(option.actionArgument)}`,
                  ),
                },
                ...(binding.options.length > 0
                  ? {
                      choiceExecutionContract:
                        'Pass exactActionArgument unchanged; do not shorten, normalize, or substitute the semantic label.',
                    }
                  : {}),
                compatibleCommits: {
                  kind: 'collection',
                  items: ['query', 'unselected', 'unresolved'].includes(
                    binding.relationshipValueState,
                  )
                    ? []
                    : commitBindings.map((commit) => commit.targetId),
                },
                ...(binding.currentValue !== null
                  ? {
                      verificationFactKey: `form.fields.${cleanIdentifier(binding.fieldName, 'field')}.current-value`,
                    }
                  : {}),
              }
            : {}),
        },
      },
    }));
    for (const binding of bindings) {
      for (const operation of binding.operations) capabilities.add(operation);
    }
    if (commitBindings.length > 0) capabilities.add('crm.record.commit');
    const tabBindings = bindings.filter(
      (binding) =>
        binding.role === 'tab' && binding.operations.includes('ui.activate'),
    );
    const panelRoute = (panel) =>
      tabBindings.find(
        (binding) =>
          firstText(binding.label).toLocaleLowerCase('en-US') ===
          firstText(panel.panelLabel, panel.panelKey).toLocaleLowerCase(
            'en-US',
          ),
      ) || null;
    const fieldInventoryItems = inventoryFieldNames.map((fieldName) => {
      const definition = vardefs[fieldName];
      const panels = layoutByField.get(fieldName) ?? [];
      const liveBindings = bindings.filter(
        (binding) => binding.fieldName === fieldName,
      );
      const reachablePanels = panels.map((panel) => ({
        ...panel,
        activationTargetId: panelRoute(panel)?.targetId ?? null,
      }));
      return JSON.stringify({
        field: fieldName,
        label: translate(definition.vname || definition.label || fieldName),
        type: definition.type || null,
        schemaPresent: true,
        recordAttributePresent: recordAttributeNames.has(fieldName),
        layoutReachable: panels.length > 0,
        liveBindingPresent: liveBindings.length > 0,
        liveTargetIds: liveBindings.map((binding) => binding.targetId),
        panels: reachablePanels,
      }).slice(0, MAX_ATTRIBUTE_LENGTH);
    });
    const fieldRouteItems = [...layoutByField.entries()]
      .map(([fieldName, panels]) => ({
        field: fieldName,
        liveTargetIds: bindings
          .filter((binding) => binding.fieldName === fieldName)
          .map((binding) => binding.targetId),
        panels: panels.map((panel) => ({
          ...panel,
          activationTargetId: panelRoute(panel)?.targetId ?? null,
        })),
      }))
      .slice(0, 100);
    const capsuleRoles = {
      module: moduleName,
      availableModules: {
        kind: 'collection',
        items: availableModules.slice(0, 100),
      },
      records: { kind: 'collection', items: recordFrames },
      interactionBindings: {
        kind: 'collection',
        items: bindingItems,
      },
      controls: {
        kind: 'collection',
        items: controlFrames,
      },
      fieldInventory: {
        kind: 'collection',
        items: fieldInventoryItems,
      },
      fieldRoutes: {
        kind: 'collection',
        items: fieldRouteItems.map((route) =>
          JSON.stringify(route).slice(0, MAX_ATTRIBUTE_LENGTH),
        ),
      },
      pendingRelationshipSelections: {
        kind: 'collection',
        items: unresolvedRelationshipFields,
      },
      blockedCommits: {
        kind: 'collection',
        items: blockedCommitBindings.map((binding) =>
          JSON.stringify({
            label: binding.label,
            reason: 'relationship-selection-unresolved',
            blockingFields: unresolvedRelationshipFields,
          }).slice(0, MAX_ATTRIBUTE_LENGTH),
        ),
      },
    };
    if (fieldDefinitionItems.length > 0) {
      capsuleRoles.fieldDefinitions = {
        kind: 'collection',
        items: fieldDefinitionItems.slice(0, 100),
      };
    }
    if (layoutFieldItems.length > 0) {
      capsuleRoles.layoutFields = {
        kind: 'collection',
        items: layoutFieldItems,
      };
    }
    const targetIds = bindings.map((binding) => binding.targetId);
    const editableControls = bindings.filter(
      (binding) =>
        binding.operations.includes('ui.field.set') ||
        binding.operations.includes('ui.selection.change') ||
        binding.operations.includes('ui.choice.open') ||
        binding.operations.includes('ui.choice.query') ||
        (binding.role === 'option' && binding.fieldName),
    );
    const reachableLayoutFields = fieldRouteItems.filter(
      (route) =>
        route.liveTargetIds.length > 0 ||
        route.panels.some((panel) => panel.activationTargetId),
    );
    const recordAttributesWithoutUiRoute = inventoryFieldNames.filter(
      (fieldName) =>
        recordAttributeNames.has(fieldName) &&
        !layoutByField.has(fieldName) &&
        !bindings.some((binding) => binding.fieldName === fieldName),
    );
    const quality = {
      bindingCount: bindings.length,
      blankLabelCount: bindings.filter((binding) => !binding.label).length,
      opaqueLocalizationLabelCount: bindings.filter((binding) =>
        opaqueLocalizationLabel(binding.label),
      ).length,
      duplicateTargetCount: targetIds.length - new Set(targetIds).size,
      relationshipChoiceBindingCount: bindings.filter(
        (binding) => binding.relationshipValueState,
      ).length,
      relationshipQueryBindingCount: bindings.filter(
        (binding) => binding.relationshipValueState === 'query',
      ).length,
      relationshipCandidateBindingCount: bindings.filter(
        (binding) => binding.relationshipValueState === 'candidate',
      ).length,
      relationshipSelectedValueBindingCount: bindings.filter(
        (binding) => binding.relationshipValueState === 'selected',
      ).length,
      relationshipUnresolvedBindingCount: bindings.filter(
        (binding) => binding.relationshipValueState === 'unresolved',
      ).length,
      pendingRelationshipSelectionCount: unresolvedRelationshipFields.length,
      hiddenPendingRelationshipSelectionCount:
        unresolvedRelationshipFields.filter(
          (fieldName) =>
            !bindings.some((binding) => binding.fieldName === fieldName),
        ).length,
      ambiguousRelationshipValueCount: bindings.filter(
        (binding) =>
          ['candidate', 'query'].includes(binding.relationshipValueState) &&
          binding.currentValue !== null,
      ).length,
      nonActionableBindingCount: bindings.filter(
        (binding) => binding.operations.length === 0,
      ).length,
      editableControlCount: editableControls.length,
      typedEditableControlCount: editableControls.filter(
        (binding) => binding.fieldName && binding.fieldType,
      ).length,
      editableFieldCoverage:
        editableControls.length === 0
          ? 1
          : editableControls.filter(
              (binding) => binding.fieldName && binding.fieldType,
            ).length / editableControls.length,
      commitBindingCount: commitBindings.length,
      blockedCommitBindingCount: blockedCommitBindings.length,
      relevantModuleCount: availableModules.length,
      layoutFieldCount: fieldRouteItems.length,
      reachableLayoutFieldCoverage:
        fieldRouteItems.length === 0
          ? 1
          : reachableLayoutFields.length / fieldRouteItems.length,
      recordAttributeWithoutUiRouteCount: recordAttributesWithoutUiRoute.length,
      recordAttributesWithoutUiRoute: recordAttributesWithoutUiRoute,
    };
    return {
      origin: 'application-runtime',
      adapterId: ADAPTER_ID,
      adapterDigest: ADAPTER_DIGEST,
      application: 'suitecrm',
      applicationVersion: '8.8.1',
      authorityManifestDigest: AUTHORITY_MANIFEST_DIGEST,
      authorityFacts,
      interactionBindings: bindings,
      quality,
      capsule: {
        v: '0.2-draft',
        id: `suitecrm.${cleanIdentifier(moduleName, 'module')}.current`,
        at: {
          surface: `suitecrm:${cleanIdentifier(moduleName, 'module')}`,
          revision,
        },
        description: {
          profile: 'crm.module-state',
          summary: `Authoritative ${moduleName} state from SuiteCRM runtime: ${recordFrames.length} records returned to the current page.`,
          frame: {
            type: 'crm.module-state',
            subject: {
              kind: 'entity',
              ref: `suitecrm:${cleanIdentifier(moduleName, 'module')}`,
              type: 'crm.module',
              label: moduleName,
            },
            roles: capsuleRoles,
          },
        },
        can: [...capabilities].sort(),
      },
      taskSpecificInputsExcluded: true,
      goldAccess: false,
    };
  };

  Object.defineProperty(globalThis, '__UGP_EXPERIMENT_BRIDGE__', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ snapshot: async () => plainClone(buildSnapshot()) }),
  });
})();
