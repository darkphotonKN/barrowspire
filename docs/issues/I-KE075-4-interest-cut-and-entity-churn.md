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

- [x] On a fixture dungeon floor a recipient gets exactly the dynamic entities within 1600 px of its centres, and always every player and fixed interactable
- [x] A spectator's centres are the living members; with none alive nothing is cut
- [x] Floors 2–3 snapshots are not cut
- [x] A `-race` test shows cut lists untouched by the next tick's pool reset
- [x] The bench records bytes per recipient per tick for the fixture dungeon and floor 2
- [x] Client: leave and re-enter, alive or dead, replays no death clip or flash; an open container re-entering shows open with no open presentation
- [ ] `go test ./...`, `golangci-lint run`, typecheck and vitest pass

## Verified, server half (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- `TestFormatStateToClientState_DungeonFloor_CutsDynamicEntitiesToTheInterestRadius`,
  `_DungeonFloor_CentresOfARecipientWithoutABody` (dead with none alive: nothing cut),
  `_NoCellGrid_NothingIsCut`, `TestBroadcastFullState_DungeonFloorCutsEachRecipientToItsOwnInterest`;
  `TestFormatStateToClientState_SentStateSurvivesTheNextTicksPoolReset` under `-race` (serializer
  and game pass under `-race`).
- Bytes per recipient per tick, `-benchtime 20x`, Apple M5 Pro.
  `BenchmarkFormatStateToClientState_BytesPerRecipient`: floor 1 cut, party mid 18,017 B; party
  corner 8,476 B; uncut 37,924 B; floor 2 14,335 B; hub at cap 17,686 B.
  `BenchmarkFloor1Snapshot_BytesPerRecipient`, real population after the room-size fix, 50
  floors: start room mean 10,601 B, max 14,852 B; most crowded room centre mean 13,790 B, max
  16,100 B; 0 floors over 16 KiB; at most 36 monsters sent. The 16 KB AC itself (review M6) waits
  on Nick.
- Left for the client agent: the leave-and-re-enter box, and the gates box (its server half passes
  as in I-KE075-3).

## Verified, client half (2026-11-06, review fix round 1, branch floor1/fix-client)

- Leave and re-enter: `monsters.test.ts` "a monster that leaves the broadcast and comes back
  (FS-KE075 §H.48)" (alive and hurt with no flash or death clip, a corpse on its last frame, no
  double spawn); `BarrowspireScene.test.ts` "a container that leaves the snapshot and comes back
  (FS-KE075 §H.48)".
- A container coming into interest after the floor's dressing is planned no longer changes the
  plan; the piece by it gives way (review M1): "should strew a dungeon floor's dressing from its
  map alone, the same whatever containers a member's snapshot holds", "should take a dressing
  piece away for good once a container is seen standing by it, its flame with it".
- The 16 KB AC (review M6) is settled by Nick ("這是網頁遊戲 符合標準就行了") on the
  real-population bench above, and ticked in FS-KE075 with its figures; permessage-deflate is a
  follow-up there.
- Gates: as I-KE075-3 (typecheck and vitest pass; `golangci-lint run` module-wide still fails on
  the 7 pre-existing errcheck findings), so the box stays open.

## Blocked By

I-KE075-3

## Spec Reference

FS-KE075 §G.36–39, §H.48. ADR-0060 Decisions 4–7.

## TDD Approach

- RED: a serializer test with monsters at 1599 and 1601 px from the recipient
- GREEN: the cut and the centres; then a client test that a re-appearing corpse does not play its death clip
