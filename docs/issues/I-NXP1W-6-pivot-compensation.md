---
id: I-NXP1W-6
status: done
implements: FS-NXP1W
blocked_by: [I-NXP1W-4]
labels: []
title: "FS-NXP1W slice 6: pivot arm compensation — retry policy, classification, rollback of 1a/1b"
---
Implements FS-NXP1W §Requirements 9, 12, 15, 36–38

**Author: human** (Nick)

## What to Build

What happens when 1a or 1b fails. This is the last point where rollback is allowed.

- **Classification (Req 9)** in the 1a and 1b wrappers. For CommitHold, disambiguate "nothing
  changed" by reading the hold: `COMMITTED` → already applied; `RELEASED` or past expiry → semantic
  impossibility. A caller amount different from the hold's amount is non-retryable and raised
  loudly. Reaching the `gold >= amount` guard aborts the transaction as a semantic impossibility.
- **Retry policy (Req 11, 36):** same shape as slice 5.
- **Rollback actions for this arm (Req 12):** every bid on the listing → `LOST` (including one
  already `WON`) and every `RESERVED` hold on the listing → `RELEASED`. Idempotent, retried without
  a cap. Plug them into slice 5's rollback wiring so a failure at any pre-pivot step undoes
  everything done so far.
- **No `REVERSED` state and no `ReverseCommit` (Req 15).**
- **Crash-point table for 1a and 1b (Req 38).** The key case: a crash after CommitHold commits but
  before the workflow records it must resolve to already applied, moving gold once.

## Acceptance Criteria

- [x] CommitHold on a `RELEASED` or expired hold is non-retryable; on a `COMMITTED` hold it is success; an amount mismatch is non-retryable
- [~] A semantic impossibility in 1a or 1b leaves: listing `SETTLEMENT_FAILED`, all holds on the listing `RELEASED`, all bids `LOST`, item `AVAILABLE` with the seller, one `settlement_exceptions` row — **partial, see Out of slice**
- [x] Crash-point table for 1a/1b committed
- [x] `make test` green

## Blocked By

I-NXP1W-4 (the forward steps). The classification and rollback actions don't wait on
I-NXP1W-5; plugging them into its rollback wiring happens once it lands.

## Spec Reference

FS-NXP1W §Requirements 9, 12, 15, 28 (CommitHold failure cases), 36–38; Edge States: crash after
CommitHold, hold expired while parked, insufficient gold. User stories 14, 20. ADR-0017, ADR-0018.

## Out of slice

The two rollback actions this arm owns are built and registered. The rest of AC 2's end
state needs machinery that does not exist yet, so it is deferred rather than faked:

| AC 2 wants | State | Owner |
|---|---|---|
| all bids on the listing `LOST` | **done** — `LoseAllBids` | this slice |
| all holds on the listing `RELEASED` | **done** — `ReleaseAllHolds` | this slice |
| listing `SETTLEMENT_FAILED` | no such `ListingStatus` and no CHECK value | I-NXP1W-3 / -7 |
| item `AVAILABLE` with the seller | 0b FreezeItem does not exist | I-NXP1W-3 |
| one `settlement_exceptions` row | table does not exist | I-NXP1W-7 |
| **Req 37** rollback wired for 0a, 0b, 1a, 1b | not wired: the workflow still runs 0a alone | I-NXP1W-5 |

Req 37 is inside this issue's anchor and is deliberately not met: wiring the actions into a
rollback path is I-NXP1W-5. `UncappedOptions` is the policy they will be scheduled under and it
is tested, but nothing references it yet — declared, not wired.

`SetWinBidFailed` was a pre-written shell whose body was a copy of `MarkSoldListingUC`. Its
body is now the failure flow it was meant for, and it is named for what it does:
`LoseAllBidsUC` / `LoseAllBids`, matching `marketplaceactivity.LoseAllBidsActivityName`. Its
payload moved to that contract package (ADR-0019) instead of being declared locally, and the
activity is now actually registered — it never was.

## Crash-point table (Req 38)

Three crash points per step: **B** before the write, **D** after the write commits but before
the activity returns, **A** after the activity returns but before the workflow records it.
Every row resolves to *already applied and continue* or *roll back*; none can move gold twice.

### 1a SetWinningBid — bid `WINNING → WON`, conditional write under the row lock

| Crash | State left behind | Retry resolves to | Proven by |
|---|---|---|---|
| B | nothing written; bid still `WINNING` | re-runs, transitions normally | `TestSetWinningBid_WinningBid_BecomesWon` |
| D | bid is `WON`, workflow does not know | already applied: the `WON` short-circuit returns success | `TestSetWinningBid_AlreadyWon_Succeeds` |
| A | bid is `WON`, activity result lost | identical to D — Temporal re-executes, hits the same short-circuit | `TestSetWinningBid_AlreadyWon_Succeeds` |
| — | bid demoted or gone while the step was in flight | semantic impossibility → roll back, not retry | `TestSetWinningBidActivity_Classification` |

### 1b CommitHold — hold `RESERVED → COMMITTED` and debit, one OCC save

| Crash | State left behind | Retry resolves to | Proven by |
|---|---|---|---|
| B | nothing written; hold still `RESERVED`, gold intact | re-runs, commits once | `TestCommitHoldUC_CommitsTheHoldFoundByItsBid` |
| D | hold `COMMITTED` **and gold already debited** — the pivot happened, the workflow does not know it | already applied: same output, no second debit. **This is the case that decides whether gold can move twice** | `TestCommitHold_AlreadyCommitted_ReturnsSameAmountWithoutMovingGold`, `TestCommitHoldUC_Retry_ReturnsTheSameResult` |
| A | as D, with the activity result lost | identical to D; the debit is idempotent in the domain, not in the workflow's bookkeeping | same |
| — | hold expired, released, or the amount disagrees | semantic impossibility → roll back. The pivot boundary is *at* a successful CommitHold, so a failed one means it never happened and rollback is still legal | `TestCommitHoldActivity_Classification` |
| — | rollback reaches an already `COMMITTED` hold | refused by the hold FSM: there is no `ReverseCommit` (ADR-0017, Req 15) | `TestReleaseHold_CommittedHold_IsRefused` |

### Crashing inside the rollback itself

Rollback actions are retried without a cap (Req 12, 36), so their own crash points all resolve
by re-running: both are no-ops once applied.

| Action | Re-run behaviour | Proven by |
|---|---|---|
| `LoseAllBids` | bids already `LOST` are skipped; terminal `CANCELLED` / `FAILED` bids are never rewritten | `TestLoseAllBids_IsIdempotentAndLeavesTerminalBidsAlone` |
| `ReleaseAllHolds` | a hold already `RELEASED` is success; one release per aggregate under its own version check | `TestReleaseAllHoldsUC_RerunAfterSuccess_IsANoOp` |

### One reading recorded

Req 12 says "every bid becomes `LOST`". `LoseAllBids` moves every bid still *in contention*
(`PENDING`, `WINNING`, `OUTBID`, `WON`) and leaves `CANCELLED` and `FAILED` alone: a bidder who
withdrew, or whose gold was never held, did not lose a contest they had already left. The
parenthetical in Req 12 — "including one already moved to `WON`" — reads as clarifying the case
that would otherwise be skipped, not as demanding that terminal bids be rewritten. Flagging it
rather than assuming: if the FS means literally every row, this narrows one test and widens the
FSM.
