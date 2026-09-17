---
id: I-F9R7Q-9
status: open
implements: FS-F9R7Q
blocked_by: [I-F9R7Q-5, I-F9R7Q-6]
labels: [blocked]
title: "FS-F9R7Q slice 9: test scaffolding and fixtures — harness only"
---
Implements FS-F9R7Q §Acceptance Criteria

**Author: agent**

## What to Build

The harness and fixtures later tests are written against. Follow `wallet-service`'s test setup
for shape.

**Start from what I-F9R7Q-6 already stood up.** That slice needs a migrated test database and a
concurrent-post helper before this harness exists, so it builds a minimal version inline. This
slice **generalises that**, it does not replace it — read it first, and do not rewrite working
setup into a different shape for its own sake.

- Database setup and teardown per test, migrations applied, isolation between tests.
- A **Temporal activity test environment** that can invoke `AppendLedgerTx` against the
  registered activity (ADR-0011 — there is no gRPC client on this path, and no RPC to call).
  The SDK's activity test environment invokes it directly; a running orchestrator is not needed
  and is out of scope.
- Fixture builders for the shapes FS-F9R7Q keeps exercising: a balanced two-leg `CommitHold`
  transaction, its `ReverseCommit` counterpart, and deliberately invalid variants (unbalanced,
  single-leg, zero amount, mixed currency) for refusal tests to consume.
- A helper for the concurrency tests I-F9R7Q-6 needs — two identical posts racing.

## Scope fence — fixtures, not assertions

**Service-layer tests are NOT part of this slice.** They are hand-written in I-F9R7Q-7 by its
author. Build the harness and the fixture builders; do not write tests that assert domain
behavior — sum-to-zero, refusal cases, reversal semantics.

The distinction: a fixture that *constructs* an unbalanced transaction belongs here. A test
that *asserts* an unbalanced transaction is refused belongs to I-F9R7Q-7.

## Acceptance Criteria

- [ ] A test can create a clean, migrated database and tear it down
- [ ] Tests are isolated — one test's rows are invisible to the next
- [ ] A test can invoke `AppendLedgerTx` through the activity test environment
- [ ] Fixture builders exist for balanced, reversal, and each invalid variant listed above
- [ ] A concurrency helper can issue two identical posts simultaneously
- [ ] No test in this slice asserts domain behavior
- [ ] `make test` green

## Blocked By

I-F9R7Q-5 (a registered activity to invoke), I-F9R7Q-6 (a repository to persist through).

## Spec Reference

FS-F9R7Q §Acceptance Criteria — this slice makes them testable; it does not test them.

## Notes

If a fixture is awkward to build, that is worth reporting: an append-only, idempotent,
multi-leg write is exactly the kind of interface where test friction reveals a design problem
in the slice 1 boundary.
