---
id: I-0009
status: done
implements: FS-0002
blocked_by: []
labels: [ready-for-agent]
title: "FS-0002 slice 1: Huma wiring + the member group — the yaml is born"
---
Implements FS-0002 §Requirements 1-4, 8-14, §API surface

## What to Build

Mount Huma on the existing gin engine and serialize the **member group (8 routes)**. This is
the slice that creates `openapi.yaml`, turns the gates on, and proves both middleware patterns.

**Wiring**
- humagin adapter over the **existing** `gin.Engine` from `SetupRouter`. Middleware order
  (Recovery → Logger → CORS → otelgin) unchanged; every unserialized route keeps working.
- **Identity bridge**: typed handlers read the same `userId`/`userIdStr` that `AuthMiddleware`
  sets. One source of caller identity, never the request body (FS-0002 §Req 3).
- **Error adapter**: Huma's error path routes through `internal/httperr` so a failure in a typed
  handler is byte-identical to one from a legacy handler. Huma does **not** get its own format
  (§Req 8).
- **Docs UI** on a public route (ADR-0002 §6).
- Makefile targets already exist — fill `{GENERATOR_CMD}` so `make openapi` produces the yaml.
- `contract.yml` already runs the gates; they stop reporting SKIPPED once the yaml lands.

**The member group — 8 routes**

Public: `POST /api/member/signup` (AMQP → 202) · `POST /api/member/signin` ·
`GET /api/member/check-email`
JWT: `GET /api/member` · `PATCH /api/member/update-password` ·
`PATCH /api/member/update-info` · `POST /api/member/avatar/upload-request` ·
`POST /api/member/avatar/confirm`

Both patterns are exercised here on purpose: the public three and the private five.

## Acceptance Criteria

- [ ] `openapi.yaml` exists and contains exactly the 8 member routes
- [ ] `make openapi && git diff --exit-code` clean
- [ ] Docs UI reachable on its public route, lists the member group
- [ ] `make lint-contract` passes
- [ ] `make openapi-breaking` reports SKIPPED-no-baseline on this slice, and is live after merge
- [ ] Error body from a typed handler is byte-identical to the seam's (assert `code`, `detail`,
      `errors[]`, and `Content-Type: application/problem+json`)
- [ ] Identity in a typed handler equals what `AuthMiddleware` set — asserted, not assumed
- [ ] `signup` still returns 202 with no member body; `check-email` still polls
- [ ] Before/after script recorded for all 8 routes, byte-compatible except the two annotated
      changes (FS-0002 §Req 10-11)
- [ ] `scripts/check-seam.sh` green
- [ ] Legacy routes (webhook, example, items, stats, notification, payment) still work and are
      ABSENT from `openapi.yaml`
- [ ] Gateway suite passes

## Blocked By

None. This slice blocks I-0010, I-0011, I-0012.

## Spec Reference

FS-0002 §Requirements 1-4 (mounting, identity), 8-9 (errors), 10-11 (the two deliberate
changes), 12-14 (docs UI, committed yaml, gates), §API surface (signup 202 + check-email rows).

## TDD Approach

- RED: typed handler returns a downstream error → assert the problem+json body matches the seam
- RED: typed handler reads identity → assert it equals the middleware's `userId`
- RED: unknown member in a request body → 422 (§Req 11)
- GREEN: the mount + the 8 transcriptions
- Manual: before/after per route, recorded in the PR

## Notes

**Transcribe, don't improve.** Anything that looks wrong goes to the pioneer log as a future FS
candidate (ADR-0002 §2). This slice fixes nothing.
