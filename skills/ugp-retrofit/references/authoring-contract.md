# UGP authoring contract

Produce this responsibility layout, combining files only when project scale
justifies it:

```text
src/ugp/
  manifest.ts
  profiles/
  bindings/
  capabilities/
  surfaces/
  tests/
```

## Authority and gaps

Use sources in this order: domain model/glossary/semantic layer/state machine;
documented API schema and behavior; validated application state and typed props;
rendered DOM/AX/text. Rendered text may supply a label but cannot establish
canonical identity, business meaning, authority, permission, or executable
capability. Omit and report facts that lack an authoritative source.

## Profile

A Profile defines frame types, role descriptions and value kinds, required
roles, optional vocabularies, a deterministic summary template, and compatible
capability identifiers. New domains add Profiles, roles, vocabulary, and
adapters. They do not add domain-specific Core fields.

## Binding and link

A typed Binding maps live application data to stable node identity, canonical
entity subject, Profile/frame type, roles, revision, and capability identifiers.
The summary is rendered from the frame. A React component normally keeps only:

```tsx
const ugp = useUgpLink(orderBinding, order);
return <button ref={ugp.ref}>Order {order.id}</button>;
```

For another framework, register and dispose the node, description provider, and
visible anchor together. Do not paste static semantic JSON into a component.

## Capability boundary

Capsules list stable capability identifiers, not credentials or permission
claims. The host resolves schemas/adapters, validates arguments, re-authorizes,
confirms when required, executes, and audits. UGP must work without an executor.

## Acceptance

- Intended frames validate; missing/unknown/invalid roles fail.
- Visible selection resolves to the exact node and canonical entity.
- Capsule frame, summary, and revision follow live authoritative data.
- Missing, stale, ambiguous, and mismatched descriptions fail closed.
- Capsules duplicate no geometry/evidence and contain no credentials.
- Unmount disposes node, anchor, and description provider.
- Functional, visual, and accessibility acceptance remains green.
