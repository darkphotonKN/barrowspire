---
id: I-0021
status: open
implements: FS-0003
blocked_by: [I-0014, I-0015]
labels: [blocked]
title: "FS-0003 slice 8: error mapping at the gRPC boundary — sentinels to status codes"
---
Implements FS-0003 §API surface

**Author: human** — do NOT hand this to `/develop`.

## What to Build

Fill `mapError` in `internal/ledger/grpc/handler.go`. **I-0015 must have left it empty** — if it
arrives with case arms already in it, that slice did not do its job and the mappings in it are
scaffold leftovers, not decisions. Verify before building on them.

Map the slice 1 sentinel set to gRPC status codes per FS-0003 §API surface's error table:

| Case | Response |
|---|---|
| legs do not sum to zero | `InvalidArgument · UNBALANCED_TRANSACTION` |
| fewer than two legs | `InvalidArgument · UNBALANCED_TRANSACTION` |
| any leg has `amount <= 0` | `InvalidArgument · VALIDATION_FAILED` |
| legs mix currencies | `InvalidArgument · VALIDATION_FAILED` |
| `reason` / `reference_type` unspecified or unknown | `InvalidArgument · VALIDATION_FAILED` |
| malformed UUID | `InvalidArgument · VALIDATION_FAILED` |
| already recorded, identical | `OK` · `applied = false` — **not an error path** |
| already recorded, contradictory | per I-0014's answer to open question 1 |
| database unavailable | `Unavailable · TRANSIENT` |
| anything else | `Internal · INTERNAL_ERROR` |

Two things the retired scaffold got right and are worth keeping: **internals never leak** —
no SQL error text in a status message — and the log level splits, with `Internal` logging at
error and everything else at warn.

`ErrConcurrentModification` and `ErrMaxRetries` have **no mapping** — OCC is gone with §Req 17
(ADR-0007). If either sentinel still exists, that is a leftover to delete, not a case to map.

Note the shape of the duplicate case: a re-post is a **success**, not an error, so it never
reaches `mapError` at all (§Req 12, ADR-0009). Removing that error rather than propagating it is
the decision — do not add a code for it.

## Acceptance Criteria

- [ ] `mapError` was empty at the start of this slice — verified, not assumed
- [ ] Every sentinel in the slice 1 set has exactly one mapping
- [ ] Every row of FS-0003 §API surface's error table is covered
- [ ] No mapping exists for `ErrConcurrentModification` or `ErrMaxRetries`
- [ ] A duplicate post returns `OK` with `applied = false` and never enters `mapError`
- [ ] No SQL error text or internal detail appears in any status message
- [ ] `Internal` logs at error level; other cases at warn
- [ ] The TODO left by I-0015 is removed
- [ ] Tests assert the code for each mapped sentinel
- [ ] `make lint && make test` green

## Blocked By

I-0014 (the sentinel set), I-0015 (the empty stub this fills).

## Spec Reference

FS-0003 §API surface (error table), §Requirements 12 (duplicate is a success), 17 (OCC removed).
Governed by ADR-0009 (the duplicate error is removed, not propagated).

## Notes

This slice is deliberately human-authored and deliberately sequenced after the scaffold, so the
mapping is a decision made once against the spec rather than inherited from copied boilerplate.
