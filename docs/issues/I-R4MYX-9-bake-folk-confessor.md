---
id: I-R4MYX-9
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-8]
labels: [ready-for-agent]
title: "FS-R4MYX slice 9: bake the Confessor's own look, folk_confessor"
---
Implements FS-R4MYX §H Requirement 37

**Lane: bake art (agent).**

## What to Build

A bespoke hub folk character, built like `quartermaster()` in
`tools/bake/page/characters/folk.js` on the shared rig (ADR-0021): the Confessor, tall and gaunt in
a dark hooded robe to the ground, a **white stole** hanging from the neck as the one pale mark
that reads at a distance, hands clasped before him, no weapon, nothing amber. Idle and walk
(`FOLK_ANIMATIONS`), eight directions, in the `folk` group, as sheet `folk_confessor` in `FOLK`.
The robe and stole fabrics come from the existing fabric palette mixed from `BARROW`.

Expected files:
- `game-client/tools/bake/page/characters/folk.js`, `folk.test.mjs`
- `game-client/tools/bake/page/characters/fabrics.js` (robe and stole fabrics), `anatomy.js` or
  `gear.js` only if a robe or stole part is new
- `game-client/public/art/manifest.json` and the regenerated `folk` atlas PNGs

Not touched: `src/` (I-R4MYX-7 maps `confessor` to the sheet), the server.

Hotspot: bakes after I-R4MYX-8 on the same branch; never hand-merge the manifest, rebake.

## Acceptance Criteria

- [ ] `folk_confessor` in the manifest, group `folk`, idle and walk in eight directions.
- [ ] The folk bake tests (legs under clothes, clearance) green for the new figure.
- [ ] `npm run bake -- --check` clean after the commit; client vitest green.

## Blocked By

I-R4MYX-8 (the manifest and atlases are rebaked wholesale; one bake at a time)

## Spec Reference

FS-R4MYX §H R37, §D R18; user story 8.
