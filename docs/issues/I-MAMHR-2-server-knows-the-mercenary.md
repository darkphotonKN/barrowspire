---
id: I-MAMHR-2
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-1]
labels: [blocked]
title: "FS-MAMHR slice 2: a mercenary can be created and is seated in a run as one"
---
Implements FS-MAMHR §A (Requirements 1–5), §API surface

**Lane: agent** (game-service, character-service, api-gateway).

## What to Build

End to end on the server: `POST /api/characters` with `class: "mercenary"` succeeds, and that
character enters a run as a mercenary.

- **game-service class row (R2).** `Classes["mercenary"]` in `internal/game/session.go`: STR 7,
  AGI 7, INT 2, VIT 7; HP 130/130; Attack 12, Defense 7, AttackSpeed 1.2, AttackRange 1; growth
  STR +1, AGI +2, MaxHealth +10 and nothing else; starting skill `cut`; class resource **parry
  charges** (FS-8AY7S's kind, max 3, no regen, starting 0). No mana, no stamina.
- **No fallback (R3).** A `mercenary` character in play is seated as a mercenary, never through the
  unknown-class fallback to `mage`. The game-service row must land in the same change as, or
  before, the allowlist below.
- **character-service (R4).** `classes` in `internal/character/service.go` gains `mercenary`. No
  migration (`class_id` is `VARCHAR(32)`).
- **api-gateway (R5).** The class doc strings on `CharacterCreate.Class` and `Character.Class` in
  `internal/gateway/character/wire.go` name the four classes. Then `make openapi && make client`;
  commit `wire.go`, `openapi.yaml` and `game-client/src/api/generated/` together. Never hand-edit
  the generated files.

## Acceptance Criteria

- [ ] character-service test: creating a `mercenary` succeeds; an unknown class is still refused
      (`400 · VALIDATION_FAILED` through the gateway).
- [ ] game-service test: a mercenary character in play is seated with the §A.2 stats, HP, combat,
      0 of 3 parry charges, and no mana or stamina component.
- [ ] game-service test: a level-up adds STR +1, AGI +2, MaxHealth +10 only.
- [ ] `openapi.yaml` and the generated client are regenerated, not hand-edited, and diff only in the
      class descriptions.
- [ ] No new migration.
- [ ] `go test ./...` and lint pass in game-service, character-service and api-gateway.

## Blocked By

- I-MAMHR-1 (the class's starting skill is the cut).
- **FS-8AY7S: the generic class resource component and its parry-charge kind (max 3, no regen)**,
  and the class config shape that replaces `ClassConfig.Mana`. The merc's row is written against it.

## Spec Reference

FS-MAMHR §A Requirements 1–5; §API surface; §Acceptance Criteria "Class and creation" rows 1–5;
User Stories 1, 30.

## Files expected

- `game-server/game-service/internal/game/session.go` (`Classes`)
- `game-server/game-service/internal/game/factory.go` (only if the class config needs the resource kind wired)
- game-service tests next to them (seat and level-up)
- `game-server/character-service/internal/character/service.go`, `service_test.go`
- `game-server/api-gateway/internal/gateway/character/wire.go`
- `game-server/api-gateway/openapi.yaml` (generated)
- `game-client/src/api/generated/` (generated)

## TDD Approach

- RED: seating a `mercenary` character in play yields a delver whose class is `mercenary` with
  HP 130 and STR 7 (today it falls back to mage).
- GREEN: the class row; then the allowlist and doc strings.
