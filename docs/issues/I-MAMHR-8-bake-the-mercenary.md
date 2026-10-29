---
id: I-MAMHR-8
status: done
implements: FS-MAMHR
blocked_by: []
labels: [ready-for-agent]
title: "FS-MAMHR slice 8 (art, HITL gate): bake the Mercenary and get the contact sheet approved"
---
Implements FS-MAMHR §H (Requirements 39–41)

**Lane: agent** (game-client bake pipeline). **HITL:** ends on the user's contact-sheet review.
Built in code, never sourced (ADR-0020, ADR-0021; fidelity bar: Ultima Online). Read
`game-client/docs/design-guideline.md` (character rules) first.

## What to Build

- A `mercenary()` model in `game-client/tools/bake/page/characters/cast.js` on the shared delver rig:
  a sellsword in mismatched, worn half-armour and leather, a one-handed arming sword, no shield, no
  helm crest. It must read at a glance as neither the knight nor the archer. `BARROW` tokens and
  blends only.
- Register it in the cast as sheet `char_mercenary_base` (group `characters`), 8 directions × idle,
  walk, attack, death, from the existing clips.
- Bake; regenerate the contact sheet; present it to the user.

## Acceptance Criteria

- [ ] The Mercenary is built in code on the shared rig and baked to `char_mercenary_base`, 8
      directions × idle, walk, attack, death.
- [ ] Manifest test asserts the new sheet.
- [ ] **The user has approved the Mercenary's contact sheet** (8 directions × each clip, at game
      scale). Until then this issue is not done, and nothing maps `mercenary` to the sheet.
- [ ] No client scene or `characterSheet()` change in this issue.

## Blocked By

None. The rest of the class never waits on this.

## Spec Reference

FS-MAMHR §H Requirements 39–41; §Acceptance Criteria "Art (gated)" rows 1–2; User Stories 24–26.

## Files expected

- `game-client/tools/bake/page/characters/cast.js` (additive: the model and its cast entry)
- `game-client/tools/bake/page/characters/gear.js`, `fabrics.js` (additive only, if new pieces are needed)
- `game-client/public/art/` baked sheet(s) and `manifest.json` (additive entries only; never hand-merge)
- `game-client/tools/bake/review/` contact sheet (regenerated)
- `game-client/src/render/art/manifest.test.ts`
