---
id: I-Q18Q3-6
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-1, I-Q18Q3-4]
labels: [blocked]
title: "FS-Q18Q3 slice 6: the cooldown sweep on the right-click square, from the server's numbers (game-client)"
---
Implements FS-Q18Q3 §D (R18–R21)

## Files it expects to touch

- `game-client/src/ui/abilityCooldown.ts`, `abilityCooldown.test.ts` (new, pure: the swept fraction
  from a `CooldownState`, the time it arrived and now; never below 0, never past 1, corrected by the
  next state)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (the wedge, redrawn each frame only while
  a cooldown runs)
- `game-client/src/ui/abilityBar.ts`, `abilityBar.test.ts` (the right-click square's view carries its
  cooldown)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts` and their `*.test.ts` (hand the bar
  the state's arrival time and tick it from `update`)

## What to Build

While `ability_cooldown.remaining > 0` and `total > 0`, cover the right-click square with a dark wedge
(`palette.ink` at about 0.55) from 12 o'clock, `remaining / total` of the well, receding clockwise.
Between states the remaining time runs down with real time since that state arrived (the open bar's
rule), never below 0; the next state corrects it. `{0, 0}` or `total` 0 draws none. No seconds
numeral, no ready flash. The potion square gets no sweep. Write the sweep so slice 7 can hand the 3
square the same view.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-client: the sweep criterion.
- [ ] Edge States: a cooldown longer than the gap between states; `total` 0 with `remaining` > 0; a
      Shadow Shot hold inside a running cooldown (active, greyed and swept at once); reconnect.
- [ ] No redraw while nothing runs.
- [ ] Headless captures of a dash and a Shadow Shot mid-sweep, checked by eye.
- [ ] Typecheck, lint, the token fence and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-Q18Q3-1 (`ability_cooldown` on the wire)
- I-Q18Q3-4 (the bar)

## Spec Reference

FS-Q18Q3 §D R18–R21; User Stories 7, 8, 11, 25.

## TDD Approach

- RED: `abilityCooldown.test.ts` expects `{remaining: 1.2, total: 1.2}` arrived 600 ms ago to sweep
  0.5, and 1500 ms ago to sweep 0.
- GREEN: the pure function, then the wedge.
