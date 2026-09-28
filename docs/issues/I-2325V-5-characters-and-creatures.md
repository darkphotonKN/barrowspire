---
id: I-2325V-5
status: done
implements: FS-2325V
blocked_by: [I-2325V-1, I-2325V-2]
labels: [ready-for-agent]
title: "FS-2325V slice 5: 8-direction characters and creatures, authored in code and baked"
---
Implements FS-2325V §E

**Needs slices 1 and 2.** Once they land, this can run alongside slices 3 and 4. No download and
no third-party models (ADR-0021). The one human step is the owner's review of the contact sheet
before scenes switch over.

## What to Build

**Fidelity bar (owner, 2026-09-27): Ultima Online level.**
- Believable proportions, readable silhouettes and textured gear.
- Not photoreal, and not super-realistic: UO's own characters aren't.
- Also not the blocky, cartoony mannequins of the spike.

Spend effort on silhouette, materials and motion rather than faces or fine anatomy. Stop at "reads
like UO at game scale", not beyond.

1. **Shared rig**, in `tools/bake/`: one humanoid skeleton (`Bone` / `SkinnedMesh`) with
   smooth-skinned bodies built from shaped geometry (lathe, tapered tube, subdivided shapes).
   Joints must bend without seams; stacked rigid primitives are not acceptable (that was the
   spike's weakness). Creature variants change proportions and add bones (tail, jaw, hunch).
2. **Materials**: procedurally generated textures and normal maps (mail, plate, leather, wool,
   rust, grime), with colours from `BARROW`.
3. **Cast**:
   - knight: mail and plate, tabard, sword and shield;
   - archer: hooded ranger in leather, with a bow;
   - wizard: robed, with a staff;
   - rivals: reuse the class models;
   - creatures in the run: a ghoul/skeleton and a hunched brute (troll).

   The spike's knight, ghoul, troll and mage show the intended look and silhouettes. They were
   built from rigid primitives; this slice rebuilds them to a higher standard.
4. **Hand-keyed clips on the shared rig**: idle (breathing, weight shift), walk (planted feet,
   knee fold, arm counter-swing, torso twist, as in the spike), a class attack (slash / shot /
   cast) and death. Cloaks, robes, hair and tails get spring-lagged secondary motion.
5. **Bake** 8 directions × {idle, walk, attack, death}.
   - The manifest records source `authored: <bake module>` and the project licence.
   - Sheet names leave room for equipment layers.
6. **Contact sheet**: the bake also writes a review page or image showing every class and
   creature × 8 directions × each animation, at game scale and zoomed ×2.
   - **Stop and hand it to the owner.**
   - Scene integration (step 7) proceeds only after approval.
7. **Scenes** play the animation matching the state they already know (moving / idle / attacking /
   dead), in the slice-1 8-way facing. The character stands on its footprint anchor with its
   shadow falling screen-right. No new state is invented to drive animation.

## Acceptance Criteria

- [ ] Every class and creature has 8-dir idle, walk, attack and death sheets in `public/art/`,
      each with a manifest source of `authored: …` (the manifest schema test covers it).
- [ ] No third-party model, animation or texture is used, and no FBX/GLB is loaded.
- [ ] Bodies are skinned meshes: no visible seams at the elbow, knee or hip in the contact sheet.
- [ ] The owner has approved the contact sheet (HITL).
- [ ] Scenes swap to the baked sheets; placeholder textures are used only as fallback.
- [ ] The bake stays deterministic (a re-bake produces no git diff).
- [ ] `git diff main... -- game-server/` is empty; no WS payload field changes.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

I-2325V-1 (projection + 8-way facing), I-2325V-2 (bake tool + loader).

## Spec Reference

FS-2325V §E.1–E.7 (ADR-0021). User stories 5, 6, 7, 8, 25, 28.

## TDD Approach

- RED: `animationSelect.test.ts`: (moving, idle, attacking, dead) × velocity → expected
  manifest animation key and direction.
- GREEN: pure selector in `src/render/art/` used by both scenes.
