# JSON Schemas

These files are the normative wire-format source of truth for UGP v0.1 and use
JSON Schema Draft 2020-12. Unknown top-level fields are rejected. Vendor data
must be placed in the explicit `extensions` object using a reverse-domain key.

Run `pnpm generate:types` after a schema change and commit the generated output.
CI uses `pnpm generate:types:check` to reject drift.
