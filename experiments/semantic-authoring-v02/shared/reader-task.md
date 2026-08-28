# Independent semantic interpretation task

Inspect only the provided `input.json` and optional guide. Identify the
canonical business referent and recover every fact you can support. Choose the
single compatible capability if one is explicitly discoverable, but set
`shouldInvoke` to `false`: this packet grants no user authority or confirmation
to execute anything. Put unsupported or ambiguous conclusions in `uncertainties`
rather than guessing. Write only `answer.json` conforming to the provided
schema.
