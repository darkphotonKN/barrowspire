# FS-NXP1W: Auction settlement saga

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Auction lifecycle" → "Auction settlement"; `game-server/wallet-service/SPECIFICATION.md` "### Saga participation" → "Settlement saga activities"; `game-server/items-service/SPECIFICATION.md` "## Marketplace settlement" → "Settlement saga activities" → this FS · Related ADRs: [ADR-0005](../adr/0005-wallet-owns-balance-ledger-is-a-reconciliation-record.md) (wallet owns balance), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) (caller-minted idempotency), [ADR-0010](../adr/0010-the-ledger-is-appended-past-the-saga-pivot.md) (pivot; ledger appended after it), [ADR-0011](../adr/0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md) (activities per owning service), [ADR-0016](../adr/0016-settlement-starts-from-an-expiry-poller-one-workflow-per-listing.md) (trigger + workflow identity), [ADR-0017](../adr/0017-item-transfer-rolls-forward-the-pivot-stays-at-commit-hold.md) (item transfer rolls forward), [ADR-0018](../adr/0018-settlement-failures-are-classified-by-kind-and-park-rather-than-fail.md) (failure classification, escalate-and-park), [ADR-0019](../adr/0019-activity-payloads-are-json-structs-in-per-owner-packages.md) (activity payload encoding)

> Terms follow `game-server/marketplace-service/CONTEXT.md` §Settlement. All decisions were
> recorded without adversarial review (the user declined challenge-me).

## Summary

When an auction ends, the winner pays, losing bidders get their held gold back, the seller is paid,
the item changes hands, the movement is recorded in the ledger and the listing is closed. The
seller can also end an auction early by accepting the current top bid, and a buyout goes through
the same process.

Settlement is one Temporal workflow per listing, hosted by marketplace. Each step runs as an activity
inside the service that owns the data (marketplace, items, wallet, ledger). Before the pivot
(`CommitHold`), a settlement that can never succeed rolls back to a final `SETTLEMENT_FAILED`. After
it, the saga only rolls forward. A temporary failure never kills a sale: the settlement escalates
to a human and parks until the dependency recovers.

