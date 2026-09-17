---
id: I-NXP1W-2
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-1]
labels: [blocked]
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
(slices 3–8), which check for and add their own schema as they go.

## Acceptance Criteria

- [ ] The three packages exist, match ledgeractivity's layout, and carry every activity in Req 18
- [ ] Each struct has a golden-JSON fixture test; changing a tag fails it
- [ ] The diagram shows `settlement-{listingId}`, CommitHold keyed on winnerBidId, step 5 = ledger,
      uuidv5 transaction_id, `PENDING_SETTLEMENT` / `SOLD` / `SETTLEMENT_FAILED` / `EXPIRED`, no
      `REVERSED`, escalate-and-park drawn
- [ ] `make test` green

## Blocked By

I-NXP1W-1

## Spec Reference

FS-NXP1W §Requirements 16–18 (activity contract), 41 (design diagram). ADR-0019.
