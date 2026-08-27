# Conformance

Status: **Normative v0.1 Alpha**

A conforming implementation declares one or more UGP profiles and passes every
Fixture whose `profiles` intersects that declaration. Schema validation alone
does not establish runtime conformance.

## Fixture suites

Schema suites contain named base documents and JSON Patch-style mutations. Each
expanded Fixture contains:

- stable `id`;
- applicable `profiles`;
- source Schema and input data;
- expected validity and optional error keywords;
- `normativeRequirements` traced to the specification.

Runtime suites additionally contain Surface, SemanticNodes, Anchors, Selection,
expected referents, expected ambiguity, expected problem, and any expected
omissions. A runner must not use network access, a model, DOM, or framework
state for Core Fixtures.

## Reports

The official runner emits JSON for automation and Markdown for review. Reports
identify every Fixture, expected result, actual result, Schema, profile, and
normative requirements. A single failed required Fixture fails the claimed
profile.

Schema changes require at least one new or changed negative Fixture. Runtime
behavior changes require a failing runtime Fixture before implementation.
