import type { Selection as UGPSelection } from '@ui-grounding/protocol';

export type OverlayMode = 'point' | 'region' | 'text';

export interface SelectionOverlayOptions {
  surfaceId: string;
  surfaceRevision: () => string;
  mode?: OverlayMode;
  root?: Document | HTMLElement;
  minRegionSize?: number;
  onSelection(selection: UGPSelection): void;
  onCancel?(): void;
}

interface Position {
  x: number;
  y: number;
}

let selectionSequence = 0;

function nextSelectionId(): string {
  selectionSequence += 1;
  return `selection:${Date.now().toString(36)}:${selectionSequence.toString(36)}`;
}

function bounds(start: Position, end: Position) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function textRangeSelection(
  options: SelectionOverlayOptions,
): UGPSelection | undefined {
  const native = document.getSelection();
  if (!native || native.isCollapsed || native.rangeCount === 0)
    return undefined;
  const range = native.getRangeAt(0);
  const exact = native.toString();
  if (!exact) return undefined;
  const rects = [...range.getClientRects()];
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const geometry = {
    kind: 'rect' as const,
    coordinateSpace: 'viewport' as const,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  return {
    selectionId: nextSelectionId(),
    surfaceId: options.surfaceId,
    mode: 'text',
    selectors: [
      { type: 'TextQuoteSelector', exact },
      {
        type: 'RangeSelector',
        startPath: nodePath(range.startContainer),
        startOffset: range.startOffset,
        endPath: nodePath(range.endContainer),
        endOffset: range.endOffset,
      },
      { type: 'UGPGeometrySelector', geometry },
    ],
    geometry,
    surfaceRevision: options.surfaceRevision(),
    createdAt: new Date().toISOString(),
    source: 'human',
  };
}

function nodePath(node: Node): string {
  const parts: number[] = [];
  for (
    let current: Node | null = node;
    current?.parentNode;
    current = current.parentNode
  ) {
    parts.unshift(
      [...current.parentNode.childNodes].findIndex(
        (child) => child === current,
      ),
    );
  }
  return `/${parts.join('/')}`;
}

export class SelectionOverlay {
  readonly #options: SelectionOverlayOptions;
  readonly #root: Document | HTMLElement;
  readonly #visual: HTMLDivElement;
  #mode: OverlayMode;
  #start: Position | undefined;
  #pointerId: number | undefined;
  #disposed = false;

  constructor(options: SelectionOverlayOptions) {
    if (typeof document === 'undefined') {
      throw new Error('SelectionOverlay requires a browser document');
    }
    this.#options = options;
    this.#root = options.root ?? document;
    this.#mode = options.mode ?? 'point';
    this.#visual = document.createElement('div');
    this.#visual.className = 'ugp-selection-region';
    this.#visual.dataset.ugpOverlayUi = 'true';
    this.#visual.hidden = true;
    this.#visual.setAttribute('aria-hidden', 'true');
    document.body.append(this.#visual);
    this.#root.addEventListener(
      'pointerdown',
      this.#onPointerDown as EventListener,
    );
    this.#root.addEventListener(
      'pointermove',
      this.#onPointerMove as EventListener,
    );
    this.#root.addEventListener(
      'pointerup',
      this.#onPointerUp as EventListener,
    );
    document.addEventListener('keydown', this.#onKeyDown);
  }

  get mode(): OverlayMode {
    return this.#mode;
  }

  setMode(mode: OverlayMode): void {
    this.cancel();
    this.#mode = mode;
  }

  cancel(): void {
    this.#start = undefined;
    this.#pointerId = undefined;
    this.#visual.hidden = true;
    this.#options.onCancel?.();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#root.removeEventListener(
      'pointerdown',
      this.#onPointerDown as EventListener,
    );
    this.#root.removeEventListener(
      'pointermove',
      this.#onPointerMove as EventListener,
    );
    this.#root.removeEventListener(
      'pointerup',
      this.#onPointerUp as EventListener,
    );
    document.removeEventListener('keydown', this.#onKeyDown);
    this.#visual.remove();
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#mode === 'text') return;
    if ((event.target as Element | null)?.closest?.('[data-ugp-overlay-ui]'))
      return;
    this.#pointerId = event.pointerId;
    this.#start = { x: event.clientX, y: event.clientY };
    if (this.#mode === 'region') {
      this.#renderRegion(this.#start, this.#start);
      this.#visual.hidden = false;
    }
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    if (
      this.#mode !== 'region' ||
      !this.#start ||
      event.pointerId !== this.#pointerId
    ) {
      return;
    }
    this.#renderRegion(this.#start, { x: event.clientX, y: event.clientY });
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (this.#mode === 'text') {
      const selection = textRangeSelection(this.#options);
      if (selection) this.#options.onSelection(selection);
      return;
    }
    if (!this.#start || event.pointerId !== this.#pointerId) return;
    const start = this.#start;
    this.#start = undefined;
    this.#pointerId = undefined;
    this.#visual.hidden = true;
    if (this.#mode === 'point') {
      const geometry = {
        kind: 'point' as const,
        coordinateSpace: 'viewport' as const,
        x: event.clientX,
        y: event.clientY,
      };
      this.#emit('point', geometry);
      return;
    }
    const geometry = {
      kind: 'rect' as const,
      coordinateSpace: 'viewport' as const,
      ...bounds(start, { x: event.clientX, y: event.clientY }),
    };
    if (
      geometry.width < (this.#options.minRegionSize ?? 3) &&
      geometry.height < (this.#options.minRegionSize ?? 3)
    ) {
      return;
    }
    this.#emit('region', geometry);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.cancel();
  };

  #emit(
    mode: 'point' | 'region',
    geometry: NonNullable<UGPSelection['geometry']>,
  ): void {
    this.#options.onSelection({
      selectionId: nextSelectionId(),
      surfaceId: this.#options.surfaceId,
      mode,
      selectors: [{ type: 'UGPGeometrySelector', geometry }],
      geometry,
      surfaceRevision: this.#options.surfaceRevision(),
      createdAt: new Date().toISOString(),
      source: 'human',
    });
  }

  #renderRegion(start: Position, end: Position): void {
    const rect = bounds(start, end);
    Object.assign(this.#visual.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }
}
