---
id: I-22WKC-4
status: done
implements: FS-22WKC
blocked_by: [I-22WKC-1]
labels: [ready-for-agent]
title: "FS-22WKC slice 4: migrate the `item` gateway package (27 writes)"
---
Implements FS-22WKC §Requirements, §API surface

## What to Build

Route every error in `api-gateway/internal/gateway/item/handler.go` (27 error writes) through
the seam, and delete this package's `status.FromError` switch — the second of the six duplicates
FS-22WKC §Requirements 6 collapses.

Item operations are the densest source of `AlreadyExists` and `NotFound` in the gateway, so this
slice is where the `409 · ALREADY_EXISTS` and `404 · NOT_FOUND` mappings get their real
exercise beyond I-22WKC-1's unit tests.

Success responses (200/201/202) are **untouched** and must stay byte-identical.

## Acceptance Criteria

- [ ] All 27 error writes in `internal/gateway/item/` go through the seam
- [ ] `grep 'c.JSON(http.Status'` over this package returns only success statuses
- [ ] This package's `status.FromError` switch is deleted
- [ ] Each migrated path has a test asserting **status + `code` + `Content-Type`**
- [ ] `AlreadyExists` → `409 ALREADY_EXISTS` and `NotFound` → `404 NOT_FOUND` covered by route-level tests, not only unit tests
- [ ] Success responses byte-identical to before
- [ ] Gateway test suite passes

## Blocked By

I-22WKC-1 — the seam and the vocabulary.

## Spec Reference

FS-22WKC §Requirements 4–9, 12, §API surface (code→status mapping). Covers user stories 2, 5, 6,
14, 16.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-22WKC-8.

## TDD Approach

- RED: per-route failure tests asserting status + `code` + `Content-Type`
- GREEN: seam call replaces the inline write; local switch deleted
