# UGP v0.2 first-principles realignment

Status: normative research-candidate constraints. UGP v0.1 remains the accepted
grounding baseline.

## Purpose

UGP preserves application-owned meaning across this round trip:

```text
application model and rules
  -> sidecar Profile and Binding
  -> visible referent link
  -> user or agent grounding
  -> independently understandable Description
  -> host-authorized capability use
```

The unit of meaning is the grounded referent. A page, module, DOM subtree, or
benchmark observation is not a substitute for the business object, property,
action, message, or region that the grounding identifies.

## Non-negotiable invariants

1. **Referent addressability.** Every meaning-bearing visible referent has one
   stable node identity and can produce its own Capsule. The Capsule subject
   matches that node's canonical application entity.
2. **Application meaning before UI mechanics.** A Description explains what the
   referent means in the application. DOM roles, selectors, target IDs, and
   click mechanics link or execute it; they do not constitute business meaning.
3. **Normative structure, loss-bounded projection.** `description.frame` is
   authoritative. `description.summary` is the canonical projection of a
   Profile-selected subset of required Frame roles, not separately authored
   prose and never a source of new facts.
4. **Fact-level authority.** Node identity, subject, every emitted role,
   revision, and capability cite declared code, domain-model, API/schema,
   official-documentation, typed-state, or translation sources. UI text alone
   may supply a display label but never business identity, meaning, state
   semantics, permission, or capability.
5. **Referent-sufficient minimality.** The default Description contains enough
   immediate meaning for an independent consumer to identify and interpret the
   referent. It is not minimized against a benchmark task. Large documents,
   lineage, schemas, and tool details remain expandable on demand.
6. **Discovery is not authority.** `can` advertises stable compatible
   capabilities. It contains neither transient UI targets nor permission. The
   host validates, re-authorizes, confirms, executes, verifies, and audits.
7. **Failure is explicit.** Missing identity, meaning, authority, lifecycle, or
   postcondition evidence fails closed. A schema-valid but semantically hollow
   Frame is invalid UGP.

## Description completeness

Every Profile frame declares competency questions. `identity` and `meaning` are
mandatory. Each question names the Frame paths that answer it and whether those
answers must appear in the deterministic summary. The Profile uses a
`summaryPlan` containing role names, not a free-form factual template:

```json
{
  "competencyQuestions": [
    {
      "id": "identity",
      "question": "Which application referent is this?",
      "answerPaths": ["subject"],
      "includeInSummary": true
    },
    {
      "id": "meaning",
      "question": "What business relationship does this field establish?",
      "answerPaths": ["roles.businessMeaning"],
      "includeInSummary": true
    }
  ]
}
```

```json
{
  "summaryPlan": {
    "roles": [
      "businessMeaning",
      "targetEntityType",
      "selectionState",
      "commitConstraint"
    ]
  }
}
```

Additional questions are Profile-specific: current value or state, scope, basis,
relation, precondition, effect, completion evidence, or constraint. An answer
role used by a competency question is required and cannot be a blank string.
Profile validation rejects summaries that omit an answer marked for summary
inclusion.

The canonical renderer emits `subject — Role: value; ...`. Fixed text is limited
to punctuation and deterministic humanization of the declared role identifier;
there is no author-controlled prose slot. All factual strings—including a longer
explanatory paragraph when one is useful—must be values of source-backed roles
in the normative Frame. This eliminates template-authored facts. It does not
make bad source data true, so provenance, competency, and live-revision
validation remain mandatory.

For example, an editable relationship field is independently described as a
business referent rather than as a generic combobox:

