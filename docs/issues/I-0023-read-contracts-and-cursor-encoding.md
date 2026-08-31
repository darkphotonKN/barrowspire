---
id: I-0023
status: done
implements: FS-0003
blocked_by: [I-0014]
labels: []
title: "FS-0003 slice 10: read contracts — proto RPCs, query-object read interfaces, cursor encoding"
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
flattened entry row on the listing (§Req 22). Three shapes §API surface now pins explicitly:

- **`optional string account_id_target`** on `ListEntriesRequest` — named apart from the caller's
  own `account_id` claim so the two cannot be confused, and `optional` because §Req 25 needs
  "unset" distinguishable from "set to the empty string": presence is an admin-only request, so a
  member who sets it is refused rather than scoped back to themselves. A bare `string` collapses
  the two and loses that signal on the wire.
- **`shared.v1.PageInfo pagination`** rather than a bare `next_cursor` field. proto3 gives a plain
  `string` no way to be absent, so the **empty string is the end-of-pages signal on the gRPC leg**
  and the gateway is what turns it into the absence the HTTP contract promises.
- **`id` on `Entry`** — the entry's own id, and the `id` half of the cursor's `(created_at, id)`.
  It is the sort key's tiebreaker, not decoration, so it cannot be dropped from the row.

**Run generation here**, absorbed from I-0018: regenerate `ledger.pb.go` and `ledger_grpc.pb.go`.
**Generated Go is never hand-edited** (root CLAUDE.md) — if the output is wrong, fix the `.proto`
and regenerate. Registration and handler arms are I-0025's, not this slice's.

**2. The read interfaces — query objects, not repository methods.** Reads do not hang off the
repository: it carries exactly one method, `Append` (§Req 9, I-0014). A repository provides
access to aggregate roots, and a flat entry row is not an aggregate and enforces no invariant, so
serving one from a repository method misuses the pattern's name.

The read path is served by **query objects** — `GetTransactionQuery` and `ListEntriesQuery` —
which hold `*sqlx.DB` directly, return DTOs, and bypass the domain entirely, because no invariant
is being enforced on a read. **Their interfaces are declared consumer-side by the gRPC handler**,
not in the domain package: the handler states the two reads it needs, and the query objects
satisfy them. Two reads: one transaction by id with its legs, and a keyset page of entries.
**Neither returns a total, a sum, or a count** (§Req 20, ADR-0005) — the absence is enforced by
there being no such method, the same way I-0014 enforces no-update, no-delete, and no-read.

The DTOs are read models and stay distinct from the gateway's transport types (`Entry`,
`EntryPage`, `Transaction`, `Leg`), which are named in FS-0003 §API surface's transport-type
table. Keeping them distinct is §Req 31.

**`LedgerEntry` is not what these queries return, and §API surface now says so.** It is the leg
row *as stored*, matching `ledger_entries` column for column, written by the append path and owned
by I-0017. The read path's shapes are the DTOs — `TransactionDetails` + `LegDetail` from
`GetTransactionQuery`, `ListEntriesDetails` + `EntryDetail` from `ListEntriesQuery` — and
`EntryDetail` is §Req 22's flattened row. One row, three shapes: stored, read back, serialized.

> **Consequence this slice must not paper over.** `EntryDetail` carries `reference_id`, `reason`,
> and `currency`, which live on `ledger_transactions`, not `ledger_entries`. The keyset predicate
> still runs on `ledger_entries` alone — that is what the `(account_id, created_at, id)` index is
> for — but filling those three fields needs the parent. Whether that is a join across the page's
> bounded row set or a second query is **I-0026's call**; this slice only has to leave the
> signature able to express either.

**3. The cursor's encoding — DECIDED by [ADR-0012](../adr/0012-cursors-are-opaque-sort-keys-carrying-no-identity.md); implement it, do not redecide it.**
Keyset over `(created_at, id)` descending (§Req 23). The ADR settles all three questions this
slice used to carry:

- **base64url of `created_at|id`** — the sort key of the page's last row, on the wire. `opaque`
  in §API surface stays a promise to clients, and the format stays out of that section
  deliberately; it lives in the ADR because it is the thing clients are not told.
- **The cursor carries the position and nothing else** — no `account_id`, no filter state, no
  limit. This one is a security constraint, not a preference: a cursor comes back unvalidated, so
  an account embedded in it would make *holding* a cursor the authority to read that account's
  history, and §Req 24–27's masking would be walked around by replay rather than defeated. The
  caller is resolved from the JWT on every page.
- **Decoded at the adapter.** Ports and repository signatures take the decoded sort key as typed
  values; an encoded cursor string never crosses into the port.
