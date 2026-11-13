---
id: I-3103M-3
status: open
implements: FS-3103M
blocked_by: [I-3103M-2]
labels: [ready-for-agent]
title: "FS-3103M slice 3: taking the tome, and the altar without it"
---
Implements FS-3103M §D, §E, §F

**Hotspot:** `session.go` (`handleInteract`); one writer at a time. Never touch
`internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract change, no kill or
match stats.

## Files expected

- `game-server/game-service/internal/game/session.go` (`handleInteract`: recognise the tome and the altar, call into `tome.go`; nothing else)
- `game-server/game-service/internal/game/tome.go` (`takeTome`, `reachAltar` without the tome; reason constants `tome_taken`, `altar_without_tome`)
- `game-server/game-service/internal/serializer/state_serializer.go` (`tome_carried` from the plan)
- Tests: `tome_test.go`, a serializer test

## What to Build

Interact on the tome, in range, by any in-play delver, removes the tome entity and records on the
plan that the party carries it (R12): run-level state, no bag slot, never extracted. The taker
alone gets the interact reply `success: true`, `reason: "tome_taken"` (R13). `tome_carried: true`
rides the broadcast while carried (R14). Interact on the altar while the party does not carry the
tome is refused through `sendRefusalToPlayer` with `reason: "altar_without_tome"`, the altar's
interact hold released as any refusal's is (R16). The carried altar path (the burn) is I-3103M-4:
in this slice a carried reach is refused like a cold one so nothing half-built ships.

## Acceptance Criteria

- [ ] Interact on the tome in range: tome gone, plan carried, reply `tome_taken` to the taker only; out of range refused as any interactable.
- [ ] Two takes in one tick: the second finds no entity and is refused as a vanished target.
- [ ] `tome_carried: true` on the broadcast after the take, on every later floor; absent before.
- [ ] The taker dying or escaping leaves the plan carried.
- [ ] Interact on the altar without the tome replies `altar_without_tome`, changes nothing, and the altar can be reached again at once.
- [ ] `make test` (and `make lint`, `make check`) green in game-service.

## Blocked By

I-3103M-2. Blocks I-3103M-4, I-3103M-7.

## Spec Reference

FS-3103M §D R12-R13, §E R14, §F R16; user stories 4, 14, 15, 16, 17.

## TDD Approach

- RED: in a forced tome run, interact on the tome from in range; the plan reads carried and the reply carries `tome_taken`.
- GREEN: the tome branch in `handleInteract`, then the altar refusal.
