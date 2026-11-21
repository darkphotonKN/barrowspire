---
id: I-E1ZDG-2
status: done
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-1]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 2: the body is its specialization, the world state sends it, titles show in every world, and Heavy Shot"
---
Implements FS-E1ZDG §B (Requirements 7–10), §K (Requirements 41–42), §L (Requirement 43)

**Lane: agent** (common/passivetree, character-service, game-service, game-client).

> *Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.* The
> body's ranks already arrive from FS-8RZ51's built slices (I-8RZ51-3: `systems.PassiveRanks`,
> `RaisePassiveRanks`), so game-service derives the specialization from them instead of storing a
> copy, and the client half now splits into world drawing (nameplates, the run's controls panel)
> and UI-scene pieces fed through the UiBridge (party frames, the character sheet, the ability
> bar's tooltip copy). The ability card no longer exists.

**Also blocked by FS-Q18Q3 (the ability bar's square tooltips, I-Q18Q3-5)** for the tooltip half
of Heavy Shot; the copy row lands in `ui/abilityCopy.ts` either way. The integrator resolves the id.

## What to Build

- **One table, shared** (§B.7): `common/passivetree` gains the tier-6-node-to-specialization
  lookup (e.g. `SpecializationOf(class string, ranks Ranks) (string, bool)`), and the eight ids.
  character-service's private `specializations` map and `withSpecialization`
  (`internal/character/service.go`) call it instead, with its tests unchanged.
- **game-service**
  - A body's specialization is `passivetree.SpecializationOf(class, systems.PassiveRanks(entity))`,
    exposed as one systems helper (e.g. `systems.Specialization(entity)`), the read every effect
    slice (I-E1ZDG-3 … 10) uses. No specialization field is stored; nothing a client sends sets
    one; ranks naming no tier-6 node of the class give none (§B.10).
  - **The pick** (§B.8): in `Session.RaisePassiveRanks`, when the raise takes the body from no
    specialization to one, call one seam (e.g. `gainedSpecialization(entity, spec)`) that later
    slices hook for the pick's one-off changes (the Berserker's clamp, I-E1ZDG-4; the Sellsword's
    max, I-E1ZDG-10). Empty in this slice.
  - `PublicPlayerState` gains `Specialization string json:"specialization,omitempty"`, filled by
    the serializer from the body, so `current_player` and every `other_players` entry carry it
    (§B.9).
- **game-client**
  - `PublicPlayerState` in `types/gameState.ts` gains `specialization?`.
  - **Nameplates: world drawing** (ADR-0086 2.1). `HubScene`, `FieldScene` and `BarrowspireScene`
    each draw a second, smaller title line under every player's name over their figure, own and
    others'. A small shared helper (beside the title builder of I-E1ZDG-1,
    `data/specializations.ts`) gives the line, so the three worlds draw one rule.
  - **Party frames: UI scene** (ADR-0086 2.1). `SeenPlayer` (`ui/partyFramesLayout.ts`) picks
    `specialization` too, so the `partySeen(state)` each world already sends carries it; the frame
    row gains the title on rows the state carries (own row always; a teammate's while in this
    world), as the level rule (FS-CH21F R10). `ui/PartyFrames.ts` draws it.
  - **Stats panel header: UI scene.** `CharacterSource` (`ui/characterSheet.ts`) picks
    `specialization`, so the `character` in each world's `gear({ kind: "seen" })` carries it;
    `characterSheet()` returns the title as the header's class line, and `GearOverlay` draws it.
  - No new bridge request or call: the UI scene reads only the data the worlds hand it (ADR-0086
    Decision 3).
  - **Heavy Shot** (§L.43): `ui/abilityCopy.ts`'s lookup takes class and specialization; the
    archer's row is "Heavy Shot" unless the specialization is `shadow_ranger` ("Shadow Shot"). The
    world's `AbilityBarView` (`ui/abilityBarView.ts`) carries the specialization beside the class
    as the copy key, so the UI scene's right-click tooltip reads the right row. The run's controls
    panel (`ui/controlsPanel.ts`, world) reads the same lookup. Skill id stays `shadow_shot`.
  - Chat, whispers, the party panel, invites and the settlement record are untouched (§K.42).

## Acceptance Criteria

- [ ] A warrior body whose ranks hold `warrior.t6b` serializes `specialization: "berserker"` on
      `current_player` and on that player's `other_players` entry for others; with no tier-6 node,
      the field is absent on both.
- [ ] Ranks holding another class's tier-6 node, or an unknown node, give no specialization; the
      seat goes ahead.
- [ ] character-service and game-service read one table in `common/passivetree`; character-service's
      existing specialization tests pass unchanged.
- [ ] After `RaisePassiveRanks` raises a tier-6 node in town, the next state carries the spec and
      the pick seam ran once; a second raise of other nodes does not run it again.
- [ ] No client message sets or changes a body's spec.
- [ ] Every nameplate of a player with a spec shows the title line in the town, fields and runs;
      one without has none.
- [ ] The stats panel header shows "Warrior · Berserker" for a Berserker, "Warrior" for none, from
      the `gear` "seen" message.
- [ ] The party frame shows the title on the own row and a same-world teammate's row, not on a
      teammate's row elsewhere, from `partySeen`.
- [ ] No UI-scene piece reads a world scene's fields (the bridge's plain data only).
- [ ] An unspecialized archer and a Hunter get "Heavy Shot" from the copy lookup and in the
      controls panel; a Shadow Ranger gets "Shadow Shot"; with I-Q18Q3-5 in, the right-click
      tooltip shows the same.
