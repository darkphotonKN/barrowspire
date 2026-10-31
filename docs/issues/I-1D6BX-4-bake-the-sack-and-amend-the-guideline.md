---
id: I-1D6BX-4
status: done
implements: FS-1D6BX
blocked_by: []
labels: [ready-for-agent]
title: "FS-1D6BX slice 4: bake the sack prop and amend the design guideline"
---
Implements FS-1D6BX §Requirements 17–18

**It ends at a HITL gate:** Kranti approves the sack's contact sheet before this closes.

## Files owned

- `game-client/tools/bake/page/models/interactables.js` (a `sack(state)` model beside `chest`)
- `game-client/tools/bake/page/catalogue.js` (a `"sack"` prop entry, states `closed` / `open`, group `props`)
- `game-client/public/art/`: a rebaked `props-*.png` and **additive** `manifest.json` entries. Rebake through `npm run bake`. Never hand-merge manifest JSON.
- `game-client/docs/design-guideline.md`: the props list (adds the sack, closed/open) and the "World-object UI can be baked art" container-view entry (three faces, only the satchel animates). Nothing else.
- `game-client/src/render/art/manifest.test.ts` (only if it enumerates props)

## What to Build

1. **Guideline amendment** (R18). Name the three container-view faces, coffer / satchel / bone
   heap, and say only the satchel animates. Add the sack to the props (closed: a tied, slumped
   burlap or leather sack. Open: the neck untied and spilled open).
2. **Bake the sack** (R17, D3, D10). Model it in code with the chest's materials vocabulary at
   the chest's scale, so a sack reads smaller and humbler than a chest on the floor. Two states,
   registered like `chest`. Built in code, never sourced (ADR-0020/0021). Meet the Ultima Online
   fidelity bar: a readable silhouette, textured material, not a blocky primitive.
3. Rebake, check the manifest diff is additive, and produce the contact sheet (`tools/bake/lib/contact.mjs`) for Kranti. Report its path.

## Acceptance Criteria

- [ ] `"sack"` is in the bake catalogue with `closed` / `open`, and the manifest gains its frames additively.
- [ ] The contact sheet is produced and its path reported. The look is gated on Kranti.
- [ ] The guideline names the three faces and lists the sack.
- [ ] The bake's own tests (`tools/bake/lib/*.test.mjs`) and `npm test` stay green.

## Blocked By

None. Slice 2 draws the `"sack"` sheet through the art library when it exists and its placeholder until then, so the two meet on the sheet name `"sack"`.

## Spec Reference

FS-1D6BX §Requirements 17–18, User Stories 2, 22, 23.
