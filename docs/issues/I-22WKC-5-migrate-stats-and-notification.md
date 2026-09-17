---
id: I-22WKC-5
status: done
implements: FS-22WKC
blocked_by: [I-22WKC-1]
labels: [ready-for-agent]
title: "FS-22WKC slice 5: migrate the `stats` and `notification` packages (18 writes)"
---
Implements FS-22WKC §Requirements, §API surface

## What to Build

Route every error in two small gateway packages through the seam:

| File | Error writes |
|---|---|
| `api-gateway/internal/gateway/stats/handler.go` | 11 |
| `api-gateway/internal/gateway/notification/handler.go` | 7 |

Combined into one slice because both are small, neither has a third-party consumer, and each
deletes one of the six duplicated `status.FromError` switches (FS-22WKC §Requirements 6) — that
brings the count of collapsed duplicates to four.

Notification paths are the most likely place for `Unavailable` to appear in practice (a
downstream that is simply not up), so this slice is where `503 · SERVICE_UNAVAILABLE` gets
exercised against a real dial failure rather than a synthetic one. Note 503, not 500 — FS-22WKC
§Requirements 5 was amended during I-22WKC-3, because a downstream outage is retryable and a 500
tells clients to give up.

Success responses (200/201/202) are **untouched** and must stay byte-identical.

## Acceptance Criteria

- [ ] All 11 `stats` and 7 `notification` error writes go through the seam
- [ ] `grep 'c.JSON(http.Status'` over both packages returns only success statuses
- [ ] Both packages' `status.FromError` switches are deleted
- [ ] Each migrated path has a test asserting **status + `code` + `Content-Type`**
- [ ] A downstream-unreachable case returns `503 SERVICE_UNAVAILABLE` with a generic `detail`; the dial error is logged, never surfaced
- [ ] Success responses byte-identical to before
- [ ] Gateway test suite passes

## Blocked By

I-22WKC-1 — the seam and the vocabulary.

## Spec Reference

FS-22WKC §Requirements 4–9, 12, §API surface, §Edge States (downstream unreachable; unmapped
gRPC code). Covers user stories 2, 5, 6, 10, 11, 14.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-22WKC-8.

## TDD Approach

- RED: failure tests per route asserting status + `code` + `Content-Type`
- RED: simulate an unreachable downstream, assert generic `detail` and absence of the dial error text
- GREEN: seam calls replace inline writes; both local switches deleted
