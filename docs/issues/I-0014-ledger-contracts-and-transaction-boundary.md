---
id: I-0014
status: open
implements: FS-0003
blocked_by: []
labels: []
title: "FS-0003 slice 1: contracts — proto, interfaces, DDL, transaction-boundary pattern, sentinels"
---

Implements FS-0003 §Requirements, §API surface, §Data model, §Open questions

**Author: human** — do NOT hand this to `/develop`. This is the whole design surface;
everything downstream is mechanical once these shapes exist.

## What to Build

Five artifacts, no behavior. Nothing here executes — this slice decides the shapes that
slices 2–9 are written against.

**1. The activity contract** — Go input/output types for `AppendLedgerTx`, per FS-0003
§API surface. **These are not proto messages.** ADR-0011 made the write path a Temporal activity,
so `AppendLedgerTx` is not an RPC and does not appear in `ledger.proto` at all — the proto
carries read RPCs only, authored in I-0023.

The field tables in §API surface survived the transport change intact and are still the spec:
`transaction_id`, `reason`, `reference_id`, `currency`, `legs[]` on the input; `account_id`,
`direction`, `amount` per leg. `currency` sits on the **transaction, not the leg** — one currency
per transaction is structural rather than validated (§Req 8). The ids are `uuid.UUID`, not
`string`: identical on the wire via `MarshalText`, while a malformed id fails at unmarshal rather
than travelling inward. `reason` and `direction` cross as plain `string` and are converted to
their string-backed Go value types on entry, which is where the closed sets are enforced;
`ReferenceType` was cut from the feature entirely and `reference_id` carries the originating
event unaided. **The response is one field, `applied`** — `transaction_id` is caller-minted and
already held, and `recorded_at` would cost a read-back after `ON CONFLICT DO NOTHING` on the one
branch built to be cheap.

**These types live in a shared package under `common/`**, imported by both the calling service
and ledger-service. Not a preference: the calling workflow must import them to invoke the
activity, and Go's `internal/` rule makes anything under `ledger-service/internal/` unimportable
from another service. There is no layout in which they live inside the service. The package is
the ledger's Published Language for the write path — the sibling of `ledger.proto` for the read
path, which is why it sits beside the proto rather than in a `utils` or `constants` bucket.
**The activity's registered name is a constant in that same package**, referenced by both the
registering service and the scheduling workflow, so a typo is a compile error rather than a
runtime routing failure.

> **These types are an ungated cross-service contract** (ADR-0011, accepted cost). The shared
> package turns a field rename into a compile error on both sides, which is worth having — but it
> is **not a gate**: no proto, no `buf`, no OpenAPI, and nothing fails a PR. Deploy skew still
> carries the old shape on in-flight workflows, where the break surfaces at runtime as a
> deserialization error inside a workflow already past its pivot. Name them as if there is no
> safety net, because there is not one.

`CreateLedger` and `GetLedger` are still deleted (§Req 18) — both are marked `SCAFFOLD` and have
no callers. Do not run proto generation here.

**2. The repository interface — one method.** The repository exposes **exactly one method,
`Append`** (§Req 9, ADR-0007). No update, no delete, and **no read** — enforced by absence, not
convention. A repository provides access to aggregate roots; a flat entry row is not an aggregate
and enforces no invariant, so serving one from a repository method misuses the pattern's name.
Reads are query objects and belong to I-0023: they hold `*sqlx.DB` directly, return DTOs, bypass
the domain, and their interfaces are declared consumer-side by the gRPC handler. An insert-only
interface carrying a single method is a harder statement than "insert and read", and it mirrors
wallet-service — the reviewed reference implementation, which has no read port at all.

**3. The transaction-boundary pattern — the load-bearing decision of this slice.**
All legs of one `AppendLedgerTx` call commit together or not at all (§Req 7–8), and the pattern for
composing that must be **expressed in the interface itself, without `*sql.Tx` leaking into the
service-layer signature.** Slice 6 writes repository method bodies against whatever this
interface says, so the pattern has to be legible from the signature alone.

> **Ordering constraint — do not reschedule.** Slice 6 (I-0019) cannot start until the
> interface here carries the pattern. Repo bodies written before the boundary is expressed will
> invent their own, which is the exact outcome this ordering exists to prevent.

**4. Migration DDL** — per FS-0003 §Data model. Decide the statements; slice 3 writes the
files. Includes `DROP TABLE ledgers` (§Req 17).

