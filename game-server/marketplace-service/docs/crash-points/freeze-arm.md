# Crash points — freeze arm (0a FreezeListing, 0b FreezeItem) and its rollback

FS-NXP1W §Req 38. Every point at which 0a or 0b can be interrupted, and what the next attempt
does. Both run before the pivot, so a point resolves to **already applied and continue**, to
**not applied, so the retry applies it**, to **parked until the dependency recovers**, or to
**roll back** to `SETTLEMENT_FAILED` (§Req 12, ADR-0018). Only a semantic impossibility rolls
back; an outage never does.

Both steps run through `runUntilDone` with `beforePivot`: an outage outlasting the 30m cap
escalates and parks, an impossibility returns to the workflow, which runs `rollBack`
(`internal/settlement/rollback.go`) and fails the run.

## The writes

**0a FreezeListing** (marketplace, `FreezeListingUC`): one transaction under the listing's row
lock (`ListingRepository.Update`). The listing moves `ACTIVE → PENDING_SETTLEMENT` through the
FSM, then the WINNING bid is read. A listing already `PENDING_SETTLEMENT` skips the move and
re-reads the winner. Any other status is `ErrInvalidListingState`; a missing row is
`commonconstants.ErrNotFound`. Both are in 0a's non-retryable set.

**0b FreezeItem** (items, `repository.FreezeItem`): one conditional write,
`LISTED → PENDING_SETTLEMENT` where the owner is the seller. Zero rows is followed by a separate
read: already `PENDING_SETTLEMENT` for the seller is success, anything else is
`ErrItemNotFreezable`, 0b's only non-retryable error.

