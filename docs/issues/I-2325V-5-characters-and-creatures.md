---
id: I-2325V-5
status: open
implements: FS-2325V
blocked_by: [I-2325V-1, I-2325V-2]
labels: [blocked]
title: "FS-2325V slice 5: baked 8-direction characters and creatures from rigged models"
---
Implements FS-2325V §E

**Gated on the owner.** Needs slices 1 and 2, **and the owner downloading the Mixamo models**
(Adobe login; an agent cannot authenticate). Once the models are in `tools/bake/sources/`, this
can run alongside slices 3 and 4.

## What to Build

1. **Human step (HITL), before the agent starts.** The owner downloads Mixamo FBX characters and
   animations into `game-client/tools/bake/sources/` (gitignored).
   - Suggested starting picks:
     - knight/warrior: an armoured paladin/knight;
     - archer: a ranger/hooded figure;
     - wizard: a robed mage;
     - rivals: reuse the class models;
     - creatures: a skeleton/zombie and a brute (e.g. Mixamo's troll-like "Warrok").
   - Animations: idle, walk, a class attack (sword slash / bow shot / spell cast), and death.
   - Download "without skin" animation files where offered, alongside one skinned character.
2. **Bake**: extend `tools/bake/` to load FBX (three's FBXLoader; GLB also accepted) and bake
   8 directions × {idle, walk, attack, death}. The manifest records source ("Mixamo: <asset>") and
   licence per sheet. Sheet names leave room for equipment layers.
3. **Scenes** play the animation matching state they already know (moving / idle / attacking /
   dead), in the slice-1 8-way facing. The character stands on its footprint anchor with its
   shadow screen-right. No new state is invented to drive animation.

## Acceptance Criteria

- [ ] Every class and creature has 8-dir idle, walk, attack and death sheets in `public/art/`,
      each with recorded source and licence (manifest schema test covers it).
- [ ] No raw FBX/GLB committed; `tools/bake/sources/` stays gitignored.
- [ ] Scenes swap to the baked sheets; placeholder textures are used only as fallback.
- [ ] `git diff main... -- game-server/` is empty; no WS payload field changes.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

I-2325V-1 (projection + 8-way facing), I-2325V-2 (bake tool + loader), and the owner's model
download.

## Spec Reference

FS-2325V §E.1–E.6. User stories 5, 6, 7, 8, 28.

## TDD Approach

- RED: `animationSelect.test.ts`: (moving, idle, attacking, dead) × velocity → expected
  manifest animation key and direction.
- GREEN: pure selector in `src/render/art/` used by both scenes.
