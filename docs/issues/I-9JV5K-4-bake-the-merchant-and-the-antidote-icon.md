---
id: I-9JV5K-4
status: done
implements: FS-9JV5K
blocked_by: [I-5FZ4J-8]
labels: [ready-for-agent]
title: "FS-9JV5K slice 4: bake the wandering merchant and the antidote icon, with a contact sheet"
---
Implements FS-9JV5K §G R26

**Files:** `game-client/tools/bake/`, `game-client/public/art/`, `game-client/src/render/art/`
(the on-demand table entry, manifest pins, icon resolver rule for `ANTIDOTE`). Not
`BarrowspireScene.ts` or `gameState.ts`.

## What to Build

The merchant as a townsfolk build with a heavy pack, a lantern and a travel-worn cloak (faces per
FS-67QQY), idle in eight directions, Ultima Online fidelity, `BARROW` colours; his own on-demand
group with a stand-in (ADR-0071 / ADR-0088 pattern; the client slice wires the fetch). The antidote
icon in `models/items.js` `ICONS` and the resolver rule. The merchant joins the contact-sheet review.

## Acceptance Criteria

- [ ] `npm run bake` then `npm run bake -- --check` pass; sheets pinned; the antidote icon resolves for `ANTIDOTE`.
- [ ] A contact sheet of the merchant (and the icon) is written; its path reported.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-5FZ4J-8 (one writer at a time in the bake tool).

## Spec Reference

FS-9JV5K §G R26.

## Closed (2026-11-25)

Baked as the on-demand `merchant` group (`public/art/merchant-0.png`), modelled in
`game-client/tools/bake/page/characters/folk.js#merchant`; the antidote's icon on the resident
`icons` atlas (`models/items.js` `ICONS.antidote`). Contact sheet:
`game-client/tools/bake/review/contact-merchant-2x.png` (him in every facing, beside the potion
icons and the antidote). The art calls, for the client slice:

- **Sheet `npc_merchant`**, 8 facings, `idle` only (4 frames at 3 fps, looping): he never walks.
  A stout, grizzled pedlar in a wide felt hat, a road-dusted cloak ragged at the hem over an
  ochre jerkin, bowed a little under a canvas frame pack that stands above his shoulders, a madder
  blanket rolled on its top, a pan and a coil of rope at its sides; his hands hold the pack's
  straps at his chest.
- **The lantern** hangs from an iron arm off the pack's left pole, beside his head on his left
  (the lit glass is the bake's amber glow). The sheet declares no light: a character sheet carries
  none today, so R21's soft lantern light is the client's, placed about a head's height up.
- **On demand by a table change** (ADR-0071 Decision 6): `NPC_ART` in
  `src/render/art/sceneArt.ts` names the group, the state key that fetches it (`merchant`), his
  sheet and his stand-in, `char_mercenary_base` (resident) under `palette.merchantStandIn`, a
  road-dust wash. `npcArtFor("merchant")` finds the row. The fetch is not wired in the scene.
- **The antidote** resolves by name (`/\bantidote\b/i` in `NAME_ICONS`), since the template code
  is not on the wire; an item with healing still resolves as a health potion first.
