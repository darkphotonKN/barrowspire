---
id: I-ZE43K-2
status: done
implements: FS-ZE43K
blocked_by: [I-ZE43K-1]
labels: []
title: "FS-ZE43K slice 2: the bazaar explains the withdrawal cap (client)"
---
Implements FS-ZE43K §Requirements 12–13, §Acceptance Criteria

## What to Build

- `game-client/src/marketplace/bid.ts` `bidFailure`: `400 · BID_WITHDRAW_LIMIT_REACHED` → "You've withdrawn too many bids on this auction to bid on it again." (no re-read). Other refusals unchanged.
- `game-client/src/marketplace/withdrawBid.ts` `withdrawConfirmText`: append "After three withdrawals on one auction, you can't bid on it again." for both a leading and an outbid bid.

## Acceptance Criteria

- [ ] `bidFailure` row for `BID_WITHDRAW_LIMIT_REACHED` with the Req 12 copy; existing rows (VALIDATION_FAILED, FAILED_PRECONDITION, ALREADY_EXISTS, EMAIL_UNVERIFIED, 409, 503) unchanged.
- [ ] `withdrawConfirmText` carries the Req 13 line for WINNING and OUTBID bids.
- [ ] tsc, vitest and next lint pass.

## Blocked By

I-ZE43K-1 (the code must exist on the wire for the end-to-end path; the client logic itself can be written against the code name).

## Spec Reference

FS-ZE43K §Requirements 12–13; User Stories 3–4.

## Expected files

`game-client/src/marketplace/bid.ts` + `bid.test.ts`; `game-client/src/marketplace/withdrawBid.ts` + `withdrawBid.test.ts`.

## TDD Approach

- RED: `bidFailure(apiError(400, "BID_WITHDRAW_LIMIT_REACHED"), …)` → the Req 12 message.
- GREEN: add the case.
