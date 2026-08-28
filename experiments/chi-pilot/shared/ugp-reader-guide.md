# UGP reader contract

- `referents` contains the currently supported application referents.
- `entityRef.namespace/id` is the canonical business identity.
- `authority` reports the evidence authority.
- When `ambiguity.requiresDisambiguation` is true, return every referent as a
  candidate, leave `primaryEntity` null, and choose `clarify`.
- A `problem.code` of `SURFACE_STALE` means no current referent is supported;
  choose `refresh`, use reason `stale`, and report authority `unknown`.
- With one supported referent and no problem, use it as the primary entity and
  choose `answer`.
