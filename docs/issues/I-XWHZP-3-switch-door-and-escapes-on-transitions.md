---
id: I-XWHZP-3
status: open
implements: FS-XWHZP
blocked_by: [I-XWHZP-1, I-XWHZP-2]
labels: [ready-for-agent]
title: "FS-XWHZP slice 3: the switch, the escape door and escapes as hope lines, on transitions only"
---
Implements FS-XWHZP §D, §E

**Type:** AFK. Client only. **Hotspot:** `BarrowspireScene.ts` (after slice 2).

## Files expected

- `game-client/src/ui/loreCopy.ts` (pure transition checks: `turnedOn(previous, incoming)`; the escapes to announce against those already said, with a first-broadcast seed)
- `game-client/src/scenes/BarrowspireScene.ts` (`checkEscapeDoorStateChanges`, `checkPlayerEscapedState` and the `exit_door_unlocked` one-shot play hope lines; the first broadcast is the baseline)
- Tests beside each; `BarrowspireScene.test.ts`

## What to Build

The switch thrown, the `exit_door_unlocked` one-shot (held while loading, R19), the escape door
opening and a player escaping are `hope` lore lines in R16's words ("You walk out of the dark."
for the player themself), not HUD notices. Broadcast lines fire on a false → true transition
against the previous broadcast only; the first broadcast after a connect, reconnect, restart or
on a new floor is the baseline and says nothing; players already out on it are seeded as said;
each escape is said once per run (R22-R24). The switch and the one-shot show one line (R14).

## Acceptance Criteria

- [ ] `turnedOn` is true only for a previous false and an incoming true; never on a first broadcast.
- [ ] The escape check names each newly escaped player once, never one already out on the baseline.
- [ ] In the run scene: the switch flip, the door flip, an escape and the `exit_door_unlocked` one-shot each raise a hope lore line and no HUD notice; a first broadcast with the switch thrown, the door open or a player out raises none.
- [ ] The switch flip and the one-shot together show one line.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-XWHZP-1, I-XWHZP-2

## Spec Reference

FS-XWHZP §D R14, R16, R19, §E R22-R24; user stories 2-5, 17-19.

## TDD Approach

- RED: `turnedOn(undefined, true)` is false; `turnedOn(false, true)` is true.
- GREEN: the checks, the escape seed, then the scene's two state checks and the one-shot.
