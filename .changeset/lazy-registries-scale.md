---
'@ui-grounding/core': patch
---

Build immutable Registry snapshots lazily so large registration and disposal
batches remain linear while preserving stable snapshot identity between
mutations.
