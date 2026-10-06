# Crash points — step 3 CreditSeller

FS-NXP1W §Req 38. Every point at which step 3 can be interrupted, and what the next attempt
does. Step 3 is in the tail (ADR-0017), so no point resolves to roll back: each one resolves to
**already applied and continue**, or to **not applied, so the retry applies it**.

## The write

One transaction (`CreditSellerUC.Handle`):

1. `INSERT INTO processed_activities (idempotency_key) … ON CONFLICT DO NOTHING`. The key is
   caller-minted: workflow ID + activity name (ADR-0009).
2. Load the seller's account by member ID.
3. If step 1 inserted nothing: already applied, so answer with the seller's account ID.
4. Otherwise `Deposit(amount)` and `SaveTx` under optimistic concurrency.
5. Commit.

The row and the credit commit together or not at all. That is what makes a bare increment
exactly-once.

## Table

| # | Crash point | State left behind | Next attempt | Resolves to | Proven by |
|---|---|---|---|---|---|
| 1 | Before the transaction begins (worker dies, wallet unreachable) | nothing | claims the key, credits | not applied → applied | `TestCreditSellerUC_FirstCredit_CreditsSellerAndReturnsTheirAccount` |
| 2 | Inside the transaction, after the row is inserted and before commit (worker killed, connection dropped, save fails) | nothing: Postgres aborts an uncommitted transaction, and the row goes with it | claims the key, credits | not applied → applied | `TestCreditSellerUC_CreditFails_LeavesNoDedupRowSoTheRetryCredits` (mutation-checked: putting the insert in its own transaction makes it fail) |
| 3 | Inside the transaction, the seller's row version lost to a concurrent write (deposit, withdraw, hold) | nothing: the whole transaction rolls back, row included | `withRetry` reruns the **whole** transaction, so it inserts again and re-reads the account | not applied → applied | covered by the structure: `withRetry` wraps `ExecTx`, never the reverse |
| 4 | After commit, before the activity returns (worker dies, or the commit ack is lost and the driver reports an error) | row + credit | Temporal retries after `StartToCloseTimeout`; the insert conflicts, so the step answers with the seller's account ID and credits nothing | already applied → continue | `TestCreditSellerUC_SameKeyTwice_CreditsOnceAndReturnsTheSameAccount` |
| 5 | After the activity completes, before the workflow records it (completion lost in transit) | row + credit | the server times the attempt out and reschedules it, which is the same as #4 | already applied → continue | as #4 |
| 6 | After the workflow records completion, before its next command (marketplace worker dies) | row + credit; the result is in history | replay reads the output from history and does not re-run the activity | already applied → continue | Temporal's guarantee; nothing in wallet to test |
| 7 | A second attempt starts while the first is still inside its transaction (a timed-out attempt that is still alive) | first attempt's uncommitted row | the second insert blocks on the primary key. If the first commits, the second sees the conflict and answers already applied. If the first rolls back, the second claims the key and credits | exactly one credit | `TestCreditSellerUC_ConcurrentAttempts_CreditOnce` |
| 8 | Wallet stays down for the whole retry window (Edge States, "wallet down after the pivot") | nothing | retried under the default tail policy; when the cap is exhausted, the workflow escalates and parks | parked, resumed later as #1 | classification: `TestCreditSellerActivity_Classification` keeps outage errors retryable. **Parking is unproven until slice 7 (I-NXP1W-7) lands.** |
| 9 | Seller has no account, or the amount is non-positive | nothing: the transaction rolls back, row included | does not retry. The error is non-retryable `CreditSellerImpossible`, an invariant breach that escalates and parks (§Req 13) | parked for an operator | `TestCreditSellerUC_SellerHasNoAccount_IsNotFoundAndLeavesNoDedupRow`, `TestCreditSellerActivity_Classification` |

## What is deliberately not stored

The dedup row has no output column. An already-applied attempt answers with the seller's
account ID by finding the seller again, and that ID never changes for a member (one account per
member, enforced by `UNIQUE(member_id)`). Storing it would add a second copy that could disagree.
