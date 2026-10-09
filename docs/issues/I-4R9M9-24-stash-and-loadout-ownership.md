---
id: I-4R9M9-24
status: open
implements: FS-4R9M9
blocked_by: [I-4R9M9-22]
labels: [ready-for-agent]
title: "items-service only lets a member read or change their own stash and loadout"
---
Implements FS-4R9M9 §Requirements 53 under the user decision of 2026-10-10 (items-service verifies the caller owns what they read or change) — final code-review follow-up P2 + S1; user approved fixing now.

**Domain:** items-service (internal/items/handler.go GetLoadout ~849, ListItemInstances ~919, UpdateLoadout ~1002; service layer). · **Lane:** agent.

## What to fix
1. `GetLoadout`, `ListItemInstances` and `UpdateLoadout` (a write) trust `req.MemberId` and never compare it with the caller (`commonauth.MemberIDFromCtx`). Apply the same rule as I-4R9M9-22 (service.go GetLoadoutWithItems): caller ≠ MemberId → wrapped `ErrForbidden` before any repository read/write → handler maps to `PermissionDenied`; no identity → `Unauthenticated`. Rule in the service layer.
2. Log every refused ownership attempt (incl. GetLoadoutWithItems) with `slog.Warn` (method, caller, requested member) — today the handler drops the wrapped error silently (items-service has no shared Status interceptor).
The gateway already fills MemberId from the caller's token (api-gateway item/typed.go ~579-584, 618-624) — confirm its calls still pass.

## Acceptance Criteria
- [ ] Per RPC: own → OK; foreign member → PermissionDenied with zero repo reads/writes; no identity → Unauthenticated.
- [ ] A refused attempt is logged once.
- [ ] items-service `go test ./...` green; api-gateway item tests green.
