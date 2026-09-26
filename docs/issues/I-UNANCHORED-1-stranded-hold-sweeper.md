---
id: I-UNANCHORED-1
status: open              # open | in-progress | done
implements: none          # needs an FS or ADR before /develop will accept it
blocked_by: []
labels: []
title: Sweep wallet holds stranded by a failed place-bid
---
Implements: none yet. Needs an anchor (FS or ADR) deciding who owns the sweep before it can be developed.

## What to Build

`PlaceBidUC` places the wallet hold **before** the listing's domain checks run
(`marketplace-service/internal/listing/usecase/place_bid_usecase.go`). When the bid is then
refused (bid too low, listing expired or not accepting bids, OCC retries exhausted), the usecase
returns `"… hold is stranded"` and nothing releases the hold. The bidder's gold stays locked.

No sweeper exists today:
- wallet-service stores `wallet_holds.expired_at` but nothing reads it to release expired holds
  (no ticker or worker in wallet-service);
- marketplace's `ReconcileWorker` only reconciles stale **item reservations**;
- settlement's release-losing-holds activity (FS-NXP1W) releases holds belonging to the listing's
  bids. A stranded hold has no bid on the listing, so settlement never sees it.

Open design question for the anchor: a wallet-owned expiry sweep (release RESERVED holds past
`expired_at`), or a marketplace reconciler that releases holds whose `bid_id` has no bid row.

## Acceptance Criteria

- [ ] A hold whose bid was refused after the hold was placed is eventually released.
- [ ] A hold backing a live WINNING bid is never released by the sweep.
- [ ] The sweep is idempotent and safe to run concurrently with settlement.

## Blocked By

None. Needs an anchor first.

## Spec Reference

Found while reconciling the marketplace HTTP surface (FS-0YXG6); explicitly out of scope there.
