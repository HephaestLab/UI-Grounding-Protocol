# Workflow pointer record

- `capture.basis` is the workflow revision at pointer capture.
- `capture.live` is the current workflow revision.
- A mismatch means the pointer record is stale and no target is currently
  supported.
- `onMismatch: reacquire` maps to a `refresh` next action.
- Stale records have unknown current authority and no canonical candidates.
