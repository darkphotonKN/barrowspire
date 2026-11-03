---
id: I-KZC92-2
status: done
implements: FS-KZC92
blocked_by: [I-KZC92-1]
labels: []
title: "FS-KZC92 slice 2: the heal shimmer plays when the local player drinks a health potion (game-client)"
---
Implements FS-KZC92 §G

## What to Build

The in-run trigger for the heal shimmer slice 1 built.

- **Watcher** (R33–R37): a pure, tested watcher in `src/ui/potionDrink.ts`, kept out of `src/render/effects/` so it needs no gallery card and doesn't collide with slice 3's `shimmer.ts`. Each `current_player` goes in, and it answers "play" when one state shows both a lower `healthPotionCount` (`src/ui/potions.ts`) and a higher `current_health` than the previous state. The first state after join, reconnect or reset is the baseline. A state with no `current_player` clears the baseline. `forget()` resets it.
- **Wiring** (R33, R34, R37, R38): in `BarrowspireScene` only, feed the watcher every state from `current_player` (never `other_players`). On "play", start a heal shimmer (granted base, `HEAL_LOOK`) on the local player's figure, and have the shimmer follow the figure's drawn position each frame. On `resetRun` (already bound to SHUTDOWN and DESTROY), forget both the watcher and every live shimmer. Hub and field scenes are untouched.

Files expected: `game-client/src/ui/potionDrink.ts`, `game-client/src/ui/potionDrink.test.ts`, `game-client/src/scenes/BarrowspireScene.ts` (and `BarrowspireScene.test.ts` if the reset wiring is covered there). Read-only use of `src/render/effects/shimmer.ts` and `src/ui/potions.ts`.

## Acceptance Criteria

- [ ] Watcher table test, one row each: a drink (count down, health up) plays. An unequip (count down, health same) doesn't. Health up with the count the same doesn't. A refused full-health press (no change) doesn't. The first state doesn't. The first state after `forget()` doesn't. A state with no `current_player` followed by one with lower count and higher health doesn't (fresh baseline). Heal and damage netting no rise doesn't.
- [ ] In a run, drinking a potion plays one heal shimmer on the local player, which moves with them; a teammate's drink plays nothing on anyone.
- [ ] Two drinks a cooldown apart play two shimmers; a run reset mid-shimmer takes everything down, and the next first state is a baseline.
- [ ] No change to the hub or field scenes, to any existing effect, or to `game-server/`; existing tests pass.

## Blocked By

I-KZC92-1

## Spec Reference

FS-KZC92 §G R33–R38, §D R23 and R26 (follow, teardown in the scene); User Stories 1, 5–10, 13, 19; Edge States (heal and damage same tick, drink and equip same state, capped heal, die or escape mid-shimmer, reset mid-shimmer).

## TDD Approach

- RED: the watcher's table test (the drink row fails first).
- GREEN: the watcher; then the scene wiring and the reset.
