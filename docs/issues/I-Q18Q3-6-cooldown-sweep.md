---
id: I-Q18Q3-6
status: done
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-1, I-Q18Q3-4]
labels: [blocked]
title: "FS-Q18Q3 slice 6: the cooldown sweep on the right-click square, from the server's numbers (game-client)"
---
Implements FS-Q18Q3 §D (R18–R21), §L (R40, R41)

> **Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.** The sweep
> runs on the UI scene's own clock, stamped as the piece hears a `bar` message whose cooldown changed
> (the bridge is synchronous, so that is the state's arrival). The world only puts the state's
> `CooldownState` in the view; it passes no arrival time and ticks nothing.

## Files it expects to touch

- `game-client/src/ui/abilityCooldown.ts`, `abilityCooldown.test.ts` (new, pure: the swept fraction
  from a `CooldownState`, the time it was heard and now; never below 0, never past 1, corrected by
  the next one)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (stamp the heard time on the UI scene's
  clock; the wedge, redrawn each frame from the UI scene's update only while a cooldown runs)
- `game-client/src/ui/abilityBarView.ts`, `abilityBar.test.ts` (the right-click square's view carries its
  `CooldownState`, if slice 4 left it out)
- `game-client/src/ui/uiSceneHud.ts` / `hudPieces.ts` only if the slot must tick its pieces each
  frame (prefer the piece's own scene `update` listener, removed on `destroy`)

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
      Shadow Shot hold inside a running cooldown (active, greyed and swept at once); reconnect; a
      world switch mid-cooldown (the sweep goes with the bar; the next world's starts fresh).
- [ ] The piece's tests stand a fake bridge and a fake clock, not a world.
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
