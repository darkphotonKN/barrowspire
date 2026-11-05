# FS-HF0WW: The 2x archer, attacking on the move, legs inside the garment, trimmed frames

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "High-detail character art", "Walk-and-attack animation", "Legs stay inside garments", "Baked frames trimmed to their pixels" → this FS · Related ADRs: [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (2x and trimmed sheets, amends [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) §5), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md) (render scale up to 2), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4, every quad corner rounded) · Surface: game-client only (bake tool, baked art, client art code)

## Summary

The archer, the hero a player watches most, is baked at twice the detail (rendered at 4x, filtered down to 2x) and drawn at half size, so on a Retina or fullscreen canvas he is sharp instead of upsampled, and stands exactly as large as before. He keeps walking while he shoots: a new `walk_attack` clip lays the shot over the walk, legs toward the aim. Baking him at 2x showed what nobody saw at 1x: every class walked with its legs through its tunic or robe. The garment rig is fixed for the four classes, and the bake now refuses any character whose legs come out through its cloth. Each baked frame of the archer is cut to its pixels at bake time, which brings his texture memory from 137 MB back to 45 MB.

Retroactive work order: written from the thread after the work was done on branch `spike/archer-2x` (2026-11-05/06). Nick approved trying the 2x archer ("render 4x, downscale 2x, keep the look"), asked for the legs to move while attacking, for the leg clipping to be fixed in all four classes and kept from coming back, and for the frames' transparent padding to be trimmed at bake time (the archer first, as a per-sheet switch). Then asked for it in `main` (「幫我把圖片和回main」, 2026-11-06).

## Facts this spec rests on

- Every sheet was drawn at 1x from a 2x render (`game-client/docs/design-guideline.md`, "Linear filtering"). Since FS-ZAJMH the canvas draws at the screen's density up to render scale 2, where a 1x sheet is upsampled.
- The 1x archer sheet: 163×144 frames, anchor (0.4233, 0.75), crown 78, four clips (idle, walk, attack, death), about 22 MB decoded.
- Characters are skinned rigs authored in `tools/bake/page/characters/` (ADR-0021). A tunic, hauberk, coat or robe is `anatomy.js` `skirt()` over legs from `legs()`. `skirt()` weighted each half of the hem to the opposite thigh (the tube's side axis is −x, angle 0 the character's right; the weights read it as the left).
- Phaser registers trimmed frames natively (`Frame.setTrim`); sprite size, origin and arcade body read `realWidth` / `realHeight`. A crop on a trimmed frame is cut to its overlap with the cut and re-derived from it on every frame change (`Frame.setCropUVs`, `TextureCrop.setFrame` → `updateCropUVs`), in 3.90 and 4.2.1 alike.
- Phaser 4.2.1 rounds each corner of a sprite's quad on its own (`TransformerImage.run`, ADR-0057).

## Requirements

### A. The archer at 2x

1. The archer's sheet is baked at `scale` 2: rendered at 4x (the bake's 2x supersample × 2) over the same camera box as at 1x and box-filtered to 2x, so each frame is exactly twice the 1x frame each way (326×288) and the anchor fraction is unchanged. The look (lighting, materials, proportions) is the 1x look with more px.
2. The manifest records a sheet's `scale` (a whole number 1–4; absent is 1). The validator rejects any other value and a frame size that is not a multiple of it.
3. The bake measures `crown` and `length` on the frames brought back to 1x (`lib/downscale.mjs`), so they stay screen px and mean what they mean on a 1x sheet.
4. The client draws a sheet at 1/`scale` (`CharacterAnimator.artScale`, folded into `dress(sprite, size)`), so in world units its display size, origin and feet are those of the 1x sheet, everywhere a character is dressed: hub, field, run, the monster roster's path, the menu hero and the roster portrait.
5. Markers (name plate, HP and teammate bars) sit over the head where they sit for the 1x sheet: `markerBase` takes `artScale` and lifts by the crown in screen px times only the rest of the sprite's scale.
6. The run's arcade body keeps the size it has with a 1x sheet (`keepBodySize` in BarrowspireScene).
7. The menu figure keeps its size (`dress(sprite, scale)`), and the roster portrait keeps its 44×56 screen-px window, its crop taken in the frame's own px.
8. The bust portrait (dialogue card, party frames) cuts the same head and shoulders from a 2x frame as from a 1x one.
9. The archer's sheet bakes into its own group (`archer-*` atlas pages), so the shared `characters-*` pages are not reshuffled by its size.

