# Benchmark adapter protocol

Official benchmark code stays outside the fixed actor. An adapter is a process
that exchanges one JSON object per line over standard input/output. Diagnostic
logs go to standard error so they cannot corrupt the trace.

## Required messages

Controller to adapter:

```json
{"op":"reset","sourceTaskId":"private runner value","seed":240828}
{"op":"observe"}
{"op":"step","action":{"kind":"click","target":"opaque-node-3"}}
{"op":"score"}
{"op":"close"}
```

Adapter to controller:

```json
{"op":"reset-result","ok":true,"publicTask":{"instruction":"...","domain":"...","taskFamily":"...","maxSteps":40}}
{"op":"observation","step":1,"sourceObservation":{"factBundleDigest":"...","factKeys":[],"channels":{}}}
{"op":"step-result","accepted":true,"terminated":false,"publicHistoryEvent":{}}
{"op":"score-result","strictSuccess":1,"nativeMetrics":{"CuP":0.93},"evaluatorDigest":"..."}
```

## Invariants

- The adapter owns benchmark reset and native evaluation; the actor never does.
- `sourceTaskId`, credentials, gold state, and evaluator implementation remain
  in the adapter process and never enter `request.json`.
- All conditions for a paired task use the same reset snapshot and public task
  wording.
- The adapter emits all available source channels before the actor is invoked.
  Grounding adapters select/transform a channel; they do not query extra facts.
- Official scorers are wrapped, not reimplemented, whenever an official scorer
  exists. The common `strictSuccess` is a registered projection from the native
  terminal result.
- Infrastructure errors are typed separately from actor failures and include a
  deterministic environment digest.
- A method incapable of representing a source observation is reported `N/A` and
  excluded by the registered support rule; it is not assigned a zero.

The local fixture uses the same task envelope but no external process. It proves
the experiment wire lifecycle, not a benchmark integration.
