---
id: I-XEDFF-2
status: done
implements: FS-XEDFF
blocked_by: [I-XEDFF-1]
labels: []
title: "FS-XEDFF slice 2: at most 20 listed items per seller (items-service)"
---
Implements FS-XEDFF §Requirements 5–9

## What to Build

In items `ReserveItem` (`internal/items/service.go`), inside the existing transaction after `LockAccountTx` and the placement checks and before `ReserveItemTx`, count the seller's instances in `LISTED` or `PENDING_SETTLEMENT`; at `MaxListedItems = 20` refuse with `errcode.Refuse(errcode.ListingLimitReached)` and write nothing. A repository method for the count (owner-scoped, run on the tx). Marketplace forwards the refusal unchanged (existing path); the client copy and the code's registration land in I-XEDFF-1.

## Acceptance Criteria

- [ ] DB-backed: 19 LISTED/PENDING_SETTLEMENT → reserve succeeds; at 20 → `LISTING_LIMIT_REACHED`, item still AVAILABLE, no `listing_id`, no `reserved_at`, no outbox row.
- [ ] AVAILABLE and IN_RUN items don't count; another member's listed items don't count.
- [ ] Two concurrent reserves at 19 → exactly one succeeds (account lock).
- [ ] A worn / unavailable item at the cap still answers `ITEM_WORN` / `ITEM_NOT_AVAILABLE`.
- [ ] gRPC ReserveItem → FailedPrecondition reason `LISTING_LIMIT_REACHED`; through marketplace and gateway → `400 · LISTING_LIMIT_REACHED` (seam test).

## Files expected to touch

- `game-server/items-service/internal/items/service.go`, `repository.go` (+ tests)
- possibly `game-server/items-service/internal/items/handler.go` (only if the refusal needs mapping; it should pass through as FS-HBXZN's do)

## Blocked By

I-XEDFF-1 (registers `LISTING_LIMIT_REACHED` in `common/errcode` and the client copy)

## Spec Reference

FS-XEDFF §Requirements 5–9; §User Stories 4–5, 7; §Acceptance Criteria rows 5–7.
