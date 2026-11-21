---
id: I-E1ZDG-1
status: done
implements: FS-E1ZDG
blocked_by: []
labels: [ready-for-agent, blocked]
title: "FS-E1ZDG slice 1: the specialization on the character read, and the title in the menus"
---
Implements FS-E1ZDG §A, §B (Requirements 1–6), §K (Requirements 37–40), §API surface

**Lane: agent** (character-service, common proto, api-gateway, game-client).

**Also blocked by FS-8RZ51 (persisted tree allocations in character-service, and the shared tree
definition that names each class's two tier-6 nodes).** Its issue ids were not minted when this
was written; the integrator adds them to `blocked_by`. This slice reads that allocation and never
builds a second store of the pick.

## What to Build

- **character-service** derives a character's specialization from its allocated tier-6 node via
  FS-8RZ51's tree definition (§B.4): one of `guardian`, `berserker`, `spellwarden`, `pyromancer`,
  `hunter`, `shadow_ranger`, `duelist`, `sellsword`, or none. Never stored on its own. The
  derivation is business logic in the service; any SQL stays in the repository.
- **`character.proto`**: `Character` gains `optional string specialization = 10;` *(integrator
  correction 2026-11-21 — reason: field 9 is FS-8RZ51's `passive_ranks`)*, set on
  `GetCharacter`, `ListCharacters` and `CreateCharacter` (always unset on a new one). Regenerate
  with `make gen` in `game-server/common`; never hand-edit the Go.
- **api-gateway**: `Character` in `wire.go` gains `Specialization *string
  json:"specialization,omitempty"` with the eight-value enum and a doc string; `characterFromProto`
  maps it. `CharacterCreate` is unchanged. Regenerate with `make openapi client`; commit
  `openapi.yaml` and `game-client/src/api/generated/` with it.
- **game-client**:
  - `roster.ts`'s `Character` gains `specialization?`, mapped in `fromServer`.
  - A small data module names each spec (display names, §A.1) and builds the title
    ("Warrior · Berserker", §K.37); an unknown id yields no title.
  - `classLore.ts` loses its `title` field and every reader of it (§K.38).
  - Character creation shows the class name alone (§K.39).
  - The main menu hero and the character list show the title where there is one, else the class
    name, beside the level (§K.40).

## Acceptance Criteria

- [ ] With no tier-6 node allocated, `GetCharacter`, `ListCharacters`, `get-character` and
      `list-my-characters` carry no `specialization`.
- [ ] With a spec node allocated, all four carry its id.
- [ ] `create-character` returns no `specialization`.
- [ ] The generated Go, `openapi.yaml` and `game-client/src/api/generated/` are regenerated, not
      hand-edited; the contract change is additive (oasdiff reports no break).
- [ ] `classLore` has no `title`; IRON GUARDIAN, ARCANE MASTER, OATHLESS BLADE and the SHADOW
      RANGER title appear on no screen.
- [ ] Character creation shows the class name alone.
- [ ] Main menu hero and character list: "WARRIOR · BERSERKER • LV.20" for a Berserker, "WARRIOR •
      LV.5" for a warrior with none.
- [ ] `make test` in character-service and api-gateway; `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` in game-client.

## Blocked By

FS-8RZ51 (persisted tier-6 allocation and the shared tree definition). No issue of this FS.

## Spec Reference

FS-E1ZDG §A R1–3; §B R4–6; §K R37–40; §API surface; §Acceptance Criteria "Derivation and wire" rows
1–5, "Client" rows 1–3; User Stories 1–6, 31–32.

## Files expected to touch

- `game-server/character-service/internal/character/{model,service,repository,handler}.go` and
  their tests (derivation; the read of FS-8RZ51's allocations)
- `game-server/common/api/proto/character/character.proto`, `character.pb.go` (generated)
- `game-server/api-gateway/internal/gateway/character/wire.go`, `typed_test.go`
- `game-server/api-gateway/openapi.yaml` (generated), `game-client/src/api/generated/schema.d.ts`
  (generated)
- `game-client/src/characters/roster.ts` (+ test)
- `game-client/src/data/specializations.ts` (new, + test)
- `game-client/src/data/classLore.ts`, `classLore.test.ts`
- `game-client/src/scenes/CharacterCreationScene.ts`, `MainMenuScene.ts`

## TDD Approach

- RED: character-service service test: a character whose allocations include the warrior's
  Berserker node reads `specialization: "berserker"`; one with no tier-6 node reads none.
- GREEN: the derivation over FS-8RZ51's tree definition, then the proto and gateway mapping.
- RED (client): `title("warrior", "berserker")` is "Warrior · Berserker"; with no spec, none.
