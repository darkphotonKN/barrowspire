# SPECIFICATION — ledger-service

<!-- Thin capability index: one line per capability, grouped by bounded context.
     Format authority: /docs/specs/README.md — capability names only, no design detail;
     sections are bounded contexts, never status; status is the checkbox ([x] shipped, [ ] not).
     Populate with /scope-it (for new work) or /spec-bootstrap (from existing code).
     Deep feature specs live in the root docs/specs/ as FS-NNNN. -->

## ledger-service

**Scaffolding only — the domain is not designed yet.** The service boots, registers with
Consul, serves gRPC, connects to the broker, and owns its database, but carries no behavior:
the `Ledger` aggregate holds identity and an OCC version and nothing else. Run `/scope-it`
to decide what this context owns before adding capability lines here.

Per-table detail lives in [`docs/schema/`](docs/schema/). Cross-service architecture context:
[`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Capabilities

<!-- - [ ] capability name -->
