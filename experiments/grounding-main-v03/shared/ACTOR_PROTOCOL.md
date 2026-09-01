# Fixed actor protocol

## Scope

This protocol isolates grounding input from agent scaffolding. Benchmark
adapters own environment reset, observation capture, action execution, and
deterministic scoring. Grounding adapters may transform only the current
observation. The actor may emit exactly one action or one final answer per step.

## Fresh-context rule

Every request is a self-contained JSON document. An actor invocation receives:

1. the fixed system instruction;
2. the current task instruction;
3. exactly one grounding representation;
4. the common action schema; and
5. the remaining step budget.

It must not receive prior tasks, benchmark IDs with semantic meaning, source
task IDs, answer keys, scorer code, hidden state, or another condition's
representation. Interactive history, when required, is supplied as a normalized
list of previously executed actions, public environment observations, and public
benchmark chat messages (including user confirmation or clarification); it is
not model-authored memory. A runner must not discard a public user reply and
replace it with an inferred permission flag.

## Request

```json
{
  "schemaVersion": "0.3.0",
  "episodeId": "opaque sha256 identifier",
  "condition": {
    "groundingMethod": "ugp",
    "model": "gpt-5.6-luna",
    "reasoningEffort": "low"
  },
  "actor": {
    "system": "fixed instruction",
    "task": "answer the user's task",
    "observation": {},
    "allowedActions": ["answer", "click", "type", "scroll", "select", "stop"],
    "remainingSteps": 1
  },
  "audit": {
    "freshContextRequired": true,
    "toolsAllowed": false,
    "goldIncluded": false,
    "sourceDigest": "sha256"
  }
}
```

`toolsAllowed: false` is a protocol requirement. A runner must enforce it, not
merely repeat it in a prompt, before its output can enter confirmatory results.

## Response

The actor returns only JSON:

```json
{
  "schemaVersion": "0.3.0",
  "episodeId": "same opaque identifier",
  "output": {
    "kind": "answer",
    "answer": "Net Revenue"
  },
  "confidence": 0.91
}
```

For an interactive action, `output.kind` is one of `click`, `type`, `scroll`,
`select`, or `stop`, and its arguments must conform to the benchmark-neutral
action schema. Invalid JSON is an invalid action and receives no hidden repair.

## Grounding adapter boundary

Each condition consumes a common source observation and emits one `observation`
object:

| Method       | Permitted representation                                                  |
| ------------ | ------------------------------------------------------------------------- |
| Vision Only  | Screenshot reference/bytes and selection geometry                         |
| HTML/AX      | Current DOM/AX subtree and selection anchor                               |
| Tree-of-Lens | Published-style multilevel visual lenses, explicitly adapted              |
| IAI-P4       | P4 interaction-augmented instruction artifact, explicitly operationalized |
| RAG          | Read-only retrieved passages                                              |
| MCP Resource | Read-only MCP resource contents; no tool execution                        |
| NLWeb        | Read-only NLWeb-style response/context                                    |
| UGP          | Complete referent index, bounded valid Capsules, and interaction overlay  |

Adapters must not change the action vocabulary, step budget, task wording, model
settings, or exposed source facts. Every generated packet records source and
representation digests.

## Trace and cost audit

The runner records wall time, response bytes, validation outcome, action, and
any usage fields actually exposed by the execution environment. Missing token
usage is stored as `null`, never estimated and never presented as exact.
Confirmatory runs also require an external transcript proving that actor tools
were disabled.
