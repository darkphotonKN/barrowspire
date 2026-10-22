---
id: I-4R9M9-22
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-20]
labels: [ready-for-agent]
title: "items-service only returns a loadout to the member who owns it"
---
Implements FS-4R9M9 §Requirements 53 (loadout hydration) under the user decision of 2026-10-10 ("only the items they wear are checked; items-service verifies the caller owns them") — code-review HIGH on I-4R9M9-20.

**Domain:** items-service (internal/items/handler.go `GetLoadoutWithItems` ~880-893, service.go ~948). · **Lane:** agent.

## Defect
`GetLoadoutWithItems` takes `req.MemberId` and never compares it with the authenticated caller (`commonauth.MemberIDFromCtx(ctx)`); any valid token can read any member's worn gear. The interceptor only proves the caller is signed in.

## What to build
- Compare the caller's member id (from the embedded identity) with `req.MemberId`; mismatch → `codes.PermissionDenied` (via the existing Status interceptor/error mapping conventions — check how other items methods refuse a foreign member), match → unchanged. Missing identity → `Unauthenticated` (the interceptor already guarantees one for guarded methods).
- Keep the check at the owning service (handler or service layer per root CLAUDE.md: business rule → service layer).

## Acceptance Criteria
- [ ] Own loadout → returned; another member's id → PermissionDenied; tests through the real interceptor chain (bufconn or handler-level with an embedded identity).
- [ ] game-service's forwarded-token loadout path still works (it sends the player's own id).
- [ ] items-service `go test ./...` green.