### B. Attacking on the move (`walk_attack`)

10. The archer's sheet carries a fifth clip, `walk_attack`: 14 frames at 24 fps, exactly as long as his attack (7 at 12), played once. It is `boxed`: drawn inside the frame box the other clips set, never widening it; the bake fails rather than clip it.
11. From the waist up it is the attack key showing at that moment, each attack key held two frames as the attack plays it, the bow's draw and the arrow included; from the waist down (pelvis and legs) it is the walk, sampled over two walk cycles (`WALK_ATTACK_CYCLES`). The spine takes up the difference between the two pelvises, so the chest keeps the attack's aim while the hips stride. The cloth walks as in the walk and calms as in the attack.
12. In the client, an attack drawn while the body moves, on a sheet that carries `walk_attack`, plays it, turned to the aim when there is one: the legs walk toward the aim, whichever way the body is going. A standing attack plays `attack`. A charge's held pose (a hold longer than the attack) plays `attack` as before.
13. Starting or stopping moving mid-shot swaps between `attack` and `walk_attack` at the same point of the shot, not from its start.
14. Sheets without the clip (every other class and creature) attack as before.
15. Known and accepted limits: kiting (moving away from the aim) walks the legs backwards against the motion (a moonwalk); about 8 % foot slide; a hitch in the stance at each shot.

### C. Legs stay inside the garment

16. `skirt()` weights each half of the hem to the thigh on its own side; the follow builds from just under the waistband and is full by mid-skirt; with swaying panels, each panel is pushed out by how far the legs reach above the hem (`pushPanels`), and below the knee a robe hangs on its panels.
17. The four classes (knight, archer, wizard, mercenary) are built with the fixed `skirt()` and re-baked.
18. Every other sheet built on `skirt()` keeps the old weighting (`mirrored: true`), so its pixels do not move. No new garment uses `mirrored`.
19. The bake guards every character sheet (`characters/clearance.js`): in every pose of every clip but the death, no leg vertex between a garment's waistband and hem may lie more than 2 px (1x px measured in model space, an upper bound on the screen) further out through the garment than it does at rest. A sheet that breaks it fails the bake, naming the clip, the frame and the px.
20. `KNOWN_CLIPPING` lists the legacy sheets that still clip (troll, zombie, ghost, the trousered resident, the spirewarden, the quartermaster). A listed sheet passes while it clips and fails the bake once it no longer does, so the list only shrinks; a new sheet never joins it.
21. The design guideline carries the rule ("Legs stay inside the garment") and says to review the walk frames, not only the idle.

### D. Frames trimmed at bake time

22. A catalogue entry may set `trim: true` (today the archer only). Each of its frames is cut to the box that holds its pixels, grown by one transparent px for linear filtering and out to whole screen px (multiples of `scale`). The cut is lossless: the frame rebuilt from it is byte-identical to the frame baked.
23. A trimmed sheet's frames are shelf-packed at their own sizes, split across pages by clip only when they cannot fit one page.
24. The manifest marks the sheet `trimmed` and gives every frame its `trim {x, y, w, h}` inside the whole frame. The validator requires a `trim` on every frame of a trimmed sheet, inside the frame, on whole screen px, and none on an untrimmed sheet.
25. The client registers each cut with `Frame.setTrim` at the whole frame's size, so the sprite sizes, anchors, collides and draws as the whole frame. The roster portrait sets its crop again after every frame change; the bust portrait and the review contact sheet put the cut back at its offset.
26. The measures (crown, length, mean colour) read the whole frames.

### E. Verification

27. The bake stays deterministic: `npm run bake -- --check` reports no changes on a clean tree.
28. Nick checks the archer, the other three classes and the menus in a real browser (slice 6).

## User Stories

