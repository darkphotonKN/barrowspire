---
id: I-MAMHR-3
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-2]
labels: [blocked]
title: "FS-MAMHR slice 3: pick a Mercenary at creation and fight with the cut"
---
Implements FS-MAMHR §G (Requirements 30–32)

**Lane: agent** (game-client). Appearance and copy work: read `game-client/docs/design-guideline.md`
and the "Wording & Tone" rules in `game-client/CLAUDE.md` first; tokens only.

## What to Build

- **Class select (R30).** `ClassKey` gains `mercenary`; `CLASS_LORE.mercenary` as FS-MAMHR §G.30:
  `MERCENARY` / `THE MERCENARY` / `OATHLESS BLADE`, the blurb verbatim, primary stat, weapon,
  playstyle, stats (HP 130, ATK 12, DEF 7, range 1, speed 200), the resource entry as parry
  charges (3) in whatever form FS-8AY7S gives the lore card, and the six random names.
  `CharacterCreationScene` offers four class cards without overlap.
- **Every class list knows the fourth (R31).** HubScene's known-class list, the placeholder texture
  set in `characterTextures.ts` (a merc placeholder of its own, distinguishable from the knight and
  archer), `characterSheet()` (maps `mercenary` to the knight sheet until I-MAMHR-9 lands). A merc
  never draws as the fallback warrior in the hub, the run, the roster or the loadout.
- **Left-click (R32).** In `BarrowspireScene`'s pointer branch, a merc's left-click sends
  `cast_skill { skill_id: "cut" }` toward the cursor, plays the **cut effect** at once (a narrow
  sword arc matching 70° and 55 px, a new effect module beside `slash.ts`) and the class attack clip.

## Acceptance Criteria

- [ ] Creation shows four cards; the Mercenary's card carries §G.30's copy exactly; a Mercenary can
      be created through the generated client.
- [ ] HubScene, the run, the roster and the loadout draw a merc with its own placeholder, not as a
      warrior.
- [ ] A merc's left-click sends `cut` with the cursor's world point and plays the cut effect.
- [ ] Token fence and client tests pass.

## Blocked By

- I-MAMHR-2 (the server accepts and seats a mercenary; the regenerated client).
- **FS-8AY7S: the lore card's resource entry** (how a class's resource is named on the creation
  card, replacing `mp`).

## Spec Reference

FS-MAMHR §G Requirements 30–32; §Acceptance Criteria "Class and creation" rows 6–7 and "Client
presentation" row 1 (cut half); User Stories 1–4, 24.

## Files expected

- `game-client/src/data/classLore.ts`
- `game-client/src/scenes/CharacterCreationScene.ts`
- `game-client/src/scenes/HubScene.ts` (known-class list)
- `game-client/src/utils/characterTextures.ts`
- `game-client/src/render/art/animationSelect.ts` (+ test)
- `game-client/src/scenes/BarrowspireScene.ts` (left-click branch)
- `game-client/src/render/effects/cut.ts` (new) + `cut.test.ts`

> Coordination: FS-8AY7S and FS-JTNPR edit `BarrowspireScene.ts`'s pointer branch concurrently.
> Add a `mercenary` branch; do not restructure theirs.
