---
id: I-B4SG9-6
status: open
implements: FS-B4SG9
blocked_by: [I-B4SG9-5]
labels: [blocked]
title: "FS-B4SG9 slice 6: the client draws the Bone Archer from its own sheet and plays its draw as the telegraph"
---
Implements FS-B4SG9 §C (R20, R21)

**Type:** AFK. Starts only after the owner has approved I-B4SG9-5's contact sheet.

## Files owned

- `game-client/src/types/gameState.ts` (`bone_archer` on `MonsterArchetype`)
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts` (the `MONSTER_LOOKS` row)
- `game-client/src/render/art/sceneArt.test.ts` only if it enumerates the `creatures` group's sheets

## What to Build

- `bone_archer` on the archetype type and in `MONSTER_LOOKS`: sheet `creature_bone_archer_base`,
  tier fodder (R20). Nameplate, elite prefix split, elite wash, HP bar, target frame, targeting,
  damage flash, death and corpse all follow from the existing roster with no new code.
- The telegraph (R21) is the existing path: the `attack` action plays the sheet's `attack` clip
  in the facing the server sends. The server now turns that facing during the wind-up; the test
  pins that a facing change mid-`attack` is followed. No new action, clip name or wire field.

## Acceptance Criteria

- [ ] `monsterLook("bone_archer")` is `creature_bone_archer_base` at the fodder tier, not the
      troll fallback; the archetype type includes it.
- [ ] `elitePlate` on an elite named "Dread Bone Archer" gives prefix "Dread" and rest
      "Bone Archer · Lv N".
- [ ] A `bone_archer` reporting `attack` plays the `attack` clip in the facing sent and follows a
      facing that changes during it.
- [ ] `npm test` and the lint fence pass in game-client.

## Blocked By

I-B4SG9-5

## Spec Reference

FS-B4SG9 §C R20–R21; user stories 2, 3, 4, 15, 19; acceptance criteria "Client" 1–3.

## TDD Approach

- RED: `monsterLook("bone_archer")`; `elitePlate` for "Dread Bone Archer".
- GREEN: the type member and the `MONSTER_LOOKS` row.
