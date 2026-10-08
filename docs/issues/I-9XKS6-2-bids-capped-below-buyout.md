---
id: I-9XKS6-2
status: done
implements: FS-9XKS6
blocked_by: [I-9XKS6-1]
labels: []
title: "FS-9XKS6 slice 2: bids at or above the buyout price are refused"
---
Implements FS-9XKS6 §Requirements 4, 10 (second half), §API surface (place-bid refusal row)

**Author: agent**

## What to Build

On a listing with a buyout price, `PlaceBidWithID` refuses a `BID` whose amount is `>= buyoutPrice`
with `ErrBidAtOrAboveBuyout`, mapped to gRPC `InvalidArgument` like `ErrBidTooLow`
(`400 · VALIDATION_FAILED` at the gateway). Listings without a buyout price are unchanged.

## Acceptance Criteria

- [ ] Bid `>= buyoutPrice` → `ErrBidAtOrAboveBuyout`, no bid created; the use case releases the hold as it does for any refused write
- [ ] Bid below it follows the existing rules
- [ ] No buyout price → bidding unchanged
- [ ] `ErrBidAtOrAboveBuyout` maps to `InvalidArgument`
- [ ] `make test` green

## Blocked By

I-9XKS6-1 (the domain must carry the buyout price).