1. As a player on a Retina screen, I want my archer drawn at the screen's detail, so that the hero I watch all game is not the softest thing on screen.
2. As a player on a 1x screen, I want the archer to look as he did, so that the change costs me nothing.
3. As a player, I want the 2x archer to stand exactly as tall and wide as before, so that nothing about his size or where he stands changes.
4. As a player, I want my name plate and bars over the archer's head where they always were, so that the HUD does not jump.
5. As a player in a run, I want the archer to collide as he did, so that the sharper art changes no gameplay.
6. As a player in the menus, I want the archer's hero figure and roster portrait the same size and framing as the other classes', so that the roster reads evenly.
7. As a player talking to an NPC or in a party, I want the archer's bust in the medallion framed as before, so that the portrait does not crop oddly.
8. As an archer player, I want my legs to keep walking when I shoot on the move, so that I do not glide across the field in a standing pose.
9. As an archer player, I want my legs to face where I aim while I shoot, so that the shot reads as aimed.
10. As an archer player, I want a shot I start standing and continue moving (or the reverse) to carry on from where it was, so that the bow does not snap back to the start of the draw.
11. As an archer player charging a held shot, I want the held pose kept, so that the charge reads as before.
12. As a knight, wizard or mercenary player, I want my attacks unchanged, so that only the archer's clip is new.
13. As a player of any class, I want my legs to stay inside my tunic or robe as I walk and fight, so that the character does not look broken.
14. As the owner, I want the bake to fail when a new or changed character pushes a leg through its garment, so that the clipping cannot come back unseen.
15. As the owner, I want the legacy sheets that still clip listed, and the list to shrink only, so that I know what is left and a fix cannot be forgotten.
16. As an artist adding a character, I want the guideline to tell me how a garment must be built and what the bake checks, so that I get it right the first time.
17. As a player, I want the 2x archer not to cost three times the memory, so that the game still loads and runs on modest machines.
18. As the owner, I want trimming as a per-sheet switch, so that another heavy sheet can opt in later without new machinery.
19. As a developer, I want a trimmed frame to behave exactly like the whole frame in Phaser, so that no code that sizes, anchors or collides a sprite has to know about trimming.
20. As a developer, I want the manifest validator to refuse a malformed `scale` or `trim`, so that a bad bake cannot reach the client.
21. As a developer, I want every size outside the atlas to stay in screen px, so that a sheet's scale is invisible to gameplay and layout code.
22. As a reviewer, I want the bake to stay deterministic, so that a re-bake with no input change shows no diff.

## Acceptance Criteria

- [ ] The archer's manifest entry has `scale: 2`, 326×288 frames, the 1x anchor and crown 78, and five clips including `walk_attack`; no other sheet has a `scale`.
- [ ] In the hub, field and run, at render scale 1, 1.5 and 2, the 2x archer's display size, origin and feet in world units equal the 1x archer's; his name plate sits at the same height; the run's arcade body is the 1x size.
- [ ] The menu hero, the roster portrait window, the silhouette and the bust portrait match the 1x geometry.
- [ ] Shooting while moving plays `walk_attack` faced to the aim; shooting while standing plays `attack`; walking plays `walk`; a held charge plays `attack`.
- [ ] Switching between moving and standing mid-shot carries the shot on from the same point.
- [ ] Knight, wizard and mercenary are re-baked with the garment fix, and their walks on screen are the re-baked frames.
- [ ] The bake fails a character sheet whose legs come more than 2 px (1x px measured in model space, an upper bound on the screen) further out through its garment than at rest, naming clip and frame; a `KNOWN_CLIPPING` sheet that no longer clips also fails it.
- [ ] Every sheet other than the four classes is pixel-identical to before.
- [ ] The archer's frames are trimmed: one atlas page, about 45 MB decoded (137 MB untrimmed), every frame byte-identical to its untrimmed bake when re-expanded.
- [ ] In the world, the silhouette and the roster portrait, the trimmed archer draws pixel-identical to the untrimmed 2x archer at render scale 1 and 2; the differences at fractional scales are at most half a backing px (§ Verification).
- [ ] The manifest validator rejects a bad `scale`, a frame size not a multiple of it, a `trimmed` other than `true`, a trimmed frame without a `trim`, a `trim` outside the frame or off whole screen px, and a `trim` on an untrimmed sheet.
- [ ] `npm run bake -- --check` reports no changes; typecheck, the full vitest suite, lint and lint:fence pass.
- [ ] The design guideline carries the garment rule and the 2x exception to "Linear filtering"; `CONTEXT.md` defines sheet scale, trimmed sheet and walk-attack.
- [ ] Nick's browser check passes (slice 6).

