---
id: I-0003
status: open
implements: FS-0001
blocked_by: [I-0001]
labels: [ready-for-agent]
title: "FS-0001 slice 3: migrate the `auth` gateway package (28 writes)"
---
Implements FS-0001 §Requirements, §API surface

## What to Build

Route every error in the `auth` gateway package through the seam. The largest package in the
feature, split across two files:

| File | Error writes |
|---|---|
| `api-gateway/internal/gateway/auth/handler.go` | 25 |
| `api-gateway/internal/gateway/auth/amqp_client.go` | 3 |

Delete this package's local `status.FromError` switch — one of the six duplicates FS-0001
§Requirements 6 exists to collapse. Its mapping logic was already collected into the seam in
I-0001; deleting it here is what makes that collection real rather than additive.

`amqp_client.go` is the odd one: errors originate from a message broker, not a gRPC call, so
they arrive as plain Go errors. They match on `apperr` sentinels, then fall to the catch-all —
never a raw broker error into the response body.

Success responses (200/201/202) in this package are **untouched** and must stay byte-identical.

## Acceptance Criteria

- [ ] All 28 error writes in `internal/gateway/auth/` go through the seam
- [ ] `grep 'c.JSON(http.Status'` over this package returns only success statuses
- [ ] This package's `status.FromError` switch is deleted, not copied
- [ ] Each migrated path has a test asserting **status + `code` + `Content-Type`**
- [ ] `amqp_client.go`'s non-gRPC errors resolve via sentinel then catch-all, never leaking broker text
- [ ] Success responses byte-identical to before (compare before/after on at least one success route)
- [ ] Gateway test suite passes

## Blocked By

I-0001 — the seam and the vocabulary.

## Spec Reference

FS-0001 §Requirements 4–9, 11, 12, §API surface (code→status mapping), §Edge States
(non-gRPC error crossing a boundary). Covers user stories 2, 5, 6, 14, 16.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-0008.

## TDD Approach

- RED: per-route tests asserting the new status + `code` + `Content-Type` on each failure path
- GREEN: replace the inline write with a seam call, delete the local switch
