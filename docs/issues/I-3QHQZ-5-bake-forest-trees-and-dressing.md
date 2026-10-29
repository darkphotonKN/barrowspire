---
id: I-3QHQZ-5
status: open
implements: FS-3QHQZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-3QHQZ slice 5: bake the forest's live and dead trees and its dressing props"
---
Implements FS-3QHQZ §C (Requirements 24, 28, 30)

Agent lane. **Ends at a HITL gate:** the owner approves the contact sheet before this issue
closes. Independent of the server.

> Coordination: slice 6 and other bake work rewrite `catalogue.js` and `public/art/manifest.json`.
> Rebake from the merged tree; never hand-merge manifest JSON.

## Files expected to touch

- `game-client/tools/bake/page/models/nature.js`: a dead tree (bare, gnarled), a dead snag
  (broken), dark live oak and dark live pine variants (low-saturation leaf from `BARROW`); fern,
  stump, fallen log, toadstools (bone piles reuse the existing run-dressing sheet).
- `game-client/tools/bake/page/catalogue.js`: `prop(...)` entries such as `tree_dead`,
  `tree_dead_snag`, `tree_oak_gloom`, `tree_pine_gloom`, `fern`, `stump`, `fallen_log`,
  `toadstools`.
- `game-client/public/art/`: rebaked atlas page(s) and additive `manifest.json` entries.
- `game-client/src/render/art/manifest.test.ts` (new sheets present).

## What to Build

Author the sheets in code (ADR-0020, ADR-0021, design guideline Part I): cold and dim but not
black; live trees dark and desaturated, dead trees bare and twisted, so a stand mixed two live to
one dead reads "forlorn". Dressing props small and low, never mistakable for an interactable (no
amber). Bake, and produce the contact sheet at game scale.

## Acceptance Criteria

- [ ] The new sheets are in `manifest.json` and pass the manifest test.
- [ ] Colours come from `BARROW` only (fence green).
- [ ] Contact sheet produced; **owner approval recorded** before close.

## Blocked By

None

## Spec Reference

FS-3QHQZ §C Requirements 24, 28, 30; Acceptance Criteria "Forest look (§C)" last item (trees and
dressing); User Stories 14, 31.
