# Independent UI interpretation task

A user pointed at a workflow node and said:

> Continue from this step using the safest appropriate next action.

Interpret only `input.json` using `GUIDE.md` when present. Do not inspect parent
directories, the source repository, git history, other runs, or the network.
Write only a JSON object to `answer.json` that conforms to `answer.schema.json`.

Rules:

- `candidateEntityIds` contains only currently supported canonical business
  identities as `namespace/id`.
- Explicitly stale evidence supports no current primary entity or candidate.
- Choose `refresh` for stale evidence, `clarify` for equal current candidates,
  and `answer` for one current referent.
- Do not infer a canonical ID or authority from visible prose alone.
