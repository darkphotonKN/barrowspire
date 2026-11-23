---
id: I-E1ZDG-11
status: done
implements: FS-E1ZDG
blocked_by: []
labels: [ready-for-agent]
title: "FS-E1ZDG slice 11: the specialization name replaces the class name on every surface"
---
Implements FS-E1ZDG §Change: The specialization name replaces the class name

**Lane: agent** (game-client only). Display only: no class id, wire field, art key or copy
lookup changes. Changes FS-8RZ51's tree header (R35, V23) through its stub
`## Change: The specialization name replaces the class name → FS-E1ZDG`.

## What to Build

- **The one rule** (N1, N2) in `src/data/specializations.ts`:
  - `roleName(className, specialization)`: the spec's display name when the character holds a
    known specialization of its own class, else the class display name ("Warrior"; an unknown
    class in title case).
  - `characterTitle` returns the role name once specialized, nothing otherwise: the " · " format
    is retired. `nameplateTitle` and `classLevelLine` read through it.
- **Every surface reads it** (N3):
  - nameplates (`render/markers/titleLine.ts`, via `nameplateTitle`): "Berserker";
  - party frames (`ui/partyFramesLayout.ts`): "Berserker";
  - the stats panel header (`ui/characterSheet.ts`): "BERSERKER" / "WARRIOR";
  - the main menu hero and the character list (`scenes/MainMenuScene.ts`, via
    `classLevelLine`): "BERSERKER • LV.20";
  - the passive tree header (`ui/passiveTreeModel.ts`): "Berserker · 3 points"; the tree's
    source carries `specialization` from the gear "seen" `character` (`ui/uiSceneTree.ts`), and
    the overlay's redraw key includes it (`ui/PassiveTreeOverlay.ts`);
  - the tier-6 tooltip: "Grants the title Berserker."
- Untouched: the controls panel (N6), the party panel (N7), `abilityCopy`, `specializationOf`,
  the art selectors.

## Acceptance Criteria

- [ ] `roleName` gives each of §A.1's eight display names for its own class, and the class name
      for none, an unknown id, an `Object.prototype` key, or another class's id.
- [ ] `characterTitle("warrior", "berserker")` is "Berserker"; absent before the pick and for an
      unknown or another class's id.
- [ ] A Berserker's nameplate title line and party frame title read "Berserker"; an
      unspecialized player has no nameplate line.
- [ ] The stats panel header reads "BERSERKER" for a Berserker and "WARRIOR" with no spec.
- [ ] The main menu hero and character list read "BERSERKER • LV.20" and "WARRIOR • LV.5".
- [ ] The tree header reads "Berserker · 3 points" and "Warrior · 3 points"; the tree redraws
      when its specialization changes.
- [ ] The Berserker node's tooltip reads "Grants the title Berserker."
- [ ] No "Class · Spec" string is produced anywhere in `src/`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

None

## Spec Reference

FS-E1ZDG §Change: The specialization name replaces the class name: N1–N7, every acceptance
criterion and edge state of the section.

## TDD Approach

- RED: `roleName("warrior", "berserker")` is "Berserker" and `characterTitle` drops the class word.
- GREEN: `roleName` in `specializations.ts`, `characterTitle` reading it; then each surface's test
  (sheet, frames, title line, tree header, menu line) flipped and passed.
