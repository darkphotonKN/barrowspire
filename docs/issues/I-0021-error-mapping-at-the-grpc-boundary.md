---
id: I-0021
status: open
implements: FS-0003
blocked_by: [I-0014, I-0015]
labels: []
title: "FS-0003 slice 8: read-path error mapping at the gRPC boundary — sentinels to status codes"
---
Implements FS-0003 §API surface

**Author: human** — do NOT hand this to `/develop`.

## What to Build

Fill `mapError` in `internal/ledger/grpc/handler.go`. **I-0015 must have left it empty** — if it
arrives with case arms already in it, that slice did not do its job and the mappings in it are
scaffold leftovers, not decisions. Verify before building on them.

**Scope changed under ADR-0011: this function serves the READ path only.** `mapError` sits in a
gRPC handler, and after ADR-0011 the only gRPC on this service is `GetTransaction` and
`ListEntries`. The write path's errors never reach here — `AppendLedgerTx` is a Temporal activity
that returns domain errors to a retry policy, and classifying them retryable/non-retryable is
**I-0018's** job, in I-0018's file. Do not map write-path sentinels here; there is no caller for
them.

Map the sentinel set to gRPC status codes for the two read operations, per FS-0003 §API surface's
read-path rows:

| Case | Response |
|---|---|
| caller is unauthenticated | `Unauthenticated · UNAUTHENTICATED` |
| a member requests another account's rows | `NotFound · NOT_FOUND` — **masked, not `Forbidden`**; see the note below |
| a member passes `account_id` on `listEntries` (admin-only param) | `PermissionDenied · FORBIDDEN` |
| transaction id does not exist | `NotFound · NOT_FOUND` |
| malformed UUID, bad `limit`, malformed cursor | `InvalidArgument · VALIDATION_FAILED` |

> **The cursor row names sentinels from a different package — this is the easy 500.** Cursor
> decoding lives in `common/utils/cursor` and returns `cursor.ErrInvalidCursor`,
> `cursor.ErrInvalidDate`, and `cursor.ErrInvalidUUID`. That last one is **not** the same
> sentinel as `ledger.ErrInvalidUUID`, which the retired scaffold's arm matched. An arm written
> against only the ledger sentinels compiles, reads correctly, and drops every malformed cursor
> into the `Internal` default — a `500` where the table says `422`. Match the `cursor` package's
> sentinels explicitly, and assert each one in a test.
| database unavailable | `Unavailable · TRANSIENT` |
| anything else | `Internal · INTERNAL_ERROR` |

> **The masking row is the reason this slice is human-authored.** A member asking for a
> transaction that exists but is not theirs must be indistinguishable from one asking for a
> transaction that does not exist — otherwise `404` vs `403` turns the endpoint into an oracle
> for which transaction ids are real. I-0025 owns the enforcement; this function must not offer a
> code that leaks the difference.

Two things the retired scaffold got right and are worth keeping: **internals never leak** —
no SQL error text in a status message — and the log level splits, with `Internal` logging at
error and everything else at warn.

`ErrConcurrentModification` and `ErrMaxRetries` have **no mapping** — OCC is gone with §Req 17
(ADR-0007). If either sentinel still exists, that is a leftover to delete, not a case to map.

The write-path sentinels — `ErrUnbalancedTransaction`, `ErrInvalidLegCount`,
`ErrInvalidLegAmount`, `ErrInvalidDirection` — likewise have **no mapping here**. They are real
and they are classified, on the activity's retry policy in I-0018.

## Acceptance Criteria

- [ ] `mapError` was empty at the start of this slice — verified, not assumed
- [ ] Every row of FS-0003 §API surface's **read-path** error set has exactly one mapping
- [ ] No mapping exists for `ErrConcurrentModification` or `ErrMaxRetries`
- [ ] No mapping exists for any write-path sentinel — those are classified in I-0018
- [ ] Another member's existing transaction and a nonexistent one produce byte-identical
      responses — asserted, not reasoned about
- [ ] No SQL error text or internal detail appears in any status message
- [ ] `Internal` logs at error level; other cases at warn
- [ ] The TODO left by I-0015 is removed
- [ ] Tests assert the code for each mapped sentinel
- [ ] `make lint && make test` green

## Blocked By

I-0014 (the sentinel set), I-0015 (the empty stub this fills).

## Spec Reference

FS-0003 §API surface (read-path error rows), §Requirements 17 (OCC removed), 24–27
(visibility and masking). Governed by ADR-0007 (OCC removal) and **ADR-0011** (the write path is
an activity, so its errors are classified by retry policy rather than mapped here).

## Notes

This slice is deliberately human-authored and deliberately sequenced after the scaffold, so the
mapping is a decision made once against the spec rather than inherited from copied boilerplate.

I-0025 extends this function with nothing new — its rows are already here. If I-0025 finds itself
adding a case arm, one of the two slices has drifted from §API surface.
