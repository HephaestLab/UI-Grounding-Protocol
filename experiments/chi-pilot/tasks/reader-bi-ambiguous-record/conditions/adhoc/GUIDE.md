# BI selection payload

- `objectsUnderPointer` lists candidate business objects.
- Canonical identity is `collection/key`; `schemaType` is its type.
- `sourceTrust: application-authoritative` maps to authoritative evidence.
- `preferredObject` is only a display preference, not a safe disambiguation.
- `sameRankRequiresUserChoice: true` means no unique primary object exists and
  the next action must ask for clarification.
