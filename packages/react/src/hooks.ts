import type {
  ContextMaterializer,
  ContextRegistrationOptions,
  RegistrySnapshot,
  Registration,
} from '@ui-grounding/core';
import type {
  DomAnchorOptions,
  DomAnchorRegistration,
} from '@ui-grounding/dom';
import type { SemanticNode } from '@ui-grounding/protocol';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefCallback,
} from 'react';

import { emptySnapshot, useGroundingRuntime } from './context.js';

type ContextDescriptor = NonNullable<
  SemanticNode['contextDescriptors']
>[number];

export interface GroundingContextProvider {
  descriptor: ContextDescriptor;
  materialize: ContextMaterializer;
  options?: ContextRegistrationOptions;
}

export interface UseGroundingNodeOptions {
  anchor?: DomAnchorOptions;
  contexts?: readonly GroundingContextProvider[];
}

export interface GroundingNodeBinding<T extends Element> {
  ref: RefCallback<T>;
  nodeId: string;
}

export function useGroundingSnapshot(): RegistrySnapshot {
  const { registry } = useGroundingRuntime();
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    () => emptySnapshot,
  );
}

export function useGroundingNode<T extends Element = HTMLElement>(
  node: SemanticNode,
  options: UseGroundingNodeOptions = {},
): GroundingNodeBinding<T> {
  const runtime = useGroundingRuntime();
  const latestNode = useRef(node);
  const latestAnchor = useRef(options.anchor);
  const latestContexts = useRef(options.contexts ?? []);
  const nodeHandle = useRef<Registration<SemanticNode> | undefined>(undefined);
  const [element, setElement] = useState<T | null>(null);
  const anchorHandle = useRef<DomAnchorRegistration | undefined>(undefined);
  latestNode.current = node;
  latestAnchor.current = options.anchor;
  latestContexts.current = options.contexts ?? [];
  const nodeKey = JSON.stringify(node);
  const anchorKey = JSON.stringify({
    anchorId: options.anchor?.anchorId,
    priority: options.anchor?.priority,
    detectOcclusion: options.anchor?.detectOcclusion,
  });

  useEffect(() => {
    if (!runtime.hydrated) return;
    const handle = runtime.registry.registerNode(latestNode.current);
    nodeHandle.current = handle;
    return () => {
      nodeHandle.current = undefined;
      handle.dispose();
    };
  }, [node.nodeId, runtime.hydrated, runtime.registry]);

  useEffect(() => {
    nodeHandle.current?.update(latestNode.current);
  }, [nodeKey]);

  const contextKey = JSON.stringify(
    (options.contexts ?? []).map((provider) => ({
      descriptor: provider.descriptor,
      nodeRevision: provider.options?.nodeRevision,
    })),
  );
  useEffect(() => {
    if (!runtime.hydrated) return;
    const disposals = latestContexts.current.map((provider) =>
      runtime.contextRegistry.register(
        node.nodeId,
        provider.descriptor,
        (request) => {
          const current = latestContexts.current.find(
            (item) => item.descriptor.name === provider.descriptor.name,
          );
          if (!current) throw new Error('Context provider was removed');
          return current.materialize(request);
        },
        provider.options,
      ),
    );
    return () => {
      for (const dispose of disposals) dispose();
    };
  }, [contextKey, node.nodeId, runtime.contextRegistry, runtime.hydrated]);

  const ref = useCallback<RefCallback<T>>((next) => {
    setElement(next);
  }, []);

  useEffect(() => {
    if (
      !element ||
      !nodeHandle.current ||
      !runtime.hydrated ||
      !runtime.domRegistry
    ) {
      return;
    }
    const handle = runtime.domRegistry.register(
      element,
      node.nodeId,
      latestAnchor.current,
    );
    anchorHandle.current = handle;
    return () => {
      if (anchorHandle.current === handle) anchorHandle.current = undefined;
      handle.dispose();
    };
  }, [
    element,
    anchorKey,
    node.nodeId,
    options.anchor?.signal,
    runtime.domRegistry,
    runtime.hydrated,
  ]);

  return { ref, nodeId: node.nodeId };
}