**Rollback** (uncapped, on a context the workflow's cancellation cannot reach):
`RaiseSettlementException` → `MarkSettlementFailed` → `LoseAllBids` → `ReleaseAllHolds` →
`UnfreezeItem`. The same rollback serves 0b, 1a and 1b (I-NXP1W-6). After a 0a impossibility only
the first two run: nothing was frozen, and the listing's bids and item belong
to whichever flow ended it. Each action is idempotent: `MarkSettlementFailed` changes only a
`PENDING_SETTLEMENT` listing and treats every other status, and a missing listing, as success;
`LoseAllBids` leaves `LOST`, `CANCELLED` and `FAILED` bids as they are; `ReleaseAllHolds` releases
the hold of every bid 0a reported in `BidIDs`, skipping a bid wallet holds nothing for and one
already released; `UnfreezeItem` matches only
an item still the seller's and still reserved for this listing, treats zero rows as success, and
logs a warning when the item is still reserved for this listing but unmatched.

If the step had parked on an earlier lap, `runUntilDone` resolves that park's exception before
returning the impossibility, so the rollback raises its own under the same (workflow, step) key,
with the impossibility as its reason, and publishes `settlement.failed`.

## 0a FreezeListing

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 1 | Before the transaction begins (worker dies, DB unreachable) | listing `ACTIVE` | locks, freezes, reads the winner | not applied → applied | `TestFreeze`; `TestFreezeListingUC_WithLeader_FreezesAndReturnsWinner` |
| 2 | Inside the transaction, before commit | nothing: Postgres aborts it and releases the lock | as #1 | not applied → applied | status change and winner read share one transaction (`ListingRepository.Update`) |
| 3 | Commit lands, acknowledgement lost | listing `PENDING_SETTLEMENT` | retryable; finds `PENDING_SETTLEMENT`, skips the move, re-reads the same winner | already applied → continue | `TestFreezeListingActivity_Classification` "dependency blip"; `TestFreezeListingUC_AlreadyFrozen_ReturnsSameOutput` |
| 4 | After commit, before the activity returns | as #3 | Temporal retries after `StartToCloseTimeout` | already applied → continue | as #3 |
| 5 | Activity completed, completion lost before the workflow records it | as #3 | the server times the attempt out and reschedules it, which is #4 | already applied → continue | as #3 |
| 6 | Marketplace DB down for the whole cap | listing `ACTIVE` | escalates and parks; `RetryStep` or the re-park timer runs #1 again; never rolls back | parked, completed after recovery | `TestWorkflow_FreezeListingOutage_ParksInsteadOfRollingBack`; `TestRunUntilDone_CapExhausted_ParksAndResumesOnRetryStep` |
| 7 | Listing withdrawn, already settled or expired before 0a runs, or missing | listing in that status, or no row | non-retryable → rollback: exception raised, `MarkSettlementFailed` leaves the status as it is, no item touched; the run fails | roll back (nothing to undo) | `TestFreezeListingActivity_Classification` "listing is not active", "listing not found, as the repository reports it"; `TestMarkSettlementFailed` "cancelled/sold/expired is left as it is"; `TestMarkSettlementFailedUC_MissingListing_IsNothingToDo`; `TestWorkflow_FreezeListingImpossible_RollsBackTheListingOnly` |

## 0b FreezeItem

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 8 | Before the write | item `LISTED` | freezes it | not applied → applied | `TestFreezeItem` "listed item owned by seller freezes" |
| 9 | Write committed, activity completion lost (any of #3–#5's shapes) | item `PENDING_SETTLEMENT` | zero rows, then the read finds it frozen for the seller | already applied → continue | `TestFreezeItem` "already frozen for seller is success and changes nothing" |
| 10 | Items down for the whole cap | item `LISTED`, listing `PENDING_SETTLEMENT` | escalates and parks; carries on to 1a once items is back, never rolls back | parked, completed after recovery | `TestFreezeItemActivity_Classification` "dependency blip"; `TestWorkflow_FreezeItemOutage_ParksInsteadOfRollingBack` |
| 11 | Item owner changed, or item unfrozen/unlisted, before 0b | item in that state | non-retryable → rollback: exception raised, listing `SETTLEMENT_FAILED`, bids `LOST`, `UnfreezeItem` leaves an item that is no longer this listing's alone; the run fails | roll back | `TestFreezeItem` "…owned by someone else is refused", "available item was unlisted, refused"; `TestFreezeItemActivity_Classification`; `TestWorkflow_FreezeItemImpossible_RollsBackAndFails`; `TestUnfreezeItem` "owned by someone else is left alone, and warned about" |
| 11a | 0b parked on an outage, then turns out impossible on a later lap | an `OPEN` park exception for (workflow, `FreezeItem`) | the park's exception is resolved, then the rollback raises its own with the impossibility as the reason | roll back, recorded and alerted | `TestWorkflow_FreezeItemParksThenImpossible_RollbackRaisesItsOwnException` |
| 11b | The workflow is cancelled while 0a or 0b is parked | the step's state before it parked | cancellation is not an impossibility: nothing is rolled back, the run ends cancelled | cancelled, nothing undone | `TestWorkflow_CancelledWhileParked_DoesNotRollBack` |

## The rollback itself

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 11c | 1a or 1b turns out impossible | listing and item frozen; 1a may have moved the winner to `WON`; no gold moved | rollback: exception, `SETTLEMENT_FAILED`, every bid `LOST` (the `WON` one included), every hold `RELEASED`, item back with its seller; the run fails | roll back | `TestWorkflow_PivotArmImpossible_RollsBackEverything` |
| 12 | A rollback action fails transiently | earlier actions applied, this one not | retried without a cap until it lands; later actions then run | rollback completes | `TestWorkflow_RollbackActionFailsTransiently_RetriesUntilItLands`; `TestMarkSettlementFailedActivity_Failure_StaysRetryable`; `TestUnfreezeItemActivity_Failure_StaysRetryable` |
| 13 | An action commits but its completion is lost | that action applied | re-run: `MarkSettlementFailed` finds `SETTLEMENT_FAILED`, `UnfreezeItem` matches zero rows; both succeed | already applied → continue | `TestMarkSettlementFailed` "already failed is applied"; `TestMarkSettlementFailedUC_Replay_Succeeds`; `TestUnfreezeItem` "already back with the seller is success and changes nothing" |
| 14 | The seller relists the item before an `UnfreezeItem` retry runs | item `LISTED` under a new listing ID | `listing_id` no longer matches: zero rows, success; the new listing's item stays `LISTED` | already applied → continue (§Req 24a) | `TestUnfreezeItem` "relisted under another listing is left alone" |
| 15 | `RaiseSettlementException` retried | one `OPEN` row for (workflow, step) | the partial unique index finds the open row; no second row, no second `settlement.failed` | already applied → continue | `settlement_exception_repository` tests |
| 16 | The workflow is cancelled while rolling back | partial rollback | the rollback runs on a disconnected context, so cancellation does not stop it | rollback completes | `TestWorkflow_CancelledDuringRollback_RollbackStillFinishes` (fails if the disconnected context is removed) |

## Known limits

- A `SETTLEMENT_FAILED` listing is never re-settled: there is no edge out of it in
  `listing_fsm.go` (`TestSettlementFailed_IsNeverFrozenAgain`), and `REJECT_DUPLICATE` refuses a
  second `settlement-{listingId}` run.
- 0a re-reads only a `WINNING` bid. A retry of 0a after 1a moved the bid to `WON` would see no
  winner. Temporal never re-runs a completed activity, so this is reachable only by a manual
  `workflow reset` to a point before 1a.
- 0b does not yet check `listing_id` (§Req 24a lists it): `FreezeItemInput` carries no listing ID.
  Tracked as I-NXP1W-16.
- **Settlements started before `BidIDs` existed.** A run whose 0a result was recorded without the
  field decodes it as nil, so its rollback releases no holds. Those bids still end `LOST`, which
  keeps the reconciler off the gold; the hold sweeper frees it at expiry plus grace. Runs are
  short, so only one in flight across the deploy can hit this.
- 1a and 1b's own crash points are in `docs/issues/I-NXP1W-6-pivot-compensation.md`; their
  impossibility now rolls back through the same `rollBack`
  (`TestWorkflow_PivotArmImpossible_RollsBackEverything`).
