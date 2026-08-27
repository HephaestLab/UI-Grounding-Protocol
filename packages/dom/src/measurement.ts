import type { Anchor } from '@ui-grounding/protocol';
import { clipRect, type Rect } from '@ui-grounding/core';

export interface DomMeasurement {
  geometry?: Extract<Anchor, { kind: 'dom' }>['geometry'];
  visibility: NonNullable<Anchor['visibility']>;
}

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function clips(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some((value) =>
    ['auto', 'clip', 'hidden', 'scroll'].includes(value),
  );
}

function clippingRects(element: Element): Rect[] {
  const output: Rect[] = [];
  for (
    let parent = composedParent(element);
    parent;
    parent = composedParent(parent)
  ) {
    const style = getComputedStyle(parent);
    if (clips(style)) {
      const rect = parent.getBoundingClientRect();
      output.push({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  output.push({ x: 0, y: 0, width: innerWidth, height: innerHeight });
  return output;
}

function unionClientRects(element: Element): Rect | undefined {
  const rects = [...element.getClientRects()].filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function isOccluded(element: Element, rect: Rect): boolean {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const hits = document.elementsFromPoint(x, y);
  if (hits.length === 0) return false;
  const top = hits[0]!;
  return top !== element && !element.contains(top);
}

export function measureDomElement(
  element: Element,
  options: { detectOcclusion?: boolean } = {},
): DomMeasurement {
  if (!element.isConnected) return { visibility: 'offscreen' };
  const style = getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) === 0
  ) {
    return { visibility: 'offscreen' };
  }
  const measured = unionClientRects(element);
  if (!measured) return { visibility: 'offscreen' };
  const visible = clipRect(measured, clippingRects(element));
  if (!visible || visible.width === 0 || visible.height === 0) {
    return { visibility: 'offscreen' };
  }
  const geometry = {
    kind: 'rect' as const,
    coordinateSpace: 'viewport' as const,
    x: visible.x,
    y: visible.y,
    width: visible.width,
    height: visible.height,
  };
  return {
    geometry,
    visibility:
      options.detectOcclusion !== false && isOccluded(element, visible)
        ? 'occluded'
        : 'visible',
  };
}

export function domPath(node: Node, root: Node = document): string {
  const parts: string[] = [];
  for (let current: Node | null = node; current && current !== root;) {
    const parent: Node | null = current.parentNode;
    if (!parent) {
      const currentRoot = current.getRootNode();
      if (currentRoot instanceof ShadowRoot) {
        parts.unshift('::shadow');
        current = currentRoot.host;
        continue;
      }
      break;
    }
    const index = [...parent.childNodes].findIndex(
      (child) => child === current,
    );
    parts.unshift(String(index));
    current = parent;
  }
  return `/${parts.join('/')}`;
}
