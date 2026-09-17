---
id: I-F9R7Q-15
status: open
implements: FS-F9R7Q
blocked_by: [I-F9R7Q-9, I-F9R7Q-13, I-F9R7Q-14]
labels: [blocked]
title: "FS-F9R7Q slice 15: read-path tests — paging stability, authz matrix, problem+json"
---
Implements FS-F9R7Q §Acceptance Criteria

**Author: agent**

> **Extends the FS-F9R7Q chain post-amendment.** Generalises I-F9R7Q-9's write-path harness to the
> read path. Read I-F9R7Q-9 first and extend it — do not rewrite working setup into a different
> shape for its own sake.

## What to Build

The read path's test coverage, on top of I-F9R7Q-9's harness.

**1. Paging stability — the load-bearing one.**
Append a transaction between two page fetches and assert the second page **skips nothing and
repeats nothing**. This is the test that justifies §Req 23's whole argument for keyset over
offset; without it the choice is an unverified assertion. Slices 12–13 write a version of this
inline — generalise it here, do not duplicate it.

Also cover: `next_cursor` **absent, not null**, on the final page; a full walk of N rows at
`limit` < N visiting each row exactly once; a malformed cursor returning `422`.

**2. The authorization matrix**, as a table-driven test — one row per cell:

| Caller | `account_id` | Expected |
|---|---|---|
| member | absent | own entries only |
| member | present | `403 · FORBIDDEN` |
| admin | present | that account |
| admin | absent | unscoped |
| no role claim | absent | `401 · UNAUTHENTICATED` at `AuthMiddleware` |
| role outside `player \| admin` | absent | own entries only — non-admin, not an error |

Plus I-F9R7Q-12's masking assertion: a member reading a transaction with no leg of theirs gets a
response **byte-identical** to the nonexistent-id response. Assert field-by-field including
`detail` — a status-only assertion cannot catch a leak in the message.

**3. The media type.**
At least one error test per status class must assert
`Content-Type: application/problem+json` **on the header**. `contract-patterns.md` §2: omitting
the `ContentType` hook degrades silently to `application/json`, and every test asserting only on
status and body still passes. This is the single trap most likely to ship unnoticed.

**4. The no-aggregate guarantee.**
Assert no read response, method, or header carries a total, sum, or count (§Req 20, ADR-0005).

## What NOT to do

- Do not assert on `detail` prose as a contract — it is explicitly allowed to change. Switch on
  `code`. The one exception is the masking test, where identity of `detail` between two responses
  is the property under test.
- Do not add a test that computes a balance from entries "to check the math." That is the
  aggregate ADR-0005 forbids, arriving through the test suite.

## Acceptance Criteria

- [ ] Paging stability test: append mid-page, assert no skip and no repeat
- [ ] Full-walk test visits every row exactly once at `limit` < N
- [ ] `next_cursor` absent on the final page
- [ ] Malformed cursor returns `422 · VALIDATION_FAILED`
- [ ] Authorization matrix covered case-per-row, including the absent-role-claim `401` and the
      unrecognised-role non-admin case — the two are asserted separately, not collapsed
- [ ] Masking test asserts byte-identical responses field-by-field
- [ ] `Content-Type: application/problem+json` asserted on the header for at least one error per
      status class
- [ ] No read response, method, or header exposes a total, sum, or count
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-F9R7Q-9 — the harness this extends
- I-F9R7Q-13 — both read operations must exist
- I-F9R7Q-14 — the generated client is part of what the integration tests exercise

## Spec Reference

FS-F9R7Q §Acceptance Criteria (the read-path criteria added by the amendment), §Requirements 20,
23, 25-28, 29 (absent `role` is a `401`; an unrecognised one is non-admin), 30. Traps:
`docs/agents/contract-patterns.md` §2.
