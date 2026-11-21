---
id: I-1J1CB-2
status: open
implements: FS-1J1CB
blocked_by: [I-E1ZDG-2]
labels: [blocked]
title: "FS-1J1CB slice 2: a body draws its spec look, fetched on demand with its base class as stand-in, the player's own look preloaded"
---
Implements FS-1J1CB §C (Requirements 16–27), §I (Requirement 48)

**Lane: agent** (game-client).

**Also blocked by the ADR FS-1J1CB names** (a spec look's art is its own on-demand group, fetched
by a player's specialization; amends ADR-0059 Decision 1 and takes the new trigger ADR-0071
Decision 6 reserves). It has no issue id: the integrator records it with `/record-decision` and
clears this line. Build to FS-1J1CB §C; the ADR records the same rules.

## What to Build

- **The sheet rule** (R17): `characterSheet(playerClass, specialization?)` in
  `src/render/art/animationSelect.ts` returns `char_<base>_<spec>` (FS-1J1CB R15) when the spec is
  one of the class's two and that sheet is in the manifest, else the base sheet. Every caller that
  has a specialization passes it; menus, character creation and party busts keep calling it
  without one (R25).
- **The table** (R26): in `src/render/art/sceneArt.ts`, a `SPEC_LOOK_ART` list, one row per look:
  group `<base>_<spec>`, the class and spec that fetch it, the base class sheet as stand-in
  (untinted). Every look group is scene-scoped and in no `SCENE_ART` set (R18). Extend the coverage
  test: each look's stand-in is on a resident group; a look group missing from the manifest is
  skipped, not an error.
- **The fetch** (R19): on each snapshot in the town, fields and runs, a specialization seen on
  `current_player` or any `other_players` entry whose look group is in the manifest and not held
  is fetched once, through `onDemandArt` (`src/render/art/phaser.ts`). Called off with the scene;
  a failed page leaves the base look with one warning and no retry this scene (R24).
- **The own look preloads** (R20): HubScene, FieldScene and BarrowspireScene `preload()` also
  queue the group of the selected character's specialization, read from `gameStore`'s active
  character (`getActiveCharacter()`, the character read the menu loaded, I-E1ZDG-1), by the world
  itself, never through the UiBridge *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*. Absent: R19 covers it. A scene holding the group keeps it across the
  transition (R23); every other look group is evicted by ADR-0059 as usual.
- **The swap** (R21, R22): one small module (e.g. `src/render/art/specLooks.ts`) that the three
  scenes' player-body code uses: it picks the sheet a body should draw now (look if held, else
  base), and when a look's group lands, or a body's specialization first appears, re-dresses each
  affected body on its own sprite with a new `CharacterAnimator` for the look's sheet, between one
  frame and the next, keeping its facing and its clip's place. Never the placeholder, never
  hidden, no placeholder warning.
- **Memory** (R27): no code; slice 11 measures.

Do not touch `src/ui/abilityIcons.ts` or the menus: the parallel FS-E1ZDG and FS-8RZ51 children
own them.

**Placement (ADR-0086)** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: every piece here stays in the world scenes (bodies follow world
objects, Decision 2.1). Nothing goes in `UIScene` or crosses the UiBridge. The party frames' busts
are drawn by `UIScene` now (`src/ui/PartyFrames.ts`, `partyFramesLayout.ts`); they keep calling
`characterSheet(playerClass)` with no spec (R25) and are not touched, because `UIScene` outlives the
world scenes that hold a spec-look group (ADR-0059 Decision 5).

## Acceptance Criteria

- [ ] `characterSheet("warrior", "berserker")` is `char_knight_berserker` when the manifest has
      it, `char_knight_base` when it does not; a spec of another class, or an unknown id, gives
      the base.
- [ ] A state with no specialized player fetches no look group.
- [ ] A snapshot first listing another player as a Spellwarden fetches `wizard_spellwarden` once;
      that body draws `char_wizard_base` untinted until every page lands, then the look, on the
      same sprite, with no frame drawn without a texture.
- [ ] A world scene entered by a character whose read carries `hunter` queues `archer_hunter` in
      its preload; the own body never draws the base after the load.
- [ ] A page that fails leaves the base look, logs one warning, and is not retried in that scene.
- [ ] Leaving a scene evicts look groups the next scene does not hold, animations first.
- [ ] The coverage test passes with all eight rows, whether or not their sheets are baked.
- [ ] Menus, character creation and party busts still draw the base sheet; nothing under
      `src/ui/` or `src/scenes/UIScene.ts` changes.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.

## Blocked By

I-E1ZDG-2 (`specialization` on `current_player` and `other_players`). The ADR above (no issue id).
Uses I-E1ZDG-1's `specialization` on the character read for R20; if it is not in yet, R20 falls
back to R19 and the criterion on the preload waits for it.

## Spec Reference

FS-1J1CB §C R16–R27; §Acceptance Criteria "On screen"; §Edge States (no spec, not on the wire, not
baked, slow, failed, scene stopped, pick mid-scene, eight looks in town); User Stories 1–3, 20–22,
25, 28. ADR-0059, ADR-0071, ADR-0081.

## Files expected to touch

- `game-client/src/render/art/animationSelect.ts` (+ test)
- `game-client/src/render/art/sceneArt.ts` (+ `sceneArt.test.ts`)
- `game-client/src/render/art/specLooks.ts` (new, + test)
- `game-client/src/render/art/phaser.ts` (if `onDemandArt` needs a player-side entry point)
- `game-client/src/render/art/artLoader.standin.ts` (test fixture, if it needs look groups)
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (player bodies,
  preload)
- `game-client/src/stores/gameStore.ts` (read only: `getActiveCharacter()`; no edit expected)

Not touched: `src/scenes/UIScene.ts`, `src/ui/uiBridge.ts`, `src/ui/PartyFrames.ts`,
`src/ui/partyFramesLayout.ts` *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*

## TDD Approach

- RED: `specLooks.test.ts` with the stand-in loader and a fixture manifest carrying
  `char_knight_berserker` on `knight_berserker`: a snapshot with an `other_players` Berserker
  draws `char_knight_base` and requests `knight_berserker`; after the pages land the same sprite
  plays `char_knight_berserker`'s idle.
- GREEN: the sheet rule, the table rows, the fetch on snapshot, the swap.
