---
id: I-77DVN-2
status: done
implements: FS-77DVN
blocked_by: [I-77DVN-1]
labels: [ready-for-agent]
title: "FS-77DVN slice 2: the top left closes up: the run's bars to (10, 16) and frames to 92, the hub's frames to the corner (game-client)"
---
Implements FS-77DVN §E

## Files it expects to touch

- `game-client/src/ui/ResourceHud.ts` (`RESOURCE_HUD_AT.run` to (10, 16); the column width as its
  own named constant, no longer `PROGRESS_HUD_W`), `game-client/src/ui/ResourceHud.test.ts`
- `game-client/src/ui/partyFramesLayout.ts` (`PARTY_FRAMES_PLACEMENT`: run top 92, hub (16, 16);
  `underXpBar` gone; `FRAME_W` from the column constant), `game-client/src/ui/partyFramesLayout.test.ts`
- `game-client/src/ui/ProgressHud.ts` (`PROGRESS_HUD_AT` and the old panel's constants removed)
- `game-client/src/scenes/BarrowspireScene.ts` (`PROGRESS_HUD_X/Y` gone; the top-left and spectate
  HUD comments), `game-client/src/scenes/BarrowspireScene.test.ts` (the stack test)
- `game-client/src/scenes/HubScene.ts` only for comments naming the frames "under the XP bar"

## What to Build

With the XP bar gone from the top left (slice 1), close the gap. In a run the Health and resource
bars stand at (10, 16), the field's place, the potion cell beside them, and the party frames from
y 92, as in a field. In the hub the party frames stand at (16, 16). The left column stays 180 wide
through a column constant the bars and frames share. Remove `PROGRESS_HUD_AT` and the old panel's
constants once nothing reads them. Prove every clearance the layout tests check today still holds.

## Acceptance Criteria

- [ ] FS-77DVN §Acceptance Criteria, the stack items: `RESOURCE_HUD_AT.run` (10, 16) equal to the field's; `PARTY_FRAMES_PLACEMENT` run {10, 92}, field {10, 92}, hub {16, 16}; bars and frames 180 wide; in each world four-row frames clear the chat window, bars, potion cell, T panel, prompts and ready check at 1080 and 1280; the run's stack clears the top-right column, the spectate HUD and the target frame; no `PROGRESS_HUD_AT` reference remains.
- [ ] A field's placements unchanged.
- [ ] Typecheck, lint and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-77DVN-1 (the XP bar must leave the top left first, or the run's bars at y 16 and the hub's
  frames at y 16 cover it)

## Spec Reference

FS-77DVN §E.17–§E.21; User Stories 19–22.

## TDD Approach

- RED: `ResourceHud.test.ts` expects the run's bars at (10, 16); `partyFramesLayout.test.ts` the run frames' top at 92 and the hub's at (16, 16).
- GREEN: `RESOURCE_HUD_AT.run = RESOURCE_HUD_AT.field`'s place; the hub's placement at the corner.
