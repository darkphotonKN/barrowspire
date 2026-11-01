---
id: I-18Z5F-4
status: done
implements: FS-18Z5F
blocked_by: []
labels: []
title: "FS-18Z5F slice 4: unsafe finds on the item component and the wire; a dead delver loses them (game-service)"
---
Implements FS-18Z5F §D (Requirements 19–22), §E (Requirements 23–25)

**Author: agent.** Independent of slices 1–3: today every item a body is seated with comes from
items-service, so "built by seating" is already the safe set.

## What to Build

1. **`ItemComponent.Unsafe bool`** (R19): seating (`buildBodyLocked`, via `loadoutItemConfig`)
   opts in to safe; every other creation path (`AddItem` / `AddItemWithUnLocked` for chests,
   containers, monster drops, field piles) is unsafe without being told. Carry it on
   `types.ItemConfig` so the safe case is explicit (e.g. a `Safe` field set only by seating, or
   an `Unsafe` default set by the shared constructor; pick the shape that makes a new source
   unsafe by default).
2. **Follows the item** (R20): equip, unequip, pickup, floor change keep the component; nothing
   clears it.
3. **Wire** (R21): `types.ItemState` gains `Unsafe bool \`json:"unsafe,omitempty"\``, filled by the
   state serializer for bag, equipment and container items. No new message type.
4. **Death filter** (R23): in `getRawMatchState` (or `rankPlayers`), for a delver whose
   `HealthComponent.IsEliminated` is true and `PlayerComponent.Escape` is false, drop every
   unsafe item from the extracted equipment (slot empty) and the extracted bag. Escaped and
   alive delvers extract everything. A removed body is simply absent, as today (R24).
5. **Fields** (R25): `PublishFieldVisit` / `gearOf` unchanged; nothing dropped.

**Hard bounds:** no proto, no items-service, no client change; the extraction event shape is
unchanged.

## Acceptance Criteria

- [ ] A seated item entity has `Unsafe == false`; a chest item, a monster drop and a field pile item have `Unsafe == true`.
- [ ] Equipping and unequipping an unsafe item keeps the flag; a floor change keeps it.
- [ ] The serialized state carries `"unsafe": true` for an unsafe item and omits the key for a safe one, in bag, equipment and container lists.
- [ ] Run end: an eliminated, non-escaped delver wearing an unsafe ring and carrying an unsafe potion and a safe sword extracts only the sword; the ring's slot extracts empty.
- [ ] Run end: an escaped delver extracts unsafe and safe items alike; so does a live, non-escaped one.
- [ ] A dead delver who departed early (`Depart`) is filtered the same way.
- [ ] A field visit's settlement extracts unsafe items after a death in the field.
- [ ] `go test -race ./...`, `golangci-lint run`: no new failures.

## Files expected to touch

- `game-server/game-service/internal/components/item.go`
- `game-server/game-service/internal/types/game.go` (`ItemState`), the `ItemConfig` type
- `game-server/game-service/internal/game/session.go` (`AddItemWithUnLocked`, `getRawMatchState`, `buildBodyLocked`), `extracted_item.go`, `service.go` (`rankPlayers` if the filter lives there)
- Item creation sites for chests, drops and field piles (`internal/game/*loot*.go` or similar)
- `game-server/game-service/internal/serializer/state_serializer.go`
- Tests beside each

## Blocked By

None.

## Spec Reference

FS-18Z5F §D R19–R22, §E R23–R25; User Stories 3, 4, 5, 7, 8, 11, 18, 19, 23; Edge States "Unsafe item equipped, then the delver dies", "Delver escapes, then a party member dies", "Dead delver's body", "Reconnect".

## TDD Approach

- RED: chest item entity → `Unsafe` true; seated sword → false.
- RED: raw match state for a dead non-escaped delver drops the unsafe ring and potion, keeps the sword.
- GREEN: the flag, the serializer field, the filter.
