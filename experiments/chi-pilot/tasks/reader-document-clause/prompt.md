# Independent UI interpretation task

A user highlighted a clause in a document application and said:

> Explain what I selected and continue with the safest appropriate next step.

Interpret only `input.json` using `GUIDE.md` when present. Do not inspect parent
directories, the source repository, git history, other runs, or the network.
Write only a JSON object to `answer.json` that conforms to `answer.schema.json`.

Rules:

- `candidateEntityIds` contains every plausible business entity as
  `namespace/id`, sorted lexicographically.
- `primaryEntity` is the uniquely supported entity; otherwise it is `null`.
- Choose `clarify` for equally supported referents and `refresh` for explicitly
  stale evidence.
- Do not infer a canonical ID or authority from visible prose alone.
