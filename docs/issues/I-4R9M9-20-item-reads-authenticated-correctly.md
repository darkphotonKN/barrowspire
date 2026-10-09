---
id: I-4R9M9-20
status: done
implements: FS-4R9M9
blocked_by: []
labels: [ready-for-agent]
title: "Item catalogue reads need no token; worn gear loads as the player"
---
Implements FS-4R9M9 §Requirements 8 (the run pool comes from `ListItemTemplates`), 5/R22 (rarities), 53 (loadout hydration) — found on the user's live stack 2026-10-10.

**Domain:** common/auth + game-service. · **Lane:** agent (user decision 2026-10-10). · **Commits:** 961961e, 0beccbb, bc4e279, d287f02 on `fix/item-auth-floor-spawn`.

## Problem
The shared items interceptor (`common/auth/interceptor.go`) required a player bearer token on every method outside `publicMethods`. game-service called items-service service-to-service with no token, so `ListItemTemplates`, `ListItemRarities` and `GetLoadoutWithItems` all failed `Unauthenticated: missing authorization`: runs had an empty item pool (no monster or chest drops), no rarities, and delvers spawned with no gear. Unit tests used fake clients, so nothing caught it.

## User decision (2026-10-10)
- Base types are catalogue data the game needs once per session over internal gRPC (not exposed through the gateway); they need no token.
- Only worn items are checked: the game loads a delver's loadout **as that player**, so items-service still verifies the caller owns it. No server-side admin or hidden service credential.
- Protecting database items after they drop in a run is deferred.

## What was built
- `ListItemTemplates` and `ListItemRarities` join `publicMethods` (they reveal nothing member-owned); `GetLoadoutWithItems` stays guarded.
- game-service keeps the player's validated WebSocket token (`types.BearerToken`, redacted when printed, logged or marshalled) on the player record, refreshes it on reconnect, and forwards it as `authorization: Bearer …` on the loadout call only (`asMember`).
- Caveat: a token that expires during a long hub stay makes the next world seat without gear until the player reconnects.

## Acceptance Criteria
- [x] Interceptor test pins both catalogue reads public and the loadout guarded.
- [x] The loadout call carries the player's token; the catalogue calls carry none.
- [x] The token never appears in logs or JSON.