- **Malformed → `422 · VALIDATION_FAILED`; past-the-end → empty page, `next_cursor` absent.** Never
  a silent reset to page one.

> **This was a one-way door, which is why it is an ADR and not a line in this issue.** A cursor's
> encoding is held by clients between requests and there is no version negotiation on a query
> param. If implementing it surfaces a reason the decision is wrong, that is a new ADR superseding
> ADR-0012 — not an edit here.

## Where `created_at` lives — SETTLED, and it shapes the read signature

**`created_at` is on `ledger_entries`, duplicated from the parent on purpose** (FS-0003 §Data
model). Normalising it away would be the textbook call and would put a join inside the keyset
predicate of every history page. Because the table is append-only and never updates, the usual
cost of duplication — two copies drifting — cannot occur.

The consequence for this slice: **the read signatures page `ledger_entries` alone.** No join, no
correlated subquery. `(account_id, created_at, id)` serves a scoped history; `(created_at, id)`
serves the unscoped admin listing. The cursor encodes that sort key and nothing else.

## The `reason` and `direction` vocabularies — SETTLED, do not reopen

`SETTLE_AUCTION`, `DEPOSIT`, `WITHDRAW`, `TRANSFER`. **There is no `Reason` enum in the proto** —
`reason` is a plain `string` on the wire, and the closed set is enforced on the write path and by
the migration's `CHECK`. FS-0003 §Requirements 5a and §Open questions 3 record both the set and
why the proto carries no third copy of it.

**`direction` is the same decision, and §API surface's proto block no longer declares an enum for
it either.** `DEBIT` and `CREDIT` cross as plain `string`, enforced by the Go value type on the
write path and by the migration's `direction_valid` `CHECK`. The reasoning is identical: the read
path echoes what is stored, an enum forces the handler to map a stored string onto a declared
value, and a value the proto does not declare becomes the zero value — reporting `UNSPECIFIED`
for a row that plainly says `CREDIT`.

Only `SETTLE_AUCTION` has a caller today. The other three are **forward-declared on purpose** —
building the deposit/withdraw/transfer *verbs* is out of scope, but **recording their effects
needs no ledger change**, which is why the set is closed now rather than grown later. The read
response echoes `reason` as stored; it does not validate against the set (the write path already
did), and it does not fail on a value it has not heard of.

## Acceptance Criteria

- [ ] `ledger.proto` carries `GetTransaction` and `ListEntries` with the shapes in §API surface
- [ ] `ledger.proto` carries no `AppendLedgerTx`, `CreateLedger`, or `GetLedger`
- [ ] `ledger.pb.go` and `ledger_grpc.pb.go` regenerate cleanly; `git diff` shows only
      regeneration output, no hand edits
- [ ] The transaction response nests `legs[]`; the listing response is flat (§Req 22)
- [ ] `Entry` carries `id` — without it the cursor's `(created_at, id)` has no tiebreaker to read
- [ ] `account_id_target` is declared `optional`, so "unset" and "empty string" are distinguishable
      on the wire (§Req 25)
- [ ] `ListEntriesResponse` paginates through `shared.v1.PageInfo`, and an exhausted page carries
      an empty `next_cursor` rather than a field the proto cannot mark absent
- [ ] No read method on any interface returns a total, sum, count, or balance (§Req 20)
- [ ] No read hangs off the repository — the two read interfaces are declared by the gRPC handler
      and satisfied by query objects that return DTOs
- [ ] The cursor is base64url of `created_at|id` and encodes nothing else — asserted, including
      that no identity appears in it (ADR-0012)
- [ ] Malformed cursor and past-the-end cursor are distinguished: `422` vs an empty page with
      `next_cursor` absent
- [ ] No port or repository signature takes an encoded cursor string
- [ ] The keyset predicate's shape is readable from the repository signature alone
- [ ] `reason` and `direction` are plain `string` fields in the proto — neither a `Reason` enum
      nor a `Direction` enum is declared, and both legal sets live on the write path and in the
      migration's `CHECK`s
- [ ] `go build ./...` succeeds (interfaces compile; no implementations required)

## Blocked By

I-0014 — the transaction-boundary pattern and the repository interface it lives on.

## Spec Reference

FS-0003 §API surface (both read operations, the field tables, the error rows), §Requirements 20
(no aggregates), 21 (the two-operation split), 22 (flattened vs nested), 23 (keyset, descending),
31 (transport types never mirror internal models). Governed by ADR-0005 and **ADR-0012**
(the cursor's encoding, contents, and decode location).

## Notes

No implementation. If a body is easier to write than an interface here, the boundary is not
decided yet — which is the point of the slice.
