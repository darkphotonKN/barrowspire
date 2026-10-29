---
id: I-8AY7S-3
status: done
implements: FS-8AY7S
blocked_by: [I-8AY7S-1]
labels: [ready-for-agent]
title: "FS-8AY7S slice 3: the resource goes to its owner only, on current_player"
---
Implements FS-8AY7S §Requirements 16–19, §WebSocket message surface

**Author: agent**

## What to Build

game-service only. Change the state broadcast so each delver is told their own resource and
nobody else's.

- `types.PlayerState` loses `CurrentMana` / `MaxMana` (`current_mana`, `max_mana`).
- `current_player` gains `resource`: `{kind, current, max, ability_cost}`, whole numbers,
  `current` rounded **down**; `ability_cost` is the cost of the class's ability (named in its
  class config by slice 1) in that pool. Omitted from JSON when absent.
- `other_players` never carry `resource`. Health fields are unchanged for everyone.
- `BackendGameState.Players` holds one `PlayerState` per delver and `FormatStateToClientState`
  picks the recipient's out; the trim has to happen so that one recipient's `resource` can never
  leak into another's `other_players` (e.g. keep the resource beside the state and attach it only
  to the recipient's copy; never mutate the shared struct per recipient).
- Sent in the hub too, and to a resolved (dead, escaped, left-behind) delver's `current_player`.

## Acceptance Criteria

- [ ] A run of two: each recipient's `current_player.resource` is their own (warrior
      `{stamina, 100, 100, 25}`, mage `{mana, 150, 150, 15}` at seat); neither recipient's
      `other_players` entry carries `resource`.
- [ ] No `current_mana` / `max_mana` key appears anywhere in the serialized broadcast.
- [ ] A pool at 24.9 serializes `current: 24`.
- [ ] Archer `ability_cost` is 10 (until FS-JTNPR switches the archer's ability).
- [ ] A left-behind delver's `current_player` carries `resource`.
- [ ] Hub broadcast: `current_player.resource` present.
- [ ] `current_health` / `max_health` unchanged for current and other players.
- [ ] `state_serializer_bench_test.go` still runs; no per-recipient allocation regression beyond
      the one small struct.
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

## Blocked By

I-8AY7S-1 (the resource component and each class's named ability).

## Spec Reference

FS-8AY7S §Requirements 16–19; §WebSocket message surface; §User Stories 22, 25, 26; §Edge States
"Fractional pool on the wire", "Spectating", "Reconnect".

## TDD Approach

- RED: `internal/serializer/resource_test.go` (new), on the existing serializer test harness
  (`progression_test.go` builds players the same way): two delvers, assert each recipient's
  shape and the absence on others, marshalled to JSON.
- GREEN: the type change and the per-recipient attach.

## Files expected to touch

`game-server/game-service/internal/types/game.go`, `internal/types/messages.go` (only if the
resource type lives there), `internal/serializer/state_serializer.go`,
`internal/serializer/resource_test.go` (new), any serializer test asserting mana fields
(`internal/serializer/*_test.go`), `internal/systems/combat.go` (exported cost lookup for the
serializer, if needed).
