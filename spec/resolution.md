# Resolution model

Status: **Normative v0.1 Alpha**

The v0.1 resolver is a deterministic pipeline:

```text
validate -> collect -> reject stale/invisible -> evidence -> rank
         -> collapse parent/child -> deduplicate entityRef -> classify ambiguity
```

Authoritative claims cannot be replaced by inferred claims. Every emitted
referent includes authority and inspectable evidence.

Candidate ordering is authority, exactness, Anchor priority, visible ratio,
z-order metadata, and finally lexical `nodeId`. The lexical tie-breaker makes
output deterministic but does not remove semantic ambiguity. Equal candidates
for different entities remain explicit ambiguity candidates.

Parent/child collapse prefers the narrowest authoritative business object that
fully represents the selection. Region selection may intentionally retain
multiple siblings. Referents with the same `entityRef` are deduplicated while
their evidence remains available. Invisible, occluded, stale, duplicate, and
collapsed candidates are recorded as omitted when audit output is enabled.
