---
id: I-TQZ5J-14
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-13]
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 2: the gear overlay (HubGear, EquipmentHud, the purse) and the container view move into the UI scene, with I, B, C, Q, E and F"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (R50–R56, R58–R60, R62, R64 for the gear overlay and the container view)

**Lane: AFK (agent).** game-client only.

One slice, not two: a take from a container is pre-checked against the bag (`mayTake` → the gear's
`roomForOne`) before the view marks it pending, synchronously. Moved apart, one of the two would ask
the other across the bridge for an answer a request cannot return. So they move together, and the
take stays inside one scene (the charter's rule).

## What to Build

- The UI scene builds, per world reported, the gear overlay with its source (`HubGear` + REST in the
  town, `EquipmentHud` in a field and the run) and its purse reader, and takes them down as the world
  leaves (R50, R51); the town's gold-Take watch goes with them.
- The worlds hand their state ticks and level as `gear: seen` / `gear: level`, the town's chest E as
  `gear: openStash` (inside its act), its letter panel's opening as `gear: close`; they answer `equip`
  and `unequip` with the socket's Equip and Unequip (R52, R54).
- The gear's open state is the UI's (R53, R55): `WorldWindows` keeps only `letter`; the corner icons,
  Esc's gear step, the menu opening, the Menu icon after the end and the sounds read the UI scene's
  gear; `blockers().gear` for the town's dialogue; its opening asks `close: letter`.
- I, B, C, Q (gear) and the inventory's E are the UI scene's (R56), as each world heard them.
- The overlay stands a ground per open panel (R59) and acts only on its own top object (R60); the
  worlds drop `covers` from their click paths.
- The container view (a field's and the run's, their pending windows) is the UI scene's, at 1100
  under the gear overlay (R62); the worlds open, fill and close it by `container` messages (a field's
  `FieldPiles` through a `PileSatchel` over the bridge) and read `container` (R53); a take is pre-checked
  by the UI's gear and asked as `take`, answered `gear: taken` when sent (R54); F and the run's Q's
  second step are the UI scene's (R56); its ground is a child of its root (R59).
- The run's end closes the gear overlay and the container view silently (R58).

## Acceptance Criteria

- [ ] No world builds `GearOverlay`, `HubGear` or `EquipmentHud`, binds I, B, C or Q for it, or tests
      its rect.
- [ ] I, B, C, Q, E, the corner icons and the stash chest's E behave as today in each world, refusals
      included; opening a panel ends a Shadow Shot hold in a field and the run.
- [ ] HubGear's no-flash reload, its loading line, its refusals and the purse line and tip as today.
- [ ] A press, hover or wheel on an open panel reaches no world handler; one in the clear band still
      attacks; a piece over the overlay (the party panel) takes the hover, the press and the wheel.
- [ ] inventory_open/close and character_open/close once per action; none for a game-made close.
- [ ] The container view opens, fills, closes (walking away, a hit, a floor change, E again, Q, the
      world leaving) and takes (click, F) as today; the full bag refused before a send; a press on its
      panel reaches no world handler; the gear overlay draws over it where they meet.
- [ ] Every gear and container test that read a world scene still passes, moved with the code.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-13.

## Spec Reference

FS-TQZ5J §Change: Phase 3 (R50–R56, R58–R60, R64); A1 R25–R27; R17, R21, R22; FS-HRH2J; FS-VPD8Y §F;
FS-7TGZ3; FS-WDM0X S1–S9; FS-2325V §D; FS-1D6BX R15–R19; FS-X2F2H R56–R60; FS-KE075 §J R60.

## TDD Approach

- RED: a UI-scene gear slot over a fake bridge builds the gear per world and takes it down on a leave;
  the corner's Inventory toggles it under the menu and `blockers().gear`; Esc closes it after the
  party panel; `gear: seen` reaches the overlay; equip sends `equip`; the container slot opens on
  `container: open`, reports `container`, and a take asks `take` only with room in the bag.
- GREEN: `uiSceneGear.ts`, the worlds' reports and answers, the UI scene's mount.
