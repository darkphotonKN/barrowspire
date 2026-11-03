# Crash points — step 5 AppendLedgerTx

FS-NXP1W §Req 32, 38. Every point at which step 5 can be interrupted, and what the next attempt
does. Step 5 is in the tail (ADR-0017): the buyer has paid, the seller is credited and the item
has moved, so no point resolves to roll back. Each one resolves to **already applied and
continue**, to **not applied, so the retry applies it**, or to **parked for an operator**.

This table covers the **saga side**: what marketplace sends and how the workflow handles each
outcome. The write itself, and its duplicate-is-success rule, belong to ledger-service
(FS-F9R7Q, I-F9R7Q-5/6/7). Rows that rest on the ledger side name it as their proof, and that
proof lands with those issues.

## What the saga sends

One `AppendLedgerTxInput`, built in `SettleAuction` from values already in workflow history, on
the `ledger` queue under `StepOptions` (30m cap, then escalate and park):

- `transaction_id = uuidv5(settlementNamespace, "settlement:" + listingId)`
  (`SettlementTransactionID`). Not the workflow or run ID. The namespace and the derivation are a
  permanent contract, pinned by `TestSettlementTransactionID_IsPinned`.
- reason `SETTLEMENT`, currency `GOLD`, reference = the listing ID.
- two legs for the settlement amount: buyer `DEBIT` on the account ID `CommitHold` returned, seller
  `CREDIT` on the account ID `CreditSeller` returned (§Req 18). Marketplace never reads either
  from wallet's data.

Every input is a pure function of history, so every attempt, retry, park lap and replay sends
the same bytes. That is what makes the ledger's dedup on `transaction_id` sufficient.

Step 5 sits behind `workflow.GetVersion("append-ledger-tx")`. A run already past step 4 when it
shipped replays without it and goes on to MarkSold, leaving no ledger rows for that settlement.

## Table

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 1 | Before the ledger transaction begins (worker dies, ledger DB unreachable) | nothing: no `ledger_transactions` row for the derived ID | the same input is appended | not applied → applied | `TestWorkflow_HasWinner_RunsTheTailInOrderAndCompletes` (the input); ledger-side append, I-F9R7Q-5 |
| 2 | Inside the ledger transaction, before commit | nothing: Postgres aborts the transaction, header and legs together | as #1 | not applied → applied | ledger writes the header and both legs in one transaction (FS-F9R7Q) |
| 3 | The commit lands but its acknowledgement is lost, so the activity reports an error | one header and two legs under the derived ID | retried with the same `transaction_id`; the ledger finds it and returns success, writing nothing | already applied → continue | `TestWorkflow_LedgerDownParks_RetriesWithTheSameTransactionID` (same input every attempt); duplicate-is-success, I-F9R7Q-6 |
| 4 | After commit, before the activity returns (ledger worker dies) | as #3 | Temporal retries after `StartToCloseTimeout`; as #3 | already applied → continue | as #3 |
| 5 | After the activity completes, before the workflow records it (completion lost in transit) | as #3 | the server times the attempt out and reschedules it, which is #4 | already applied → continue | as #3 |
| 6 | After the workflow records completion, before step 6 is scheduled (marketplace worker dies) | as #3; the result is in history | replay reads the result from history and does not re-run the activity | already applied → continue | Temporal's guarantee; nothing in marketplace to test |
| 7 | Ledger stays down for the whole retry window | nothing | retried under `StepOptions` until the 30m cap; then the workflow escalates and parks, and the re-park timer or `RetryStep` runs #1 again with the same input. Wallet and items steps are unaffected: they are already done, and other settlements' wallet and items steps run on their own queues | parked, completed after recovery | `TestWorkflow_LedgerDownParks_RetriesWithTheSameTransactionID` |
| 8 | Two attempts in flight at once (a timed-out attempt that is still alive) | the first attempt's uncommitted insert | the second blocks on the `transaction_id` primary key. If the first commits, the second sees a duplicate and returns success. If it rolls back, the second applies | exactly one transaction | the primary key on `ledger_transactions.transaction_id`; **no concurrent test yet** |
| 9 | The ledger refuses the transaction (unbalanced legs, a nil account ID, a reason or currency outside its CHECKs) | nothing | does not retry. After the pivot an impossibility is an invariant breach: it escalates and parks for an operator (§Req 13), who fixes the cause and sends `RetryStep` | parked for an operator | `TestWorkflow_TailImpossible_ParksAndNeverRollsBack/AppendLedgerTx` |
| 10 | A different `transaction_id` for the same listing (namespace or derivation changed) | the earlier settlement's rows | the ledger's unique index on `reference_id WHERE reason = 'SETTLEMENT'` refuses the second post rather than double-posting. Classifying that refusal is ledger-side (I-F9R7Q); classified non-retryable it parks as #9, otherwise it parks as #7 | parked for an operator | `TestSettlementTransactionID_IsPinned` keeps this from happening; the index is ledger migration 000003 |

## Why the derived ID and not the workflow ID

The workflow ID (`settlement-{listingId}`) is stable too, but the ledger's transaction ID is a
fact about the sale, not about the process that recorded it. Deriving it from the listing keeps
it the same if a settlement is ever re-run under a new workflow (an operator restart, a future
migration), and lets anyone recompute it from the listing alone when reconciling.
