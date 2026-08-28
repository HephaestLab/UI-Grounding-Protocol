import {
  SemanticDescriptionRegistry,
  type ProfileDefinition,
} from '@ui-grounding/authoring';
import {
  ContextRegistry,
  SemanticRegistry,
  type RegistrySnapshot,
} from '@ui-grounding/core';
import { DomAnchorRegistry } from '@ui-grounding/dom';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface GroundingRuntime {
  registry: SemanticRegistry;
  contextRegistry: ContextRegistry;
  descriptionRegistry: SemanticDescriptionRegistry;
  domRegistry?: DomAnchorRegistry;
  hydrated: boolean;
}

const RuntimeContext = createContext<GroundingRuntime | undefined>(undefined);

export interface GroundingSurfaceProviderProps {
  surfaceId: string;
  surfaceRevision: string;
  profiles?: readonly ProfileDefinition[];
  children?: ReactNode;
}

export function GroundingSurfaceProvider(
  props: GroundingSurfaceProviderProps,
): ReturnType<typeof createElement> {
  const [runtime] = useState(() => {
    const registry = new SemanticRegistry({
      surfaceId: props.surfaceId,
      surfaceRevision: props.surfaceRevision,
    });
    return {
      registry,
      contextRegistry: new ContextRegistry(),
      descriptionRegistry: new SemanticDescriptionRegistry(props.profiles),
      ...(typeof window === 'undefined'
        ? {}
        : { domRegistry: new DomAnchorRegistry({ registry }) }),
    };
  });
  const [hydrated, setHydrated] = useState(false);
  const lifecycle = useRef(0);

  useEffect(() => {
    lifecycle.current += 1;
    const generation = lifecycle.current;
    setHydrated(true);
    return () => {
      setHydrated(false);
      queueMicrotask(() => {
        if (lifecycle.current !== generation) return;
        runtime.domRegistry?.dispose();
        runtime.descriptionRegistry.dispose();
        runtime.contextRegistry.dispose();
        runtime.registry.dispose();
      });
    };
  }, [runtime]);

  useEffect(() => {
    if (hydrated) runtime.registry.setSurfaceRevision(props.surfaceRevision);
  }, [hydrated, props.surfaceRevision, runtime.registry]);

  return createElement(
    RuntimeContext.Provider,
    { value: { ...runtime, hydrated } },
    props.children,
  );
}

export function useGroundingRuntime(): GroundingRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error('UGP hooks require GroundingSurfaceProvider');
  }
  return runtime;
}

export const emptySnapshot: RegistrySnapshot = Object.freeze({
  surfaceId: '',
  surfaceRevision: '',
  semanticRevision: 0,
  nodes: Object.freeze([]),
  anchors: Object.freeze([]),
});
