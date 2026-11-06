---
id: I-BDRTJ-1
status: done
implements: FS-BDRTJ
blocked_by: []
labels: []
title: "FS-BDRTJ slice 1: server dev test room (guard, gate, seating, no settlement, chests, enemies, respawn)"
---
Implements FS-BDRTJ §Requirements (1, 3-4, 6-17), §Acceptance Criteria, §Edge States

## What to Build

The whole room on the server, off unless `ENVIRONMENT` is development: the boot option from `main.go`, the hub gate, the `dev_test_room` field, level 20 naked seating with no items-service call, the `settleVisit` skip, the fixed-list chests with 2s restock, and the three still enemies with 2s respawn.

## Acceptance Criteria

- [ ] Guard is `strings.EqualFold(environment, "development")` in `main.go`, passed through `SetupRouter` to a `gameserver` option whose zero value is off.
- [ ] Off: `FieldSession` finds no room, the hub has no such gate, `enter_field` answers `unknown_field`.
- [ ] On: the gate is at the hub's bottom-left, and walking in seats a level 20 body with an empty loadout. A fake items client sees no `CheckOutRunGear`.
- [ ] A fake `VisitSettler` sees nothing, and the record keeps its real level and XP, on each of: `leave_field`, disconnect (`homeFromField`), `leave_hub`, `enter_hub`, normal close (`handler.go`), and an entry aborted after seating. All of them reach `settleVisit`.
- [ ] Enemies spawn without Velocity, never move or strike, can be walked through, and are replaced 2s after death with no drop.
- [ ] Chests are pre-opened and hold the fixed list, including all six uniques. Nothing rolls, and a taken item is back after 2s.
- [ ] `session.go` gains only the one call in `step` and the one struct field holding the room's state. No changes to the combat, gear or monster systems, or to `hubGates`.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

None

## Spec Reference

FS-BDRTJ §Requirements 1, 3-4, 6-17: guard, gate, room, seating, leaving, items, enemies. User Stories 2-5.

## Files Expected

- New: `game-server/game-service/internal/game/dev_test_room.go` (place, item list, chests, enemies, tick hook, hub gate), plus `internal/game/dev_test_room_test.go` and `internal/gameserver/dev_test_room_test.go`
- `game-server/game-service/cmd/server/main.go`, `config/routes.go`
- `game-server/game-service/internal/components/gate.go`, `internal/game/field_place.go`, `internal/game/session.go`
- `game-server/game-service/internal/gameserver/fields.go`, `internal/gameserver/server.go`

## TDD Approach

- RED: a table test over every way out, asserting that no visit is published and the record is unchanged.
- GREEN: the `settleVisit` skip, then the room behind it.
