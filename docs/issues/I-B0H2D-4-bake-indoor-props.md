---
id: I-B0H2D-4
status: open
implements: FS-B0H2D
blocked_by: []
labels: [ready-for-agent]
title: "FS-B0H2D slice 4: bake the Inn, store and smithy props in code"
---
Implements FS-B0H2D §G Requirement 30

**Author: agent** (charter: props built in code; art pipeline delegated, gated on a contact sheet)

## What to Build

Six new baked prop sheets, authored in code in `tools/bake` like the town's existing props
(ADR-0020, ADR-0021, design guideline Part I): `counter`, `stool`, `inn_hearth`, `shelf`,
`forge`, `anvil`. Reuse the existing `table`, `crate` and `barrel`. `forge` and `inn_hearth`
declare a light source in the manifest. Sizes fit the furnishing rects I-B0H2D-2 commits (counter
and tables) where known; otherwise size to the FS layout and note it.

Expected files:
- `game-client/tools/bake/page/models/` (a new `interior.js`, or additions to `town.js`)
- `game-client/tools/bake/page/catalogue.js`
- `game-client/public/art/manifest.json` and the regenerated atlas PNGs under `game-client/public/art/`
- `game-client/docs/design-guideline.md` only if a rule change is needed (flag it, don't slip it in)

Not touched: `src/scenes/HubScene.ts`, `hubKeepOut.ts`, the server.

Hotspot note: `manifest.json` and the atlases are regenerated wholesale by the bake. Do not run
this in parallel with any other bake on the same branch (check FS-KSD6K's issues before starting).

## Acceptance Criteria

- [ ] Six sheets in the manifest with anchor, frame size and (forge, inn_hearth) a light source.
- [ ] Built in code, no sourced models; fits the Ultima Online fidelity bar.
- [ ] Contact sheet produced and approved before the commit lands (the gate for art).
- [ ] Bake tool tests and client vitest green.

## Blocked By

None (I-B0H2D-5 draws placeholders until these exist)

## Spec Reference

FS-B0H2D §G R30; user story 28.

## TDD Approach

- Not test-first art. Existing bake lib tests (`crown`, `mean`, `pack`) must stay green; add a
  manifest-shape check if the light declaration is new for props.
