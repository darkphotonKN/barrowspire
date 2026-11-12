---
id: I-JS7C8-11
status: done
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 11: characters face their movement again, nothing about facing is sent, and an attacking class steps back in backpedal_attack when moving more than 90° from its aim (game-client)"
---
Implements FS-JS7C8 §A (R4, R6), §B (R9, R11, R13, R45), §D (R22, R24), §E (R47), §Acceptance Criteria "Run and the backward step" (choice boxes), "Facing" (client boxes)

**Lane: agent.** game-client only. Undoes the pointer facing of I-JS7C8-3 and all of I-JS7C8-4
(superseded by the owner's change of 2026-11-12) and reworks the clip choice. Until a sheet
carries `backpedal_attack` (I-JS7C8-12), an attacking class plays `walk_attack` at any angle
(R11), so the visible change of this slice is the figure turning to its movement again and running
that way.

## What to Build

1. **Facing from movement.** Remove the pointer facing: `src/render/art/pointerFacing.ts` (+ test)
   and its use in `BarrowspireScene`, `FieldScene` and `HubScene`; `CharacterMotion.face` /
   `CharacterAnimator.face` and `selectAnimation`'s `face` go. The local player and every other
   figure face their drawn movement; standing keeps the last facing; an attack faces its aim; death
   and the Shadow Shot hold as today (R22, R24).
2. **Nothing sent or read about facing.** Remove `src/scenes/faceWire.ts` (+ test) and every
   `FaceSender` call, `face` / `FacePayload` from `ActionMap` (`src/assets/types/client.ts`),
   `facing?` from `PublicPlayerState` (`src/types/gameState.ts`), and the scenes' turn of another
   player to `wireFacing` (R47).
3. **Clip choice** (`selectAnimation`, `src/render/art/animationSelect.ts`):
   - moving, not attacking, sheet has `run`: `run` at `speed / RUN_PACE`, turned to the movement
     (R4); without `run`, `walk` as today. No standalone `backpedal` is ever chosen (R45):
     `backpedal` leaves `CharacterAnimation`, `SheetClips` and the stride set, and
     `BACKPEDAL_PACE` leaves the client (the bake keeps measuring the legs, I-JS7C8-12).
   - attacking while moving (not a charge): the attack's facing is the aim's 8-way facing, as
     today. If the sheet carries `backpedal_attack` and the movement is more than 90° from that
     facing (`movesAwayFrom`), `backpedal_attack`; else `walk_attack` (R9, R11). Both at their
     authored rate, turned to the aim.
   - `CharacterAnimation` gains `backpedal_attack`; `CharacterAnimator` learns whether the sheet
     carries it.
4. **Swaps** (`CharacterAnimator.show`): `backpedal_attack` joins the swing clips, so
   `walk_attack` ↔ `backpedal_attack` (and either ↔ `attack`) mid-swing carries the frame index;
   a new swing still starts at frame 0 (R13).
5. `game-client/docs/design-guideline.md` "Eight facings": a character faces its movement (the
   velocity the client already renders), never the pointer; an attack faces its aim (R41, the
   facing half).

## Acceptance Criteria

- [x] Moving the pointer never turns the local character, standing or moving, in the town, a field
      and a run; it faces its movement and keeps it standing.
- [x] Another player's figure faces its movement; nothing reads a `facing` from the state.
- [x] No `face` message is ever sent; `pointerFacing.ts` and `faceWire.ts` are gone, and
      `ActionMap` and `PublicPlayerState` are as main has them for facing.
- [x] With a test sheet carrying `walk_attack` and `backpedal_attack`: attacking while moving at
      more than 90° from the aim plays `backpedal_attack`, at exactly 90° and below `walk_attack`,
      both turned to the aim, at time scale 1; with `walk_attack` only, `walk_attack` at any angle.
- [x] A `walk_attack` ↔ `backpedal_attack` swap mid-swing keeps the frame index; a new swing starts
      at frame 0; a charge plays `attack` whole.
- [x] Moving without attacking never plays a backward step; with `run` it runs turned to its
      movement at `speed / RUN_PACE`.
- [x] Hub folk, monsters and the menu figures choose exactly as before.
- [x] `npx vitest run --maxWorkers=4 --minWorkers=1`, `tsc` and the lint are green.

## Outcome (2026-11-12)

Done: tests `2fab7494` (seen red: 15 vitest failures and both `@ts-expect-error` absence checks
unused under tsc), change `c6489c1b`. Every box above is met:

- pointer: `pointerFacing.ts` is gone and nothing calls a `face` on an animator
  (`character.test.ts` "facing its movement", the three scenes' "facing from movement" tests);
- others: the scenes step every figure from its drawn position and keep no `wireFacing`;
- wire: no `face` is sent in the run, field or town; `faceWire.ts` is gone; `ActionMap` and
  `PublicPlayerState` equal the merge base (`client.test.ts`, `gameState.test.ts`, by tsc);
- choice and swaps: `animationSelect.test.ts` and `character.test.ts` "the run and the backward
  step while attacking" (over 90°, exactly 90°, a sheet without `backpedal_attack`, a charge, the
  `walk_attack` ↔ `backpedal_attack` ↔ `attack` frame carry, a new swing at frame 0);
- folk, monsters and the menu figures: the existing suites are unchanged and green;
- whole client vitest (260 files, 6952 tests), `tsc --noEmit -p .` and `npm run lint` green
  (the lint's one warning, `NotificationBell.tsx`, predates this slice).

Left for I-JS7C8-12 (the bake): `manifest.test.ts` still names the archer's `backpedal` (the
committed sheet carries it until the re-bake), the guideline's clip list still names `backpedal`
and one `walk_attack` cycle, and `BACKPEDAL_PACE` stays exported, unused by the client, while
`tools/bake/page/characters/clips.test.mjs` imports it.

## Blocked By

None (blocks I-JS7C8-10: the client stops sending `face` before the server stops accepting it).

## Spec Reference

FS-JS7C8 §A R4, R6, §B R9, R11, R13, R45, §D R22, R24, §E R47, §F R41 (facing half); Facts 7, 11;
Edge States "Moving across the 90° line mid-swing", "Kiting", "A charge", "A Shadow Shot hold
while moving", "Strafing without attacking"; user stories 3–6, 13–16, 22, 24, 25.

## Files it expects to touch

- `game-client/src/render/art/animationSelect.ts` (+ `.test.ts`)
- `game-client/src/render/art/character.ts` (+ `.test.ts`)
- delete `game-client/src/render/art/pointerFacing.ts` (+ `.test.ts`)
- delete `game-client/src/scenes/faceWire.ts` (+ `.test.ts`)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts`, `HubScene.ts` (+ their `.test.ts`)
- `game-client/src/assets/types/client.ts`, `game-client/src/types/gameState.ts`
- `game-client/src/render/iso/facing.ts` (keeps `movesAwayFrom`, its doc moved to the attack rule)
- `game-client/src/render/art/manifest.test.ts` (only if it names `backpedal`)
- `game-client/docs/design-guideline.md` ("Eight facings")

## TDD Approach

- RED: `selectAnimation` attacking, aim `n`, velocity south at 90 px/s, sheet with
  `backpedal_attack` → `backpedal_attack` facing `n`; and the local character in each scene, the
  pointer moved to its north while it walks east, faces east.
- GREEN: drop the look, add the attack-angle rule and the swing swap.
