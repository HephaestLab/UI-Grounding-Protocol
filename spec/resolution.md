# Resolution model

Status: **Editor's Draft**

The v0.1 resolver will be a deterministic pipeline:

```text
validate -> collect -> reject stale/invisible -> evidence -> rank
         -> collapse parent/child -> deduplicate entityRef -> classify ambiguity
```

Authoritative claims cannot be replaced by inferred claims. Every emitted
referent will include authority and inspectable evidence.
