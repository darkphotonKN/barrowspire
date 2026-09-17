---
id: I-29KSH-7
status: done
implements: FS-29KSH
blocked_by: [I-29KSH-6]
labels: [blocked]
title: "FS-29KSH slice 7: storekeeper NPC opens the loadout"
---
Implements FS-29KSH §Requirements 29-30

**Author: agent**

## What to Build

The second function NPC. Interacting with the storekeeper opens the loadout UI; the loadout is
no longer reachable from the main menu.

The loadout stays **REST-only** — `getItemInstances`, `getLoadout`, `PUT /api/items/loadout`.
**No new endpoints and no new WebSocket actions.** `LoadoutScene` already exists and already
talks to those; this slice changes how it is reached, not what it does.

Reuses the function-NPC machinery from I-29KSH-6.

**Decide and proceed** (marked AFK deliberately): the storekeeper's dialogue line, in the same
lore voice.

Watch the existing hazard: equipment slot naming diverges between backend
(`chest`/`gloves`/`legs`) and frontend (`body`/`hands`/`feet`), mapped in two places. Do not add
a third mapping site.

## Acceptance Criteria

- [x] Interacting with the storekeeper NPC opens the loadout.
- [ ] **Blocked, not by this slice.** Equipment changes cannot be verified: the loadout's REST
      calls return 401 before reaching the items surface at all. See below.
- [x] The loadout cannot be reached from the main menu.
- [x] No new HTTP endpoint and no new WebSocket action was added.
- [x] The storekeeper is at a fixed position, identical for two different clients.
- [x] **Revised, as in I-29KSH-1/I-29KSH-5/I-29KSH-6:** no new test failures, no new lint findings versus
      the branch point.


### Surfaced here, belongs elsewhere: items-service rejects every gRPC call

Opening the pack returns 401, and the cause is upstream of anything this slice touches.

`items-service` chains `commonauth.Auth` over its gRPC server
(`items-service/config/routes.go:60`), so every method demands `authorization`
metadata and returns `codes.Unauthenticated` — HTTP 401 — without it. **Neither
caller sends it.** `api-gateway/internal/gateway/item/client.go` and
`game-service/grpc/items/client.go` attach no metadata and install no client
interceptor; the only correct example in the repo is
`api-gateway/internal/gateway/listing/handler.go:49`.

Three call paths are broken, and only the first is visible:

| Caller | Effect |
|---|---|
| gateway → items (`getLoadout`, `getItemInstances`) | 401, which is the symptom above |
| game-service → items (`InitializeItems`) | fails silently — the code calls it "deliberately non-fatal: a session with no loot still runs", so **runs have been spawning with no loot** |
| game-service → items (a player's loadout on join) | same |

Not caused by this slice, which only made the first path reachable — the same
pattern as the rest of this feature. The fix is not symmetrical: the gateway can
forward the caller's header, but **game-service holds no player token**, so
server-to-server calls need an identity decided first (a service credential, or
forwarding the player's token through the world). That is a design question, not
a missing line.

## Blocked By

I-29KSH-6 — function NPC placement, interaction and dialogue land there.

## Spec Reference

FS-29KSH §Requirements 29-30. Note FS-29KSH has no §API surface section: this feature changes no
HTTP contract.

## TDD Approach

- RED: assert the main menu exposes no loadout entry point.
- GREEN: entry removed, storekeeper interaction opens `LoadoutScene`.
