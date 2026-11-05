---
id: I-V74WE-2
status: done
implements: FS-V74WE
blocked_by: [I-V74WE-1]
labels: []
title: "FS-V74WE slice 2: the bazaar routes BID_TOO_LOW and BID_AT_OR_ABOVE_BUYOUT by code (client)"
---
Implements FS-V74WE §Requirements 11–15, §Acceptance Criteria, §Edge States

## What to Build

The bid box stops guessing when the server says why:

- `game-client/src/marketplace/bid.ts` `bidFailure`: `BID_TOO_LOW` → ask for a re-read whose message is always `outbidMessage(fresh.minimumBid)`; `BID_AT_OR_ABOVE_BUYOUT` → `{ message: BID_AT_BUYOUT }`, no re-read. `VALIDATION_FAILED` keeps today's re-read-then-`validationRefusal` inference. The result type has to let `submitBid` tell "re-read, then outbid" from "re-read, then infer"; the shape is the implementer's choice.
- `game-client/src/marketplace/bidFlow.ts` `submitBid`: for `BID_TOO_LOW`, `resetTouched` then re-read, then the outbid message with the fresh minimum (never `BID_AT_BUYOUT`); a failed re-read → `BROWSE_UNREACHABLE`. Update the header comment's step 3.
- Update the `validationRefusal` doc comment: it is now the `VALIDATION_FAILED` fallback only.

## Acceptance Criteria

- [ ] `bidFailure(apiError(400, "BID_TOO_LOW"), …)` asks for the outbid re-read; `bidFailure(apiError(400, "BID_AT_OR_ABOVE_BUYOUT"), …)` → `BID_AT_BUYOUT`.
- [ ] `submitBid` with `BID_TOO_LOW`: `resetTouched` before `refresh`; note is `outbidMessage(fresh.minimumBid)`, also when the amount ≥ the re-read `buyoutPrice`; `refresh` → undefined gives `BROWSE_UNREACHABLE`.
- [ ] `submitBid` with `BID_AT_OR_ABOVE_BUYOUT`: no `refresh`, note is `BID_AT_BUYOUT`.
- [ ] `VALIDATION_FAILED` behaves as today (re-read; at-buyout when amount ≥ fresh buyout, else outbid).
- [ ] `keepsBidKey` is false for both new codes (`bid.test.ts` table rows).
- [ ] Every other `bidFailure` row (FAILED_PRECONDITION, ALREADY_EXISTS, EMAIL_UNVERIFIED, BID_WITHDRAW_LIMIT_REACHED, 409, 503, unknown) unchanged.
- [ ] tsc, vitest and lint pass.

## Blocked By

I-V74WE-1 (the codes must be on the wire for the end-to-end path; the client logic can be written against the code names).

## Spec Reference

FS-V74WE §Requirements 11–15 (too-low re-read and outbid, at-buyout without re-read, VALIDATION_FAILED fallback, key spent, nothing else changes); User Stories 1–6, 8, 11–13; §Edge States (re-read fails, fresh minimum at or above buyout, stale page at buyout, new client vs old server).

## Expected files

`game-client/src/marketplace/bid.ts`, `game-client/src/marketplace/bid.test.ts`, `game-client/src/marketplace/bidFlow.ts`, `game-client/src/marketplace/bidFlow.test.ts`.

## TDD Approach

- RED: `submitBid` where `placeBid` rejects with `apiError(400, "BID_TOO_LOW")` and `refresh` returns `{ minimumBid: 120, buyoutPrice: 100 }` for an amount of 150 → note `outbidMessage(120)` (today's inference says `BID_AT_BUYOUT`).
- GREEN: give `BID_TOO_LOW` its own re-read outcome in `bidFailure` and branch on it in `submitBid`.
