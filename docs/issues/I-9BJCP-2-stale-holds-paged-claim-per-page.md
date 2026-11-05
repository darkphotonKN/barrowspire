---
id: I-9BJCP-2
status: done
implements: FS-9BJCP
blocked_by: []
labels: [ready-for-agent]
title: "FS-9BJCP slice 2: wallet pages stale reserved holds and the hold reconciler reads every page with one claim query per page (wallet-service, marketplace-service)"
---
Implements FS-9BJCP §Requirements 6–19, §Acceptance Criteria, §Edge States, §API surface

## What to Build

- **wallet.proto:** `ListStaleReservedHoldsRequest` gains `after` (string); `ListStaleReservedHoldsResponse` gains `next` (string). Additive field numbers only. Regenerate with the repo's proto target and keep only the wallet outputs in the diff.
- **wallet query + handler** (`internal/account/query/stale_reserved_holds_query.go`, `grpc/handler.go` `ListStaleReservedHolds`): order by `(created_at, bid_id)`, start strictly after `after` (decoded with the existing `cursor.Cursor`, ID = bid id), keep the clamp to 100, read `limit + 1` to set `next`; a malformed `after` → `InvalidArgument`. Filter unchanged.
- **marketplace hold reconciler** (`usecase/reconcile_holds_usecase.go`, `grpc/client.go` `ListStaleReservedHolds`, `query/has_bid.go`): read pages until `next` is empty; per page, ONE claim query over the page's bid ids (`id = ANY($1) AND status NOT IN ('CANCELLED','FAILED')`) replacing the per-row `HasBidHoldingGold`; release every unclaimed hold as today; a failed claim query releases nothing on that page and the pass moves on; no-progress guard; per-row release failures logged and skipped; a failed page read ends the pass with an error.
- **`worker/reconcile_holds.go`:** run each pass under a 2-minute deadline.
- One info line per pass with the counts. The 10-minute grace (`reserved_before`, caller clock) is unchanged.

## Acceptance Criteria

- [ ] DB-backed wallet: ordering by `(created_at, bid_id)`, strict `after`, clamp kept, `next` only when another row follows, ties on `created_at` with no skip or repeat; malformed `after` → `InvalidArgument`.
- [ ] DB-backed marketplace: the per-page claim query returns exactly the ids of bids not CANCELLED/FAILED.
- [ ] A pass with more than one page of claimed holds followed by one unclaimed hold releases it in the same pass, issuing one claim query per page.
- [ ] A failed claim query releases nothing on that page and the next page is still read.
- [ ] No-progress `next` stops the pass with an error; an expired/cancelled pass ctx stops between pages and rows and reports once; a failed page read ends the pass after rows already handled; the worker applies the 2-minute pass deadline.
- [ ] A response with no `next` ends the pass after that page (old-server compatibility).
- [ ] Tests pass.

## Blocked By

None. Hotspot note: shares the `make gen` regeneration with I-9BJCP-1 — run one after the other, not concurrently.

## Spec Reference

FS-9BJCP §Requirements 6–19; User Stories 3–9, 11–16.

## TDD Approach

- RED: a DB test with > 100 stale holds (tied `created_at`) visited once across pages; a use-case test with two pages of claimed holds and an orphan on page 3, asserting one claim query per page and the orphan released.
- GREEN: the keyset query; the paging loop with the batch claim query.
