---
id: I-0022
status: open
implements: FS-0003
blocked_by: [I-0018, I-0019]
labels: [blocked]
title: "FS-0003 slice 9: test scaffolding and fixtures — harness only"
---
Implements FS-0003 §Acceptance Criteria

**Author: agent**

## What to Build

The harness and fixtures later tests are written against. Follow `wallet-service`'s test setup
for shape.

**Start from what I-0019 already stood up.** That slice needs a migrated test database and a
concurrent-post helper before this harness exists, so it builds a minimal version inline. This
slice **generalises that**, it does not replace it — read it first, and do not rewrite working
setup into a different shape for its own sake.

- Database setup and teardown per test, migrations applied, isolation between tests.
- A gRPC test client that can call `AppendLedgerTx` against a running handler.
- Fixture builders for the shapes FS-0003 keeps exercising: a balanced two-leg `CommitHold`
  transaction, its `ReverseCommit` counterpart, and deliberately invalid variants (unbalanced,
  single-leg, zero amount, mixed currency) for refusal tests to consume.
- A helper for the concurrency tests I-0019 needs — two identical posts racing.

## Scope fence — fixtures, not assertions

**Service-layer tests are NOT part of this slice.** They are hand-written in I-0020 by its
author. Build the harness and the fixture builders; do not write tests that assert domain
behavior — sum-to-zero, refusal cases, reversal semantics.

The distinction: a fixture that *constructs* an unbalanced transaction belongs here. A test
that *asserts* an unbalanced transaction is refused belongs to I-0020.

## Acceptance Criteria

- [ ] A test can create a clean, migrated database and tear it down
- [ ] Tests are isolated — one test's rows are invisible to the next
- [ ] A test can call `AppendLedgerTx` through a real gRPC client
- [ ] Fixture builders exist for balanced, reversal, and each invalid variant listed above
- [ ] A concurrency helper can issue two identical posts simultaneously
- [ ] No test in this slice asserts domain behavior
- [ ] `make test` green

## Blocked By

I-0018 (a reachable RPC to call), I-0019 (a repository to persist through).

## Spec Reference

FS-0003 §Acceptance Criteria — this slice makes them testable; it does not test them.

## Notes

If a fixture is awkward to build, that is worth reporting: an append-only, idempotent,
multi-leg write is exactly the kind of interface where test friction reveals a design problem
in the slice 1 boundary.
