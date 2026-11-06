---
id: I-72KT8-2
status: done
implements: FS-72KT8
blocked_by: [I-V74WE-2, I-72KT8-1]
labels: []
title: "FS-72KT8 slice 2: the bazaar explains ALREADY_LEADING (client)"
---
Implements FS-72KT8 §Requirements 16–18, §Acceptance Criteria

## What to Build

When place-bid answers `400 · ALREADY_LEADING`, the bid box says "You're already the highest bidder." without re-reading the listing. Builds on FS-V74WE slice 2, which reshapes `bidFailure` on this branch first.

- `game-client/src/marketplace/bid.ts`: new exported constant `BID_ALREADY_LEADING = "You're already the highest bidder."` with a `/** FS-72KT8 req 16 … */` comment like `BID_WITHDRAW_LIMIT`'s; `bidFailure` gains `case "ALREADY_LEADING": return { message: BID_ALREADY_LEADING };`, in whatever result shape FS-V74WE leaves it.
- `keepsBidKey` needs no change (a 400 spends the key); add the table row that proves it.
- Nothing else in the bid box changes: no pre-send check, no viewer-relative leading flag.

## Acceptance Criteria

- [ ] `bidFailure(apiError(400, "ALREADY_LEADING"), …)` → `{ message: BID_ALREADY_LEADING }` (no re-read requested).
- [ ] `submitBid` with `ALREADY_LEADING`: no `refresh`, note is `BID_ALREADY_LEADING` (error tone).
- [ ] `keepsBidKey(apiError(400, "ALREADY_LEADING"))` is false (`bid.test.ts` table row).
- [ ] Every other `bidFailure` row (including FS-V74WE's `BID_TOO_LOW` / `BID_AT_OR_ABOVE_BUYOUT`) unchanged.
- [ ] tsc, vitest and lint pass.

## Blocked By

I-V74WE-2 (same `bidFailure`; this slice lands on top of it). I-72KT8-1 (the code must be on the wire for the end-to-end path; the client logic can be written against the code name).

## Spec Reference

FS-72KT8 §Requirements 16 (message, no re-read), 17 (key spent), 18 (no advance warning); User Stories 3, 18; §Acceptance Criteria (client row); §Edge States (old client, new server: why the deploy order in Req 19 exists).

## Expected files

`game-client/src/marketplace/bid.ts`, `game-client/src/marketplace/bid.test.ts`, `game-client/src/marketplace/bidFlow.test.ts` (one `submitBid` row; `bidFlow.ts` itself shouldn't need a change).

## TDD Approach

- RED: `bid.test.ts`, `bidFailure(apiError(400, "ALREADY_LEADING"), { amount: 150 })` → `{ message: BID_ALREADY_LEADING }` (today it falls to `err.detail`).
- GREEN: the constant and the `case`.