**5. The sentinel error set.** FS-0003 §API surface's error table is the target vocabulary —
`UNBALANCED_TRANSACTION`, `VALIDATION_FAILED`, and the transient/internal cases. **The set now
feeds two consumers, not one:** the write path classifies each sentinel retryable or
non-retryable on the activity's retry policy (I-0018), and the read path maps its own errors to
gRPC codes (I-0021). A sentinel that is neither classified nor mapped is a gap in one of them. Existing sentinels in
`internal/ledger/domain/ledger/errors.go` and `commonconstants` are the starting point;
`ErrConcurrentModification` goes away with OCC (§Req 17, ADR-0007).

## The three open questions — ALL RESOLVED, do not reopen

FS-0003 §Open questions now carries all three as decisions with their reasoning. This slice
**implements** them; it does not revisit them.

- **OQ1 — is there a natural key? → No, and there must not be.** The four-column unique index
  `(reason, reference_id, account_id, direction)` is **rejected**: it is a domain rule wearing a
  constraint's clothes, and partial refunds, a second fee on one settlement, and admin
  adjustments all break it legitimately. **`transaction_id` — the parent PK — is the sole
  idempotency guard.** `ON CONFLICT DO NOTHING` on the parent insert; 0 rows means already
  recorded, return success, skip the legs. No `LEDGER_CONFLICT` sentinel is needed.
- **OQ2 — two tables? → Yes**, `ledger_transactions` parent + `ledger_entries` legs, already
  implemented in `000001_create_ledger_transactions_and_entries.up.sql`. **But none of the unique
  constraints the old recommendation proposed** — not `UNIQUE(reason, reference_id)`, not
  `UNIQUE(transaction_id, account_id, direction)`. Parent PK is `transaction_id`,
  caller-supplied, **no `DEFAULT`**.
- **OQ3 — the legal set of `reason`? → `SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`**,
  enforced by a **string-backed Go value type** validated on the write path and by the DB
  `CHECK`. **No proto enum** — `reason` crosses every wire as a plain `string` (§Req 5a,
  §Open question 3). Forward-declared: only `SETTLE_AUCTION` has a caller, and recording the
  others later needs no schema change.

**What this slice still owes the DDL:** FS-0003 §Data model is now the two-table shape and is the
source of truth. Reconcile the migration on disk against it — the FS adds `created_at` to
`ledger_entries` (duplicated from the parent deliberately, so the read path pages without a join)
and specifies `(account_id, created_at, id)` and `(created_at, id)` as the read indexes. The
migration currently has neither.

## Acceptance Criteria

- [ ] The activity's input/output Go types match §API surface's field tables
- [ ] `AppendLedgerTx` appears in no `.proto` file; `CreateLedger` / `GetLedger` are gone
- [ ] The repository interface declares exactly one method, `Append` — no update, no delete, and
      no read
- [ ] The activity's input/output types and the registered-name constant live in a shared package
      under `common/`, importable by a service that is not ledger-service
- [ ] `AppendLedgerTxResponse` carries `applied` and nothing else
- [ ] The transaction-boundary pattern is readable from the interface signature alone, with no
      `*sql.Tx` in any service-layer signature
- [ ] Migration DDL decided, including `DROP TABLE ledgers`
- [ ] Sentinel error set covers every row of FS-0003 §API surface's error table, and each row is
      marked retryable or non-retryable
- [ ] The migration matches FS-0003 §Data model — `created_at` on `ledger_entries`, the
      `(account_id, created_at, id)` and `(created_at, id)` indexes present
- [ ] No unique constraint exists beyond the two primary keys
- [ ] `currency` is on the transaction, not the leg
- [ ] `go build ./...` succeeds (interfaces compile; no implementations required)

## Blocked By

None. This slice blocks all of I-0015 … I-0022.

## Spec Reference

FS-0003 §Requirements 6–13 (invariants, idempotency), 15–16 (boundaries), 17–18 (scaffold
retirement, proto rewrite), §API surface (the RPC and error table), §Data model (DDL),
§Open questions (all three). Governed by ADR-0006, ADR-0007, ADR-0008, ADR-0009, and
**ADR-0011** (the write path is a Temporal activity, so artifact 1 is Go types, not proto).

## Notes

No implementation. If a body is easier to write than an interface here, that is a signal the
boundary is not yet decided — which is the whole point of this slice.
