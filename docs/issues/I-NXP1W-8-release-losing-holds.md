---
id: I-NXP1W-8
status: done
implements: FS-NXP1W
blocked_by: [I-NXP1W-4, I-NXP1W-7]
labels: []
title: "FS-NXP1W slice 8: step 2 ReleaseLosingHolds — forward and roll forward"
---
Implements FS-NXP1W §Requirements 9, 29, 38

**Author: human** (Nick)

## What to Build

One issue for this arm: its failure handling is just classification plus the shared helper from
slice 7.

- **Forward (wallet):** every `RESERVED` hold for a losing bid on the listing → `RELEASED`. Returns
  the released count. Input: listingId, winnerBidId, losing bidIds.
- **Roll forward:** holds already `RELEASED` count as already applied. Transient failures use the
  default tail policy and escalate and park through slice 7. No rollback: this is the tail.
- **Crash-point table** for this step.

## Acceptance Criteria

- [x] Every losing hold ends `RELEASED`; the winning hold is untouched
- [x] Re-running after success returns the same count and changes nothing
- [ ] Cap exhaustion parks through the slice 7 helper — **out of slice, see below**
- [x] Crash-point table committed
- [x] Use case tested without Temporal; `make test` green

## Blocked By

I-NXP1W-4 (the pivot), I-NXP1W-7 (the helper).

## Spec Reference

FS-NXP1W §Requirements 9 (classification), 29 (step 2), 38 (crash points); Edge States: wallet
down after the pivot. User story 7.

## Out of slice

| AC / Req | State | Owner |
|---|---|---|
| Cap exhaustion parks through the helper | the escalate-and-park helper does not exist | I-NXP1W-7 |
| **Req 35** `HeartbeatTimeout` + heartbeats | not added; see the note below | I-NXP1W-7 |

Neither reaches this step's code. The park behaviour is what the *workflow* does once this
activity's cap is exhausted; the activity returns a plain retryable error either way, which it
already does. The default tail retry policy the helper is supposed to carry already exists as
`settlement.StepOptions` (built in I-NXP1W-6) in exactly the shape Req 11 describes.

**Heartbeat judgement, recorded for I-NXP1W-7 rather than guessed here.** Req 35 is in slice 7's
anchor, not this one, but this step is the one most likely to need it: `ReleaseLosingHolds` does
one OCC save per losing bidder, so a heavily contested auction can push it past the 30s
`StartToCloseTimeout` that `StepOptions` sets. Whoever does slice 7 should decide whether this
activity heartbeats, and it is the concrete case to decide against.

## Crash-point table (Req 38)

**B** before the write, **D** after the write commits but before the activity returns, **A** after
the activity returns but before the workflow records it. This is the tail, so no row rolls back —
every one resolves to already-applied-and-continue, or escalates and parks (Req 13).

| Crash | State left behind | Retry resolves to | Proven by |
|---|---|---|---|
| B | no hold moved; every loser still `RESERVED` | re-runs and releases them | `TestReleaseLosingHoldsUC_ReleasesEveryLoserAndLeavesTheWinner` |
| D (partway) | some losers `RELEASED`, some not; count not reported | re-runs; released holds are no-ops, the rest go back, and the count reported is the total either way | `TestReleaseLosingHoldsUC_Rerun_ReportsTheSameCount` |
| A | every loser `RELEASED`, count lost | already applied: the re-run reports the same count rather than 0, so the workflow does not record that a settlement released nothing | `TestReleaseLosingHoldsUC_Rerun_ReportsTheSameCount` |
| — | a losing bid has no hold at all (its gold was never held) | skipped, not counted, not an error — otherwise an uncappable step never finishes | `TestReleaseLosingHoldsUC_LoserWithNoHold_IsSkippedNotCounted` |
| — | the winner appears in the losing set | filtered before the loop; the hold FSM refuses `COMMITTED → RELEASED` as a second line | `TestReleaseLosingHoldsUC_WinnerInTheLosingSet_IsIgnored`, `TestReleaseHold_CommittedHold_IsRefused` |
| — | a loser's hold cannot move to `RELEASED` | invariant breach → non-retryable → escalate and park (Req 13), **never roll back** | `TestReleaseLosingHoldsActivity_Classification` |
| — | wallet is down | transient → plain error → retry, cap, park (Edge States: *wallet down after the pivot*) | `TestReleaseLosingHoldsActivity_Classification` |

### Count semantics, decided against the contract's own comment

`ReleaseLosingHoldsOutput` said "how many holds **this call** actually moved. A retry that finds
them all released returns 0". Req 9 says an already-applied step returns "the same output the
first application would give", and AC 2 says a re-run returns the same count. Req 9 and the AC
agree against the comment, so the count is **how many losing holds are released once the step
returns**, and the comment was corrected. Counting only this call's work would have crash point A
record that a settlement released nothing, for one that released everything.
