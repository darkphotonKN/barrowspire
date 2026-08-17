# ADR-0009 — Idempotency belongs to the caller, via a deterministic transaction_id

Status: accepted
Date: 2026-08-17
Scope: `game-server/ledger-service`, `game-server/wallet-service`
Realized by: FS-0003 §Requirements 11–13 and the `AppendLedgerTx` contract (not yet implemented)

## Context

The ledger will be written to over paths that redeliver: broker at-least-once delivery, gRPC
retries, and — once wallet-service's transactional outbox lands — a relay that republishes until
acknowledged. **Duplicate posts are the normal case, not an exceptional one.** Something has to
decide whether an arriving transaction is new or a repeat.

The ledger cannot decide it alone. If it mints its own `transaction_id` and dedups on the
economic reference instead, it still faces two structurally identical requests and no way to
distinguish *"this is the retry of the settlement I already recorded"* from *"this is a second,
genuine movement that happens to have the same shape."* Only the caller knows which economic
event it is currently trying to record, because only the caller knows it is retrying.

That makes the caller the correct owner — but it is worth being explicit that this is an
**ownership transfer, not a free win**. The ledger is accepting that its correctness now depends
on a property of its callers that it cannot verify: that the same event always yields the same
id. A caller that mints a fresh UUID per attempt will double-record, and nothing in the ledger
will notice.

The related question is what a duplicate should *return*. Surfacing a conflict error would be
technically honest, but it pushes identical error-handling into every caller for something that
is expected traffic — and the natural handling is always "treat it as success," so the error only
creates opportunities to get it wrong. The error is better removed than propagated.

> Recorded without adversarial review in this repo. The decision arrived pre-formed from an
> external design discussion and was locked directly during FS-0003 scoping.

## Decision

**The caller mints `transaction_id`, deterministically derived from the event being recorded.
The ledger never mints one.**

- A re-post of an already-recorded transaction is a **no-op success** — `OK`, with `applied =
  false` so the caller can still tell the difference if it wants to.
- Deduplication is enforced by a **unique index**, not by reading and then writing. Two
  concurrent identical posts cannot both land.
- The ledger performs no verification that a caller's ids are in fact deterministic.

## Consequences

- **Retries are safe by construction.** No caller needs compensation logic, and no caller needs
  to handle a duplicate error path.
- **The transactional outbox pattern works with no extra dedup machinery** on either side. This
  is the intended write path (see FS-0003 §Known gap) and this decision is what makes it viable.
- **Cost: correctness depends on caller determinism, unverifiably.** This is the load-bearing
  risk of the decision. A caller generating a per-attempt UUID silently double-records gold
  movements, and the reconciler is what would eventually catch it.
- **Cost: a duplicate carrying different content is currently invisible.** The unique index keys
  on `(reason, reference_id, account_id, direction)` and excludes `amount`, so a retry with a
  corrected amount no-ops as success while the ledger keeps the original value. **This ADR does
  not settle that** — it is FS-0003 open question 1, whose recommendation is to make the no-op
  conditional on the existing legs agreeing, and to raise a hard conflict when they do not.
- **Nothing enforces `transaction_id` uniqueness itself**, so two genuinely different transactions
  sharing an id would break sum-to-zero across the pair undetected. Also unsettled — FS-0003 open
  question 2.
