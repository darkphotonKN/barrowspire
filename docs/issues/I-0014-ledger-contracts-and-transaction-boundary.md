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
proto today and have no callers (§Req 18). Enums for **`Direction` and `Reason` only** —
`ReferenceType` was cut from the feature entirely; `reference_id` carries the originating event
unaided. Note `currency` sits on `AppendLedgerTxRequest`, **not** on `LedgerLeg`: one currency
per transaction is structural rather than validated (§Req 8).
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
  enforced by proto enum, Go value type, and DB `CHECK`. Forward-declared: only `SETTLE_AUCTION`
  has a caller, and recording the others later needs no schema change.

**What this slice still owes the DDL:** FS-0003 §Data model is now the two-table shape and is the
source of truth. Reconcile the migration on disk against it — the FS adds `created_at` to
`ledger_entries` (duplicated from the parent deliberately, so the read path pages without a join)
and specifies `(account_id, created_at, id)` and `(created_at, id)` as the read indexes. The
migration currently has neither.

## Acceptance Criteria

- [ ] `ledger.proto` carries `AppendLedgerTx` and no `CreateLedger` / `GetLedger`
- [ ] Repository interface exposes no update and no delete method
- [ ] The transaction-boundary pattern is readable from the interface signature alone, with no
      `*sql.Tx` in any service-layer signature
- [ ] Migration DDL decided, including `DROP TABLE ledgers`
- [ ] Sentinel error set covers every row of FS-0003 §API surface's error table
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
§Open questions (all three). Governed by ADR-0006, ADR-0007, ADR-0008, ADR-0009.

## Notes

No implementation. If a body is easier to write than an interface here, that is a signal the
boundary is not yet decided — which is the whole point of this slice.
