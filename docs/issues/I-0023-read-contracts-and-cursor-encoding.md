---
id: I-0023
status: open
implements: FS-0003
blocked_by: [I-0014]
labels: [blocked]
title: "FS-0003 slice 10: read contracts — proto RPCs, repository read interfaces, cursor encoding"
---
Implements FS-0003 §API surface, §Requirements 20-23, 31

**Author: human** — do NOT hand this to `/develop`. Same reason as I-0014: this is the design
surface the read path is written against, and every slice after it is mechanical once the shapes
exist.

> **Extends the FS-0003 chain post-amendment.** Slices 1–9 (I-0014 … I-0022) were cut before
> FS-0003 gained its read path; this slice and the four after it cover what the amendment added.
>
> **This slice also absorbed proto generation from I-0018.** ADR-0011 made the write path a
> Temporal activity, so `AppendLedgerTx` left the proto entirely and I-0018 became the worker
> slice. `ledger.proto` now contains read RPCs only — authored here, so generation belongs here
> too.

## What to Build

Three artifacts, no behavior.

**1. Proto** (`common/api/proto/ledger/ledger.proto`) — `GetTransaction` and `ListEntries` per
§API surface. **These two are the entire service definition** — `AppendLedgerTx` is an activity
and is not in the proto (ADR-0011), and `CreateLedger` / `GetLedger` are deleted (§Req 18).
Request and response messages, including the nested `legs[]` on the transaction response and the
flattened entry row on the listing (§Req 22).

**Run generation here**, absorbed from I-0018: regenerate `ledger.pb.go` and `ledger_grpc.pb.go`.
**Generated Go is never hand-edited** (root CLAUDE.md) — if the output is wrong, fix the `.proto`
and regenerate. Registration and handler arms are I-0025's, not this slice's.

**2. Repository read interfaces.** The read methods the append-only repository already promised
by exposing "insert and read only" (I-0014) finally get their consumer. They read into
**`LedgerEntry`**, the persistence struct I-0017 owns — the transport types (`Entry`,
`EntryPage`, `Transaction`, `Leg`) are the gateway's and are named in FS-0003 §API surface's
transport-type table. Keeping them distinct is §Req 31. Two reads: one
transaction by id with its legs, and a keyset page of entries. **Neither returns a total, a sum,
or a count** (§Req 20, ADR-0005) — the absence is enforced by there being no such method, the
same way I-0014 enforced no-update and no-delete.

**3. The cursor's encoding — the load-bearing decision of this slice.**
Keyset over `(created_at, id)` descending (§Req 23). Decide and write down:

- what the cursor encodes, and in what form on the wire (it is declared `opaque` in §API surface,
  which is a promise to clients, not a licence to leave it undecided here)
- how a malformed one is distinguished from a well-formed one that decodes to nothing
- whether the sort key travels in the repository signature or is reconstructed inside it

> **This is a one-way door.** A cursor's encoding is held by clients between requests. Changing
> it later invalidates every cursor in flight, and there is no version negotiation on a query
> param. Decide it deliberately now rather than discovering it in slice 13.

## Where `created_at` lives — SETTLED, and it shapes the read signature

**`created_at` is on `ledger_entries`, duplicated from the parent on purpose** (FS-0003 §Data
model). Normalising it away would be the textbook call and would put a join inside the keyset
predicate of every history page. Because the table is append-only and never updates, the usual
cost of duplication — two copies drifting — cannot occur.

The consequence for this slice: **the read signatures page `ledger_entries` alone.** No join, no
correlated subquery. `(account_id, created_at, id)` serves a scoped history; `(created_at, id)`
serves the unscoped admin listing. The cursor encodes that sort key and nothing else.

## The `reason` vocabulary — SETTLED, do not reopen

`SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`. The proto enum matches the migration's
`CHECK`; FS-0003 §Requirements 5a and §Open questions 3 record it.

Only `SETTLE_AUCTION` has a caller today. The other three are **forward-declared on purpose** —
building the deposit/withdraw/transfer *verbs* is out of scope, but **recording their effects
needs no ledger change**, which is why the set is closed now rather than grown later. The read
response echoes `reason` as a plain string; it does not validate against the set (the write path
already did).

## Acceptance Criteria

- [ ] `ledger.proto` carries `GetTransaction` and `ListEntries` with the shapes in §API surface
- [ ] `ledger.proto` carries no `AppendLedgerTx`, `CreateLedger`, or `GetLedger`
- [ ] `ledger.pb.go` and `ledger_grpc.pb.go` regenerate cleanly; `git diff` shows only
      regeneration output, no hand edits
- [ ] The transaction response nests `legs[]`; the listing response is flat (§Req 22)
- [ ] No read method on any interface returns a total, sum, count, or balance (§Req 20)
- [ ] The cursor's encoding is decided and written down, including the malformed-vs-empty split
- [ ] The keyset predicate's shape is readable from the repository signature alone
- [ ] `reason`'s legal set agrees between the proto and the migration
- [ ] `go build ./...` succeeds (interfaces compile; no implementations required)

## Blocked By

I-0014 — the transaction-boundary pattern and the repository interface it lives on.

## Spec Reference

FS-0003 §API surface (both read operations, the field tables, the error rows), §Requirements 20
(no aggregates), 21 (the two-operation split), 22 (flattened vs nested), 23 (keyset, descending),
31 (transport types never mirror internal models). Governed by ADR-0005.

## Notes

No implementation. If a body is easier to write than an interface here, the boundary is not
decided yet — which is the point of the slice.
