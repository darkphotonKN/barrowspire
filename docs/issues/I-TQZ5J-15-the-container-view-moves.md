---
id: I-TQZ5J-15
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-14]
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 3: the container view and its contents, F and Q's second step move into the UI scene"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (R50, R52–R54, R56, R58–R60, R62 for the container view)

**Lane: AFK (agent).** game-client only.

## What to Build

- The UI scene builds the container view (a field's and the run's, their pending windows) per world
  and takes it down as the world leaves; its depth 1100, under the gear overlay (R62).
- The worlds open, fill and close it by `container` messages; a field's `FieldPiles` through a
  `PileSatchel` over the bridge; the UI's `container` state is what the worlds read (R53).
- A take: `mayTake` is the UI's gear's `roomForOne`; the take is a `take` request; the world answers
  `gear: taken` when it sent the loot (R54). F and the run's Q's second step are the UI scene's (R56).
- Its ground is a child of its root (R59); it acts only on its own top object (R60).
- The run's end closes it silently (R58).

## Acceptance Criteria

- [ ] No world builds `ContainerView` or binds F, or forwards its pointer to it.
- [ ] Opening, filling, closing (walking away, a hit, a floor change, E again, Q, the world leaving)
      and taking (click, F) as today in a field and the run; the full bag refused before a send.
- [ ] A press on the view's panel reaches no world handler; the gear overlay draws over it where they
      meet.
- [ ] Every container test that read a world scene still passes, moved with the code.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-14.

## Spec Reference

FS-TQZ5J §Change: Phase 3 (R50, R52–R54, R56, R58–R60, R62); FS-2325V §D; FS-1D6BX R15–R19; FS-X2F2H
R56–R60; FS-KE075 §J R60; FS-HRH2J R21.

## TDD Approach

- RED: the UI scene's container slot opens on `container: open`, reports `container`, and a take asks
  `take` only with room in the bag; `gear: taken` holds the item in the bag.
- GREEN: the container slot, the worlds' `PileSatchel` over the bridge, the run's sends.
