---
id: I-0YXG6-5
status: open
implements: FS-0YXG6
blocked_by: []
labels: [ready-for-agent]
title: "FS-0YXG6 slice 5: wallet refusals keep their meaning through place-bid"
---
Implements FS-0YXG6 §Requirements 13, §API surface

## What to Build

marketplace's wallet client (`listing/grpc/client.go`, `PlaceHold`) wraps wallet's gRPC status with
`%w` and returns it. marketplace's `mapError` only matches sentinels, so it lands in `default` →
`Internal`, and an insufficient-gold bid answers 500. The error isn't lost; nothing switches on its
code.

In the wallet client, switch on `status.Code(err)` and return marketplace sentinels inline, for
example:
- `FailedPrecondition` → an insufficient-funds sentinel, which `mapError` maps to `FailedPrecondition`;
- `Unavailable` → `ErrTransient`, which `mapError` maps to `Unavailable`;
- anything else stays wrapped and falls to `Internal`.

Add the new sentinel to `mapError` if needed.

## Acceptance Criteria

- [ ] A wallet `FailedPrecondition` on `PlaceHold` makes `PlaceBid` answer `FailedPrecondition`, which the gateway returns as `400 · FAILED_PRECONDITION`.
- [ ] A wallet `Unavailable` makes `PlaceBid` answer `Unavailable` (503).
- [ ] An unrecognised wallet code still answers `Internal` and is logged at Error level.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 13, §API surface (place-bid errors), §Edge States (bid the bidder cannot
afford). User stories 9, 26.

## TDD Approach

- RED: a fake wallet returning `status.Error(codes.FailedPrecondition, …)`. `PlaceBid` answers `codes.FailedPrecondition`. This fails today, because it returns Internal.
- GREEN: switch on the code in `PlaceHold`, and map the new sentinel in `mapError`.
