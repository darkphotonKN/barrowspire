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
- **SETTLEMENT_FAILED** — terminal listing status after a pre-pivot rollback for a failure that can never succeed (item moved, hold released, listing withdrawn). Holds released, bids LOST, item unfrozen to its seller. Never re-settled.
- **Semantic impossibility** — a step failure no retry can fix. The only failure kind that triggers a rollback, and only before the pivot. Contrast *transient* (retry, cap, park) and *already applied* (treated as success) (ADR-0018).
- **PENDING_SETTLEMENT** — listing status from step 0a until SOLD / SETTLEMENT_FAILED; a live listing for every reconciler. (items-service has its own `PENDING_SETTLEMENT` item status, set at 0b.)
