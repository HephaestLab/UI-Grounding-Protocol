import type { GroundingBundle, ResolvedReferent } from '@ui-grounding/protocol';

export function renderAmbiguityChooser(
  container: HTMLElement,
  grounding: GroundingBundle,
  onChoose: (referent: ResolvedReferent) => void,
): () => void {
  const ambiguity = grounding.ambiguity as
    | {
        requiresDisambiguation?: boolean;
        candidates?: ResolvedReferent[];
      }
    | undefined;
  if (!ambiguity?.requiresDisambiguation || !ambiguity.candidates) {
    return () => undefined;
  }
  const panel = document.createElement('div');
  panel.className = 'ugp-ambiguity';
  panel.dataset.ugpOverlayUi = 'true';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Choose a UI referent');
  for (const referent of ambiguity.candidates) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = referent.label;
    button.addEventListener('click', () => onChoose(referent), { once: true });
    panel.append(button);
  }
  container.append(panel);
  panel.querySelector('button')?.focus();
  return () => panel.remove();
}
