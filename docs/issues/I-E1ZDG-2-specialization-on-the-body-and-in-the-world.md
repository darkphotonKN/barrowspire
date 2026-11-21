---
id: I-E1ZDG-2
status: open
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-1]
labels: [ready-for-agent, blocked]
title: "FS-E1ZDG slice 2: the body carries its specialization, the world state sends it, titles show in every world, and Heavy Shot"
---
Implements FS-E1ZDG §B (Requirements 7–10), §K (Requirements 41–42), §L (Requirement 43)

**Lane: agent** (game-service, game-client).

**Also blocked by FS-8RZ51 (the in-town spend applied to the character in play).** Its issue id
was not minted when this was written; the integrator adds it to `blocked_by`. This slice hooks
the tier-6 spend FS-8RZ51 applies; it does not build the spend.

## What to Build

- **game-service**
  - A `Specialization` type with the eight ids (and none), on the player entity (beside `Class`).
    The foundation every effect slice (I-E1ZDG-3 … 10) reads.
  - `types.CharacterInPlay` gains it; `grpc/character/client.go` maps the proto's optional field.
    `buildBodyLocked` seats it. An id the service does not know, or one of another class, seats
    as none with a `slog` warning (§B.10). Nothing a client sends sets it.
  - When FS-8RZ51 applies a tier-6 spend to the character in play in town, the body gains the
    specialization on that tick (§B.8). Expose one seam (e.g. `gainSpecialization(entity, spec)`)
    that later slices hook for what happens at the pick (the Berserker's clamp, the Sellsword's
    max).
  - `PublicPlayerState` gains `Specialization string json:"specialization,omitempty"`, so
    `current_player` and every `other_players` entry carry it (§B.9).
- **game-client**
  - `PublicPlayerState` in `types/gameState.ts` gains `specialization?`.
  - **Nameplates** in the town, fields and runs: a second, smaller title line under the name for
    every player with a spec, own and others' (§K.41).
  - **Stats panel header** (`characterSheet()` / the gear overlay) shows the title in place of the
    class name.
  - **Party frames** show a member's title on rows the state carries (own row always; a teammate's
    while in this world), as the level rule (FS-CH21F R10).
  - Chat, whispers, the party panel, invites and the settlement record are untouched (§K.42).
  - **Heavy Shot** (§L.43): the archer's right-click is named "Heavy Shot" unless the player is a
    Shadow Ranger, whose is "Shadow Shot", on the ability card and the controls help line. The
    copy lookup takes class and spec. Skill id stays `shadow_shot`.

## Acceptance Criteria

- [ ] A character read with `berserker` seats a body whose state shows `specialization:
      "berserker"` on `current_player` and on that player's `other_players` entry for others.
- [ ] A character with none: the field is absent on both.
- [ ] An unknown id, or `pyromancer` on a warrior, seats as none and logs a warning.
- [ ] After FS-8RZ51's tier-6 spend in town, the next state carries the spec.
- [ ] No `cast_skill`, `move` or other client message changes a body's spec.
- [ ] Every nameplate of a player with a spec shows the title line; one without has none.
- [ ] The stats panel header shows "Warrior · Berserker" for a Berserker, "Warrior" for none.
- [ ] The party frame shows the title on the own row and on a same-world teammate's row, not on a
      teammate's row elsewhere.
- [ ] An unspecialized archer and a Hunter see "Heavy Shot"; a Shadow Ranger sees "Shadow Shot".
- [ ] `make test` in game-service; `npm test`, `npm run lint`, `npm run lint:fence`,
      `npx tsc --noEmit` in game-client.

## Blocked By

I-E1ZDG-1 (the proto field). FS-8RZ51 (the in-town spend applied to the character in play).

## Spec Reference

FS-E1ZDG §B R7–10; §K R41–42; §L R43; §Acceptance Criteria "Derivation and wire" rows 6–9,
"Client" rows 4–6; §Edge States (unknown spec, other class, teammate elsewhere); User Stories 3,
7, 23, 32–33.

## Files expected to touch

- `game-server/game-service/internal/components/player.go` (or a new `components/specialization.go`)
- `game-server/game-service/internal/types/game.go` (`CharacterInPlay`, `PublicPlayerState`)
- `game-server/game-service/grpc/character/client.go`
- `game-server/game-service/internal/game/session.go` (`buildBodyLocked`), `factory.go`
  (`PlayerConfig`), and the FS-8RZ51 spend path
- `game-server/game-service/internal/serializer/state_serializer.go`, a new
  `serializer/specialization_test.go`
- `game-server/game-service/internal/game/character_seat_test.go`
- `game-client/src/types/gameState.ts`
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (nameplates, help
  line)
- `game-client/src/ui/characterSheet.ts`, `GearOverlay.ts`, `partyFramesLayout.ts`,
  `PartyFrames.ts`, `abilityCopy.ts`, `abilityCard.ts` (+ tests)

## TDD Approach

- RED: seat a warrior whose character read carries `berserker`; serialize; expect
  `"specialization":"berserker"` on the own entry and on a second player's `other_players` entry.
- GREEN: the field through `CharacterInPlay` → `PlayerComponent` → `PublicPlayerState`.
- RED (client): `abilityCopy("archer", undefined).name` is "Heavy Shot"; with `shadow_ranger`,
  "Shadow Shot".
