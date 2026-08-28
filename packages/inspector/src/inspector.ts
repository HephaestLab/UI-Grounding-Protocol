import type {
  GroundingCapsule,
  SemanticDescriptionRegistry,
} from '@ui-grounding/authoring';
import { resolveSelection, type SemanticRegistry } from '@ui-grounding/core';
import {
  renderAmbiguityChooser,
  SelectionOverlay,
  type OverlayMode,
} from '@ui-grounding/overlay';
import type {
  GroundingBundle,
  ResolvedReferent,
  Selection,
} from '@ui-grounding/protocol';

export interface GroundingInspectorOptions {
  registry: SemanticRegistry;
  descriptions: SemanticDescriptionRegistry;
  root?: Document | HTMLElement;
  initialMode?: OverlayMode;
  initiallyOpen?: boolean;
  onGrounding?(capsule: GroundingCapsule): void;
}

function button(label: string, action: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', action);
  return element;
}

function narrowedGrounding(
  grounding: GroundingBundle,
  referent: ResolvedReferent,
): GroundingBundle {
  const narrowed = structuredClone(grounding);
  narrowed.referents = [referent] as GroundingBundle['referents'];
  narrowed.ambiguity = { requiresDisambiguation: false };
  delete narrowed.problem;
  return narrowed;
}

export class GroundingInspector {
  readonly #options: GroundingInspectorOptions;
  readonly #shell: HTMLElement;
  readonly #launcher: HTMLButtonElement;
  readonly #panel: HTMLElement;
  readonly #status: HTMLElement;
  readonly #summary: HTMLElement;
  readonly #raw: HTMLElement;
  readonly #modeButtons = new Map<OverlayMode, HTMLButtonElement>();
  readonly #overlay: SelectionOverlay;
  #mode: OverlayMode;
  #lastCapsule?: GroundingCapsule;
  #chooserDispose: (() => void) | undefined;
  #disposed = false;

  constructor(options: GroundingInspectorOptions) {
    if (typeof document === 'undefined') {
      throw new Error('GroundingInspector requires a browser document');
    }
    this.#options = options;
    this.#mode = options.initialMode ?? 'point';
    this.#shell = document.createElement('div');
    this.#shell.className = 'ugp-inspector-shell';
    this.#shell.dataset.ugpOverlayUi = 'true';

    this.#launcher = button('UGP', () => this.toggle());
    this.#launcher.className = 'ugp-inspector-launcher';
    this.#launcher.setAttribute('aria-controls', 'ugp-inspector-panel');

    this.#panel = document.createElement('aside');
    this.#panel.id = 'ugp-inspector-panel';
    this.#panel.className = 'ugp-inspector-panel';
    this.#panel.setAttribute('aria-label', 'UGP semantic inspector');
    this.#panel.hidden = !(options.initiallyOpen ?? true);

    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'UGP Inspector';
    const close = button('Close', () => this.close());
    close.setAttribute('aria-label', 'Close UGP Inspector');
    header.append(title, close);

    const modes = document.createElement('div');
    modes.className = 'ugp-inspector-modes';
    for (const [mode, label] of [
      ['point', 'Point'],
      ['region', 'Region'],
      ['text', 'Text'],
    ] as const) {
      const modeButton = button(label, () => this.setMode(mode));
      modeButton.dataset.mode = mode;
      this.#modeButtons.set(mode, modeButton);
      modes.append(modeButton);
    }

    this.#status = document.createElement('p');
    this.#status.className = 'ugp-inspector-status';
    this.#status.setAttribute('role', 'status');
    this.#status.textContent = 'Select visible content to inspect its meaning.';

    this.#summary = document.createElement('p');
    this.#summary.className = 'ugp-inspector-summary';
    this.#summary.hidden = true;

    const details = document.createElement('details');
    const detailsTitle = document.createElement('summary');
    detailsTitle.textContent = 'Structured output';
    this.#raw = document.createElement('pre');
    this.#raw.textContent = '{}';
    details.append(detailsTitle, this.#raw);

    this.#panel.append(header, modes, this.#status, this.#summary, details);
    this.#shell.append(this.#launcher, this.#panel);
    document.body.append(this.#shell);
    this.#overlay = new SelectionOverlay({
      surfaceId: options.registry.surfaceId,
      surfaceRevision: () => options.registry.surfaceRevision,
      mode: this.#mode,
      ...(options.root ? { root: options.root } : {}),
      onSelection: (selection) => this.inspect(selection),
    });
    this.#renderMode();
    this.#renderOpenState();
  }

  get lastCapsule(): GroundingCapsule | undefined {
    return this.#lastCapsule ? structuredClone(this.#lastCapsule) : undefined;
  }

  open(): void {
    this.#assertActive();
    this.#panel.hidden = false;
    this.#renderOpenState();
  }

  close(): void {
    this.#assertActive();
    this.#panel.hidden = true;
    this.#renderOpenState();
  }

  toggle(): void {
    this.#assertActive();
    this.#panel.hidden = !this.#panel.hidden;
    this.#renderOpenState();
  }

  setMode(mode: OverlayMode): void {
    this.#assertActive();
    this.#mode = mode;
    this.#overlay.setMode(mode);
    this.#renderMode();
  }

  inspect(selection: Selection): GroundingCapsule {
    this.#assertActive();
    this.#chooserDispose?.();
    this.#chooserDispose = undefined;
    const grounding = resolveSelection(
      this.#options.registry.getSnapshot(),
      selection,
    );
    if (
      grounding.ambiguity?.requiresDisambiguation &&
      grounding.ambiguity.candidates
    ) {
      this.#renderCapsule(this.#options.descriptions.createCapsule(grounding));
      this.#chooserDispose = renderAmbiguityChooser(
        this.#panel,
        grounding,
        (referent) => {
          this.#chooserDispose?.();
          this.#chooserDispose = undefined;
          this.#publish(
            this.#options.descriptions.createCapsule(
              narrowedGrounding(grounding, referent),
            ),
          );
        },
      );
      return this.#lastCapsule!;
    }
    const capsule = this.#options.descriptions.createCapsule(grounding);
    this.#publish(capsule);
    return capsule;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#chooserDispose?.();
    this.#overlay.dispose();
    this.#shell.remove();
  }

  #publish(capsule: GroundingCapsule): void {
    this.#renderCapsule(capsule);
    this.#options.onGrounding?.(structuredClone(capsule));
  }

  #renderCapsule(capsule: GroundingCapsule): void {
    this.#lastCapsule = structuredClone(capsule);
    this.#status.textContent = capsule.problem
      ? `${capsule.problem.code}: ${capsule.problem.message}`
      : 'Grounded to application semantics.';
    this.#summary.hidden = !capsule.description;
    this.#summary.textContent = capsule.description?.summary ?? '';
    this.#raw.textContent = JSON.stringify(capsule, null, 2);
  }

  #renderMode(): void {
    for (const [mode, element] of this.#modeButtons) {
      element.setAttribute('aria-pressed', String(mode === this.#mode));
    }
  }

  #renderOpenState(): void {
    this.#launcher.setAttribute('aria-expanded', String(!this.#panel.hidden));
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('GroundingInspector is disposed');
  }
}
