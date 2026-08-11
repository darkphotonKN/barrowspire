---
id: I-0008
status: open
implements: FS-0001
blocked_by: [I-0007]
labels: [ready-for-agent]
title: "FS-0001 slice 8: game-client reads `code` — the cutover, and the single merge to main"
---
Implements FS-0001 §Requirements, §API surface

## What to Build

Cut `game-client` over from `.error` / `.message` to the problem+json contract: switch on
`code`, display `detail` (FS-0001 §Requirements 15).

**14 files** currently read `.error` or `.message` (32 occurrences). Both key names disappear
from gateway error responses — this is the deliberate, one-time break the FS chose over a
transitional dual-read. Dual-read was rejected because it ships a knowingly redundant body and
depends on a cleanup that historically does not happen.

Client error handling collapses from four shapes to one: switch on `code`, fall back to a
generic message on an unrecognised code (adding codes is non-breaking, so the client must
tolerate one it has never seen). Display `detail` where a human-readable message is needed —
but **never branch on `detail`**, which is prose and explicitly not contract.

Out of scope: `game-client`'s internal `.error`/`.message` inconsistency on paths that are not
gateway error responses.

### This slice carries the merge

Slices I-0001 through I-0007 land on `feat/fs-0001-error-contract`. **This slice's merge is the
one that reaches main.** FS-0001 locked "break the client once" — but merging each package slice
independently would break it five times, once per migrated package. The slicing is fine; the
merge policy is what preserves the decision.

### The ratchet cannot see this break

There is no `openapi.yaml` in this repo yet, so oasdiff has nothing to diff against — the error
shape change is **structurally invisible** to the breaking-change gate. Verification here is
manual and mandatory: exercise each error class against the running gateway before and after,
and record the pairs. Nothing automated will catch a missed path.

## Acceptance Criteria

- [ ] No remaining read of `.error` or `.message` on a gateway error path across the 14 files
- [ ] Client switches on `code`; unrecognised codes fall back to a generic message rather than failing
- [ ] `detail` is displayed but never branched on
- [ ] `errors[]` is iterated without a null check (it is always present)
- [ ] Every error class in FS-0001 §API surface exercised **before and after** against a running gateway, pairs recorded in the PR
- [ ] Auth failure, validation failure, not-found, and a forced 500 verified end to end in the UI
- [ ] `game-client` builds and its test suite passes
- [ ] The full branch merges to main as one change

## Blocked By

I-0007 — and transitively every migration slice. The client cuts over only once the server
speaks one shape everywhere.

## Spec Reference

FS-0001 §Requirements 15, §API surface (member table — `code` is the switch key, `detail` is
prose), §Scoping notes decision 3 (client cutover is the final slice of this feature, not a
follow-up). Covers user stories 1, 2, 3, 4, 20.

## TDD Approach

- RED: client tests asserting behavior on a problem+json body with a `code` the client knows
- RED: assert graceful fallback on an unknown `code`
- GREEN: the cutover
- Manual: before/after pairs per error class — the only verification available, since no spec exists to ratchet against
