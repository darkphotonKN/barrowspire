---
id: I-Q18Q3-2
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-1]
labels: [blocked]
title: "FS-Q18Q3 slice 2: the tree ability's cost and cooldown on current_player, only while it is held (game-service)"
---
Implements FS-Q18Q3 §A (R4, R5, R6), §WebSocket message surface

## Files it expects to touch

- `game-server/game-service/internal/types/game.go` (`CurrentPlayerState.TreeAbilityCooldown
  *CooldownState`, json `tree_ability_cooldown,omitempty`; `ResourceState.TreeAbilityCost *int`, json
  `tree_ability_cost,omitempty`)
- `game-server/game-service/internal/serializer/state_serializer.go` (`resourceState` adds the cost;
  a `treeAbilityCooldownState(entity)`; both only while the delver holds the tree ability) and its test
- `game-server/game-service/internal/systems/combat.go` (an exported read of the tree ability's
  cost, beside `AttackCost`, if FS-04EEA's slice has not added one; Settle the Debt's least cost, 1)
  and `combat_test.go`

## What to Build

While the character in play holds its class's tree ability (the tier-3 node as FS-8RZ51 seats it, the
hold FS-04EEA R3 checks), send `current_player.tree_ability_cooldown {remaining, total}` by slice 1's
rules and `resource.tree_ability_cost` (whole number; Settle the Debt's is 1, the least it needs).
Both absent while it is not held. A mercenary's tree cooldown is the cut's slot (FS-04EEA R33).
Never on an `other_players` entry's cooldowns; `tree_ability_cost` rides wherever `resource` rides.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-service: the "does not hold … / holds it" criterion
      (absent when not held; both present when held; the costs and totals at FS-04EEA's starting
      values; the merc's cut slot), and no `other_players` entry carries `tree_ability_cooldown`.
- [ ] A test seats a delver without the node (fields absent) and one with it (fields present).
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.

## Blocked By

- I-Q18Q3-1 (the cooldown shape and the kept starting length)
- blocked by FS-04EEA (the tree ability rows, costs and cooldowns, and each class naming its tree
  ability in the class config)
- blocked by FS-8RZ51 (the tier-3 node held on the seated delver)

## Spec Reference

FS-Q18Q3 §A R4–R6 and the WebSocket message surface; User Stories 15, 16, 26, 27.

## TDD Approach

- RED: a serializer test expects no `tree_ability_cooldown` for a warrior without the node, and
  `{10, 10}` with `tree_ability_cost` 40 on the tick an Earthbreaker resolves for one with it.
- GREEN: read the held ability from the delver and serialize the two fields.
