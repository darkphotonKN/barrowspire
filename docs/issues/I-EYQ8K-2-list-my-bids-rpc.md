---
id: I-EYQ8K-2
status: open
implements: FS-EYQ8K
blocked_by: []
labels: [ready-for-agent]
title: "FS-EYQ8K slice 2: marketplace reads a member's own bids (ListMyBids RPC)"
---
Implements FS-EYQ8K §Requirements (Req 1–6, 8)

**Author:** unassigned

## What to Build

marketplace-service + the shared proto. A new read RPC `ListMyBids` mirroring `ListMyListings`:
request `cursor` (opaque) + `limit`; response the caller's bids, newest placed first `(created_at DESC, id)`,
with `next_cursor` while more remain. Each row: bid id, listing id, amount, status, placed at, and the
listing summary (status, ends at, ended, current price — absent when nobody leads — buyout price —
absent when unset) plus the listing's `item_instance_id` so the gateway can embed the item.
Only `PENDING`, `WINNING`, `OUTBID`, `WON`, `LOST` are returned (never `FAILED`, `CANCELLED`).
One row per bid. Query in `internal/listing/query/` over `bids` joined to `listings`, using
`idx_bids_member`; no migration. Regenerate proto Go (`common/api/proto`), never hand-edit it.
gRPC handler takes the member from the call's identity, as `ListMyListings` does.

## Acceptance Criteria

- [ ] Only the caller's bids come back, newest first; `FAILED` and `CANCELLED` never.
- [ ] Two bids by one member on one listing are two rows.
- [ ] Paging: `limit` honoured, `next_cursor` set while more remain and absent at the end; a page boundary on equal `created_at` neither skips nor repeats (tie broken by id).
- [ ] A malformed cursor answers `INVALID_ARGUMENT`.
- [ ] Each row carries the listing summary fields; `current_price` reflects the listing now (another delver's bid when they lead).
- [ ] Query tests against the DB (`MARKETPLACE_TEST_DB_DSN`); handler test for the identity and the cursor error.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-EYQ8K §Requirements 1–6, 8; §User Stories 1–8, 18–20; §Acceptance Criteria (read rows).

## TDD Approach

- RED (query, DB): member with bids in every status → only the five listed statuses, newest first.
- RED (query, DB): three bids, limit 2 → two rows + cursor; next page → one row, no cursor.
- RED (handler): malformed cursor → `INVALID_ARGUMENT`.
