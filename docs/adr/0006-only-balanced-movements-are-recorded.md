# ADR-0006 — Only balanced movements are recorded; holds produce no ledger entries

Status: accepted
Date: 2026-08-17
Scope: `game-server/ledger-service`
Realized by: FS-0003 §Requirements 1–5, 7–8 (not yet implemented)

## Context

wallet-service's saga reserves gold before spending it: `PlaceHold` parks it, then either
`CommitHold` spends it or `ReleaseHold` returns it. All three are interesting events, and the
instinct when building an audit trail is to record all of them — a hold is a thing that happened,
and a record that omits it feels incomplete.

Double-entry does not permit it. Every entry must have a counterparty; that is what makes
conservation checkable. **A hold has no counterparty.** No account exists to credit for gold that
*might* leave one — the gold has not gone anywhere, and no second party has a claim on it yet.
Recording a hold therefore forces one of two outcomes:

- a single-legged transaction, which breaks sum-to-zero and destroys the one invariant the
  reconciler depends on; or
- a **system / suspense account** to balance against, which is a real design commitment — it
  introduces an account nobody owns, whose balance has to mean something, and which becomes the
  place every awkward entry gets swept. That is out of scope and should not be adopted as a side
  effect of wanting hold visibility.

The cleaner framing: **a hold is an intention, not a movement.** `ReleaseHold` is the same fact
in reverse — gold was parked and unparked, and nothing moved. The ledger records what happened to
gold, not what was contemplated. Hold history already has an owner: `wallet_hold`, with its own
FSM and lifecycle.

Deposits and withdrawals hit exactly this wall — gold entering or leaving the economy has no
in-game counterparty either — which is why they are deferred rather than forgotten. They are
blocked on the same system-account decision.

> Recorded without adversarial review in this repo. The decision arrived pre-formed from an
> external design discussion and was locked directly during FS-0003 scoping.

## Decision

**An entry exists only as one leg of a transaction whose legs sum to zero.** Concretely:

| Saga verb | Ledger effect |
|---|---|
| `PlaceHold` | **no entry** — an intention, with nothing to balance against |
| `ReleaseHold` | **no entry** — nothing moved |
| `CommitHold` | **one transaction, two legs** — buyer `DEBIT`, seller `CREDIT` |
| `ReverseCommit` | **one new transaction, two legs swapped** |
| deposit / withdraw | recorded when built — **blocked on a system-account decision** |

All legs of a transaction share one currency, since sum-to-zero across currencies is meaningless.

## Consequences

- **Conservation is structural, not aspirational.** Every recorded transaction nets to zero, so a
  non-zero sum is unambiguously a defect rather than an expected artifact of some entry type.
- **Ledger volume tracks settlements, not bidding activity.** A 47-bid auction produces exactly
  two rows: the 46 losing holds release and leave no trace. Volume stays proportional to money
  that actually moved.
- **Cost: the ledger cannot answer "who was holding gold at time T."** That question belongs to
  `wallet_hold` and must be asked there. Anyone reconstructing an auction's full history needs
  both records.
- **Cost: deposits and withdrawals are blocked**, not merely unscheduled. They cannot be added
  without first deciding what a system account is and who owns its balance.
- **A system account remains available as a future decision** — this ADR rejects adopting one
  *implicitly, to make holds recordable*, not the concept itself. Introducing one would need its
  own ADR.
