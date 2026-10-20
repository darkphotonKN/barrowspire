---
id: I-EYQ8K-4
status: done
implements: FS-EYQ8K
blocked_by: [I-EYQ8K-3]
labels: []
title: "FS-EYQ8K slice 4: the My bids view"
---
Implements FS-EYQ8K §Requirements (Req 15–18), §Edge States

**Author:** unassigned

## What to Build

game-client. A third option **My bids** on the marketplace page's Browse / Mine `ViewToggle`
(`src/app/marketplace/page.tsx`). It pages `GET /api/marketplace/bids/mine` through the generated client
(load more by `nextCursor`, like Mine) and shows one row per bid: the relic (embedded item), the bid amount,
the bid's status label, the auction's current price, and whether / when it ends. Labels:
`WINNING` "Leading", `OUTBID` "Outbid", `PENDING` "Placing…", `WON` "Won", `LOST` "Lost". Empty: "You have
no bids." Signed out: ask the delver to sign in, as Mine does. Pure modules under `src/marketplace/`
(e.g. `myBids.ts` for the label map and row shaping) with tests; the table component under
`src/components/bazaar/`. Token-only styling (ADR-0013); follow `docs/design-guideline.md`. No withdraw
here (slice 5).

## Acceptance Criteria

- [ ] The toggle offers Browse / Mine / My bids; My bids lists the caller's bids newest first and pages on demand.
- [ ] Each row shows relic, amount, status label, current price, end state.
- [ ] Status labels follow Req 16 (unit-tested).
- [ ] Empty and signed-out states as above.
- [ ] Only the generated client is used for the read.
- [ ] Tests, lint (incl. token fence) and typecheck pass.

## Blocked By

I-EYQ8K-3

## Spec Reference

FS-EYQ8K §Requirements 15–18; §User Stories 1–8, 17–19, 21; §Edge States (no bids, signed out).

## TDD Approach

- RED: label map → each of the five statuses gives its Req 16 label.
- RED: row shaping from a `MyBid` with no `currentPrice` / no `item` → sensible fallbacks.
