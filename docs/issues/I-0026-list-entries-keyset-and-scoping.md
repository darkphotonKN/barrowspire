---
id: I-0026
status: open
implements: FS-0003
blocked_by: [I-0024, I-0025, I-0042]
labels: [blocked]
title: "FS-0003 slice 13: listEntries end-to-end — keyset pager, account scoping, authz matrix"
---
Implements FS-0003 §API surface, §Requirements 20, 23, 25, 27-28

**Author: human** — do NOT hand this to `/develop`. Two hard things in one slice: the keyset
predicate and the authorization matrix.

> **Extends the FS-0003 chain post-amendment.** The second and last of the read operations.

## What to Build

`GET /api/ledger/entries` — the gateway surface, reusing the scaffolding I-0025 created.

> **Narrowed: the flattened keyset query, the index proof, and the `ListEntries` gRPC arm moved
> to I-0042.** Sort order and cursor encoding were already fixed by I-0023 and ADR-0012, which
> makes the SQL mechanical. What remains here is the authorization matrix, the cursor decode at
> the adapter, and the transport types — the parts that are decisions.

**Transport types — names are decided, do not invent.** Per FS-0003 §API surface's
transport-type table, in `api-gateway/internal/gateway/ledger`:

- **`Entry`** — one flattened history row, the `entries[]` member
- **`EntryPage`** — the response: `entries[]` plus `next_cursor`

**Not** `EntryDTO`, not `LedgerEntry`. `LedgerEntry` is the persistence struct (I-0017) and §Req
31 forbids the transport type mirroring it; `ledger.LedgerEntry` would also stutter. Reuse
`Leg` and `Transaction` from I-0025 rather than declaring parallel types.

**The flattened row** (§Req 22) — leg fields joined with their parent's, per §API surface's
`entries[]` table. Built by the query, not by re-nesting and flattening in Go.

**The keyset pager** (§Req 23) is built in I-0042, over `(created_at, id)` **descending, newest
first**. Direction is contract, not preference: it decides which way the cursor's comparison
runs — and therefore which way *this* slice's adapter decodes into. What belongs here is the
decode, not the predicate.

> **`created_at` is on `ledger_entries`, and the predicate needs no join.** It is a
> transaction-level fact **duplicated onto the leg deliberately** (FS-0003 §Data model), which is
> exactly what lets `(account_id, created_at, id)` serve a scoped history page directly. The
> normal objection to denormalising — two copies drifting — cannot happen in a table that never
> updates.
>
> The unscoped admin listing uses `(created_at, id)` for the same reason. **Verify the planner
> actually picks these indexes** rather than assuming it does; that is the acceptance criterion
> below, not a nicety.

`next_cursor` is **absent on the final page**, not present-and-null (§API surface). A client
loops while the field is there.

**Scoping is re-read from the JWT on every page, never from the cursor** ([ADR-0012](../adr/0012-cursors-are-opaque-sort-keys-carrying-no-identity.md)).
The cursor carries `created_at|id` and nothing else, so page two runs the same authorization
check against the same source as page one. If paging ever appears to "remember" whose rows it was
fetching, that memory is a hole: a cursor returns from the client unvalidated, and an account
embedded in one would make possession of a cursor equal authority over that account's history.
A cursor pointing past the last row is an **empty page with `next_cursor` absent** — a success,
not an error, and never a reset to page one.

`limit` defaults to 50, max 100. `limit=0` is out of range (`422`), not "unlimited".

**The authorization matrix** (§Req 25, 27, 28):

| Caller | `account_id` param | Result |
|---|---|---|
| member | absent | own entries only, scoped by the `account_id` token claim |
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
- [ ] A cursor pointing past the last row returns an empty page with `next_cursor` absent —
      not an error, not page one
- [ ] A member replaying another member's cursor still gets only their own rows — asserted,
      since this is what keeps the cursor from acting as a capability token (ADR-0012)
- [ ] `limit=0` and `limit=101` are refused
- [ ] Member without `account_id` sees only their own entries
- [ ] Member with `account_id` receives `403 · FORBIDDEN`
- [ ] Admin with and without `account_id` behave per the matrix
- [ ] No response, method, or header carries a total, sum, or count
- [ ] The index intended to serve the keyset predicate is the one actually used — verified
      against the query plan
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-0024 — the gateway's ledger client
- I-0025 — the `ledger` typed package, `guard`, `Protected`, and the claim plumbing
- I-0042 — the flattened keyset query and the `ListEntries` gRPC arm this operation calls
  (which in turn carries I-0023's cursor encoding and read signature)

## Spec Reference

FS-0003 §API surface (the `listEntries` row, the `entries[]` table, `next_cursor`, the
error-semantics table), §Requirements 20 (no aggregates), 23 (keyset, descending, offset
refused), 25 (member refusal), 27 (`account_id` as a token claim), 28 (admin scoping). Governed
by ADR-0005 and **ADR-0012** (the cursor is a position, not a request).

## TDD Approach

- RED: append a transaction between two page fetches; assert the second page skips and repeats
  nothing
- GREEN: keyset predicate over `(created_at, id)` descending