- [ ] `make test` in common, character-service and game-service; `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` in game-client.

## Blocked By

I-E1ZDG-1 (built: the derivation in character-service, the proto field). FS-8RZ51's I-8RZ51-3
(built: ranks on the body, `RaisePassiveRanks`). FS-Q18Q3 (square tooltips, I-Q18Q3-5) for the
tooltip half only.

## Spec Reference

FS-E1ZDG §B R7–10; §K R41–42; §L R43; §Acceptance Criteria "Derivation and wire" rows 6–9,
"Client" rows 4–6; §Edge States (unknown or other-class node, teammate elsewhere); User Stories 3,
7, 23, 32–33.

## Files expected to touch

- `game-server/common/passivetree/tree.go` (or a new `specialization.go`), `passivetree_test.go`
- `game-server/character-service/internal/character/service.go` (call the shared table)
- `game-server/game-service/internal/systems/passive_ranks.go` (or a new `systems/specialization.go`)
- `game-server/game-service/internal/game/session.go` (`RaisePassiveRanks`: the pick seam),
  `game/passive_ranks_test.go`
- `game-server/game-service/internal/types/game.go` (`PublicPlayerState`)
- `game-server/game-service/internal/serializer/state_serializer.go`, a new
  `serializer/specialization_test.go`
- `game-client/src/types/gameState.ts`
- `game-client/src/data/specializations.ts` (the nameplate line helper, + test)
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (nameplates only)
- `game-client/src/ui/partyFramesLayout.ts`, `PartyFrames.ts` (+ tests)
- `game-client/src/ui/characterSheet.ts`, `GearOverlay.ts` (+ tests)
- `game-client/src/ui/abilityCopy.ts`, `abilityBarView.ts`, `controlsPanel.ts` (+ tests)

## TDD Approach

- RED: `passivetree.SpecializationOf("warrior", Ranks{"warrior.t6b": 1})` is `berserker`; with
  `mage.t6a`, none.
- GREEN: the table moved from character-service into the shared package.
- RED: serialize a body with `warrior.t6b` held; expect `"specialization":"berserker"` on the own
  entry and on a second player's `other_players` entry.
- RED (client): `partyFrameRows` with a `specialization` on `current_player` puts the title on the
  own row; the copy lookup gives "Heavy Shot" for `("archer", undefined)` and "Shadow Shot" for
  `("archer", "shadow_ranger")`.
