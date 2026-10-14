# Crash points — step 6 MarkSold

FS-NXP1W §Req 38. Every point at which step 6 can be interrupted, and what the next attempt
does. Step 6 is in the tail (ADR-0017): the buyer has paid and steps 3–5 have run, so no point
resolves to roll back. Each one resolves to **already applied and continue**, to **not applied,
so the retry applies it**, or to **parked for an operator**.

Step 6 is the settlement's last. A listing reads `SOLD` only once money, item and ledger are all
done; until then it stays `PENDING_SETTLEMENT`, so a stuck settlement is always visible on it.

## The write

One transaction under the listing's row lock (`ListingRepository.Update`, via
`MarkSoldListingUC`):

1. `SET LOCAL lock_timeout = '3s'`, then load the listing `FOR UPDATE` and its bids. No other
   writer can move the listing until this transaction ends.
2. `Listing.MarkSold(now)` decides on the loaded aggregate:
   - `SOLD`: already applied, change nothing.
   - `PENDING_SETTLEMENT` with a `WON` bid: copy that bid's bidder and amount into `buyer_id` and
     `sold_price`, and move to `SOLD` through the FSM.
   - anything else, or `PENDING_SETTLEMENT` with no `WON` bid: `ErrInvalidListingState`, change
     nothing.
3. Write only what changed (no version predicate: the row lock already serialised it). An
   already-`SOLD` listing produces no change, so nothing is written.
4. Commit.

Status, buyer and price are one write, so a `SOLD` listing always carries its buyer and price.

"Already applied" is the listing's own status. That is enough here, unlike step 4: `SOLD` is
terminal, with no edge out of it in `listing_fsm.go`, so nothing can move the listing between a
successful attempt and its retry.

## Table

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 1 | Before the transaction begins (worker dies, marketplace DB unreachable) | nothing: listing `PENDING_SETTLEMENT`, no buyer or price | locks, finds the `WON` bid, sells | not applied → applied | `TestMarkSold` "pending settlement with a won bid is sold"; `TestMarkSoldListingUC_WonListing_IsSoldUnderTheLock` |
| 2 | Inside the transaction, before commit (worker killed, connection dropped) | nothing: Postgres aborts the uncommitted transaction and releases the lock | as #1 | not applied → applied | the status, buyer and price change in one transaction (`ListingRepository.Update`) |
| 3 | The commit lands but its acknowledgement is lost, so the driver reports an error | listing `SOLD` with buyer and price | the error is retryable; `MarkSold` finds `SOLD`, changes nothing, and nothing is written | already applied → continue | `TestMarkSoldActivity_Classification` "dependency blip" (retryable), then as #4 |
| 4 | After commit, before the activity returns (worker dies) | as #3 | Temporal retries after `StartToCloseTimeout`; `MarkSold` finds `SOLD` | already applied → continue | `TestMarkSold` "already sold is applied" (buyer and price unchanged); `TestMarkSoldListingUC_AlreadySold_Succeeds` |
| 5 | After the activity completes, before the workflow records it (completion lost in transit) | as #3 | the server times the attempt out and reschedules it, which is #4 | already applied → continue | as #4 |
| 6 | After the workflow records completion, before the run closes (marketplace worker dies) | as #3; the result is in history | replay reads the result from history and does not re-run the activity | already applied → continue | Temporal's guarantee; nothing in marketplace to test |
| 7 | Another writer holds the listing's row lock past the 3s `lock_timeout` | nothing | the lock error (`ErrLockUnavailable`) is outside the non-retryable set, so it is retried | not applied → applied | `TestMarkSoldActivity_Classification` "row lock not acquired in time" |
| 8 | A second attempt starts while the first is still inside its transaction (a timed-out attempt that is still alive) | first attempt's uncommitted change, and its lock | the second waits on `FOR UPDATE`. If the first commits, the second loads `SOLD` and changes nothing. If the first rolls back, the second sells | exactly one transition | the row lock; **no concurrent test yet** |
| 9 | Marketplace's DB stays down for the whole retry window | nothing | retried under `StepOptions` until the 30m cap; then the workflow escalates and parks, and the re-park timer or `RetryStep` runs #1 again | parked, completed after recovery | classification as #3; parking: `TestRunUntilDone_CapExhausted_ParksAndResumesOnRetryStep`, `TestRunUntilDone_ResumesOnTheReparkTimer`. **Step 6 is not yet scheduled through `runUntilDone`**: `SettleAuction` stops after 0b until the steps before it are wired |
| 10 | The listing is `ACTIVE`, `EXPIRED` or `CANCELLED`; or `PENDING_SETTLEMENT` with no `WON` bid; or missing | nothing: the domain refuses, the transaction rolls back, and the listing is never overwritten | does not retry. `MarkSoldImpossible` is an invariant breach after the pivot: it escalates and parks for an operator (§Req 13), who corrects the data and sends `RetryStep` | parked for an operator | `TestMarkSold` "pending settlement with no won bid is refused", "active is refused", "expired is refused", "cancelled is refused"; `TestMarkSoldListingUC_DomainRefusal_KeepsItsSentinel`; `TestMarkSoldActivity_Classification`; `TestRunUntilDone_ImpossibleAfterThePivot_Parks` |

## Where the buyer and price come from

`MarkSoldInput` carries only the listing ID. The buyer and price are read from the bid step 1a
moved to `WON`, inside the same locked transaction, rather than passed in. They cannot disagree
with what was actually committed at the pivot, and the step needs no input beyond the listing.
The values are copied out of the bid, so the listing never shares memory with it.

The old `MarkSold` also refused to run before `endsAt`. That check is gone: AcceptBid and buyout
settle a listing before it ends.
