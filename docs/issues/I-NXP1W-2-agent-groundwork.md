---
id: I-NXP1W-2
status: done
implements: FS-NXP1W
blocked_by: [I-NXP1W-1]
labels: []
title: "FS-NXP1W slice 2: agent groundwork — activity contract packages and diagram fix (only if needed)"
---
Implements FS-NXP1W §Requirements 16–18, 41

**Author: agent**

## What to Build

Mechanical cleanup before the arms start. **Check first; do only what is missing.**

- **Activity contract packages** under `game-server/common/api/activity/`:
  `marketplaceactivity`, `itemsactivity`, `walletactivity`, alongside the existing
  `ledgeractivity`. Activity name constants plus the input/output structs from Req 18, as plain
  structs with explicit JSON tags (ADR-0019). One golden-JSON fixture test per struct.
- **Design diagram** corrected per Req 41.

## Scope fence

No activity implementations, use cases, migrations or workflow code. Those belong to the arms
(slices 3–13), which check for and add their own schema as they go.

## Acceptance Criteria

- [x] The three packages exist, match ledgeractivity's layout, and carry every activity in Req 18
- [x] Each struct has a golden-JSON fixture test; changing a tag fails it
- [ ] The diagram shows `settlement-{listingId}`, CommitHold keyed on winnerBidId, step 5 = ledger,
      uuidv5 transaction_id, `PENDING_SETTLEMENT` / `SOLD` / `SETTLEMENT_FAILED` / `EXPIRED`, no
      `REVERSED`, escalate-and-park drawn
- [x] `make test` green

## Blocked By

I-NXP1W-1

## Spec Reference

FS-NXP1W §Requirements 16–18 (activity contract), 41 (design diagram). ADR-0019.

## Outcome

Four sibling packages under `game-server/common/api/activity/`, one per executing service, each
holding its activity name constants and payload structs:

| Package | Activities |
|---|---|
| `marketplaceactivity` | FreezeListing, SetWinningBid, MarkSold, RaiseSettlementException, MarkSettlementFailed, LoseAllBids |
| `itemsactivity` | FreezeItem, TransferItem, UnfreezeItem |
| `walletactivity` | CommitHold, ReleaseLosingHolds, CreditSeller, ReleaseAllHolds |
| `ledgeractivity` | AppendLedgerTx (pre-existing, moved and fixtured) |

Every row of Req 18 is covered. Field names and JSON tags follow the Req 18 table's own wording;
IDs are `uuid.UUID` and amounts `int64`, following `ledgeractivity`'s precedent rather than
wallet's platform-width `int`.

Decisions a reviewer should look at rather than assume:

- **`ledgeractivity` moved** from `common/api/activity/append.go` to
  `common/api/activity/ledgeractivity/append.go`. It was the only package in the directory and its
  package name did not match it, so the other three could not be siblings. Nothing imported it
  (verified), so the move costs nothing now and would cost four arms' import paths later. It also
  gained the golden fixtures Req 17 requires and never had.
- **Rollback activity names are this slice's, not the FS's.** Req 18's last row says only
  "rollback activities (Req 12)". `MarkSettlementFailed`, `LoseAllBids`, `UnfreezeItem` and
  `ReleaseAllHolds` are derived from Req 12 and slices 5/6. Nothing schedules them yet, so slices
  5 and 6 can still rename them cheaply.
- **Rows the Req 18 table marks output `—` get no Output type.** The activity returns only an
  error. A later slice that needs a result adds one additively.
- **Single-field inputs are not deduplicated.** `FreezeListingInput`, `MarkSoldInput`,
  `MarkSettlementFailedInput` and `LoseAllBidsInput` are all just a listing ID. Additive-only means
  each has to be able to grow a field without dragging the others' wire shape along.

The golden guard is `activitytest.Golden`, a generic helper asserting both directions: encoding
pins the tags, and decoding the committed fixture back into the current struct is the replay
guarantee ADR-0019 actually cares about. Verified non-vacuous by hand — renaming `seller_id` to
`sellerId` and retyping `Amount` from `int64` to `string` each fail the suite.

**Req 41 (design diagram) — nothing to correct.** There is no settlement design diagram in the
repo: no `.mmd`, `.svg`, `.drawio` or mermaid block anywhere, and no file outside the ADRs and the
FS itself mentions `bid-{bidId}` or `REVERSED`. The issue scopes this as "only if needed". If the
diagram lives outside the repo, Req 41 is still open and belongs wherever it is kept.
