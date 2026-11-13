---
id: I-C8VM7-9
status: open
implements: FS-C8VM7
blocked_by: [I-C8VM7-7]
labels: [ready-for-agent]
title: "FS-C8VM7 slice 9: ability telegraphs and impacts, the dagger and rock flights, and their gallery cards"
---
Implements FS-C8VM7 §F (R36-R39)

**Type:** AFK. **Hotspot (client):** `monsters.ts` (the `ability` action's clip only),
`gameState.ts`, `canvasPalette.ts`, `src/dev/gallery/effects.ts`. Built against the spec's wire;
its server counterparts are I-C8VM7-2 and -3.

## Files expected to touch

- `game-client/src/types/gameState.ts` (`MonsterAction` gains `ability`; `MonsterState.ability?: {kind, x, y, radius, arc, remaining}`; `projectile_type` values `thrown_dagger`, `ogre_rock`)
- `game-client/src/render/effects/monsterAbility.ts` (new: circle and cone telegraphs filling toward landing, and impacts, in the hostile channel)
- `game-client/src/render/effects/thrownDagger.ts`, `ogreRock.ts` (new flights), `flights.ts` (their registration)
- `game-client/src/render/creatures/monsters.ts` (`action: "ability"` plays `attack` paced to the wind-up; a corpse's `burst` drawn)
- `game-client/src/utils/canvasPalette.ts` (telegraph and flight colours, `BARROW` tokens only)
- `game-client/src/dev/gallery/effects.ts` (a card per new piece)
- Tests next to each new file; `src/render/creatures/monsters.test.ts`

## What to Build

- R36: while `ability` has a radius, draw its area for `remaining`: a circle for `pounce`,
  `ground_slam`, `burst`, `wail`, a cone (`arc`, facing) for `cleave`; when the field goes, a short
  impact of the same shape; `burst` on the corpse.
- R37: `action: ability` plays the `attack` clip paced to the wind-up; a pounce's leap follows the
  server position.
- R38: `thrown_dagger` and `ogre_rock` flights in the hostile channel (the rock big and slow); a
  volley's arrows are bone arrows.
- R39: a gallery card for each new effect in the same change.

## Acceptance Criteria

- [ ] Each `ability` kind with a radius draws its shape at its centre for its `remaining` time, then an impact; `burst` draws on a corpse.
- [ ] `action: ability` plays the attack clip.
- [ ] `thrown_dagger` and `ogre_rock` draw their own flights; the gallery's effects registry has a card for each new effect and its registry test passes.
- [ ] No raw colour literal outside the palette (`npm run lint:fence` passes).
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` pass.

## Bounds

Client only. No HTTP contract change; generated client untouched.

## Blocked By

I-C8VM7-7

## Spec Reference

FS-C8VM7 §F R36-R39; user stories 9-12, 29; acceptance criteria "Client" 3-4.

## TDD Approach

- RED: a monster state with `ability: {kind: "ground_slam", radius: 130, remaining: 0.9}` draws a 130 px circle at its centre; a cleave a 120° cone along the facing.
- GREEN: the telegraph module, the flights, the clip mapping, the cards.
