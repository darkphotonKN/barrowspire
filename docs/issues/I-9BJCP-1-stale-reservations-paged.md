---
id: I-9BJCP-1
status: done
implements: FS-9BJCP
blocked_by: []
labels: [ready-for-agent]
title: "FS-9BJCP slice 1: items pages stale reservations and the stale-reservation reconciler reads every page (items-service, marketplace-service)"
---
Implements FS-9BJCP §Requirements 1–5, 11–14, 16–19, §Acceptance Criteria, §Edge States, §API surface

## What to Build

- **items.proto:** `ListStaleReservedRequest` gains `after` (string) and `limit` (int32); `ListStaleReservedResponse` gains `next` (string). Additive field numbers only. Regenerate with the repo's proto target and keep only the items outputs in the diff (revert any other stale proto `make gen` rewrites).
- **`cursor.ReservedAt`** in `common/utils/cursor`, keyed by `(reserved_at, id)`, ADR-0012 wire format, modelled on `cursor.UpdatedAt`.
- **items repository/service/handler:** `ListStaleReserved` orders by `(reserved_at, id)`, starts strictly after `after`, clamps `limit` to 100 (absent → 100), reads `limit + 1` to set `next`; a malformed `after` → `InvalidArgument`. Filter unchanged.
- **marketplace stale-reservation reconciler** (`usecase/reconcile_reservations_usecase.go`, adapter `adapter/itemreserver/*`): read pages until `next` is empty; stop with an error on a `next` equal to the cursor sent; stop between pages and rows when ctx ends, reporting it once; per-row failures logged and skipped; a failed page read ends the pass with an error. Confirm/cancel decisions and the listing-id fence (FS-04ZB6) unchanged. The pass already runs under `worker/reconcile.go`'s per-pass deadline.
- One info line per pass with the counts.

## Acceptance Criteria

- [ ] DB-backed: ordering by `(reserved_at, id)`, strict `after`, clamp, `next` only when another row follows, ties on `reserved_at` with no skip or repeat across pages; malformed `after` → `InvalidArgument`.
- [ ] `cursor.ReservedAt` round-trips; empty string = no cursor.
- [ ] A pass with a full page of always-failing rows followed by one orphan cancels the orphan in the same pass.
- [ ] No-progress `next` stops the pass with an error; a cancelled pass ctx stops between pages and rows and reports once; a failed page read ends the pass after rows already handled.
- [ ] A response with no `next` ends the pass after that page (old-server compatibility).
- [ ] Existing reconciler tests (confirm when live by listing id, cancel otherwise) stay green.
- [ ] Tests pass.

## Blocked By

None. Hotspot note: shares the `make gen` regeneration with I-9BJCP-2 (all protos regenerate together) — run the two slices one after the other, not concurrently.

## Spec Reference

FS-9BJCP §Requirements 1–5, 11–14, 16–19; User Stories 1, 2, 6–10, 12–15, 17.

## TDD Approach

- RED: a DB test inserting > 100 stale reservations with tied `reserved_at` and asserting two pages visit each once; a use-case test with a full first page of failing rows and an orphan on page 2.
- GREEN: the keyset query + cursor; the paging loop.