**Prerequisites assumed present, not built here:** Temporal running with a worker in each
participating service and `common/temporal` (ADR-0011-anchored infrastructure, `I-ADR0011-n`
issues); the `bids` table (Kiki's bids work); ledger-service's `AppendLedgerTx` activity
(FS-F9R7Q).

## Requirements

### Trigger and identity (ADR-0016)

1. A settlement is one workflow with ID `settlement-{listingId}`, started with reuse policy
   `REJECT_DUPLICATE`, registered on the `marketplace` task queue.
2. An **expiry poller** in marketplace periodically selects `ACTIVE` listings past expiry and starts
   settlement for each. It never selects any other status.
3. **AcceptBid** starts settlement for the listing early. The seller accepts only the **current
   WINNING bid**; no bid ID is passed to the workflow.
4. **Buyout** starts settlement for the listing. It meets the same workflow and is not a separate saga.
5. Every starter treats "workflow already started" as success. Workflow input is `listingId` plus
   a trigger kind (`EXPIRY` | `ACCEPT_BID` | `BUYOUT`). The winner is always selected by step 0a,
   the same way for every trigger.

### Step sequence

6. Steps run in this order, each as an activity on the owning service's task queue:

   | # | Activity | Owner / queue | Phase |
   |---|---|---|---|
   | 0a | `FreezeListing` (+ winner selection) | marketplace | before pivot |
   | 0b | `FreezeItem` | items | before pivot |
   | 1a | `SetWinningBid` | marketplace | before pivot |
   | 1b | `CommitHold` | wallet | **pivot** |
   | 2 | `ReleaseLosingHolds` | wallet | tail |
   | 3 | `CreditSeller` | wallet | tail |
   | 4 | `TransferItem` | items | tail |
   | 5 | `AppendLedgerTx` | ledger | tail |
   | 6 | `MarkSold` | marketplace | tail |

7. Each activity is a thin wrapper over a use case in the owning service that a non-Temporal
   caller could also invoke. Temporal-specific code (options, error classification into
   application errors, heartbeats) stays in the wrapper. No saga step makes a gRPC call.
   `CommitHold`, `ReleaseHold` and `CreditSeller` are not added as gRPC RPCs.
8. **Zero bids:** when 0a finds no WINNING bid, the workflow short-circuits. The listing becomes
   `EXPIRED` and the item returns from `LISTED` to `AVAILABLE`; no wallet, ledger or bid steps
   run. This is a normal outcome, not an exception.

### Failure handling (ADR-0017, ADR-0018)

9. Every activity classifies each failure as exactly one of:
   - **transient**: dependency unavailable, deadline exceeded, resource exhausted. Returned as a
     plain (retryable) error.
   - **already applied**: the state the step would produce is already present (its own retry
     catching up). Returned as **success** with the same output the first application would give.
   - **semantic impossibility**: the step can never succeed (for example the hold is released
     or expired, the listing is no longer eligible, or the item's owner or status changed).
     Returned as a non-retryable application error.
   Each activity declares its non-retryable set explicitly (ADR-0011).
10. **Escalate and park.** Every activity has a capped retry (exponential backoff with a maximum
    interval, bounded by `ScheduleToCloseTimeout`). When the cap is exhausted by transient failures,
    the workflow does **not** fail. It:
    1. runs `RaiseSettlementException` (marketplace queue, unlimited retry), which writes a
       `settlement_exceptions` row and publishes `settlement.failed` through marketplace's
       transactional outbox;
    2. parks until a `RetryStep` signal arrives or a re-park timer fires, whichever comes first;
    3. retries the same step from the beginning of its retry policy. On eventual success the exception row is
       marked resolved.
    One helper implements this for every step.
11. Starting values, which are tuning and not contract: backoff 1s initial → 1m maximum; cap
    (`ScheduleToCloseTimeout`) 30m; re-park timer 1h. Settlement grace on hold expiry (Req 19) must
    comfortably exceed the cap.
12. **Before the pivot**, a semantic impossibility in 0a, 0b, 1a or 1b rolls back to a **final**
    state. The listing becomes `SETTLEMENT_FAILED`, every RESERVED hold on the listing is released,
    every bid becomes `LOST` (including one already moved to `WON`), the item is unfrozen to
    `AVAILABLE` for its seller, and a `settlement_exceptions` row records the rollback. Each
    rollback action is itself idempotent and retried without a cap. A `SETTLEMENT_FAILED` listing is never re-settled.
13. **After the pivot**, there is no rollback and no abandon signal. A semantic impossibility in the tail
    is an invariant breach: it escalates and parks (Req 10) instead of failing.
14. A settlement workflow never ends in a failed state after the pivot.
15. `REVERSED` hold state and a `ReverseCommit` verb are **not** built (ADR-0017).

### Activity contract (ADR-0019)

16. Activity name constants and input/output types live in one package per executing service under
    `game-server/common/api/activity/`: `marketplaceactivity`, `itemsactivity`, `walletactivity`,
    alongside the existing `ledgeractivity`. Plain structs, explicit JSON tags.
17. Contract changes are additive-only (never remove a field, retype it or change a tag). Each struct has
    a golden-JSON fixture test.
18. The contract carries at least:

    | Activity | Input | Output |
    |---|---|---|
    | `FreezeListing` | listingId | outcome (`HAS_WINNER` \| `NO_BIDS`), listingId, itemId, sellerId, winnerBidId, winnerMemberId, amount |
    | `FreezeItem` | itemId, sellerId | — |
    | `SetWinningBid` | listingId, winnerBidId | — |
    | `CommitHold` | winnerBidId, expected amount | buyer walletAccountId, committed amount |
    | `ReleaseLosingHolds` | listingId, winnerBidId, losing bidIds | released count |
    | `CreditSeller` | sellerId, amount, idempotency key (workflow ID + activity name) | seller walletAccountId |
    | `TransferItem` | itemId, buyer memberId | — |
    | `AppendLedgerTx` | existing `ledgeractivity.AppendLedgerTxInput` | existing output |
    | `MarkSold` | listingId | — |
    | `RaiseSettlementException` | listingId, workflowId, step, reason | exceptionId |
    | rollback activities (Req 12) | listingId / itemId / bidIds as needed | — |

    Marketplace never learns wallet account IDs from wallet's data model. It receives them only as
    `CommitHold` / `CreditSeller` outputs and passes them to the ledger legs as they are.

### Schema prerequisites

19. **Hold expiry is passed explicitly at PlaceHold** as listing expiry + settlement grace, and
    stored in `wallet_holds.expired_at` (the column already exists; `PlaceHoldUC` currently derives
    it from `time.Now()`). This is a prerequisite for settlement: without it, nothing protects settlement from the hold sweeper racing it.
20. `listings.status` admits `PENDING_SETTLEMENT`, `SOLD`, `SETTLEMENT_FAILED` and `EXPIRED`, with
    the transitions of this FS enforced as conditional writes.
21. `bids.status` admits `WON` and `LOST`. A partial unique index `ON bids(listing_id) WHERE
    status='WINNING'` exists (it enforces how many winners a listing has; the row lock enforces which).
22. `item_instances.status` admits `PENDING_SETTLEMENT`, distinct from `LISTED`. Whether the
    existing `IN_ESCROW` value is this state under an older name is resolved when implementing it.
    Either reuse and rename it, or add the new value and document `IN_ESCROW`.
23. wallet has a `processed_events` dedup table keyed on **(workflow ID, activity name)**.
24. marketplace has a `settlement_exceptions` table: listing_id, workflow_id, step, reason, status
    (open / resolved), created_at, resolved_at nullable, published_at nullable.

### Activities

Every guard is a conditional write (or, in wallet, an aggregate save under optimistic
concurrency). Never read-then-act.

25. **0a FreezeListing.** In one transaction: `ACTIVE → PENDING_SETTLEMENT` conditional on
    `status='ACTIVE'`, then select the WINNING bid.
    - Already applied: the listing is `PENDING_SETTLEMENT`. Re-select the winner and return the same output.
    - Semantic impossibility: any other status (lost a race with withdrawal or an earlier terminal outcome).
    - The late-bid race is closed by placeBid taking the listing row lock **and re-checking status
      after acquiring it**, not by this transaction. That re-check must not be optimised away.
26. **0b FreezeItem.** `LISTED → PENDING_SETTLEMENT` conditional on `status='LISTED' AND
    owner_member_id = sellerId`.
    - Already applied: the item is `PENDING_SETTLEMENT` with owner = seller.
    - Semantic impossibility: any other status or owner.
27. **1a SetWinningBid.** Bid `WINNING → WON`, conditional on status. Already applied: bid is `WON`.
28. **1b CommitHold (pivot).** In wallet's aggregate style (reconstitute, domain method, OCC save):
    hold `RESERVED → COMMITTED` and debit the account, atomically.
    - The debit amount is the **hold's own amount**. The caller's expected amount is only a cross-check;
      a mismatch is a semantic impossibility, raised loudly.
    - The debit is guarded by `gold >= amount`. Reaching that guard is an invariant breach and aborts the transaction.
    - "Nothing changed" is disambiguated by reading the hold's state: `COMMITTED` → already applied
      (success, same output); `RELEASED` or past expiry → semantic impossibility.
29. **2 ReleaseLosingHolds.** Every `RESERVED` hold for a losing bid on the listing → `RELEASED`.
    Holds already `RELEASED` count as already applied. Tail: no rollback.
30. **3 CreditSeller.** Credit the seller's account with the settlement amount, deduplicated through
    `processed_events` (Req 23) in the same transaction. Already applied: a dedup row exists.
31. **4 TransferItem.** `owner_member_id = buyer, status = AVAILABLE` conditional on
    `status='PENDING_SETTLEMENT'`: transfer and unfreeze in one write. Already applied: owner = buyer
    and status is not `PENDING_SETTLEMENT`. Tail: no rollback.
32. **5 AppendLedgerTx (saga side).** The workflow builds a two-leg transaction: buyer DEBIT and seller CREDIT
    for the settlement amount, reason `SETTLEMENT`, reference = listingId, legs keyed by the wallet
    account IDs from Req 18, and schedules it on the `ledger` queue.
    - `transaction_id = uuidv5(fixed settlement namespace, "settlement:" + listingId)`. Not the
      workflow or run ID. The namespace UUID and the derivation are a permanent contract; changing either
      causes double posts.
    - A duplicate append is a no-op success (ledger-side, FS-F9R7Q).
    - The ledger never learns what an auction is.
33. **6 MarkSold.** `PENDING_SETTLEMENT → SOLD` conditional on status. Already applied: `SOLD`. Zero
    rows with any other status is an invariant breach and escalates and parks (Req 13).
34. **Stale-reservation reconciler.** Marketplace's reconciler (`ListStaleReserved` →
    `CancelReservation`) treats an item whose listing is `PENDING_SETTLEMENT` as live and never
    cancels its reservation.

### Workflow assembly

35. Every activity has an explicit `TaskQueue` and a `StartToCloseTimeout`. Any activity that can run
    longer than its heartbeat window sets `HeartbeatTimeout` and heartbeats.
36. Retry policies follow Req 9–11. No activity has unlimited retries without a cap, except
    `RaiseSettlementException` and the rollback actions (Req 10, 12).
37. Rollback before the pivot (Req 12) is wired for 0a, 0b, 1a and 1b.

### Verification

38. **Crash-point analysis:** for each step, every crash point (before the write, after the write
    but before the activity completes, after completion but before the workflow records it) is
    enumerated and shown to resolve to already-applied-and-continue or roll back. The result is
    committed alongside the tests.
39. **End-to-end auction test:** list → several bids → expiry → settlement, asserting final state in
    marketplace (listing SOLD, winner WON, losers LOST), wallet (buyer debited, holds committed or
    released, seller credited), items (owner = buyer, AVAILABLE) and ledger (**exactly two** rows
    under the derived transaction_id).
40. **Break-it tests** on the walking skeleton and the real workflow: retryable failure → backoff
    visible; cap exhausted → exception row + park, then `RetryStep` resumes; semantic impossibility before
    the pivot → `SETTLEMENT_FAILED`; worker killed mid-activity → activity rescheduled and settlement
    completes.

### Design diagram

41. The settlement design diagram is corrected to match this FS: workflow ID `settlement-{listingId}`
    (not `bid-{bidId}`); `CommitHold` keyed on winnerBidId (not an account ID); step 5 labelled
    ledger (not items); `transaction_id` shown as uuidv5 everywhere; states `PENDING_SETTLEMENT`,
    `SOLD`, `SETTLEMENT_FAILED`, `EXPIRED` drawn and `REVERSED` removed; escalate-and-park drawn. Seller
    credit placement is confirmed as intended escrow (a short window between pivot and CreditSeller).

## User Stories

1. As a seller, I want my auction to settle automatically when it expires, so that I get paid without doing anything.
2. As a seller, I want to accept the current top bid before expiry, so that I can close a sale I'm happy with early.
3. As a seller, I want an auction with no bids to hand my item back, so that I can use or relist it.
4. As a seller, I want to be credited exactly once, so that a retry never pays me twice or not at all.
5. As a winning bidder, I want exactly the amount I bid taken from my held gold, so that I'm never charged a figure another service made up.
6. As a winning bidder, I want to receive the item even if the item service was down for a while, so that my payment is never stranded.
7. As a losing bidder, I want my held gold released promptly after settlement, so that I can bid elsewhere.
8. As a buyer using buyout, I want my purchase to settle through the same process, so that it follows the same guarantees.
9. As a bidder, I want a bid placed after the auction froze to be rejected, so that the result can't change under the winner.
10. As a seller, I want my item protected from any other listing or sale while settlement runs, so that it can't be sold twice.
11. As an operator, I want a settlement stuck on an outage to raise an exception and wait, not fail, so that no sale is lost to a blip.
12. As an operator, I want to resume a parked settlement with a signal once the dependency is fixed, so that recovery doesn't need a workflow reset.
13. As an operator, I want parked settlements to retry on their own after a while, so that recovery happens even if nobody acts.
14. As an operator, I want a settlement that can never succeed to end cleanly in `SETTLEMENT_FAILED` with everything released, so that nothing stays frozen forever.
15. As an operator, I want every exception recorded in `settlement_exceptions` and published as `settlement.failed`, so that I'm alerted and can audit what happened.
16. As an incident responder, I want a settlement's full history visible in Temporal, so that I can see exactly which step failed and why.
17. As the expiry poller, I want starting an already-running or finished settlement to be harmless, so that I can poll carelessly and heal missed ticks.
18. As the marketplace service, I want AcceptBid, buyout and expiry to converge on one workflow, so that a race between them settles once.
19. As the wallet service, I want to take the debit amount from my own hold row, so that my balance invariant never depends on a caller.
20. As the wallet service, I want my own retries to be treated as success, so that a crash after commit doesn't abort a settlement that already moved gold.
21. As the items service, I want the freeze to check the seller still owns the item, so that "sold out from under us" is a real check, not a guess.
22. As the ledger service, I want a settlement posted once as two balanced legs with a stable transaction ID, so that a retried append never double-records.
23. As a support engineer, I want a settlement with 47 bids to produce exactly two ledger rows, so that the record shows gold movements and not hold churn.
24. As the stale-reservation reconciler, I want to recognize items under settlement as live, so that I never unfreeze an item mid-settlement.
25. As the hold sweeper, I want hold expiry set explicitly from the listing's expiry plus grace, so that I don't release a hold settlement is about to commit.
26. As a developer, I want each activity's contract in its owner's package with golden fixtures, so that a breaking rename fails a PR instead of a running workflow.
27. As a developer, I want each activity to wrap a plain use case, so that I can test the domain logic without Temporal.
28. As a developer, I want the retry cap, park and rollback behaviour in one helper, so that every step fails the same way.
29. As a teammate reading the design, I want the diagram to match the code, so that I don't implement a superseded ID scheme or step owner.

## Acceptance Criteria

- [ ] Starting `settlement-{listingId}` twice (any mix of expiry, AcceptBid, buyout) runs one settlement; the second start returns success to its caller.
- [ ] The expiry poller starts settlement for ACTIVE past-expiry listings and ignores every other status, including `SETTLEMENT_FAILED`.
- [ ] AcceptBid settles at the current WINNING bid; no bid ID reaches the workflow.
- [ ] A listing with no bids ends `EXPIRED` with its item `AVAILABLE`, and no wallet or ledger activity runs.
- [ ] A happy-path settlement ends with: listing `SOLD`; winner `WON`, others `LOST`; winning hold `COMMITTED` and buyer debited by the hold's amount; losing holds `RELEASED`; seller credited once; item owned by the buyer and `AVAILABLE`; exactly two ledger rows under `uuidv5(ns, "settlement:"+listingId)`.
- [ ] Re-executing any activity after it succeeded returns success with the same output and changes nothing.
- [ ] `CommitHold` on a `RELEASED` or expired hold is non-retryable; on a `COMMITTED` hold it is success; a caller amount different from the hold's amount is non-retryable.
- [ ] `FreezeItem` fails non-retryably when the item's owner is not the seller or its status is neither `LISTED` nor `PENDING_SETTLEMENT`.
- [ ] A semantic impossibility before the pivot leaves: listing `SETTLEMENT_FAILED`, all holds on the listing `RELEASED`, all bids `LOST`, item `AVAILABLE` with the seller, one `settlement_exceptions` row.
- [ ] An activity exhausting its cap produces a `settlement_exceptions` row and a `settlement.failed` publish, and the workflow stays open.
- [ ] A parked settlement resumes on `RetryStep` and, separately, on the re-park timer; on success the exception is resolved.
- [ ] No settlement workflow ends in a failed state after `CommitHold` succeeded.
- [ ] Every activity has `TaskQueue` and `StartToCloseTimeout`; every activity declares its non-retryable set.
- [ ] Every activity input/output struct lives in its owner's `common/api/activity` package and has a golden-JSON fixture test.
- [ ] `PlaceHold` stores the explicitly passed expiry.
- [ ] `processed_events` rejects a second credit for the same (workflow ID, activity name).
- [ ] The stale-reservation reconciler does not cancel the reservation of an item whose listing is `PENDING_SETTLEMENT`.
- [ ] A crash-point table covering every step is committed, and each crash point resolves to already-applied-and-continue or roll back.
- [ ] Killing a participant worker mid-activity does not change the final state.
- [ ] The e2e auction test passes across all four services.
- [ ] The design diagram reflects Req 41.

## Edge States

- **Expiry and AcceptBid race:** both start `settlement-{listingId}`; the second is rejected as a duplicate and returns success. One settlement.
- **Bid placed during freeze:** placeBid acquires the listing row lock after 0a commits, re-checks status, sees `PENDING_SETTLEMENT` and rejects. A bid that committed before 0a is included in winner selection.
- **Zero bids:** short-circuit to `EXPIRED` + item `AVAILABLE` (Req 8).
- **Listing withdrawn before 0a runs:** 0a sees a non-ACTIVE status → semantic impossibility. Whether a withdrawn listing then moves to `SETTLEMENT_FAILED` or keeps its withdrawn status is governed by the future ListingWithdraw saga; until then the rollback must not overwrite a terminal status that another flow set.
- **Crash after 0a commits, before the activity completes:** the retry sees `PENDING_SETTLEMENT` → already applied, same output.
- **Item owner changed or item unfrozen before 0b:** non-retryable → rollback to `SETTLEMENT_FAILED`.
- **Crash after CommitHold commits, before the workflow records it:** the retry reads `COMMITTED` → success. Gold moves once.
- **Hold expired while parked before the pivot:** the hold sweeper releases it; CommitHold returns semantic impossibility → rollback. The grace period must exceed the cap to keep this rare.
- **Winner has insufficient gold at commit:** unreachable while holds are correct; the guard aborts the pivot transaction, raised as semantic impossibility → rollback.
- **Wallet down after the pivot:** ReleaseLosingHolds / CreditSeller hit the cap → escalate → park; the buyer is debited and the seller not yet credited for the outage's duration (accepted escrow shape).
- **Items down for hours after the pivot:** TransferItem parks; the buyer has paid and has no item until recovery (ADR-0017).
- **Ledger down:** AppendLedgerTx parks; the ledger's own bulkhead (separate queue) keeps wallet and items steps unaffected.
- **Duplicate ledger append:** same transaction_id → no-op success.
- **MarkSold finds a non-PENDING_SETTLEMENT listing:** invariant breach → escalate and park; never overwrite.
- **Operator never responds:** re-park timer retries hourly, indefinitely.
- **Rollback action itself fails transiently:** retried without a cap; a rollback never parks halfway.
- **Stale-reservation reconciler runs mid-settlement:** skips items whose listing is `PENDING_SETTLEMENT` (Req 34).
- **Marketplace worker down:** no workflow tasks progress; on restart the workflow resumes from history. Participant activities already completed are not re-run.
- **Workflow code deployed while settlements are open:** short-lived runs make this rare; any change that alters the command sequence must use Temporal versioning.

## Out of Scope

- Temporal infrastructure: compose services, smoke test, `common/temporal`, per-service worker bootstrap, walking skeleton. ADR-0011-anchored, tracked as `I-ADR0011-n` issues.
- ledger-service internals and the `AppendLedgerTx` activity implementation (FS-F9R7Q, I-F9R7Q-5).
- The `bids` table and bid placement, AcceptBid's HTTP endpoint, deposit/withdraw (Kiki's work); this FS only defines what AcceptBid triggers.
- BidPlaced saga; ListingWithdraw saga (with live bids, an open product decision).
- SYSTEM account design.
- Funding reconciler sweeper (hold with no bid past grace); hold-expiry sweeper implementation.
- `gold_awards` table.
- A refund path for committed settlements (`ReverseCommit`, `REVERSED`), rejected by ADR-0017.
- Operator tooling beyond sending `RetryStep` through the Temporal UI or CLI.
- Wallet's transactional outbox for hold state changes (ADR-0010's open question).
- Reconciling the wallet spec lines "Expose the write path (gRPC and AMQP)" and "Consume marketplace saga events to drive writes" with ADR-0011.
