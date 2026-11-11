---
id: I-56CKV-4
status: open
implements: FS-56CKV
blocked_by: [I-56CKV-3]
labels: [blocked]
title: "FS-56CKV slice 4: the run's top-left stack moved up: the XP bar to y 16, the resource bars, potion cell and party frames with it (game-client)"
---
Implements FS-56CKV §D

## Files it expects to touch

- `game-client/src/ui/ProgressHud.ts` (`PROGRESS_HUD_AT.run` to (10, 16); its doc comment)
- `game-client/src/ui/ResourceHud.ts` (doc comment only; `RESOURCE_HUD_AT.run` follows by derivation),
  `game-client/src/ui/ResourceHud.test.ts` (y 84 → 56)
- `game-client/src/ui/partyFramesLayout.ts` (doc comment only; the placement follows),
  `game-client/src/ui/partyFramesLayout.test.ts` (run top 160 → 132, y 84 → 56)
- `game-client/src/scenes/BarrowspireScene.ts` (the `PROGRESS_HUD_*` comment "under the position
  line"), `game-client/src/scenes/BarrowspireScene.test.ts` only if a test pins the old values

## What to Build

Set the run's XP bar to (10, 16). The resource bars (10, 56), the potion cell beside them and the
party frames' run top (132) follow by derivation. The hub and the fields do not move. Prove the
frames at their tallest still clear the chat window and everything else the layout test checks.

## Acceptance Criteria

- [ ] FS-56CKV §Acceptance Criteria, the stack items: `PROGRESS_HUD_AT.run` (10, 16), `RESOURCE_HUD_AT.run` (10, 56), `PARTY_FRAMES_PLACEMENT.run.top` 132; the hub and field placements unchanged; four-row frames clear the chat window, XP bar, resource bars, potion cell, T panel and prompts.
- [ ] Typecheck and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-56CKV-3 (the readout must leave (10, 10) first, or in a dev build it covers the XP bar at y 16)

## Spec Reference

FS-56CKV §D.20–§D.22; User Stories 12, 13, 15.

## TDD Approach

- RED: `ResourceHud.test.ts` expects the run's bars at y 56 and `partyFramesLayout.test.ts` the run frames' top at 132.
- GREEN: `PROGRESS_HUD_AT.run.y = 16`.
