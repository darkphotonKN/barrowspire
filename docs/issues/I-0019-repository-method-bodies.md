---
id: I-0019
status: open
implements: FS-0003
blocked_by: [I-0014, I-0016, I-0017]
labels: [blocked]
title: "FS-0003 slice 6: repository method bodies — atomic multi-leg append, idempotent"
---
Implements FS-0003 §Requirements 9-13, §Data model

**Author: human** — do NOT hand this to `/develop`.

## What to Build

Implement the repository interfaces from slice 1 against `ledger_entries`.

> **Ordering constraint — do not start this slice early.** The transaction-boundary pattern is
> decided in I-0014 and **expressed in the interface**. Write these bodies against the pattern
> exactly as the signature expresses it, with no `*sql.Tx` in any service-layer signature.
> If the signature turns out to make an implementation awkward, that is a finding to take back
> to I-0014 and change deliberately there — not a reason to reshape the interface mid-body.
> The whole point of deciding the boundary first is that it stops being negotiable once bodies
> are being written against it.

**Atomicity** — all legs of one append commit together or none do (§Req 7–8). The failure mode
that matters: a partial write leaves an unbalanced transaction in an append-only table where it
cannot be corrected by anything but a reversal.

**Idempotency** — a re-post of an already-recorded transaction is a **no-op success**, not an
error (§Req 12). It is enforced by the **unique index**, not by reading first and then writing
(§Req 13): a read-then-write races, and two concurrent identical posts would both land.
Translate the unique violation into the no-op. `commonhelpers.WrapDBErr` plus the `lib/pq` codes
is this repo's established way to turn a driver error into a sentinel — follow
`wallet-service`'s repository for the pattern.

**Append-only** — insert and read only. No update, no delete (§Req 9, ADR-0007). The interface
should already make this impossible; do not add methods.

Check I-0014's answer to **open question 1** before writing the conflict path: if the no-op was
made conditional on the existing legs agreeing, the mismatch case raises a conflict sentinel
rather than returning success.

## Acceptance Criteria

- [ ] Bodies match the slice 1 interfaces with no signature changes
- [ ] No `*sql.Tx` appears in any service-layer signature
- [ ] All legs commit atomically — proven by a test that fails the second leg's insert and
      asserts zero rows remain
- [ ] Re-posting an identical transaction returns success and leaves the row count unchanged
- [ ] Two concurrent identical posts produce exactly one set of rows — proven by a concurrent
      test, not by inspection
- [ ] The unique violation is translated to a sentinel via `commonhelpers.WrapDBErr`, not
      matched on driver error strings
- [ ] No update or delete method exists
- [ ] `make lint && make test` green

## Blocked By

I-0014 (interfaces + the transaction-boundary pattern), I-0016 (the table), I-0017 (scan
targets).

## Spec Reference

FS-0003 §Requirements 9 (append-only), 10 (DB-set `created_at`), 11–13 (caller-supplied
`transaction_id`, no-op duplicate, unique-index enforcement), §Data model, §Edge States
(concurrent duplicate, retry-after-commit). Governed by ADR-0007, ADR-0009.

## Notes

Persistence only. Sum-to-zero validation is slice 7 (I-0020) — do not enforce it here.

**Why this slice is human-authored.** Most of it is mechanical, but one piece is not: *"a unique
violation means success"* is not a persistence detail, it is ADR-0009's idempotency contract
expressed in the repository. If I-0014 resolved open question 1 by making the no-op conditional
on the existing legs agreeing, the compare-and-conflict logic lands here too. That is domain
reasoning living in an adapter, and it is the reason this slice is not delegated.

**Test infrastructure ordering.** The atomicity and concurrency criteria above need a migrated
test database and a way to race two identical posts — and I-0022 (the harness) is blocked by
*this* slice, so it is not available yet. Stand up whatever minimal setup these tests need
inline; I-0022 generalises it afterwards rather than the other way round. Do not weaken the
criteria to avoid the setup: the concurrent-duplicate case is the one that proves idempotency is
enforced by the unique index rather than by a read-then-write (§Req 13).
