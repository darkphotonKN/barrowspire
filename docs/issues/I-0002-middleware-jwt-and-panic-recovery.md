---
id: I-0002
status: done
implements: FS-0001
blocked_by: [I-0001]
labels: [ready-for-agent]
title: "FS-0001 slice 2: middleware error paths — JWT and panic recovery"
---
Implements FS-0001 §Requirements, §Edge States

## What to Build

The two error paths that never reach a handler. They are their own slice because middleware
**aborts before the handler runs** — if the seam turns out to be handler-shaped, this is where
it breaks, and every package slice after this one assumes it doesn't.

**JWT middleware — `api-gateway/internal/auth/jwt_middleware.go`**

4 error writes, all 401. **Replaced outright, not forked** (FS-0001 §Requirements 11): every
error body in the gateway changes at once in this feature, so a compatibility path would exist
only to be deleted. All four emit `401 UNAUTHENTICATED` in problem+json — missing token,
malformed token, expired token, invalid signature.

**Panic recovery — `api-gateway/config/routes.go:24`**

`gin.Default()` is in use, so gin's stock Recovery is active — and it writes a **500 with an
empty body**. There is currently no JSON at all on a panic. Replace with `gin.New()` plus an
explicit `gin.CustomRecovery` that emits `500 INTERNAL_ERROR` in problem+json through the seam.

Switching `Default()` → `New()` drops gin's Logger as well as its Recovery. Re-attach whatever
logging the service expects, in the order the existing chain implies — CORS and
`otelgin.Middleware` at `routes.go:35`/`:42` must keep working unchanged.

## Acceptance Criteria

- [ ] All 4 JWT paths emit `401 UNAUTHENTICATED` in problem+json with the correct `Content-Type`
- [ ] The JWT middleware contains no direct status write
- [ ] A panic in a handler produces `500 INTERNAL_ERROR` in problem+json — asserted with a deliberate panic, not assumed
- [ ] The panic is logged server-side with its stack; no stack, file path, or internal detail appears in the response body
- [ ] `gin.New()` chain preserves CORS, otel, and request logging behavior
- [ ] Protected routes still reject unauthenticated requests (no route accidentally opened by the middleware rewrite)
- [ ] Gateway test suite passes

## Blocked By

I-0001 — the seam must exist and must be callable from a middleware context.

## Spec Reference

FS-0001 §Requirements 11 (JWT replaced outright), §Edge States (missing/expired/malformed JWT;
panic in a handler). Covers user stories 1, 4, 10, 15, 20.

## Merge Policy

Land on `feat/fs-0001-error-contract`, not main. See I-0008.

## TDD Approach

- RED: request with no/expired/malformed token asserts `401` + `UNAUTHENTICATED` + problem+json
- GREEN: middleware routed through the seam
- RED: handler that panics asserts `500` + `INTERNAL_ERROR` + problem+json (today: empty body)
- GREEN: `gin.New()` + `CustomRecovery` through the seam
