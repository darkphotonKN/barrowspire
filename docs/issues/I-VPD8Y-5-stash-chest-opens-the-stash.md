---
id: I-VPD8Y-5
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-4]
labels: []
title: "FS-VPD8Y slice 5: a stash chest in the Quartermaster's store opens the stash beside the bag"
---
Implements FS-VPD8Y §E Requirements 31–34, §F Requirements 35–37, 43–44

**Author: agent** (charter default)

## What to Build

The chest and a read-only stash view.

- Chest prop (R31–R33): client-side, walk-through, inside the Quartermaster's store (store rect
  1130,150 300×240; Quartermaster at 1280,270), more than `NPC_TALK_RANGE` (80) plus a margin from
  him, clear of the store's shelves and crates and the walk in from the door. Run chest sheet
  (`render/world/chest.ts` `CHEST`, closed frame) with a slight tint and trim drawn in code from
  palette tokens (ADR-0013, ADR-0025; `game-client/docs/design-guideline.md`). No bake, no new
  asset, no game-service change. An MRZH7 marker: amber "Stash" nameplate in
  `palette.markerFunction` with the amber sigil, at marker depth. The open frame shows while this
  player's stash is open.
- `E` (R34): `HubScene.offerConversation` includes the chest in the nearest-in-range choice
  (`NPC_TALK_RANGE`); a nearer NPC wins. With the overlay open, `E` stays the overlay's; ESC menu or
  dialogue open → nothing.
- Stash mode (R35–R37): the overlay opens with the left panel showing a 6 × 10 stash grid (stash
  order, empty wells, `N / 60`, hover tip, level dimming) instead of stats; over 60 → tinted extra
  rows and the over-capacity count, scrolling if needed (FS-HRH2J R23 rule). Closing the overlay by
  any of its keys ends stash mode; next `I`/`B` shows stats. Walking away does not close it.
- Only the hub composes stash mode (R43); the Quartermaster is unchanged (R44).
- A load failure shows the error line in the stash panel too (Edge States).

## Acceptance Criteria

- [ ] The chest stands in the store, out of the Quartermaster's talk range, walk-through, run-chest art with a code-drawn tint/trim from tokens, amber "Stash" marker.
- [ ] `E` within range opens the overlay with the stash grid on the left (6 × 10, `N / 60`); a nearer NPC takes the `E`.
- [ ] A stash over 60 shows tinted extra rows and e.g. `64 / 60`; every item reachable.
- [ ] Closing the overlay ends stash mode; the next `I`/`B` shows the stats panel.
- [ ] No stash mode in `BarrowspireScene` or `FieldScene`; no change to the Quartermaster.
- [ ] Layout / keep-out / overlay tests cover the chest spot and the stash grid; the token fence and the client suite pass.

## Blocked By

I-VPD8Y-4 (the `stash` list from `loadHubGear`)

## Spec Reference

FS-VPD8Y §E R31–R34; §F R35–R37, R43–R44; §Edge States (empty stash, over capacity, load failure, world switch). User stories 3–9, 19–20, 28.

## TDD Approach

- RED: layout test for a 6 × 10 left stash grid with over-capacity rows; hub test that `E` within range of the chest opens stash mode and a nearer NPC wins.
- GREEN: chest prop + marker, stash panel mode in the overlay, hub wiring.

## Files it expects to touch

`game-client/src/scenes/HubScene.ts` (+ test), `game-client/src/ui/{GearOverlay,gearOverlayLayout,HubGear}.ts` (+ tests), `game-client/src/render/world/{chest,hubInteriors,hubKeepOut}.ts` (+ tests) or a new `hubStash.ts`, `game-client/src/render/palette` (token use only)
