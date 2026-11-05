---
id: I-F692V-2
status: done
implements: FS-F692V
blocked_by: [I-F692V-1]
labels: []
title: "FS-F692V slice 2: the seller block explains an accept refused because the leading bid dropped (game-client)"
---
Implements FS-F692V §Requirements 10–11, §Acceptance Criteria (client), §Edge States

## What to Build

When accept answers `400 · LEADING_BID_LOWERED`, the seller learns why and sees the new state:

- `game-client/src/marketplace/accept.ts`: a new message constant
  `The leading bid dropped since you looked — check it and accept again.`, and `acceptFailure` routes
  `400` with code `LEADING_BID_LOWERED` to it with `refetch: true`. Check that code before the
  existing `400 · FAILED_PRECONDITION` branch so the two are never confused.
- `acceptFlow.ts` / `SellerBlock.tsx`: no new wiring should be needed. A refusal with `refetch`
  already re-reads the listing and closes the dialog. Confirm this with a test rather than assuming
  it.
- Every other accept outcome stays FS-49Z37 Req 16–17.

## Acceptance Criteria

- [ ] `acceptFailure(400 · LEADING_BID_LOWERED)` gives the Req 10 message with `refetch: true`
      (`marketplace/accept.test.ts`).
- [ ] `submitAccept` on that refusal re-reads the listing once, reports not sold, and shows the message
      as an error note (`marketplace/acceptFlow.test.ts`).
- [ ] `400 · FAILED_PRECONDITION`, `409 · CONFLICT`, `503` and other refusals keep their FS-49Z37
      messages, and the existing tests still pass.
- [ ] The client's typecheck, lint and tests pass.

## Blocked By

I-F692V-1: the code and the required `minAmount` exist only once slice 1 lands.

## Spec Reference

FS-F692V §Requirements 10–11. User Stories 4, 6, 7, 16. Edge States: the leader withdrew and the
runner-up was promoted lower, and the leader withdrew with no bid left (that case is still FS-49Z37's
`FAILED_PRECONDITION` path).

## TDD Approach

- RED: `acceptFailure` on `ApiError(400, "LEADING_BID_LOWERED")` expects the new message and
  `refetch`.
- GREEN: the constant and the new branch in `acceptFailure`.
