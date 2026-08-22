# SPECIFICATION — ledger-service

<!-- Thin capability index: one line per capability, grouped by bounded context.
     Format authority: /docs/specs/README.md — capability names only, no design detail;
     sections are bounded contexts, never status; status is the checkbox ([x] shipped, [ ] not).
     Populate with /scope-it (for new work) or /spec-bootstrap (from existing code).
     Deep feature specs live in the root docs/specs/ as FS-NNNN. -->

## Purpose

ledger-service owns the **append-only record of completed gold movements** — the
**reconciliation bounded context**. It answers *"why is this number what it is"*, and makes it
possible to detect when the flows that produced it were wrong.

It is **not the source of truth for balance**. `wallet-service.accounts.gold` owns that, and
the question *"what is the balance"* must not migrate here for convenience. The ledger records
movements in **double-entry transactions**: a set of legs sharing one `transaction_id` whose
signed amounts sum to zero.

**Scaffold status.** The service boots, registers with Consul, serves gRPC, connects to the
broker, and owns its database. Its current `Ledger` aggregate (per-member root with an OCC
version) predates the domain design and is **retired by FS-0003** — an append-only record
performs no read-modify-write, so optimistic concurrency has nothing to protect.

Per-table detail lives in [`docs/schema/`](docs/schema/). Cross-service architecture context:
[`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Capabilities

- [ ] Append a balanced ledger transaction → FS-0003
- [ ] Read the movement record → FS-0003
