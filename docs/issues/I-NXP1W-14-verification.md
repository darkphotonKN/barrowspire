---
id: I-NXP1W-14
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-6, I-NXP1W-8, I-NXP1W-9, I-NXP1W-11, I-NXP1W-12, I-NXP1W-13]
labels: [blocked]
title: "FS-NXP1W slice 14: verification — end-to-end auction test and break-it tests"
---
Implements FS-NXP1W §Requirements 39–40

**Author: agent**

## What to Build

- **End-to-end auction test (Req 39):** list → several bids → expiry → settlement. Assert final
  state in marketplace (listing `SOLD`, winner `WON`, losers `LOST`), wallet (buyer debited, holds
  committed or released, seller credited), items (owner = buyer, `AVAILABLE`) and ledger
  (**exactly two** rows under the derived transaction_id).
- **Break-it tests (Req 40):** retryable failure → backoff visible; cap exhausted → exception row
  + park, then `RetryStep` resumes; semantic impossibility before the pivot → `SETTLEMENT_FAILED`;
  worker killed mid-activity → the activity is rescheduled and settlement completes.

## Scope fence

Tests only. If a test exposes a behavior bug, report it against the owning slice instead of fixing
it here. Crash-point tables are already committed by each arm.

## Acceptance Criteria

- [ ] The e2e auction test passes across all four services
- [ ] Each break-it scenario in Req 40 has a passing test
- [ ] Killing a participant worker mid-activity does not change the final state
- [ ] `make test` green

## Blocked By

I-NXP1W-6, I-NXP1W-8, I-NXP1W-9, I-NXP1W-11, I-NXP1W-12, I-NXP1W-13 (every arm done).

## Spec Reference

FS-NXP1W §Requirements 39 (e2e), 40 (break-it). User stories 16, 23.
