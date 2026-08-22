---
id: I-0028
status: open
implements: FS-0003
blocked_by: [I-0022, I-0026, I-0027]
labels: [blocked]
title: "FS-0003 slice 15: read-path tests — paging stability, authz matrix, problem+json"
---
Implements FS-0003 §Acceptance Criteria

**Author: agent**

> **Extends the FS-0003 chain post-amendment.** Generalises I-0022's write-path harness to the
> read path. Read I-0022 first and extend it — do not rewrite working setup into a different
> shape for its own sake.

## What to Build

The read path's test coverage, on top of I-0022's harness.

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
| no role claim | absent | treated as member |

Plus I-0025's masking assertion: a member reading a transaction with no leg of theirs gets a
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
- [ ] Authorization matrix covered case-per-row, including the absent-role-claim case
- [ ] Masking test asserts byte-identical responses field-by-field
- [ ] `Content-Type: application/problem+json` asserted on the header for at least one error per
      status class
- [ ] No read response, method, or header exposes a total, sum, or count
- [ ] `make lint && make test` green for ledger-service and api-gateway

## Blocked By

- I-0022 — the harness this extends
- I-0026 — both read operations must exist
- I-0027 — the generated client is part of what the integration tests exercise

## Spec Reference

FS-0003 §Acceptance Criteria (the read-path criteria added by the amendment), §Requirements 20,
23, 25-28, 30. Traps: `docs/agents/contract-patterns.md` §2.
