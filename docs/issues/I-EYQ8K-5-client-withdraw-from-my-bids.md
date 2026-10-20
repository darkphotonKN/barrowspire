---
id: I-EYQ8K-5
status: done
implements: FS-EYQ8K
blocked_by: [I-EYQ8K-1, I-EYQ8K-4]
labels: []
title: "FS-EYQ8K slice 5: withdraw a bid from My bids"
---
Implements FS-EYQ8K §Requirements (Req 10–14), §API surface, §Edge States

**Author:** unassigned

## What to Build

game-client. On the My bids view, offer **Withdraw** on a row whose bid is `WINNING` or `OUTBID` and whose
listing is `ACTIVE` and not ended; never on `PENDING`. Clicking asks for confirmation with copy by status:
- `WINNING`: "Withdraw your bid of {amount} gold? The next highest bid takes the lead."
- `OUTBID`: "Withdraw your bid of {amount} gold? Your gold is returned."

Confirming calls `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` through the generated client
(add an `apiClient` method alongside `buyout` / `acceptBid` if that is the house pattern). On `204` re-read the
list and the purse. Refusals: `400 · FAILED_PRECONDITION` → "This bid can no longer be withdrawn." and re-read
the list; `409` → existing `BID_CONFLICT`; `503` → `BROWSE_UNREACHABLE`; else the problem's `detail`. Cancel
sends nothing. Decisions (offered?, confirm copy, refusal → copy) live in a pure module (e.g.
`src/marketplace/withdrawBid.ts` + a flow like `acceptFlow.ts`), tested without a dialog.

## Acceptance Criteria

- [ ] Withdraw offered exactly on `WINNING`/`OUTBID` rows of `ACTIVE`, not-ended listings.
- [ ] Confirm copy follows the bid's status; Cancel sends nothing.
- [ ] After `204` the list and purse are re-read.
- [ ] Each refusal shows Req 14's copy; `FAILED_PRECONDITION` also re-reads the list.
- [ ] The call goes through the generated client.
- [ ] Tests, lint (incl. token fence) and typecheck pass.

## Blocked By

I-EYQ8K-1 (backend must accept OUTBID), I-EYQ8K-4 (the view)

## Spec Reference

FS-EYQ8K §Requirements 10–14; §API surface (`withdraw-bid`); §User Stories 9–16, 22; §Edge States (promoted / outbid while open, ended while open).

## TDD Approach

- RED: `withdrawOffered` over status × listing state table.
- RED: confirm copy for WINNING vs OUTBID.
- RED: flow: 204 → re-read list and purse; 400 FAILED_PRECONDITION → copy + re-read list; 409 / 503 / other → copy.
