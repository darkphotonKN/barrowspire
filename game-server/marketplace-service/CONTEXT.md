# CONTEXT — marketplace-service

Ubiquitous language for the **marketplace-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## Terms

<!-- **Term** — one-line definition -->

### Settlement (FS-NXP1W)

- **Settlement** — the saga that resolves an ended auction into its final state; one Temporal workflow per listing, ID `settlement-{listingId}`, hosted by marketplace (ADR-0016).
- **Settlement trigger** — what starts a settlement: the expiry poller, AcceptBid, or buyout. All three start the same workflow ID; any start after the first is a no-op success (ADR-0016). A trigger is not a step.
- **Expiry poller** — the marketplace component that starts settlement for ACTIVE listings past expiry. It never selects `SETTLEMENT_FAILED`.
- **Pivot** — `CommitHold`, the first step that moves real gold (ADR-0010). Before it, a failure that can never succeed rolls back the earlier steps; after it, the saga only rolls forward. Same step as ledger-service's "pivot"; this context also uses it to split failure handling.
- **Tail** — steps after the pivot (ReleaseLosingHolds, CreditSeller, TransferItem, AppendLedgerTx, MarkSold): forward-only, no undo steps (ADR-0017).
- **Parked settlement** — a settlement that exhausted a step's retry cap, escalated, and is waiting on a `RetryStep` signal or a re-park timer to retry that same step. The workflow is the dead-letter queue; it never fails past the pivot (ADR-0018). Say "parked settlement", not "parked": elsewhere (wallet/ledger) "parked gold" means a held balance.
- **Escalate** — record a settlement exception and publish `settlement.failed` before parking.
- **Settlement exception** — a `settlement_exceptions` row: the durable, human-facing record that a settlement parked or rolled back. Carries the alert; the saga state stays in the workflow.
- **SETTLEMENT_FAILED** — terminal listing status after a pre-pivot rollback for a failure that can never succeed (item moved, hold released). Holds released, bids LOST, item unfrozen to its seller. Never re-settled. A listing withdrawn before step 0a also takes the pre-pivot rollback but stays CANCELLED, not SETTLEMENT_FAILED: the rollback's status write changes only PENDING_SETTLEMENT (FS-V7A5S Req 10).
- **Semantic impossibility** — a step failure no retry can fix. The only failure kind that triggers a rollback, and only before the pivot. Contrast *transient* (retry, cap, park) and *already applied* (treated as success) (ADR-0018).
- **PENDING_SETTLEMENT** — listing status from step 0a until SOLD / SETTLEMENT_FAILED; a live listing for every reconciler. (items-service has its own `PENDING_SETTLEMENT` item status, set at 0b.)

### Accepting a bid (FS-F692V)

- **Accept floor** — the leading bid amount the seller saw when they accepted (`minAmount`). AcceptBid is refused (`LEADING_BID_LOWERED`) when the WINNING bid is now below it; at or above it, settlement starts as usual, so a higher bid landing first still wins (FS-49Z37). A floor, not a bid identity: the seller never learns which bid leads.

### Bidding (FS-ZE43K)

- **Bid withdrawal cap** — the number of bids a member may withdraw on one listing (3, ADR-0052) before they can no longer bid on it. Counts only that member's CANCELLED bids on that listing; withdrawing itself is never refused, and buyout is not limited. A capped bid is refused with the domain sentinel `ErrBidWithdrawLimitReached`, which crosses the wire as the registered code `BID_WITHDRAW_LIMIT_REACHED` ("limit" in the code and sentinel names this cap; the constant is `bidWithdrawalCap`).

### Withdrawing a listing (FS-V7A5S)

- **Withdrawal** — the seller taking their own ACTIVE, unended, not-bought-out listing down: the listing becomes CANCELLED, its live bids LOST, and a `withdraw-listing` workflow returns the item and every hold (ADR-0051). Not to be confused with a bidder *withdrawing a bid*, which leaves that bid CANCELLED.
- **Live bid** — a bid still holding gold: PENDING, WINNING or OUTBID. A listing with live bids cannot be withdrawn in its final 30 minutes.
- **Withdraw backstop** — the reconcile-tick pass that starts the `withdraw-listing` workflow for every CANCELLED listing whose withdrawal is not yet marked started, however old, for a start that failed and was not retried or never ran, then marks it (FS-V7A5S Req 8). A duplicate start is a no-op.
- **Withdrawal started** — the per-listing marker (`listings.withdrawal_started_at`) set once a listing's `withdraw-listing` workflow start lands or the starter answers already-started. Records "started", never "finished": once started, the workflow's uncapped retries finish it. Unmarked CANCELLED listings are exactly the backstop's candidates.
