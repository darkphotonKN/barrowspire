---
id: I-NXP1W-20
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 20: buyout retries a bid write whose outcome is unknown before leaving its hold to the reconciler"
---
Implements FS-NXP1W §HTTP entry points (Req 43, 44)

**Author:** unassigned

## What to Build

When `BuyoutUC`'s bid write fails with an error that is neither a definitive refusal nor proof it
wrote nothing (an ambiguous COMMIT, a timeout), it keeps the hold and returns the error at once.
`PlaceBidUC` in the same spot retries the write a few times with `withBackoff`
(`place_bid_usecase.go:105-131`), because the write is idempotent on its bid ID and its
`SELECT ... FOR UPDATE` queues behind a COMMIT still in flight. Most such failures are settled by
one retry. Buyout skipping that step sends more attempts down the "unknown, keep the hold, let the
reconciler decide" path, which since ADR-0026 is recoverable with a new key but still leaves the
buyer's gold frozen for the reconciler's 10-minute grace and the buyer told it failed.

Give buyout the same classification and retry:

- On the first failure: a definitive refusal (`isDefinitiveBuyoutRefusal`) releases, as today; an
  error proving nothing was read (`failedBeforeRead`) on the first attempt is safe to release, as for
  PlaceBid. Anything else is unknown: retry the write with `withBackoff` on a context detached from
  the request's cancellation (`writeRetryDeadline`), settled only by a definitive refusal.
- The retried write is the same closure, so a retry that finds this bid ID, or the buyer's own
  buyout, under the lock is a replay. The `recorded` flag from I-NXP1W-19 still decides whether this
  call's hold backs a bid.
- Still unknown after the retries: keep the hold, log it for the reconciler, and return
  `ErrTransient` so the gateway answers `503` and the buyer resends with the same key.

Reuse PlaceBid's helpers (`withBackoff`, `failedBeforeRead`, `maxWriteAttempts`,
`writeRetryBackoff`, `writeRetryDeadline`); do not copy them.

## Acceptance Criteria

- [ ] A write that fails ambiguously once and then succeeds records the buyout, keeps the hold, releases nothing, and starts settlement.
- [ ] A write whose first COMMIT landed but was not acknowledged is recognised on retry (`HasBid`) as recorded; no release.
- [ ] A write still unknown after the retries keeps the hold, starts no release, and returns an error wrapping `ErrTransient`.
- [ ] A definitive refusal on any attempt releases the hold, as today.
- [ ] Failing before the read on the first attempt releases the hold; failing before the read on a retry does not (it proves nothing about the attempt before).
- [ ] The retries run on a context the request's cancellation cannot kill.
- [ ] Tests pass.

## Blocked By

None (builds on I-NXP1W-19, merged)

## Spec Reference

FS-NXP1W §HTTP entry points Req 43 (buyout holds the buyer's gold like any bid) and Req 44 (a
repeated buyout does not place a second bid). The retry rule is PlaceBid's (TCC: Cancel only once
the write provably did not land). ADR-0026.

## TDD Approach

- RED: `updateScript` `{err: ambiguous}` then success → recorded, zero releases.
- RED: `{committed: true, err: ambiguous}` → the retry finds the bid; zero releases.
- RED: ambiguous on every attempt → `ErrTransient`, zero releases.
- RED: `failedBeforeRead` on attempt 1 → one release.
