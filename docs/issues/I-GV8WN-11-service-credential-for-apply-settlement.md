---
id: I-GV8WN-11
status: open
implements: ADR-0040
blocked_by: []
labels: []
title: "FS-GV8WN slice 11: ApplySettlement requires a service credential"
---
Implements ADR-0040 §Consequences (accepted risk: tokenless ApplySettlement)

**Author: human.** game-server is the owner's hand-coded lane. Needs a decision first (HITL): the
mechanism, and whether it gets its own ADR.

## What to Build

`/items.ItemsService/ApplySettlement` is in `common/auth/interceptor.go` `publicMethods`. It writes
items for any members its event names, and items-service's gRPC listener is not bound to localhost.
Replace the public entry with a service credential that game-service presents.

- Recommended: a shared internal service secret (k8s Secret / `.env`), sent in gRPC metadata by
  game-service and checked by the interceptor for service-called methods only. The same check can
  retire wallet's `ReleaseHold` / `ListStaleReservedHolds` entries.
- Not preferred: a service-role JWT, because game-service would have to hold `JWT_SECRET` and could
  then mint player tokens.

## Acceptance Criteria

- [ ] `ApplySettlement` without the credential is Unauthenticated; with it, it is served.
- [ ] Player tokens cannot call it (it is not a member call).
- [ ] The credential is config (env / k8s Secret), never in code; the GKE manifests carry it.
- [ ] `auth_test` pins the new rule; the `publicMethods` entry is gone.

## Blocked By

None. It must land **before I-GV8WN-8 is deployed to GKE**.

## Spec Reference

ADR-0040 §Consequences; FS-GV8WN §D R11 ("no bearer token": still true, a service credential
replaces it).
