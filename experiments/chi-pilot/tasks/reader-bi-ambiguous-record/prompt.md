# Independent UI interpretation task

A user pointed at a visible row in a business application and said:

> Explain this order and continue with the safest appropriate next step.

Interpret only `input.json`. Do not inspect parent directories, the source
repository, git history, other experiment runs, or the network. Do not ask a
human for help. Write only a JSON object to `answer.json` that conforms to the
provided `answer.schema.json`.

Rules:

- `candidateEntityIds` contains every plausible business entity as
  `namespace/id`, sorted lexicographically.
- `primaryEntity` is the uniquely supported entity. It must be `null` when two
  or more equally supported referents require clarification.
- Choose `clarify` when more than one equally supported referent remains.
- Choose `refresh` when the evidence is explicitly stale.
- Do not invent business data that is not present in the input.
