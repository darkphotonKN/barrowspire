---
id: I-50MTX-6
status: done
implements: FS-50MTX
blocked_by: [I-50MTX-1]
labels: [ready-for-agent]
title: "FS-50MTX slice 6: the HTTP contract and the client work per character"
---
Implements FS-50MTX §Contract and client, §API surface, §Reads, §Moves

**Hotspot:** one writer at a time on `game-server/api-gateway/openapi.yaml` and
`game-client/src/api/generated/`.

**Why gateway and client are one slice.** Regenerating the client removes `/api/items/loadout` from
its typed paths, so `api.ts`, `HubGear` and the picker stop type-checking in that same moment. Cutting
them apart would leave the client red between slices.

## Files owned

- `game-server/api-gateway/internal/gateway/item/typed.go`, `wire.go`, `typed_test.go`, `handler_test.go`
- `game-server/api-gateway/openapi.yaml` (generated)
- `game-client/src/api/generated/` (generated)
- `game-server/api-gateway/SPECIFICATION.md` (the route names at `:186`)
- `game-client/src/utils/api.ts`, `api.test.ts`, `api.renewal.test.ts`
- `game-client/src/ui/HubGear.ts`, `HubGear.test.ts`
- `game-client/src/scenes/HubScene.ts` (`composeGear` only)
- `game-client/src/marketplace/pickerRelics.ts`, `pickerRelics.test.ts`, `useItemInstances.ts`, `listRelic.ts`, `listRelic.test.ts`
- `game-client/src/components/bazaar/ListRelicDrawer.tsx`

## What to Build

**Gateway, per §API surface.**

- `get-loadout` and `update-loadout` move to `GET` and `PUT /api/characters/{characterId}/loadout`, in the item package. The path parameter must be spelled `characterId`: `character/typed.go` already registers `/api/characters/{characterId}`, and the router is gin, which panics at startup on a differing wildcard name at one position.
- **The old `GET` and `PUT /api/items/loadout` routes are removed with no shim (charter default: alpha, one client).**
- `update-loadout`'s `Errors` list gains 404 and 503, in its own list so no other operation widens.
- `list-item-instances` takes an optional `characterId` query, uuid; each item gains `character_id`, absent for a stash item.
- `move-item-instance`'s body gains a required `character_id`, uuid. Its error list already has 404 and 503.

**Contract (R36).** Edit the handlers, run `make openapi && make client` in `game-server/api-gateway`,
and commit all three together. `openapi.yaml` and `src/api/generated` are never hand-edited.

**Client: the hub's gear (R37).** `api.ts`'s `getLoadout`, `updateLoadout` and `moveItemInstance` take
the character; `getItemInstances` takes it as optional. `HubGear` stays behind its injected
`HubGearApi`; `composeGear` binds that to the store's active character, read at each call, so changing
character shows that character's gear and bag on the next open. The store is per tab, so two tabs each
act as their own character. A `404 · NOT_FOUND` from a move or equip takes the existing refused path,
which re-reads the real bag and stash.

**Client: the List-a-relic picker (R38).** `loadPickerRelics` reads only `getItemInstances()` with no
character, so the stash. The loadout read and `worn` go from `pickerRelics.ts`, `useItemInstances.ts`
and `pickerCards`. A relic is listable when it is in the stash and AVAILABLE. The Bazaar needs no active
character. `WORN_CANNOT_LIST` stays: the server still answers `ITEM_WORN` first (R35).

## gRPC compile

**No caller breaks; this slice is the update.** The gateway starts sending `character_id` on
`GetLoadout`, `UpdateLoadout`, `MoveItemInstance` and optionally `ListItemInstances`. The fields exist
from I-50MTX-1, so it compiles, and its tests stub the client. End to end it needs I-50MTX-3 and
I-50MTX-4 on the branch.

## Acceptance Criteria

- [ ] `GET` and `PUT /api/characters/{characterId}/loadout` work per §API surface, and the router builds with the existing character routes (`config/routes_test.go`).
- [ ] `/api/items/loadout` answers 404.
- [ ] A malformed `characterId` answers `422 · VALIDATION_FAILED`, on path and query.
- [ ] `update-loadout` documents and returns 404 and 503; `move-item-instance` requires `character_id`.
- [ ] `character_id` is on each listed item and absent for a stash item.
- [ ] `openapi.yaml` and the generated client are regenerated, not hand-edited.
- [ ] The hub gear overlay reads and writes as the active character, and shows the new character's gear after Change character.
- [ ] The List-a-relic picker works with no active character, makes no loadout read, and shows no held item.
- [ ] `go test ./...` in `api-gateway`, `npm test` and the type check pass.

## Blocked By

I-50MTX-1. Nothing waits on it. It may run beside I-50MTX-2, -3, -4 and -5.

## Spec Reference

FS-50MTX R18, R22-R24 (HTTP side), R36-R38, §API surface; user stories 5, 6, 14, 15, 18, 19.

## TDD Approach

- RED: a gateway test `PUT`s `/api/characters/{id}/loadout` and asserts the stub saw `character_id`, and `pickerRelics.test.ts` asserts `getLoadout` is not called.
- GREEN: the routes, the regeneration, then the client signatures through to `composeGear`.
