---
id: I-MAMHR-7
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-3, I-MAMHR-5]
labels: [blocked]
title: "FS-MAMHR slice 7: the armed tell and the riposte slice"
---
Implements FS-MAMHR §G (Requirements 33–34)

**Lane: agent** (game-client). Read `game-client/docs/design-guideline.md` first; tokens only.

## What to Build

- **Armed tell (R34).** While the latest state shows the merc at 3 of 3 parry charges (FS-8AY7S's
  resource fields), the merc's own figure carries a visible tell (for example a glint running along
  the blade). It clears when the count drops.
- **Riposte slice (R33).** At 3 parry charges, a merc's left-click still sends `cut`, but plays the
  **riposte slice** instead of the cut effect: a clean, wide slice across 240° and 90 px toward the
  cursor, with the class attack clip. It must read as clearly bigger than the cut and the knight's
  slash.

## Acceptance Criteria

- [ ] At 3 parry charges, left-click sends `cut` and plays the riposte slice; below 3 it plays the
      cut effect.
- [ ] The armed tell shows at 3 and clears when the count drops.
- [ ] Nothing of this is drawn for another delver.
- [ ] Token fence and client tests pass.

## Blocked By

- I-MAMHR-3 (the merc's left-click branch), I-MAMHR-5 (the server throws the riposte).
- **FS-8AY7S: the class resource fields on `current_player`** (the parry charge count).

## Spec Reference

FS-MAMHR §G Requirements 33–34, 38; §Acceptance Criteria "Client presentation" rows 1–2;
User Stories 15, 16, 18.

## Files expected

- `game-client/src/scenes/BarrowspireScene.ts` (left-click branch)
- `game-client/src/render/effects/riposte.ts` (new) + `riposte.test.ts`

> Coordination: I-MAMHR-6 edits the same pointer handler. Whichever lands second rebases.
