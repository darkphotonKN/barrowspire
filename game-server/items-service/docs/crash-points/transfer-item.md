# Crash points — step 4 TransferItem

FS-NXP1W §Req 38. Every point at which step 4 can be interrupted, and what the next attempt
does. Step 4 is in the tail (ADR-0017): the buyer has already paid, so no point resolves to roll
back. Each one resolves to **already applied and continue**, to **not applied, so the retry
applies it**, or to **parked for an operator**.

## The write

One transaction (`repository.TransferItem`, Read Committed):

1. `INSERT INTO item_transfers (listing_id, item_id, buyer_member_id) … ON CONFLICT (listing_id)
   DO NOTHING`. If it inserts nothing, this listing's transfer is already recorded: already
   applied, so it reports success and writes nothing else.
2. One conditional `UPDATE`: owner → buyer, status → `AVAILABLE`, `listing_id` → `NULL`, where the
   item is `PENDING_SETTLEMENT` **for this listing**. Transfer and unfreeze are one write.
3. If the `UPDATE` changed no row, the item is not this settlement's to move: the transaction rolls
   back, taking step 1's record with it, and the repository reports `false`.
4. Commit.

A record exists exactly when the transfer happened, because both commit together or not at all.

"Already applied" is that record, **not the item's current state**. Once the transfer commits the
item is the buyer's, unfrozen and outside the settlement's control: the buyer may relist it, freeze
it in their own settlement, or sell it on, all before a retry runs. The item stops showing that this
transfer happened; the record does not.

The service turns `false` into `ErrItemNotTransfer`; the activity classifies that as the
non-retryable `TransferItemImpossible` and leaves every other error retryable.

## Table

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 1 | Before the transaction begins (worker dies, items DB unreachable) | nothing: item `PENDING_SETTLEMENT`, seller's, `listing_id` set; no record | records and transfers | not applied → applied | `TestTransferItem` "frozen for this listing moves to the buyer, unfreezes and is recorded" |
| 2 | Inside the transaction, before commit: after the insert, after the update, or between (worker killed, connection dropped, a statement fails) | nothing: Postgres aborts an uncommitted transaction, and the record goes with the write | as #1 | not applied → applied | the record and the write share the transaction: `TestTransferItem` "frozen for another listing is refused, left alone and not recorded" shows a rollback leaves no record |
| 3 | The commit lands but its acknowledgement is lost, so the driver reports an error | item buyer's, `AVAILABLE`, `listing_id` `NULL`; record present | the error is retryable; the insert conflicts, so it reports success and writes nothing | already applied → continue | `TestTransferItemActivity_Classification` "database is down" (retryable), then as #4 |
| 4 | After commit, before the activity returns (worker dies) | as #3 | Temporal retries after `StartToCloseTimeout`; the insert conflicts | already applied → continue | `TestTransferItem` "already transferred is success and changes nothing" |
| 5 | After the activity completes, before the workflow records it (completion lost in transit) | as #3 | the server times the attempt out and reschedules it, which is #4 | already applied → continue | as #4 |
| 6 | After the workflow records completion, before its next command (marketplace worker dies) | as #3; the result is in history | replay reads the result from history and does not re-run the activity | already applied → continue | Temporal's guarantee; nothing in items to test |
| 7 | As #4, but the buyer relists the item before the retry runs | record present; item buyer's, `LISTED` for a new listing | the insert conflicts; the item is not read or touched | already applied → continue | `TestTransferItem` "already transferred and relisted by the buyer is still success" |
| 8 | As #4, but before the retry the buyer's new listing freezes the item, or sells it on to someone else | record present; item `PENDING_SETTLEMENT` for the new listing, or owned by the next buyer | the insert conflicts; the new listing's freeze and the next owner are left alone | already applied → continue | `TestTransferItem` "already transferred and frozen by the buyer's own sale is success and left alone", "already transferred and sold on to someone else is still success" |
| 9 | A second attempt starts while the first is still inside its transaction (a timed-out attempt that is still alive) | first attempt's uncommitted record and write | the second insert waits on the `listing_id` primary key. If the first commits, the second conflicts and reports already applied. If the first rolls back, the second records and transfers | exactly one transfer | the primary key on `listing_id`; **no concurrent test yet** |
| 10 | Items stays down for the whole retry window (Edge States, "items down for hours after the pivot") | nothing | retried under `StepOptions` until the 30m cap; then the workflow escalates and parks, and the re-park timer or `RetryStep` runs #1 again | parked, completed after recovery | classification as #3; parking: `TestRunUntilDone_CapExhausted_ParksAndResumesOnRetryStep`, `TestRunUntilDone_ResumesOnTheReparkTimer`. **Step 4 is not yet scheduled through `runUntilDone`**: `SettleAuction` stops after 0b until 1a–3 are wired |
| 11 | No record, and the item is not `PENDING_SETTLEMENT` for this listing: never frozen, frozen for another listing, or missing | nothing: the `UPDATE` changes no row, the transaction rolls back, and no record is left | does not retry. `TransferItemImpossible` is an invariant breach after the pivot: it escalates and parks for an operator (§Req 13), who corrects the item's data and sends `RetryStep` | parked for an operator | `TestTransferItem` "frozen for another listing is refused, left alone and not recorded", "listed but never frozen is refused and not recorded", "missing item is refused and not recorded"; `TestServiceTransferItem`; `TestTransferItemActivity_Classification`; `TestRunUntilDone_ImpossibleAfterThePivot_Parks` |
| 12 | A database error inside the transaction that is not a crash (statement times out, serialization failure) | nothing: the transaction rolls back | the error is retryable, never read as impossible; the retry is #1 | not applied → applied | `TestServiceTransferItem` "infrastructure failure passes through, not as impossibility", `TestTransferItemActivity_Classification` |

## Why the record, and not the item

An earlier version decided "already applied" from the item: owner = buyer and not
`PENDING_SETTLEMENT` (§Req 31's wording). That holds only while the buyer leaves the item alone.
In #8 it fails: the retry found the item frozen by the buyer's own sale or owned by someone else,
reported `TransferItemImpossible` although the transfer had happened, and parked. If the item had
been sold on, every retry stayed impossible, so the settlement could never reach steps 5–6 and no
operator tool could move it on. The record makes #8 an ordinary already-applied retry.

FreezeItem keeps deciding from the item, because its evidence cannot move before its retry: a
frozen item is held by its settlement, and nothing else touches it until a later step of that same
settlement, which cannot run until step 0b has returned.

## Why the `listing_id` guard stays on the write

The record answers retries of a transfer that happened. The guard covers the opposite case: no
record, and the item frozen for some other listing (#11). Status alone cannot tell this settlement's
freeze from another's (§Req 8, migration 000022), so without `listing_id = $3` that `UPDATE` would
unfreeze and move an item in the middle of someone else's settlement. With it, the write changes
nothing and the step parks.