```json
{
  "v": "0.2-draft",
  "id": "capsule:contact-edit:account-name",
  "at": {
    "surface": "crm:contacts:edit",
    "revision": "contact-edit-r17"
  },
  "referent": {
    "nodeId": "contact-edit:account-name",
    "revision": "account-name-r17"
  },
  "description": {
    "profile": "profile:crm",
    "summary": "Account Name — Business meaning: Links the current Contact record to an Account record.; Target entity type: crm.account; Selection state: unresolved; Commit constraint: Save remains blocked until selected Account identity is verified.",
    "frame": {
      "type": "crm.relationship-field",
      "subject": {
        "kind": "entity",
        "ref": "contact-fields/account-name",
        "label": "Account Name"
      },
      "roles": {
        "businessMeaning": "Links the current Contact record to an Account record.",
        "targetEntityType": "crm.account",
        "selectionState": "unresolved",
        "commitConstraint": "Save remains blocked until selected Account identity is verified."
      }
    }
  },
  "can": ["crm.relationship.choose"]
}
```

The current DOM target, popup option IDs, and exact click arguments stay in the
visible/interaction Bindings. They are not duplicated into this Description.

## Responsibility boundaries

```text
Authority Manifest
  stable sources and known gaps
          |
          v
Semantic Binding
  node + subject + roles + revision + per-fact provenance
          |
          v
Description
  Profile + canonical role projection + normative Frame

Visible Link                       Host Interaction Binding
  lifecycle + anchor                transient target + arguments
          \                         /
           +------ Grounding ------+
```

- A view component normally stores only its lifecycle-safe UGP link.
- A semantic Binding must not depend on benchmark task text, gold, scorer, or
  model outcome.
- A transient `targetId` belongs to the visible or host-interaction link. It is
  not a business role unless the UI control itself is the selected referent.
- A control selected as a referent is described by its application effect,
  preconditions, target business object, and completion evidence—not merely by
  `role=button` or `operation=click`.

## Composition and surface discovery

A legitimate surface referent may have its own Description, but it cannot stand
in for its children. Surface discovery returns a compact referent index with
stable node IDs, labels, deterministic summaries, and Capsule handles. Full
child Capsules are resolved on demand or selected under an explicit budget.

Do not build one page-level Frame that inlines every control Binding and then
call that object the Description of whichever child the consumer needs. This
breaks referent identity, hides missing component meaning, duplicates action
metadata, and makes payload size scale with the page rather than the referent.

## State and interaction lifecycle

Business state, proposed input, executable choice, committed value, and
postcondition evidence are distinct. For any compound or asynchronous control:

- preserve one canonical business-field identity across visual subtrees;
- distinguish proposal/query state from committed application state;
- keep an unresolved mutation transaction-scoped rather than visibility-scoped;
- expose commit only when declared preconditions hold;
- release pending state only on authoritative completion evidence, explicit
  cancellation, or transaction exit;
- treat an unchanged bound value and relevant surface state as a failed attempt.

These rules generalize relationship pickers, autocomplete, file upload,
multi-step dialogs, editors, staged filters, and other compound controls.

## Validation levels

1. **Schema:** wire objects and Profile definitions are structurally valid.
2. **Semantic contract:** every Frame answers `identity` and `meaning`; required
   competency answers exist; the summary is an exact canonical role projection
   and contains no template-authored facts.
3. **Authority:** every emitted fact cites a source declared in the frozen
   Authority Manifest; unresolved facts are explicit gaps.
4. **Round trip:** a selected visible node resolves to the same canonical
   subject, live revision, and independent Capsule; child referents are not
   replaced by a surface aggregate.
5. **Lifecycle and operation:** dynamic registration, transition state,
   capability compatibility, commit gating, and postcondition evidence are
   verified without changing product behavior.
6. **Consumer evidence:** only after levels 1–5 pass may small paired actor runs
   test whether UGP improves independent-agent performance.

## Consequence for the SuiteCRM development line

The frozen v2–v7 adapters remain useful evidence about interaction execution and
transaction lifecycle. They do not by themselves establish the original UGP
claim because their page-level `crm.module-state` Capsule aggregates controls
and gives individual controls no independently complete Description. They must
not be rewritten or mixed. A future adapter version starts only after the
offline gates above pass and uses referent-level Capsules plus a separate
surface index and interaction overlay.
