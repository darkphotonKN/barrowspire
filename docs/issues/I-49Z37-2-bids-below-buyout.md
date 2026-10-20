---
id: I-49Z37-2
status: done
implements: FS-49Z37
blocked_by: [I-49Z37-1]
labels: []
title: "FS-49Z37 slice 2: bids stay below a listing's buyout price"
---
Implements FS-49Z37 §Requirements 20–21

**Author:** unassigned

## What to Build

- On a listing with `buyoutPrice`, the bid box's highest acceptable amount is `buyoutPrice − 1`. An
  amount at or above it shows `Bids must stay below the buyout price — to buy now, use Buy out.`
  and sends nothing.
- The server's `ErrBidAtOrAboveBuyout` (`400 · VALIDATION_FAILED`, from a stale page) shows the same
  copy, not the outbid message. Tell it apart from a plain too-low refusal by the re-read listing:
  refused amount ≥ its `buyoutPrice` → the cap; otherwise today's outbid path.
- Key handling follows I-49Z37-1 (a `VALIDATION_FAILED` drops the attempt).

## Acceptance Criteria

- [ ] An amount ≥ `buyoutPrice` shows the cap message and sends nothing; a listing without a buyout price has no cap.
- [ ] A server cap refusal shows the cap message; a plain too-low refusal still shows the outbid message.
- [ ] Tests pass; lint and typecheck pass.

## Blocked By

I-49Z37-1 (both reshape `bidFailure` / `submitBid`)

## Spec Reference

FS-49Z37 §Requirements 20–21; §User Stories 18, 19; §Acceptance Criteria "Bid box…".

## TDD Approach

- RED: the bid box validator refuses `buyoutPrice` and accepts `buyoutPrice − 1`.
- RED: `submitBid` with a `VALIDATION_FAILED` whose re-read listing has `buyoutPrice ≤ amount` returns the cap note.
