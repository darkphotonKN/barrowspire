---
id: I-P0HSP-3
status: done
implements: FS-P0HSP
blocked_by: [I-P0HSP-1]
labels: [ready-for-agent]
title: "FS-P0HSP slice 3: M cycles the town's minimap through normal, enlarged and the overlay, on the run's remembered mode (game-client)"
---
Implements FS-P0HSP §F, §G

## Files it expects to touch

- `game-client/src/scenes/HubScene.ts` + `HubScene.test.ts`: M bound as a keydown event with its
  guards (repeat, chat typing, the menu panel, a dialogue card, the mailbox's letter panel, no map
  yet); the mode read from `barrowspire_minimap_mode` at scene start and written on M; the overlay
  followed each frame from the player's eased position and the party's drawn figures, held against
  the screen from the main camera's frames (`afterFrameSetUp`); the corner empty in overlay mode.
- `game-client/src/ui/minimap.ts` only if the plan seam needs the overlay's projection or hold
  generalised; `ui/minimapMode.ts` unchanged.
- Whatever makes invite prompts and the ready check draw over the map where they overlap (§G.38),
  e.g. the minimap made before them or their depth; the run unchanged.

## What to Build

In the town, M steps normal → enlarged → overlay → normal, exactly as in a run: the enlarged 324 × 162
panel at the column's top, its marks and dots at the normal size; the overlay the town at 1/8 of the
world's projection about the player, moving with them, held within two backing px, at 40% with the
2 px edge line, at depth 920 (over the world, the indoor blackout and the vignette, under name plates
and sigils at 950, the arrival card and the HUD), taking no input. The mode is the run's one stored
key, so a choice made in a run holds in the town and the other way round.

## Acceptance Criteria

- [x] FS-P0HSP §Acceptance Criteria: M in the town (cycle, guards, stored key, nothing before the map);
      enlarged and overlay as the run's; the corner empty in overlay mode; prompts and the ready check
      over the map where they overlap at 1080.
- [x] The overlay's placement and hold measured as FS-1SEF0's (no back-steps walking, within two
      backing px of the figure's point, at render scales 1, 1.5 and 2).
- [x] Headless captures of the town in each mode at 1080 × 720 and 1280 × 720, render scales 1 and 2,
      looked at by eye.
- [x] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-P0HSP-1

## Spec Reference

FS-P0HSP §F.31–§F.34, §G.35, §G.38; User Stories 21–23, 25, 27.

## TDD Approach

- RED: in a hub scene with its map built, three M presses step normal → enlarged → overlay and write
  each to the store; a press while chat is typing, or on a repeat, changes nothing; a scene started
  with "enlarged" stored builds the map enlarged.
- GREEN: the binding and the mode, then the overlay's follow and hold wired to the hub's camera.

## Status

Done 2026-11-12. M is a keydown event in `HubScene.bindMinimapKey` (guards: repeat, chat typing, the
menu, a dialogue card, the letter panel, no map yet); the mode is read from
`barrowspire_minimap_mode` as the map is built with the first walled state (the scene's start, as
far as M can tell: M does nothing before it) and written on each press. `followMapOverlay` runs
each frame after the figures ease. The overlay's placement and hold are the run's own code
(`MinimapView`), measured by `minimap.test.ts` at render scales 1, 1.5 and 2 and checked for the
town in `worldMinimap.test.ts` (1/8 about the player, the town 300 x 150). Invite prompts and the
ready check redraw their objects on every change, after the map, at the one HUD depth 1000, so they
draw over it (`worldMinimap.test.ts`, §G.38). Captures (a headless stand-in, not the live scene:
a flat world from the golden walls, the real WorldMinimap and townMap) in the session scratchpad
`hub-minimap/town-{normal,enlarged,overlay}-{1080,1280}x720-x{1,2}.png`, looked at.
