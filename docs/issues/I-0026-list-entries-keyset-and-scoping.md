---
id: I-0026
status: open
implements: FS-0003
blocked_by: [I-0023, I-0024, I-0025]
labels: [blocked]
title: "FS-0003 slice 13: listEntries end-to-end — keyset pager, account scoping, authz matrix"
---
Implements FS-0003 §API surface, §Requirements 20, 23, 25, 27-28

**Author: human** — do NOT hand this to `/develop`. Two hard things in one slice: the keyset
predicate and the authorization matrix.

> **Extends the FS-0003 chain post-amendment.** The second and last of the read operations.

## What to Build

`GET /api/ledger/entries` — every layer, reusing the gateway scaffolding I-0025 created.

**Transport types — names are decided, do not invent.** Per FS-0003 §API surface's
transport-type table, in `api-gateway/internal/gateway/ledger`:

- **`Entry`** — one flattened history row, the `entries[]` member
- **`EntryPage`** — the response: `entries[]` plus `next_cursor`

**Not** `EntryDTO`, not `LedgerEntry`. `LedgerEntry` is the persistence struct (I-0017) and §Req
31 forbids the transport type mirroring it; `ledger.LedgerEntry` would also stutter. Reuse
`Leg` and `Transaction` from I-0025 rather than declaring parallel types.

**The flattened row** (§Req 22) — leg fields joined with their parent's, per §API surface's
`entries[]` table. Built by the query, not by re-nesting and flattening in Go.

**The keyset pager** (§Req 23) — over `(created_at, id)` **descending, newest first**. Direction
is contract, not preference: it decides which way the cursor's comparison runs.

> **`created_at` may not be on the row you are paging.** Under OQ2's two-table shape it is a
> transaction-level fact on the parent, deliberately absent from `ledger_entries`. The predicate
> then spans the join, and the index that serves it must actually be used — check the plan, do
> not assume. If I-0014 settled OQ2 differently, follow that.

`next_cursor` is **absent on the final page**, not present-and-null (§API surface). A client
loops while the field is there.

`limit` defaults to 50, max 100. `limit=0` is out of range (`422`), not "unlimited".

**The authorization matrix** (§Req 25, 27, 28):

| Caller | `account_id` param | Result |
|---|---|---|
| member | absent | own entries only, resolved via `wallet.GetAccount` |
| member | present | **`403 · FORBIDDEN`** — refused, never narrowed to empty |
| admin | present | that account's entries |
| admin | absent | unscoped — every entry, paged |

The member+`account_id` case is a **refusal, not a filter**. Silently returning an empty list
would leave a working existence oracle for account ids. Note this is deliberately the *louder*
`403`, unlike I-0025's `404` — there, existence is the secret; here it is nothing.

As in I-0025: **no role claim means `member`.** Fail closed.

## The invariant that outranks the rest

§Req 20 / ADR-0005: **no total, no sum, no count.** Not on the response, not on a repository
method, not as a convenience `X-Total-Count` header. Keyset pagination is partly chosen *because*
it needs no count — offset paging's total is the exact thing that would smuggle an aggregate in.

## Acceptance Criteria

- [ ] `GET /api/ledger/entries` returns flattened rows carrying both parent and leg fields
- [ ] Rows come back newest-first
- [ ] Paging the full history with `limit` below the row count visits every row exactly once —
      proven by a test that appends a transaction mid-page and asserts no row skipped or repeated
- [ ] `next_cursor` is absent, not null, on the final page
- [ ] A malformed cursor returns `422 · VALIDATION_FAILED`
- [ ] `limit=0` and `limit=101` are refused
- [ ] Member without `account_id` sees only their own entries
- [ ] Member with `account_id` receives `403 · FORBIDDEN`
- [ ] Admin with and without `account_id` behave per the matrix
- [ ] No response, method, or header carries a total, sum, or count
- [ ] The index intended to serve the keyset predicate is the one actually used — verified
      against the query plan
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-0023 — the cursor encoding and the repository read signature
- I-0024 — the gateway's ledger client
- I-0025 — the `ledger` typed package, `guard`, `Protected`, and the `wallet.GetAccount` helper

## Spec Reference

FS-0003 §API surface (the `listEntries` row, the `entries[]` table, `next_cursor`, the
error-semantics table), §Requirements 20 (no aggregates), 23 (keyset, descending, offset
refused), 25 (member refusal), 27 (wallet resolution), 28 (admin scoping). Governed by ADR-0005.

## TDD Approach

- RED: append a transaction between two page fetches; assert the second page skips and repeats
  nothing
- GREEN: keyset predicate over `(created_at, id)` descending
