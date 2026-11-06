# FS-3V7GC: Knight, wizard and mercenary baked at 2x, attacking on the move, trimmed

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "High-detail character art", "Walk-and-attack animation", "Legs stay inside garments", "Baked frames trimmed to their pixels" (the lines point at FS-HF0WW and name capabilities, not a class, so they stay as they are; this FS brings the other three classes under them) · Related: [FS-HF0WW](HF0WW-2x-archer-walk-attack-leg-clearance-trim.md) (the archer's work order, which this repeats for the other three), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (a sheet may be baked at 2x and trimmed, opted into per sheet), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (animation is presentation only) · Surface: game-client only (bake tool, baked art, client art docs)

## Summary

The knight, the wizard and the mercenary are baked the way FS-HF0WW baked the archer: rendered at 4x, filtered down to 2x and drawn at half size, so they are sharp on a Retina or fullscreen canvas and stand exactly as large as before. Each keeps walking while it attacks (`walk_attack`, the attack from the waist up over the walk from the waist down, legs toward the target), and each frame is trimmed to its pixels at bake time. Each class packs into its own atlas group, as the archer does. At 2x the leg guard's limit halves to 0.5 1x px. The wizard's walk and walk-attack showed 0.85 against her robe, and no setting of the robe itself brought it under. So the thighs of all four classes are drawn further in under their garments: one shared clearance, unchanged in kind.

Nick approved all four classes at 2x with legs moving while attacking and frames trimmed from the start (「先幫我把目前４個人物都做４倍縮到２倍 然後攻擊移動時腳要會動 可以一開始製作就去除白色嗎」); FS-HF0WW did the archer; then he asked for the other three (「做其他3個角色吧」, 2026-11-06), with every class's thighs slimmed alike: the shared `legs({ under })`, one `UNDER_CLEAR`, no per-class clearance.

## Facts this spec rests on

- After FS-HF0WW the archer alone is at 2x and trimmed. The knight (160×146 frames), the wizard (143×134) and the mercenary (161×146) are 1x sheets on the shared `characters-0..2` pages, 65.3 MB (62.2 MiB) decoded together on three pages (width × height × 4).
- What FS-HF0WW built is per sheet already. The bake reads `scale`, `trim` and `animations` from the catalogue entry (`page/main.js`, `bake.mjs`). `walkAttackClip` and `layerPoses` take any style (`characters/clips.js`). The client plays `walk_attack` on any sheet that carries it (`CharacterAnimator` asks the art library), draws any sheet at 1/`scale`, and registers any sheet's trims. The validator checks `walk_attack` on any sheet. The client loads every atlas the manifest lists, so no code names an atlas group.
- Every attack the client draws carries an aim toward its target, melee included (`render/combat/playerCombat.ts`), and the warrior's charge passes a hold longer than the attack.
- The leg guard (FS-HF0WW R19) holds a 2x sheet to 0.5 1x px. Before this work, at 1x, the worst in-motion values were knight 0.20, wizard 0.85 and mercenary 0.40 (archer 0.47). With `walk_attack` they are knight 0.25, wizard 0.85 and mercenary 0.45, measured on the bake page (`bakeClearance`).
- The wizard's worst point is the leading thigh's front flank at mid-thigh (0.41 H) and at the knee, deep inside the robe at rest. The robe there follows the thigh by only about a fifth of its swing. Garment settings measured on 2026-11-06 (worst in motion, 1x px): moving her `trail: 0.02` into `gown` 0.85 (no change); `legFollow` 0.55 / 0.6 / 0.65 / 0.7 → 0.81 / 0.80 / 0.85 / 0.94; `panelWeight` 0.45 / 0.55 / 0.7 → 0.81 / 0.78 / 0.75; a `belly` of 0.004 / 0.006 / 0.008 → 0.87 / 0.88 / 0.89. None reaches 0.5, and the larger ones change how the robe sways.
- `legs({ under })` draws a thigh in to `UNDER_CLEAR` inside its garment's wall wherever the garment covers it, and nothing under the hem moves (FS-HF0WW R17). The same constant for all four classes, wizard worst in motion: 0.035 → 0.557, 0.0375 → 0.518, 0.04 → 0.31 (knight 0, archer 0.07, mercenary 0).

## Requirements

### A. The three classes at 2x

1. The knight's, wizard's and mercenary's sheets are baked at `scale` 2, as FS-HF0WW R1 bakes the archer: rendered at 4x over the same camera box and box-filtered to 2x, so each frame is exactly twice its 1x frame each way and the anchor fraction is unchanged. The bake measures `crown` on the frames brought back to 1x (FS-HF0WW R3).
2. Each class packs into its own atlas group (`knight-*`, `wizard-*`, `mercenary-*` pages, as `archer-*`), and the shared `characters` group is gone. Nothing in the client names an atlas group.
3. The client draws them through FS-HF0WW R4–R8, unchanged. In world units their display size, origin and feet are those of their 1x sheets; markers, the run's arcade body, the menu figure, the roster portrait and the bust portrait keep their 1x geometry. No client code changes for it.

### B. Attacking on the move

4. Every class sheet carries `walk_attack`, as the archer's does (FS-HF0WW R10–R11). It runs 14 frames at 24 fps, exactly as long as the class's attack, and plays once. It is `boxed`: drawn inside the frame box the other clips set, never widening it. From the waist up it shows the attack key at that moment, each key held two frames, with the class's own additions (the mercenary's free arm, the wizard's orb flare). From the waist down it is the walk over two cycles, and the spine takes up the difference between the pelvises. The attack's lunge (its body offset) is not kept, since that would slide the planted feet (`layerPoses`).
5. A class's clips are one rule (`characters/clips.js`): the creature clips plus `walk_attack` (`CLASS_ANIMATIONS`), and the mercenary's also his parry (`MERC_ANIMATIONS`). Creatures and hub folk carry no `walk_attack`.
6. The client plays it by FS-HF0WW R12–R13, now on all four classes. An attack drawn while the body moves plays `walk_attack`, turned to the aim, which for a melee swing is its target: the legs walk toward it. A standing attack plays `attack`. A held charge (the warrior's) plays `attack`. Starting or stopping mid-swing carries on from the same point.
7. The mercenary's parry while moving stays as it is: the whole-body guard slides with him (FS-MAMHR §G.35). There is no walk-parry. A cut thrown inside the stance while moving plays `walk_attack`, as any cut over the stance plays over it.
8. The known limits of FS-HF0WW R15 apply to every class: walking backwards against the motion when attacking away from it (the moonwalk), about 8 % foot slide, and a hitch in the stance at each attack.

### C. Legs stay inside the garment

9. The guard is unchanged: 0.5 1x px for a 2x sheet (`clearanceLimit(2)`), at rest and in every clip but the death, `walk_attack` included. No class joins `KNOWN_CLIPPING`, and the limit is not loosened.
10. All four classes keep one shared thigh rule, `legs(rig, mat, { under })` with one `UNDER_CLEAR`, now 0.04 H (was 0.012). That is the least, in steps of 0.0025 H, that holds the 2x wizard under the limit. There is no per-class clearance. The archer is re-baked by it.
11. No garment changes: the knight's hauberk, the archer's tunic, the wizard's robe and scapular, and the mercenary's coat keep every `skirt` option they have, so their cloth looks and sways as before. The thighs drawn further in lie under the cloth; at rest the change is a handful of edge px per frame.

### D. Frames trimmed at bake time

12. The three sheets are `trim: true`, cut as FS-HF0WW R22–R25 cuts the archer's, and drawn, anchored and sized as their whole frames.

### E. Verification

13. The bake stays deterministic: `npm run bake -- --check` reports no changes on a clean tree.
14. The decoded texture memory of each new atlas page, and the total before and after, are measured and recorded here.
15. Nick checks the three classes, their walk-attack and the menus in a real browser (slice 4).

## User Stories

1. As a knight, wizard or mercenary player on a Retina screen, I want my hero drawn at the screen's detail, as the archer is, so that every class looks equally sharp.
2. As a player on a 1x screen, I want the three classes to look as they did, so that the change costs me nothing.
3. As a player, I want each class to stand exactly as large as before, with its name plate and bars where they were and its collisions unchanged, so that nothing about play changes.
4. As a knight or mercenary player, I want my legs to keep walking when I swing on the move, facing what I swing at, so that I do not glide across the field in a standing pose.
5. As a wizard player, I want my legs to keep walking when I cast on the move, so that the cast reads as hers and not a slide.
6. As a knight player charging, I want the charge's held pose kept, so that the charge reads as before.
7. As a mercenary player, I want my parry to behave as it does today, so that the guard I time is not changed by art work.
8. As a player of any class, I want my legs to stay inside my tunic, hauberk, coat or robe at the sharper detail, so that the character never looks broken.
9. As the owner, I want every class's thighs slimmed by the same rule, so that the four classes are built alike and no class carries its own exception.
10. As the owner, I want the leg guard's limit kept and no class on its exception list, so that the clipping cannot come back.
11. As a player, I want the three sharper sheets to cost far less than four times their memory, so that the game still loads on modest machines.
12. As a developer, I want the classes' clips to come from one rule, so that a fifth class gets `walk_attack` without new machinery.
13. As a reviewer, I want the bake to stay deterministic, so that a re-bake with no input change shows no diff.

## Acceptance Criteria

- [ ] The knight's, wizard's and mercenary's manifest entries have `scale: 2`, frames twice their 1x size each way, their 1x anchors and crowns, `trimmed: true`, and `walk_attack` among their clips (the mercenary's with `parry` as well); each sits on its own group's pages; no `characters-*` page remains; no sheet but the four classes has a `scale`.
- [ ] Every class's `walk_attack` lasts exactly as long as its attack, plays once, is 8-way, and never widens the frame box.
- [ ] Attacking while moving plays `walk_attack` faced to the aim for every class; a standing attack plays `attack`; a held charge plays `attack`; the mercenary's parry while moving plays `parry`.
- [ ] In world units each class's display size, origin and feet equal its 1x sheet's (§ Verification).
- [ ] The bake's leg guard passes all four classes at 0.5 1x px with `UNDER_CLEAR` 0.04 and no other change to any garment; `KNOWN_CLIPPING` and `clearanceLimit` are unchanged.
- [ ] The decoded memory of each new page and the totals before and after are recorded (§ Verification).
- [ ] `npm run bake -- --check` reports no changes; typecheck, the full vitest suite, lint and lint:fence pass.
- [ ] The design guideline and `CONTEXT.md` say walk-attack and the 2x exception cover the four classes.
- [ ] Nick's browser check passes (slice 4).

## Edge States

- **A melee swing with no target** (a swing into air): the attack has no aim, so `walk_attack` faces the way the body walks, as the archer's does.
- **The knight's charge while moving**: plays `attack`, its held pose held, never `walk_attack`.
- **The mercenary's parry while moving**: the guard, whole-body, sliding with him as today; a cut inside it plays `walk_attack` over it.
- **Death during `walk_attack`**: death plays over it, as over any attack.
- **Fractional render scale and the menu hero**: the trimmed frames' sub-px offset of ADR-0058 Consequences now applies to all four classes; Nick judges it in the browser check, as for the archer.
- **The archer**: re-baked by the shared `UNDER_CLEAR`; its frames differ from FS-HF0WW's bake at the thighs and the shadow they cast, and in nothing else.
- **An atlas page missing**: the sheet falls back to its placeholder as any sheet does (FS-2325V).

## Out of Scope

- Baking or trimming any sheet other than the four classes (creatures, folk, props): each is its own work (ADR-0058).
- A walk-parry for the mercenary.
- Fixing the moonwalk, foot slide and stance hitch of `walk_attack` (FS-HF0WW R15).
- Removing the trimmed frames' sub-px offset at fractional render scales.
- The legacy sheets on `KNOWN_CLIPPING`.
- Any server or game-rule change: animation is presentation only (ADR-0020).
