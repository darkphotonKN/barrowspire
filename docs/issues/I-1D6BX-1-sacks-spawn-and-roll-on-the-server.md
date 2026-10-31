---
id: I-1D6BX-1
status: done
implements: FS-1D6BX
blocked_by: []
labels: [ready-for-agent]
title: "FS-1D6BX slice 1: sacks spawn, roll and restock on the server"
---
Implements FS-1D6BX §Requirements 1–11

The whole server side of the feature in one vertical slice. A sack can appear where a chest
would, rolls through a per-kind roll on first open, goes out on the wire as `kind: "sack"`, and
restocks in a field. Chests roll exactly as before.

## Files owned

- `game-server/game-service/internal/components/container.go` (`ContainerKindSack`)
- `game-server/game-service/internal/game/loot_tuning.go` (`SackShare` and the per-kind empty chance and count constants)
- `game-server/game-service/internal/game/session.go`: `generateItemsAt` / `generateItems`, `CreateContainer` / `AddContainer`, the container-open path that calls `rollChest`. **Hotspot: touch only these functions.**
- `game-server/game-service/internal/game/factory.go` (`CreateContainerEntity` takes a kind)
- `game-server/game-service/internal/game/forest_chests.go` (`rollChest` / `fieldChestRoll` by kind, `restockFieldChests` treats a sack as a chest)
- `game-server/game-service/internal/game/field_place.go` (clearing chest placement draws the share)
- `game-server/game-service/internal/game/field_drops.go` (`fieldContainerRoll` by kind)
- `game-server/game-service/internal/serializer/state_serializer.go` (only if the kind needs anything; it already passes `Kind` through)
- the tests beside each

## What to Build

1. Add `ContainerKindSack = "sack"` (R1). A container is placed with a kind.
2. Introduce the per-kind roll (R4–R5, charter D1). Each kind has an empty chance and a count
   range. The roll hits the empty chance and returns no items, or draws a count uniform in the
   range, then splits by the existing `weaponDropRate`/`armorDropRate`/`consumableDropRate`,
   unchanged. Chest = empty 0, count 2–4 (behaviour-preserving). Sack = empty 0.8, count 1–1.
   Inject the randomness so tests are deterministic. Keep the existing `utils.GenRandomBetween`
   type split as it is, or route it through the injected rand without changing its distribution.
3. At each chest spawn point (run floor `CreateContainer`, Forest `layout.Chests`), draw once
   against `SackShare` (0.33) and place a sack on a hit (R3, D6, D7).
4. The open path rolls by the container's kind. The field roll keeps each item at `DropFactor`
   (R7). An empty roll still sets `HasBeenOpened` with an empty list (R9).
5. `restockFieldChests` restocks sacks like chests. Run sacks never restock (R10).
6. The serializer emits `"sack"` (R2).

## Acceptance Criteria

- [ ] A chest rolls 2–4 items with the old type split (existing tests stay green; add one if none pins the count).
- [ ] A sack rolls empty at 0.8, else exactly 1 item (table test, injected rand).
- [ ] A test computes each kind's expected count from the constants and asserts sack < chest (R6).
- [ ] A run floor places a sack on a share hit and a chest otherwise (injected rand), and the same holds per Forest clearing chest point.
- [ ] A field sack's roll is kept per item at `DropFactor`.
- [ ] An empty roll leaves the container opened, `IsOpen` true, with an empty item list.
- [ ] A field sack restocks after the delay, and a run sack never does.
- [ ] The serializer emits `kind: "sack"`.
- [ ] `go test ./...` and `golangci-lint run` are green in game-service.

## Blocked By

None.

## Spec Reference

FS-1D6BX §Requirements 1–11, User Stories 1, 3, 4, 13–15, 17–20, Edge States (empty, refused open).

## TDD Approach

- RED: a per-kind roll test where the injected rand hits the sack's empty chance and expects no items.
- GREEN: the per-kind roll with the chest and sack constants.
