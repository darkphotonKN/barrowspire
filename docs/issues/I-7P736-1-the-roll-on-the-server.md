---
id: I-7P736-1
status: done
implements: FS-7P736
blocked_by: []
labels: [ready-for-agent]
title: FS-7P736 slice 1: the roll on the server, its cooldown and its state on the wire
---
Implements FS-7P736 §A

## What to Build
game-service: the `roll` action routed like the other game actions (`gameActions`, `ParsePayload`),
queued onto the tick; a roll in flight carried by the MovementSystem through the swept collision
at a fixed 500 px/s for 0.4 s (the dash's "charge in flight" is the precedent; never read the pace
scale or any speed modifier); through bodies; ended by anything that stops a step; invulnerable at
the hit gate; traps and plates react as to a walk; casts and timed opens cancel as a move does;
`RollDistance`, `RollDuration`, `RollCooldown` named tunables; R6 refusals; R8's dropped actions;
`current_player.roll_cooldown` and `roll {dir_x, dir_y}` on current and other players (serializer;
fields added only).

**Do not start until the coordinator says session A's pace branch has landed**: merge Kranti's
`chore/game-loop-performance-optimization` in first (it touches `systems/movement.go`), then build
on top.

## Acceptance Criteria
- [x] FS-7P736's game-service Acceptance Criteria.
- [x] `make test` and `make check` green in game-service.
      (2026-11-26: `make check`'s `go fmt` rewrites `internal/game/interact_cache_test.go`, and its
      lint stage stops on 26 findings already in the tree, none in the roll's files. Both are
      pre-existing: the file was reverted, and `go vet`, `gofmt -l` and `golangci-lint` on the
      touched packages stand in for it, clean on every touched line.)

## Blocked By
Session A's pace branch landing on `chore/game-loop-performance-optimization`.

## Spec Reference
FS-7P736 §A R1–R12, Acceptance Criteria (game-service), Edge States.
