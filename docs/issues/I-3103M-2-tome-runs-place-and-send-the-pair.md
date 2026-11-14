---
id: I-3103M-2
status: done
implements: FS-3103M
blocked_by: []
labels: []
title: "FS-3103M slice 2: tome runs place the tome and the altar, and send them"
---
Implements FS-3103M §B, §C, §E

**Hotspot:** one writer at a time on `session.go` and `dungeon_floor.go`. Never touch
`internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract change (the WS
state is outside OpenAPI), no kill or match stats.

## Files expected

- new `game-server/game-service/internal/components/tome.go` (the run-level `TomePlanComponent`: tome floor, altar floor, carried, burned; `TomeComponent`, `AltarComponent` markers)
- `game-server/game-service/internal/ecs/entity.go` (three component types)
- new `game-server/game-service/internal/game/tome.go` (`rollTomePlan`, placement, factories, the session's plan accessor)
- `game-server/game-service/internal/game/monster_tuning.go` (`TomeRunChance = 0.02`, beside the spawn rates)
- `game-server/game-service/internal/game/session.go` (`InitialSystems`: roll the plan beside `rollSpireHeight`, on the run-level entity; nothing else)
- `game-server/game-service/internal/game/dungeon_floor.go` (`layDungeon`: place the tome or altar after the containers)
- `game-server/game-service/internal/types/game.go` (`TomeState`, `AltarState`), `internal/types/messages.go` (`ClientGameState` / `BackendGameState` keys `tome`, `altar`, `tome_carried`)
- `game-server/game-service/internal/serializer/state_serializer.go` (collect; cut `tome` like containers; `altar` whole)
- Tests: new `tome_test.go` in `internal/game`, a new serializer test

## What to Build

At run creation, a tome plan on 2% of runs (R5): tome floor uniform in [1, height - 2], altar floor
in [tome + 1, height - 1] (R6), held on the run-level entity so it survives floor changes (R7).
Each floor build places the tome on its floor and the altar on its floor (whether or not the tome
was taken) in a random non-start room, after the containers, as a container is placed (R8, R9). A
floor of buildings places neither and logs a warning (R10). The broadcast carries `tome` (cut by
the interest radius as containers are), `altar` with `burned: false`, and `tome_carried` (always
absent in this slice until I-3103M-3 sets it), all absent elsewhere (R14). No key or reply names
the tome's floor, the altar's floor or the height (R15). Interact on these entities is not wired
yet (I-3103M-3); `handleInteract` keeps refusing an unknown kind as today.

Keep the roll apart from setting the plan on the run-level entity: FS-BDRTJ's endgame test run
(I-BDRTJ-4) sets the plan directly, with fixed floors, in place of the roll.

## Acceptance Criteria

- [ ] `TomeRunChance` 1 gives every run a plan, 0 none; over many seeded runs at 0.02 the share is about 2%.
- [ ] Over many seeded plans at heights 3-10 the floors are always in range; height 3 always gives 1 and 2.
- [ ] A forced tome run: the tome floor has exactly one tome, the altar floor exactly one altar, each in a non-start room, off doorways, overlapping nothing; other floors have neither.
- [ ] A forced fallback floor places neither and logs a warning.
- [ ] Serializer: `tome` only within the interest cut on its floor; `altar` to every recipient on its floor with `burned: false`; none of the three in the hub, a field or a run floor without them; no height-derived field anywhere.
- [ ] `make test` (and `make lint`, `make check`) green in game-service.

## Blocked By

None. Blocks I-3103M-3.

## Spec Reference

FS-3103M §B R5-R7, §C R8-R11, §E R14-R15; user stories 2, 3, 5, 19, 22, 24.

## TDD Approach

- RED: `rollTomePlan` with a source forcing the chance and height 3 returns tome 1, altar 2.
- GREEN: the plan roll, then placement, then the serializer keys, each test-first.