## Edge States

- **Fractional render scale (1.25, 1.5, 1.75) and the menu hero (drawn at 0.65).** Where a trimmed frame's offset × sprite scale × render scale is not a whole backing px, Phaser 4's per-corner rounding draws the cut up to half a backing px from where the whole frame would draw it (0.87 for the menu hero), and that can change between frames of a clip by up to half a px (0.6 for the menu hero's attack). Measured, not fixed (ADR-0058 Consequences); a 2-screen-px trim grid would fix 1.5 only.
- **A trimmed sheet's animated crop** (the roster portrait): set again each tick after the clip steps, or Phaser would shrink it frame by frame.
- **A blank frame on a trimmed sheet**: keeps a one-cell cut at its top-left, so every frame has a size.
- **Shooting while kiting**: the legs face the aim and walk backwards against the motion (accepted limit, R15).
- **A charge (held shot)** while moving: plays `attack`, not `walk_attack`, so the held pose holds.
- **Death during `walk_attack`**: death plays over it as over any attack.
- **A sheet without `walk_attack`**: the attack slides along while moving, as before.
- **The 1x archer art** (any older bake, or a manifest without `scale`): drawn at scale 1, unchanged.
- **An atlas page missing**: the sheet falls back to its placeholder as any sheet does (FS-2325V).
- **A legacy sheet fixed later**: it passes the guard, so the bake fails until it is taken off `KNOWN_CLIPPING`.

## Verification (2026-11-06, Phaser 4.2.1, local main 750787ce + this work)

On our own dev server, headless Chrome, account `phaser4-trial@example.test`, hero Sylvan (archer). The art was served from three sets: the trimmed 2x bake, the same bake with trim off, and local main's 1x art. Each frame was set and rendered alone with the game loop asleep, then read back from the WebGL drawing buffer.

- **Trimmed vs untrimmed 2x.** Render scale 1 and 2: every hub frame of every clip at two sub-px positions (560), every silhouette (40) and the roster portrait (6) pixel-identical; the menu hero (13 frames, drawn at 0.65) differs. Render scale 1.5: no frame identical, offset at most 0.5 backing px, changing by at most 0.5 px between frames of one clip; a model of Phaser 4's per-corner rounding predicts identical vs different for all 560 hub frames at every scale. On Phaser 3.90 (earlier run) the same comparison gave at most 0.9 px and the same 0.5 px wobble.
- **2x vs 1x.** In world units, display size, origin and feet equal across 336 hub frames, 32 silhouettes and 19 menu frames at every scale; the run's arcade body (built as BarrowspireScene builds it) 60×60 at the same offset; the hub name plate at the same height (−85).
- **`walk_attack`.** In Gentle Meadows at render scale 1, 1.5 and 2: shooting while walking played `walk_attack` (82–89 frame changes, facing the aim), a standing shot `attack`, walking alone `walk`.
- **Leg fix.** Knight, wizard and mercenary walk frames on screen (64 each) differ from local main's, and at render scale 1 equal the re-baked frames within 1/255.

## Out of Scope

- Baking any other sheet at 2x, or trimming any other sheet. Each is a catalogue change plus a check of that sheet's readers (ADR-0058).
- Fixing the legacy sheets on `KNOWN_CLIPPING` (troll, zombie, ghost, folk) and the other `mirrored` sheets.
- Removing the sub-px offset of trimmed frames at fractional render scales and on the menu hero.
- Attacking on the move for the other classes.
- Fixing the moonwalk, foot slide and stance hitch of `walk_attack`.
- Any server or game-rule change: animation is presentation only (ADR-0020).
