# Codex subagent pilot runbook

Use this only for pilot and engineering runs unless the execution product later
provides enforceable tool/filesystem isolation and audited usage.

For every actor request:

1. Create a new subagent task with no inherited conversation
   (`fork_turns=none`).
2. Select exactly the model and reasoning effort in `request.condition`.
3. Put the complete `request.json` contents in the task message. Do not give a
   filesystem path, repository name, source task ID, benchmark name, answer key,
   prior response, or result summary.
4. State that tools are prohibited and request the single response JSON only.
5. Do not send corrective follow-ups. Invalid JSON is sealed as an invalid
   action.
6. Save the returned text unchanged, then run `record.mjs` and the external
   deterministic scorer.
7. Record exact token usage only if the runner exposes it. Otherwise leave token
   fields `null` and use bytes/wall time as operational measures.

One subagent must handle only one step. A new subagent receives the next public
environment observation for interactive tasks. This is slower but prevents
uncontrolled memory and cross-condition contamination.

Prompt-level prohibition is not enforcement. Because Codex subagents can access
the shared workspace, the resulting run has `toolsEnforcedOff=false` unless an
independent runner audit proves otherwise.

The current text-only subagent handoff also cannot attach screenshot bytes as a
native multimodal message. A subagent may read a screenshot with a filesystem
tool for exploratory debugging, but that violates the main-table tool-isolation
contract. Do not report such a run as the Vision Only or ScreenQA confirmatory
condition.
