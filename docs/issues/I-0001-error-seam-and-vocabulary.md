---
id: I-0001
status: done
implements: FS-0001
blocked_by: []
labels: [ready-for-agent]
title: "FS-0001 slice 1: error vocabulary + the single mapping seam, proven on `example`"
---
Implements FS-0001 §Requirements, §API surface, §Edge States

## What to Build

The foundation every later slice depends on, plus one package migrated through it so the
foundation ships **proven** rather than merely present.

**Vocabulary — `game-server/common/`**

- `common/errcode` **already exists** (seeded by setup) with the six generic codes:
  `UNAUTHENTICATED`, `VALIDATION_FAILED`, `NOT_FOUND`, `ALREADY_EXISTS`, `FORBIDDEN`,
  `INTERNAL_ERROR`. Verify it against FS-0001 §Requirements 1 rather than rewriting it. Do
  **not** add domain codes speculatively — the domain block stays empty until a real failure
  needs distinguishing.
- `common/apperr` (**new**) — the sentinel errors the gateway matches on, so the gateway and
  the ten downstream services share one vocabulary instead of each inventing its own.

**The seam — `api-gateway/internal/httperr`**

Exactly one exported function decides HTTP error status for the whole gateway. It maps in this
precedence, per FS-0001 §Requirements 5:

| Input | Response |
|---|---|
| downstream `InvalidArgument` | `400 · VALIDATION_FAILED` |
| downstream `NotFound` | `404 · NOT_FOUND` |
| downstream `AlreadyExists` | `409 · ALREADY_EXISTS` |
| downstream `Unauthenticated` | `401 · UNAUTHENTICATED` |
| downstream `PermissionDenied` | `403 · FORBIDDEN` |
| downstream `Unavailable`, unmapped code, anything else | `500 · INTERNAL_ERROR` |

gRPC status first, then a local `apperr` sentinel, then the catch-all. The mapping is
**collected from the six existing `status.FromError` switches, not invented** — read them first.

The body is RFC 9457 `application/problem+json` with `type`, `title`, `status`, `detail`,
`code`, `errors[]`. `errors[]` is **always present**, empty when there is no field detail.
`Content-Type` must be `application/problem+json`, not `application/json`.

No downstream error text reaches the client: `detail` is client-safe prose, the raw error is
logged server-side with its operation name. 5xx logs at error level, 4xx at info.

The seam must be callable **from middleware, not just handlers** — I-0002 depends on this, and
building it handler-only is the mistake that forces a rewrite one slice later.

**Prove it — `internal/gateway/example`**

Migrate `example/handler.go` (3 error writes, the smallest surface in the gateway) end to end.
Delete its local `status.FromError` switch. This is the vertical part of the slice: the seam is
not "done" until real routes return real problem+json through it.

## Acceptance Criteria

- [ ] `common/errcode` matches §Requirements 1; domain-code block still empty
- [ ] `common/apperr` defines the sentinels the seam matches on
- [ ] One function in `internal/httperr` is the only code in the gateway that decides an error status
- [ ] Each of the six mappings above has a test asserting **status, `code`, AND `Content-Type`**
- [ ] `errors[]` is present-and-empty when there is no field detail (asserted)
- [ ] A test asserts a known downstream error string does **not** appear in any response body
- [ ] An error with an empty message falls back to status text, never an empty `detail`
- [ ] The seam is exercised once from a non-handler (middleware-shaped) call site
- [ ] `example`'s 3 writes go through the seam; its `status.FromError` switch is deleted
- [ ] `common/` still builds for all 11 modules in the `go.work` workspace
- [ ] Gateway test suite passes

## Blocked By

None. This is the foundation slice.

## Spec Reference

FS-0001 §Requirements 1–10 (vocabulary, seam, body shape, leak prevention), §API surface
(member table + code→status mapping), §Edge States (unmapped code, non-gRPC error, empty
message). Covers user stories 5, 6, 7, 10, 11, 12, 13, 14, 16.

## Merge Policy

Land on `feat/fs-0001-error-contract`, **not** main. See I-0008 — the client break must happen
at one merge, not five.

## TDD Approach

- RED: table test over the six gRPC codes asserting status + `code` + `Content-Type` — fails, no seam exists
- GREEN: the mapping function and the problem+json writer
- RED: assert a downstream message string is absent from the body
- GREEN: `detail` generalisation + server-side logging of the raw error
