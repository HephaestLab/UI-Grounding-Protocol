# Runtime UGP adapter protocol

The end-to-end main experiment evaluates an installed UGP semantic sidecar, not
a harness-generated representation of an unmodified page.

## Authoring boundary

One adapter is authored per application and version. Its author may inspect the
application frontend/backend code, domain model, official API/schema, validated
live state, and general product documentation. The authoring workspace excludes
held-out benchmark tasks, gold answers, evaluator implementation, selected task
IDs, and all model outcomes.

Each adapter freezes an authority manifest containing:

- application and adapter versions;
- source kind (`code`, `domain-model`, `api-schema`, or `official-docs`), stable
  locator, and version/digest;
- the semantic fact keys supported by each source;
- known gaps and fail-closed behavior.

Closed applications may substitute an official API/schema plus validated state
and product documentation for unavailable backend source. DOM/AX may locate a
visible anchor or provide a label, but is never an authority for canonical
identity, business meaning, permission, or capability.

## Runtime bridge

The installed sidecar exposes a read-only experiment bridge at
`globalThis.__UGP_EXPERIMENT_BRIDGE__`. The bridge separates surface discovery,
referent description, authority facts, and interaction execution:

- `snapshot()` returns the current surface's compact referent index, flat
  authority facts, and common interaction Bindings;
- `describe(nodeId)` returns the independently complete Capsule for that exact
  live referent or a fail-closed problem.

The index may carry deterministic summaries for discovery. It cannot replace
child Capsules with one aggregate page Description.

```json
{
  "origin": "application-runtime",
  "adapterId": "webmall-commerce-v1",
  "adapterDigest": "<sha256>",
  "application": "webmall",
  "applicationVersion": "<pinned version>",
  "authorityManifestDigest": "<sha256>",
  "authorityFacts": [
    {
      "key": "product:canonical-id",
      "value": "...",
      "sourceIds": ["api.products"]
    }
  ],
  "referentIndex": [
    {
      "nodeId": "product:42:add-to-cart",
      "label": "Add to cart",
      "profile": "profile:commerce",
      "frameType": "commerce.purchase-action",
      "summary": "Add to cart — Effect: Adds the referenced product to the current cart; Target object: Product 42; Preconditions: Product 42 is orderable; Constraint: Quantity must be positive",
      "capsuleHandle": "product:42:add-to-cart"
    }
  ],
  "interactionBindings": [
    {
      "targetId": "42",
      "role": "button",
      "label": "Add to cart",
      "labelSource": "live-ui-anchor"
    }
  ],
  "taskSpecificInputsExcluded": true,
  "goldAccess": false
}
```

Calling `describe("product:42:add-to-cart")` returns a Capsule whose Frame
subject is that referent and whose semantic roles explain the action's business
effect, target object, preconditions, and relevant constraints. Its transient
`targetId` remains in `interactionBindings`; it is not a Description role.

The bridge contains no credentials, execution authority, task IDs, gold, or
scorer details. Missing, stale, ambiguous, or unsupported bindings return a
fail-closed Capsule problem rather than guessed semantics.

`interactionBindings` are live UI anchors, not domain authority. They may use a
DOM/AX identifier and visible label to connect a stable semantic identity or
capability to the benchmark action space. Every representation condition
receives them as a separate flat common action overlay so executability is not
mistaken for business semantics.

## Experimental use

- UGP receives runtime-emitted referent Capsules unchanged, selected from the
  current referent index under the frozen, task-independent observation budget.
  The complete index remains visible and every handle stays resolvable through
  `describe`; only the number of fully expanded Capsules is bounded.
- Equal-authority RAG, read-only MCP, and NLWeb controls receive projections of
  exactly the same `authorityFacts` and common `interactionBindings`.
- Vision, HTML/AX, Tree-of-Lens, and IAI controls receive only their native page
  observations and public task policy.
- Non-UGP DOM/AX extraction removes `data-ugp-*` attributes.
- The official benchmark reset, task wording, action space, and scorer remain
  unchanged across conditions.

The audit rejects a task packet when the UGP origin is not
`application-runtime`, an authority digest is missing, any indexed referent
lacks an independently resolvable valid Description, an expanded Capsule subject
does not match its node's canonical entity, a child is represented only by a
surface aggregate, fact-level provenance is missing, semantic control facts do
not match UGP authority facts, a semantic Frame contains transient target IDs, a
structural control contains authority fact keys, or task/gold/scorer access is
declared.

## Frozen legacy adapters

SuiteCRM v2–v7 predate this realignment and remain immutable developmental
artifacts. Their page-level Capsule and embedded control Frames may be audited
as evidence about execution and lifecycle failures, but they do not satisfy the
referent-level Description gate and must not be mixed with a later adapter.
