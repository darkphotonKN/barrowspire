# ADR-0010 — The ledger is appended past the settlement saga's pivot, so nothing recorded is ever wrong

Status: accepted
Date: 2026-08-23
Scope: `game-server/ledger-service`, `game-server/marketplace-service`, `game-server/wallet-service`
Amends: [ADR-0007](0007-the-ledger-is-append-only-corrections-are-reversals.md) — replaces its
"corrections are reversals" clause; its append-only clause stands
Realized by: FS-0003 §Requirements 2–3, 9 (not yet implemented)

## Context

ADR-0007 was written against an assumption about *when* the ledger is written: that a settlement
commits, the movement is recorded, and a later failure can therefore leave a wrong row behind.
Given that assumption its conclusion was right — you cannot mutate an append-only record, so a
correction has to be a new transaction with the legs swapped.

The assumption no longer holds. The settlement of a winning bid is a **saga**, and a saga has a
**pivot**: the point at which the first real gold moves and rollback stops being possible. Here
the pivot is the winning bid's wallet hold being committed and the buyer's account debited.

That single fact reorganises everything downstream of it:

- **Before the pivot**, a failure compensates in reverse. No gold has changed hands, so there is
  nothing for a reconciliation record to record.
- **After the pivot**, the saga cannot go back. It can only roll forward, retrying each remaining
  step until it succeeds.

The ledger append is one of those forward steps, and it is placed **after every money step has
succeeded**. So the two cases that ADR-0007's reversal mechanism existed to handle both
disappear: a settlement that fails early never reaches the ledger, and a settlement that reaches
the ledger has already finished moving money.

A reversal, at that point, would be a correction to a record that is not wrong.

> The orchestration is expected to run on Temporal. That choice belongs to the settlement saga
> and is not a ledger concern; what this ADR depends on is the *ordering guarantee* — pivot,
> then roll-forward-only — not the tool that provides it.

## Decision

**The ledger is appended only past the saga's pivot, once every money step has succeeded, as a
single transaction under one `transaction_id`.**

Consequently, **ledger-service has no reversal, correction, or retraction mechanism** — no RPC,
no service method, no repository method. Not because corrections are forbidden, but because the
write is ordered so that nothing correctable is ever written.

**ADR-0007's append-only clause stands and remains load-bearing.** Only its "corrections are
reversals" clause is replaced: there are no corrections to make.

## Consequences

- **A row in the ledger always means the gold really moved.** The record gains a property it did
  not have under ADR-0007, where a row might be a movement, or a movement that was later undone,
  and telling them apart meant looking for a sibling transaction.
- **`reason` collapses to a single value.** `SETTLEMENT_REVERSAL` is gone; the enum is
  `SETTLEMENT` alone. A future reason is additive and non-breaking.
- **`reference_id` becomes effectively unique per transaction.** Under ADR-0007 a settlement and
  its reversal shared one, which is why a read path filtering on it was worth having. That
  argument is now void — noted so it is not re-derived from the old ADR.
- **Idempotency matters more, not less.** The append is a retried forward step, so duplicate
  delivery is the normal path rather than an edge case. This is ADR-0009's caller-minted
  deterministic `transaction_id` earning its keep, and the two decisions now depend on each
  other.
- **The durability gap narrows.** FS-0003's known gap — wallet commits, the append is lost, and
  a reconciler reports a discrepancy with no underlying gold error — mostly closes, because the
  orchestrator re-drives the step. What remains is the window between the money moving and the
  retry landing, during which a reconciler run would report a false discrepancy. **Whether that
  residue still justifies wallet-service's planned transactional outbox is left open**, and
  belongs to whoever specifies the saga.
- **Cost: the ledger's correctness now depends on an ordering it does not enforce.** Nothing in
  ledger-service can check that its caller is past the pivot. A caller that appends early writes
  a row that may become wrong, and the service has no mechanism to fix it — the reversal is gone.
  This is a real transfer of responsibility to the saga, accepted deliberately: the alternative
  is keeping a correction path permanently for a case correct callers never produce.
- **Cost: an incorrect row is now permanent.** Under ADR-0007 there was an escape hatch. There is
  not one now. Recovering from a caller bug that wrote a bad transaction would mean a manual,
  audited data fix, or a new ADR reintroducing reversals.
- **Cost: this will be questioned by anyone reading ADR-0007 first.** ADR-0007 is immutable and
  its body still describes reversals as the correction mechanism. Its header points here; this
  ADR is the standing answer.
