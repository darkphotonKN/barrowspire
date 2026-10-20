---
id: I-49Z37-1
status: done
implements: FS-49Z37
blocked_by: []
labels: [ready-for-agent]
title: "FS-49Z37 slice 1: a refused bid retries under a fresh key"
---
Implements FS-49Z37 §Requirements 22–24, §Acceptance Criteria (Bid keys)

**Author:** unassigned

## What to Build

Today `bidAttempt` reuses the previous attempt's key whenever the amount is unchanged, and
`submitBid` keeps the attempt after **any** failure. Since ADR-0027, a key whose bid was refused
or abandoned is spent: reusing it answers `409 · ALREADY_EXISTS`, which `bidFailure` shows as
`BID_CONFLICT` ("someone bid at the same moment — try again"), so a delver who resubmits the same
amount after a too-low refusal loops on a spent key.

- Keep the attempt (and its key) only after `409 · CONFLICT`, `503` and transport failures, where a
  same-key retry is correct (ADR-0027 keeps the hold for a busy listing).
- After `400 · VALIDATION_FAILED`, `400 · FAILED_PRECONDITION` or `409 · ALREADY_EXISTS`, drop the
  attempt, so the next press mints a new key even for the same amount.
- `409 · ALREADY_EXISTS` shows `That attempt lapsed — try again.`; `409 · CONFLICT` keeps
  `BID_CONFLICT`.

Pure logic in `marketplace/bid.ts` / `bidFlow.ts`; `ListingDetailDialog.tsx` only wires it.

## Acceptance Criteria

- [ ] After `VALIDATION_FAILED`, `FAILED_PRECONDITION` or `409 · ALREADY_EXISTS`, the same amount is sent under a new key.
- [ ] After `409 · CONFLICT` or `503`, the same amount is sent under the same key.
- [ ] `409 · ALREADY_EXISTS` shows `That attempt lapsed — try again.`; `409 · CONFLICT` still shows `BID_CONFLICT`.
- [ ] Existing bid behavior (outbid re-read, not-enough-gold, ended) unchanged.
- [ ] Tests pass; lint and typecheck pass.

## Blocked By

None

## Spec Reference

FS-49Z37 §Requirements 22–24; §User Stories 20, 21; §Acceptance Criteria "Bid keys…", "Bid 409 · ALREADY_EXISTS…".

## TDD Approach

- RED: `submitBid` failing with `ApiError(400, VALIDATION_FAILED)` returns no attempt to reuse (next `bidAttempt` mints).
- RED: `bidFailure` on `ApiError(409, ALREADY_EXISTS)` gives the lapsed copy, and the attempt is dropped.
- GREEN: classify the failure into keep / drop alongside its message.
