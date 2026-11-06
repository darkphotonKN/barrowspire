# ADR-0049 — A refused bid answers only once its hold is back, waiting at most 3 seconds

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (`PlaceBidUC.releaseHold`, `releaseWait`,
`usecase.HoldReleaseAwaiter`, `releasehold.Starter.ReleaseHoldAndWait`)
Amends: [ADR-0024](0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) — "Callers
start, never wait", for PlaceBid's compensation only
Builds on: [ADR-0027](0027-place-bid-id-is-derived-from-the-callers-key.md) (a keyed bid's ID is derived from its
key, so a resend lands on the same hold)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, after an audit of the bidding
flow.

A keyed bid is held and recorded under an ID derived from member, listing and key (ADR-0027), so a
resend of the same key lands on the same hold. Wallet's `PlaceHold` answers a hold that is still
`RESERVED` for the same amount as success, since that is the resend's own hold.

When the bid write is refused (bid too low, listing closed, and so on), PlaceBid gives the hold back
by starting the `ReleaseHold` workflow, and under ADR-0024 it answered the bidder as soon as the start
was accepted, before the release ran. That left a window:

1. M bids under key K; the bid is refused as too low; the release is started but has not run. The hold
   is still `RESERVED`.
2. The bid M lost to is withdrawn, so M's amount would now be accepted.
3. M resends K. `PlaceHold` finds the hold `RESERVED` and answers success; the write records M's bid
   as WINNING.
4. The release runs and moves the hold to `RELEASED`.

M then leads with no gold behind the bid. At settlement `CommitHold` meets a released hold and the
listing rolls back to `SETTLEMENT_FAILED`. M cannot take gold this way, but can hold an auction hostage
with a lead nobody can beat and then sink it.

The official client never resends a key after a refusal: it keeps a key only for a network error, a
503 or `409 CONFLICT` (`keepsBidKey`). So the window is reached by a hand-built resend, or by a refusal
lost in transit that the client retries under the same key, in the same second that the competing
bid is withdrawn.

Three fixes were weighed:

- **Wait for the release before answering (chosen).** Small and local, no schema change.
- **Tombstone the bid ID under the listing lock**, so a write refuses an ID whose release was decided.
  Closes the window even while wallet is down, but needs a migration plus changes to the repository,
  PlaceBid and the reconciler. Too heavy for a low-risk hole.
- **Accept and log the risk.** Reasonable given the preconditions, but the cheap fix is cheap.

## Decision

**When PlaceBid gives a hold back, it starts the `ReleaseHold` workflow and waits up to
`releaseWait` (3 seconds) for the run to finish before answering the bidder.** A refused bid
therefore reaches the bidder with its hold already `RELEASED`. A resend under the same key then meets
`ErrBidAlreadyHeld` in wallet (`409 ALREADY_EXISTS`) and never reaches the write.

- **Only PlaceBid waits.** WithdrawBid and Buyout still start and never wait (ADR-0024). A buyout
  refusal cannot later become valid, and a withdrawn bid is already `CANCELLED`, so neither has the
  window.
- **Waiting only watches the run.** When `releaseWait` runs out, the caller stops watching. The run is
  not cancelled and keeps retrying until the gold is back, exactly as before. The bidder is answered
  with the original refusal either way. The release outcome is logged and never returned.
- **A release started earlier is waited on too.** If the bid's workflow ID already exists
  (`REJECT_DUPLICATE`), the wait uses that run, found by the bid's workflow ID.

## Consequences

- **The resend window is closed whenever wallet is healthy.** A healthy release takes tens of
  milliseconds, which is all a refused bid waits. A bid that lands waits for nothing.
- **Durability is unchanged.** The release is still a workflow that retries until it lands. ADR-0024's
  reason for existing, that a wallet outage or a marketplace crash must not strand gold, still holds.
- **Cost: ADR-0024's "the bidder never waits on wallet" no longer holds for refused bids.** While wallet
  is slow or down, a refused bid waits the full 3 seconds before answering.
- **The window is narrowed, not closed.** It still opens when the release outlasts the wait, when the
  start itself fails (left to the reconciler, as before), and in the reconciler's own gap between
  "no bid claims this hold" and releasing it. Each needs a struggling wallet or Temporal plus a
  deliberate resend; while wallet is down, the resend's own `PlaceHold` usually fails too. The
  tombstone above remains the full fix if this ever proves insufficient.
- **A refused bidder sees correct available gold**, since the hold is back before they hear the
  refusal. A quick rebid under a new key no longer trips over the old hold.
- **3 seconds is tuning, not contract.** It must stay well under every timeout between the bidder and
  marketplace. A reply that times out upstream is retried by the client under the same key, which is
  the very resend this fences off. It also fits inside `compensationTimeout` (5s), which bounds the
  start and the wait together.
- **New port.** `usecase.HoldReleaseAwaiter` (`ReleaseHoldAndWait`) sits beside
  `HoldReleaseStarter`. `releasehold.Starter` implements both, and `ErrHoldReleasePending` tells a
  wait that ran out from a release that failed.
