---
id: I-S109X-3
status: done
implements: FS-S109X
blocked_by: [I-S109X-1]
labels: []
title: "FS-S109X slice 3: the withdraw confirm says whether the withdrawal counts (client)"
---
Implements FS-S109X §Requirements 10–12, §Acceptance Criteria

## What to Build

In My bids, the withdraw confirm for an outbid bid stops warning about a limit it can't reach; a leading bid's confirm keeps the warning. No API change: the confirm already has the bid's status.

- `game-client/src/marketplace/withdrawBid.ts` `withdrawConfirmText`: for `OUTBID` (case-insensitive, as today) → "Withdraw your bid of 75 gold? Your gold is returned. Withdrawing an outbid bid doesn't count toward the limit."; for `WINNING` → unchanged: "Withdraw your bid of 1,200 gold? The next highest bid takes the lead. After three withdrawals on one auction, you can't bid on it again." Update the doc comments that cite FS-ZE43K req 13 "on every confirm".
- `BID_WITHDRAW_LIMIT_REACHED` refusal copy (FS-ZE43K Req 12) unchanged.

## Acceptance Criteria

- [ ] `withdrawConfirmText({status: "outbid", amount: 75})` returns Req 10's exact text; `WINNING` returns Req 11's exact text.
- [ ] `withdrawOffered`, `withdrawFailure` and the refusal copy unchanged.
- [ ] Tests pass (game-client).

## Blocked By

I-S109X-1 (the confirm must not promise a free withdrawal before marketplace makes it free)

## Spec Reference

FS-S109X §Requirements 10–12; User Stories 3–5.

## Expected files

game-client `src/marketplace/withdrawBid.ts` + `withdrawBid.test.ts` (and `withdrawBidFlow.test.ts` only if it asserts the confirm text).

## TDD Approach

- RED: change the `outbid` case in `withdrawBid.test.ts` to Req 10's text; it fails on the current warning.
- GREEN: branch the trailing sentence on status in `withdrawConfirmText`.
