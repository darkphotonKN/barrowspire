---
id: I-V7A5S-3
status: done
implements: FS-V7A5S
blocked_by: []
labels: [ready-for-agent]
title: "FS-V7A5S slice 3: My bids says \"Withdrawn by seller\" for a bid on a withdrawn listing (game-client)"
---
Implements FS-V7A5S §Requirements 17–18

## What to Build

In My bids, a bid whose listing's status is CANCELLED reads **"Withdrawn by seller"** (and says the gold was returned) instead of "Lost". Every other bid label is unchanged. `MyBid.listing.status` is already on the wire, so this is client-only: `marketplace/myBids.ts` (`bidStatusLabel` / `myBidRow`) learns the listing status. No withdraw action appears on such a row (the existing `listingLive` rule already hides it).

## Acceptance Criteria

- [ ] `myBidRow` table: LOST + listing CANCELLED → "Withdrawn by seller"; LOST + listing SOLD / SETTLEMENT_FAILED / EXPIRED → "Lost"; every existing status row unchanged.
- [ ] The row's note says the gold was returned.
- [ ] vitest, tsc, next lint clean.

## Files expected to touch

- `game-client/src/marketplace/myBids.ts` (+ `myBids.test.ts`)
- possibly `game-client/src/components/bazaar/MyBidsTable.tsx` (only if the note needs a slot)

## Blocked By

None (renders a status the server can already produce via settlement rollback; the server-side withdrawal lands in I-V7A5S-1)

## Spec Reference

FS-V7A5S §Requirements 17–18; §User Stories 6–7; §Acceptance Criteria (Client, last row).
