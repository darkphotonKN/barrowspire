---
id: I-KE075-4
status: open
implements: FS-KE075
blocked_by: [I-KE075-3]
labels: [blocked]
title: "FS-KE075 slice 4: dungeon-floor snapshots cut per recipient to 1600 px; the client lets monsters, piles and containers leave and return without replaying one-shots (game-service + game-client)"
---
Implements FS-KE075 §G (Requirements 36–39), §H Requirement 48

**Lane: agent (AFK), game-service (agreed in the charter) and game-client.**

## What to Build

Server: on a dungeon floor (a floor whose layout has regions), each recipient's snapshot carries only the monsters (corpses included), drop piles and containers within 1600 px of its interest centres: its living body, or every living in-play party member when it has none, and no cut when no member lives. Players, doors, switch, escape door, stairs, projectiles, trails, items and equipment always sent. Cut lists are fresh slices, never aliases of the pooled state. Floors 2–3 not cut. Tested on a fixture dungeon session, since floor 1 only becomes a dungeon in slice 6.

Client: on any run floor, a monster, drop pile or container missing from a snapshot is removed with no death clip, sound or notice; one that appears is created in its current state (corpse on its last frame, container open, health as baseline) with no death clip, open presentation or damage flash.

## Files (expected)

- `internal/serializer/state_serializer.go` (`FormatStateToClientState`: the cut, fresh slices)
- `internal/game/session.go` (`broadcastFullState`: interest centres per recipient)
- `internal/serializer/state_serializer_test.go`, `state_serializer_bench_test.go`, a `-race` test
- `game-client/src/render/creatures/monsters.ts`
- `game-client/src/render/world/chest.ts`, `sack.ts`, `dropPile.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (container and pile updates)

## Acceptance Criteria

- [ ] On a fixture dungeon floor a recipient gets exactly the dynamic entities within 1600 px of its centres, and always every player and fixed interactable
- [ ] A spectator's centres are the living members; with none alive nothing is cut
- [ ] Floors 2–3 snapshots are not cut
- [ ] A `-race` test shows cut lists untouched by the next tick's pool reset
- [ ] The bench records bytes per recipient per tick for the fixture dungeon and floor 2
- [ ] Client: leave and re-enter, alive or dead, replays no death clip or flash; an open container re-entering shows open with no open presentation
- [ ] `go test ./...`, `golangci-lint run`, typecheck and vitest pass

## Blocked By

I-KE075-3

## Spec Reference

FS-KE075 §G.36–39, §H.48. ADR-0060 Decisions 4–7.

## TDD Approach

- RED: a serializer test with monsters at 1599 and 1601 px from the recipient
- GREEN: the cut and the centres; then a client test that a re-appearing corpse does not play its death clip
