---
id: I-NXP1W-4
status: open
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 4: pivot arm forward — 1a SetWinningBid, 1b CommitHold"
---
Implements FS-NXP1W §Requirements 19, 21, 27–28

**Author: human** (Nick)

## What to Build

The steps from the winning bid up to and including the pivot, on the forward path only. Failure
handling is slice 6.

- **1a SetWinningBid** (marketplace): bid `WINNING → WON`, conditional on status. An already `WON`
  bid is success.
- **1b CommitHold** (wallet, the pivot): in wallet's aggregate style (reconstitute, domain method,
  OCC save), hold `RESERVED → COMMITTED` and debit the account atomically.
  - The debit is the **hold's own amount**; the caller's expected amount is only a cross-check.
  - Guard `gold >= amount`.
  - A `COMMITTED` hold is already applied: success with the same output (buyer walletAccountId, committed amount).
- **PlaceHold takes an explicit expiry** (listing expiry + settlement grace), stored in
  `wallet_holds.expired_at` instead of deriving it from `time.Now()`. Without this, the hold
  sweeper can race settlement.

**Check as you go:** bids `WON`/`LOST` statuses (Req 21).

## Acceptance Criteria

- [ ] SetWinningBid is a conditional write; re-running it is success
- [ ] CommitHold debits by the hold's amount and commits the hold in one OCC save
- [ ] CommitHold on a `COMMITTED` hold returns success with the same output and moves no gold
- [ ] `PlaceHold` stores the explicitly passed expiry
- [ ] Use cases tested without Temporal; `make test` green

## Blocked By

None. Starts in parallel with slices 1 and 3: build and test the use cases, then wrap them as
activities and test them with the Temporal SDK's activity test environment. Scheduling them from
the workflow, after 0a's winner output, happens once I-NXP1W-3 lands. That's integration, not a
blocker.

## Spec Reference

FS-NXP1W §Requirements 19 (hold expiry), 21 (bid statuses), 27 (1a), 28 (1b). User stories 5,
19–20, 25. ADR-0005, ADR-0010.
