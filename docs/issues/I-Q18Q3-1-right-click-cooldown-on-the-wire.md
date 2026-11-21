---
id: I-Q18Q3-1
status: open
implements: FS-Q18Q3
blocked_by: []
labels: [ready-for-agent]
title: "FS-Q18Q3 slice 1: the right-click ability's cooldown on current_player, the merc's as the whiff lockout (game-service, client types)"
---
Implements FS-Q18Q3 §A (R1–R3, R6, R7), §WebSocket message surface

## Files it expects to touch

- `game-server/game-service/internal/components/attack.go` (`CooldownComponent` keeps each running
  cooldown's starting length beside its remaining time)
- `game-server/game-service/internal/systems/combat.go` (set the starting length where a cooldown
  starts; `tickCooldowns` clears both; the whiff lockout's starting length where the stance closes on
  nothing, ~line 578) and `combat_test.go`
- `game-server/game-service/internal/components/` parry component file if the lockout's starting
  length is kept there
- `game-server/game-service/internal/types/game.go` (`CooldownState {Remaining, Total float64}`, json
  `remaining` / `total`; `CurrentPlayerState.AbilityCooldown`, json `ability_cooldown`)
- `game-server/game-service/internal/serializer/state_serializer.go` (an `abilityCooldownState(entity)`
  beside `resourceState`, own frame only) and its test
- `game-client/src/types/gameState.ts` (`CooldownState`; optional `ability_cooldown`,
  `tree_ability_cooldown` on the own player, optional `tree_ability_cost` on `ResourceState`; typed now
  so later slices only read them)

## What to Build

Put the delver's right-click ability's cooldown on their own state. `current_player.ability_cooldown`
is `{remaining, total}` in float seconds for `AbilityComponent.Kind`: the seconds left and the length
that cooldown started at (worn attack speed applied), `{0, 0}` when nothing runs. Keep the starting
length on the server so `total` never changes while a cooldown runs. For a delver whose ability is
`parry`, report the whiff lockout instead (remaining = `LockoutRemaining`, total = the length it
started at). Sent in every world whenever the delver has an ability; never on an `other_players`
entry. No inbound change.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-service: the first three criteria (ready `{0, 0}`; a dash
      reads total 0.4 falling to `{0, 0}`; Shadow Shot 1.2; attack speed +50 % gives 0.4 / 1.5 and a
      gear swap mid-cooldown leaves `total` unchanged; the merc's whiff lockout), the
      `other_players` criterion, and "a refused cast starts no cooldown on the wire".
- [ ] Table tests in `combat_test.go` for the starting length; serializer tests for the field's
      presence and absence.
- [ ] `go test -race ./...` green in game-service; `golangci-lint run` clean.
- [ ] Client types compile (`npx tsc --noEmit`); nothing in the client reads the fields yet.

## Blocked By

None

## Spec Reference

FS-Q18Q3 §A R1–R3, R6, R7 and the WebSocket message surface; User Stories 7, 8, 11, 25, 26.

## TDD Approach

- RED: a serializer test expects a warrior's `ability_cooldown` to be `{0.4, 0.4}` on the tick a dash
  resolves and `{0, 0}` once it has run out.
- GREEN: keep the starting length in `CooldownComponent` and serialize both.
