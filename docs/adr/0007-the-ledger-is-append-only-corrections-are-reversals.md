# ADR-0007 — The ledger is append-only; corrections are reversals

Status: accepted
Date: 2026-08-17
Scope: `game-server/ledger-service`
Amended by: [ADR-0010](0010-the-ledger-is-appended-past-the-saga-pivot.md) — the "corrections are
reversals" clause. The append-only clause below stands; the reversal mechanism does not. The
ledger is now appended only past the settlement saga's pivot, so no recorded transaction is ever
wrong and there is nothing to reverse. **The body below is left as written, and its reversal
reasoning no longer describes the system.**
Realized by: FS-0003 §Requirements 9–10, 17 (not yet implemented)

## Context

Settlements fail after commit. When they do, the recorded movement is wrong, and there are two
ways to make the record right: change the rows, or add rows that cancel them.

Changing them is cheaper and produces a tidier table. It is also fatal to the point of having a
ledger. The service exists to answer *"why is this number what it is"* and to detect when the
flows that produced it were wrong (ADR-0005). A mutable record cannot do either:

- **"This never happened" becomes indistinguishable from "this was corrected."** An `UPDATE`
  erases the fact that the system once believed something else, which is precisely the fact an
  investigation needs.
- **Tampering becomes indistinguishable from maintenance.** If rows are routinely edited, no
  property of the table separates a legitimate fix from an illegitimate one. Append-only makes
  the absence of tampering a structural fact rather than a claim about who had database access.
- **A correction has its own timing.** A reversal posted three days later is a different
  economic story from one posted three seconds later, and only an appended record preserves the
  distinction.

There is also a design consequence worth surfacing here, because it removes machinery rather than
adding it: **append-only means there is no read-modify-write anywhere in this service.** The
scaffold shipped a per-member `Ledger` aggregate carrying an optimistic-concurrency `version`,
plus `usecase/retry.go`'s `withRetry` to handle lost updates. With nothing ever updated, OCC
guards nothing and the retry loop has no race to retry.

> Recorded without adversarial review in this repo. The decision arrived pre-formed from an
> external design discussion and was locked directly during FS-0003 scoping.

## Decision

**No `UPDATE`. No `DELETE`. Ever.**

- The repository exposes insert and read only. This is enforced by the **absence of a method**,
  not by a convention someone must remember — there is nothing to call.
- A correction is posted as a **new transaction** with its own `transaction_id` and the legs
  swapped (`ReverseCommit`). The original rows remain byte-identical.
- `created_at` is set by the database (`DEFAULT now()`), never supplied by the caller, so
  ordering cannot be backdated by a client.
- **Optimistic concurrency is removed from this service.** The `ledgers` table, the `Ledger`
  aggregate root, its `version` column, and `withRetry` are deleted rather than carried forward.

## Consequences

- **History is auditable**, and the absence of tampering is a property of the schema and the
  repository surface rather than of operational discipline.
- **Concurrency gets simpler, not harder.** No OCC, no retry loop, no lost-update class of bug.
  Write safety comes from the unique index plus a single DB transaction per append.
- **Correctness depends on the reversal being posted**, not on anyone noticing a bad row. A wrong
  entry stays visible forever; "fixed" means "followed by its reversal," which readers must
  understand.
- **Cost: the table grows monotonically.** Partitioning or archival will eventually be needed.
  Not now, and any scheme must preserve the append-only property rather than compact it away.
- **Cost: an obviously-garbage row (wrong account, wrong reference) is unremovable.** It is
  corrected by reversal like any other error. Accepted deliberately — an escape hatch for
  "obviously garbage" is an escape hatch.
