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

**1. Proto** (`common/api/proto/ledger/ledger.proto`) — per FS-0003 §API surface.
`AppendLedgerTx` replaces `CreateLedger` and `GetLedger`; both are marked `SCAFFOLD` in the
proto today and have no callers (§Req 18). Enums for `Direction`, `Reason`, `ReferenceType`.
Do not run generation here — that is slice 5.

**2. Repository + service interfaces.** The repository exposes **insert and read only**. There
is no update method and no delete method — enforced by absence, not convention (§Req 9,
ADR-0007).

**3. The transaction-boundary pattern — the load-bearing decision of this slice.**
All legs of one `AppendLedgerTx` commit together or not at all (§Req 7–8), and the pattern for
composing that must be **expressed in the interface itself, without `*sql.Tx` leaking into the
service-layer signature.** Slice 6 writes repository method bodies against whatever this
interface says, so the pattern has to be legible from the signature alone.

> **Ordering constraint — do not reschedule.** Slice 6 (I-0019) cannot start until the
> interface here carries the pattern. Repo bodies written before the boundary is expressed will
> invent their own, which is the exact outcome this ordering exists to prevent.

**4. Migration DDL** — per FS-0003 §Data model. Decide the statements; slice 3 writes the
files. Includes `DROP TABLE ledgers` (§Req 17).

**5. The sentinel error set.** The domain errors slice 8 maps to gRPC codes. FS-0003
§API surface's error table is the target vocabulary — `UNBALANCED_TRANSACTION`,
`VALIDATION_FAILED`, and the transient/internal cases. Existing sentinels in
`internal/ledger/domain/ledger/errors.go` and `commonconstants` are the starting point;
`ErrConcurrentModification` goes away with OCC (§Req 17, ADR-0007).

## The three open questions land here

FS-0003 §Open questions are **unsettled**, and this is the slice that settles them. Each
changes an artifact above; none may be silently defaulted.

- **OQ1 — the unique index excludes `amount`.** A retry with a corrected amount currently
  no-ops as success. Changes the DDL and the error set (a `LEDGER_CONFLICT` sentinel, or not).
- **OQ2 — nothing enforces `transaction_id` uniqueness.** The recommendation is a
  `ledger_transactions` table, which **changes the DDL, both interfaces, and the slice 4 struct**.
  Settle before slice 3 or 4 start, or they get rewritten.
- **OQ3 — `reason` / `reference_type` are bare TEXT.** Changes the DDL (CHECKs) and the proto
  (enums are already drawn; the DB side is the open half).

## Acceptance Criteria

- [ ] `ledger.proto` carries `AppendLedgerTx` and no `CreateLedger` / `GetLedger`
- [ ] Repository interface exposes no update and no delete method
- [ ] The transaction-boundary pattern is readable from the interface signature alone, with no
      `*sql.Tx` in any service-layer signature
- [ ] Migration DDL decided, including `DROP TABLE ledgers`
- [ ] Sentinel error set covers every row of FS-0003 §API surface's error table
- [ ] All three open questions have a recorded answer, and FS-0003 is updated to match
- [ ] `go build ./...` succeeds (interfaces compile; no implementations required)

## Blocked By

None. This slice blocks all of I-0015 … I-0022.

## Spec Reference

FS-0003 §Requirements 6–13 (invariants, idempotency), 15–16 (boundaries), 17–18 (scaffold
retirement, proto rewrite), §API surface (the RPC and error table), §Data model (DDL),
§Open questions (all three). Governed by ADR-0006, ADR-0007, ADR-0008, ADR-0009.

## Notes

No implementation. If a body is easier to write than an interface here, that is a signal the
boundary is not yet decided — which is the whole point of this slice.
