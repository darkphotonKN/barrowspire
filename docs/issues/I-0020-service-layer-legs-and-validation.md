---
id: I-0020
status: open
implements: FS-0003
blocked_by: [I-0014, I-0019]
labels: [blocked]
title: "FS-0003 slice 7: service layer — leg construction, sum-to-zero, reason/reference validation"
---
Implements FS-0003 §Requirements 1-8, §Edge States

**Author: human** — do NOT hand this to `/develop`.

## What to Build

The domain logic. This is where a transaction becomes valid or is refused.

**Leg construction** — build the legs of a transaction from an `AppendLedgerTx` request.
`CommitHold` is two legs, buyer `DEBIT` and seller `CREDIT` (§Req 1). `ReverseCommit` is a new
transaction with its own `transaction_id` and the legs swapped — never a mutation of the
original (§Req 2, ADR-0007). `PlaceHold` and `ReleaseHold` reach this service as nothing at all;
if they ever arrive, that is a caller defect (§Req 3–4, ADR-0006).

**Sum-to-zero** — legs sharing a `transaction_id` net to zero, mapping `DEBIT` to negative and
`CREDIT` to positive (§Req 7). FS-0003 places this in the service layer, so **the database does
not enforce it** — this code is the only thing standing between a caller's arithmetic bug and a
permanently wrong append-only row. Also enforce: at least two legs, and one currency across all
legs, since sum-to-zero across currencies is meaningless (§Req 8).

**Amount and direction** — `amount > 0` always; direction carries the sign (§Req 6, ADR-0008).
The DB CHECK is the backstop, not the primary check; a caller should get a domain error, not a
constraint violation.

**Reason / reference validation** — validate against the closed sets. The enforcement level
follows slice 1's answer to **open question 3** (type system, DB CHECK, or both).

## Acceptance Criteria

- [ ] A balanced two-leg transaction is accepted
- [ ] An unbalanced transaction is refused and writes nothing
- [ ] A single-leg transaction is refused
- [ ] A leg with `amount <= 0` is refused with a domain error, not a constraint violation
- [ ] A transaction whose legs mix currencies is refused
- [ ] An unknown `reason` or `reference_type` is refused
- [ ] A `ReverseCommit` posts a second transaction with swapped legs; the original rows are
      byte-identical afterwards
- [ ] A 47-bid settlement scenario produces exactly 2 rows (§Req 5)
- [ ] No method returns a balance or sums entries into an account total (§Req 14, ADR-0005)
- [ ] Table-driven tests cover each refusal above, written by hand after this slice
- [ ] `make lint && make test` green

## Blocked By

I-0014 (interfaces, sentinels, open question 3), I-0019 (repository bodies to persist through).

## Spec Reference

FS-0003 §Requirements 1–5 (what is and is not an entry), 6–8 (sign, sum-to-zero, currency),
14 (no balance), §Edge States (single leg summing to zero, reversal without an original,
unknown account). Governed by ADR-0005, ADR-0006, ADR-0007, ADR-0008.

## Notes

Service-layer tests are hand-written here, not in I-0022. That slice provides the harness and
fixtures only.

One edge worth deciding explicitly while writing this: **a reversal posted for a transaction
that was never recorded is accepted** (§Edge States). Verifying an original would need a
read-before-write and would still race; catching it is the reconciler's job, which is out of
scope.
