---
id: I-3QHQZ-4
status: open
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-3, I-X2F2H-5]
labels: [ready-for-agent, blocked]
title: "FS-3QHQZ slice 4: clearing chests that roll at the Forest's level and drop factor and restock after 5 minutes"
---
Implements FS-3QHQZ §B (Requirements 15, 19)

Agent lane. **Also blocked by FS-X2F2H's derived-drop-rate issue**: the slice that scales a
field's drop chance by its factor, read at roll time. Id not minted yet; add it once FS-X2F2H is
sliced. Chests reuse that rule; they do not invent a second scaling.

## Files expected to touch

- `game-server/game-service/internal/game/forest_map.go` and its test: a container entity at
  each chest clearing's centre, recorded as occupied.
- `game-server/game-service/internal/game/chest_loot.go` and its test: a field-aware chest drop
  (item level uniform in the Forest band 4–9; chance scaled by the Forest factor through
  FS-X2F2H's rule).
- `game-server/game-service/internal/game/forest_chests.go` (new) and its test: the 5-minute
  restock (clear what is left, close, reset `HasBeenOpened`), driven from the world's tick or
  intent queue, never from a timer goroutine outside the tick.
- `game-server/game-service/internal/game/session.go`: only the container-open branch, if the
  field-aware drop has to be chosen there.

## What to Build

1. A chest at each chest clearing (from slice 3's assignment).
2. First open rolls through the Spire's chest roll (FS-4R9M9) with the item level drawn from 4–9
   and the Forest drop factor applied. No killer-first window on a chest.
3. 5 minutes after first opening: remove anything still inside, close it, and reset it so the
   next opening rolls again. Items already taken stay taken and settle as field pickups
   (FS-X2F2H).

## Acceptance Criteria

- [ ] Every chest clearing has exactly one container; no container elsewhere in the Forest.
- [ ] First open rolls once, at an item level in 4–9, with the Forest factor applied (injected-rand test).
- [ ] Two opens in the same tick roll once.
- [ ] 5 minutes after first open (stepped tick or fake clock) the chest is closed and empty; the next open rolls again.
- [ ] The Spire's chests are unchanged (existing chest tests green).
- [ ] `go test ./...` and `golangci-lint run` green in game-service.

## Blocked By

- I-3QHQZ-3 (clearing assignment)
- FS-X2F2H derived-drop-rate issue (id pending; see above)

## Spec Reference

FS-3QHQZ §B Requirements 15, 19; Acceptance Criteria "Forest world (§B)" chest item; Edge States
"Two players open a chest at once", "A chest is mid-restock while someone stands at it"; User
Stories 7, 8.

## TDD Approach

- RED: a stepped-tick test that a chest opened at t0 is closed and empty at t0 + 5 min.
- GREEN: placement, the field-aware drop, the restock.
