---
id: I-0XMCP-2
status: done
implements: FS-0XMCP
blocked_by: []
labels: [ready-for-agent]
title: "FS-0XMCP slice 2: the Spire's facade, the trail and the road, signposts and approaches (game-client art)"
---
Implements FS-0XMCP §Requirements 11, 15–20

**Author: agent** (presentation only; art is built in code and baked, ADR-0020/0021)

## What to Build

The hub looks like a crossroads with the Spire at its back. No gameplay changes: nothing is
triggered by walking anywhere in this slice.

- **The Spire's facade**: one new baked sheet authored in code, front face and lower storeys
  only (stone base and steps, great arched door, buttresses, two storeys with arrow slits),
  stone from the tower interior family in `tools/bake/page/models/tower.js` (FS-8RBQY). Drawn
  beyond the north edge (world y < 0), door centred on the Spire gate at (1000, 50). The
  door's threshold carries the amber interactable cue; nothing else on it is amber.
- **Its top is never on screen**: check the camera's reach (`projectedBounds` + margin in
  `HubScene.create`) at the walkable area's north-west, north and north-east corners; adjust
  the margin or the prop height, never bake the whole tower.
- **West trail mouth**: trodden ground to the west edge at (40, 400), flanked by baked `pine` /
  `oak` thickening beyond the edge; a `signpost` beside it.
- **East road**: a wider rutted road to the east edge at (1960, 360), a fence end beside it,
  lighter ground beyond; a `signpost` beside it.
- **Approaches**: add to `HUB_PATHS` the north lane `[950, 100, 100, 400]`, west trail
  `[60, 390, 600, 50]` + `[620, 390, 60, 300]`, east road `[1380, 340, 570, 50]` +
  `[1340, 390, 60, 300]` (nudge only to clear keep-out; record nudges here).
- **Keep-out K8**: `HUB_KEEP_OUT` gains the three gates (position + range 80, read-only facts
  copied from `hub_map.go`, documented like K3–K6); no prop inside a gate's range or on a gate
  approach. Every existing and new placement passes K1–K8.
- Hub size unchanged (2000 × 1000); no server change.

## Acceptance Criteria

- [ ] A facade sheet exists in the bake catalogue, authored in code; `manifest.json` and the atlas pages are re-baked by the pipeline, never hand-edited.
- [ ] The facade draws beyond the north edge with its door centred on (1000, 50); its top is not visible from any camera position (screenshots at the three north corners).
- [ ] The door's threshold is the only amber on the facade.
- [ ] Trail mouth with trees and a signpost at the west gate; road with a fence end and a signpost at the east gate; trodden paths join all three gates to the existing paths.
- [ ] K8 exists in `hubKeepOut.ts`; `hubKeepOut.test.ts` checks every placement against K1–K8 and passes.
- [ ] A contact sheet of the new and changed art (facade, trail mouth, road, signposts in place) is produced and reviewed before closing (design guideline Part I).
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/tools/bake/page/models/tower.js` (or a new `models/spire.js` beside it): the facade model
- `game-client/tools/bake/page/catalogue.js`: register the sheet
- `game-client/public/art/*.png`, `game-client/public/art/manifest.json`: bake output only
- `game-client/src/render/art/manifest.test.ts` (if sheet lists are asserted)
- `game-client/src/render/world/hubKeepOut.ts`, `hubKeepOut.test.ts`: paths, trees, signposts, fence end, K8
- `game-client/src/scenes/HubScene.ts`: place the facade and edge dressing; camera margin if needed
- `game-client/src/render/world/ground.ts` (only if the road or trail ground needs a new treatment)

## Blocked By

None (gate positions are FS data; keep-out copies them like K3–K6)

## Spec Reference

FS-0XMCP §Requirements 11, 15–20; §User Stories 2, 3, 11, 12, 14, 25, 27; §Acceptance Criteria
11–14, 18; §Decision log D2, D3, D5, D11, D12. Art rules: `game-client/docs/design-guideline.md`
Part I.

## TDD Approach

- RED: `hubKeepOut.test.ts`: a prop inside a gate's range or on an approach breaks K8.
- GREEN: K8 rule and gate data; then place the dressing until every spot passes.
- Art is verified by the contact sheet and in-scene screenshots, not unit tests.

## Review record

- **Contact sheet approved 2026-10-30.** The owner reviewed the Spire facade contact sheet and
  answered "Approve".
- **Approach nudges as built** (`game-client/src/render/world/hubKeepOut.ts`, `HUB_APPROACHES`):
  - west trail: `[-200, 390, 710, 50]`, then south down the west house's east side at x 470,
    `[470, 390, 40, 320]`, joining the west arm along `[480, 680, 230, 30]`. The FS path
    `[60, 390, 600, 50]` + `[620, 390, 60, 300]` would have crossed the cart, the washing line,
    the sacks and a market stall;
  - north lane: `[950, 0, 100, 500]`, run on to the edge to meet the Spire's steps;
  - east road: `[1380, 340, 820, 50]`, run on to the edge and beyond; its drop
    `[1340, 390, 60, 300]` unchanged.
- **Props moved to clear K8:** braziers to (1080, 440) and (530, 600); a crate to (1320, 505);
  the fence at (1740, 300) cut from 180 to 130 long.
