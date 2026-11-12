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
17. The four classes (knight, archer, wizard, mercenary) are built with the fixed `skirt()`, their thighs drawn in under it (`legs(rig, mat, { under })`, given the garment's `skirt` options: every bind-pose vertex the garment covers that lies past its wall less 0.012 H is pulled in to that line, nothing under the hem moves), and re-baked.
18. Every other sheet built on `skirt()` keeps the old weighting (`mirrored: true`), so its pixels do not move. No new garment uses `mirrored`.
19. The bake guards every character sheet (`characters/clearance.js`): in every pose of every clip but the death, no leg vertex the garment covers, from its top ring (the waistband included) to its hem, may lie more than one baked px outside the cloth over it: 1 px at 1x, 0.5 px for a sheet baked at 2x (1x px measured in model space, an upper bound on the screen; `clearanceLimit(scale)`). The distance is absolute, not measured from where the leg sits at rest, so a leg already outside the garment at rest fails. A belt or sash over the waistband counts as cover over its own height. A sheet that breaks it fails the bake, naming the clip, the frame and the px.
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
- [ ] The bake fails a character sheet with a leg more than one baked px (1 px at 1x, 0.5 at 2x; 1x px measured in model space, an upper bound on the screen) outside its garment or the belt over its waistband, at rest or in any clip but the death, naming clip and frame; a `KNOWN_CLIPPING` sheet that no longer clips also fails it.
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

## Change: Class sheets at 1.5x
Status: work-order
Date: 2026-11-12

> Anchored here, not on FS-3V7GC or within FS-JS7C8: this FS owns "High-detail character art",
> the capability a sheet's `scale` serves, and the rule this change rewrites (R1's 2x archer, R2's
> whole-number `scale`, R22's trim on multiples of `scale`). FS-3V7GC repeats this work order for
> the other three classes under the same lines, and FS-JS7C8 owns the clips the re-bakes carry,
> not their scale; both are pointed at from here (R39). Decision: [ADR-0076](../adr/0076-a-sheet-may-be-baked-at-1-5x-its-frame-and-trim-on-a-two-screen-px-grid.md),
> amending ADR-0058 Decisions 1 and 3.

The owner's words. On 2026-11-12, with the archer re-baked for FS-JS7C8 on two pages at 2x
(84.70 MB RGBA, +88 % over main), he agreed to the plan "if 1.5x is acceptable, all four classes
move to 1.5x", approved the spike (「好」), and after its side-by-side page of the archer at 1.5x
and at 2x on his Retina screen said: 「感覺可以」.

### Facts this change rests on

- The spike (`spike/archer-1p5x`, 16adf4c4, throwaway): the archer at 1.5x is one page,
  3820×2720, 41.56 MB RGBA, PNG 5.75 MB; against the 2x archer 15–22 % softer at render scale 2,
  sharper at 1.5, equal at 1, no shimmer at any render scale. Its bake changes left every other
  atlas byte-identical.
- The client draws a sheet at 1/`scale` through `sheetScale` (R4–R8). Its readers:
  `CharacterAnimator.artScale` (`dress`), `markerBase` (markers, `artScale`), `keepBodySize`
  (BarrowspireScene, `artScale`), `MenuFigure` (the figure's size and the roster portrait's crop)
  and the manifest validator (`screenScale`). The bust portrait reads the frame's own px and no
  scale.
- The roster portrait's crop is screen px × `scale`. At 1.5 a crop edge on an odd screen px is half
  a frame px.

### Requirements

29. A sheet's `scale` is 1, 1.5, 2, 3 or 4 (ADR-0076 Decision 1). The validator refuses any other
    value (1.25, 2.5, 3.5, 0.5, 5 among them), a frame size that is not a whole number of screen
    px (`frameWidth / scale`, `frameHeight / scale` whole) and, on a trimmed sheet, a `trim` off the
    grid of R31.
30. At a fractional `scale` the bake cuts the 1x frame box on a grid of `q` 1x px, `q` the least
    whole number making `scale × q` whole (2 at 1.5): each side of the anchor is rounded up to a
    multiple of `q`, so the frame is exactly `scale` times the 1x box and the anchor is a whole px
    in it. It renders at the supersample × `scale` (3x at 1.5) over that box and box-filters to
    `scale`×. At a whole `scale` nothing changes: every sheet not at 1.5 keeps its bytes.
31. A trimmed sheet's cut lies on whole multiples of `q` screen px: `scale × q` sheet px (3 at
    1.5, two screen px; 2 at 2x and 1 at 1x, as R22 had it).
32. The bake measures `crown` and `length` on the frames brought back to 1x by an exact area filter
    (R3): at a fractional scale a nearest blow-up by `q`, then a `scale × q` box.
33. Every reader of `sheetScale` works at 1.5, unchanged in what it gives: the display size, origin
    and feet in world units are those of the 1x sheet (R4); markers sit over the head as for a 1x
    sheet (R5); the run's arcade body keeps its 1x size (R6); the menu figure keeps its size (R7).
    The roster portrait keeps its 44×56 screen-px window and its crop lies on whole frame px: at
    1.5 its top edge is moved up to the `q`-screen-px grid (one more px of headroom when the crown
    would put it between px), so the crop's origin and size are whole frame px. The bust portrait
    cuts the same head from a 1.5x frame (R8).
34. The archer's sheet (`char_archer_base`) is baked at `scale` 1.5 with every clip it carries
    (FS-JS7C8: `run`, `walk_attack`, `backpedal_attack`), trimmed, in its own `archer` group. The
    re-bake changes only the archer's pages and the manifest; every other atlas keeps its bytes.
35. The knight, the wizard and the mercenary are baked at 1.5 when each is re-baked with `run` and
    `backpedal_attack` (FS-JS7C8 slices 6–8, I-JS7C8-6..8), and not before: until then they stay
    at 2, and the client draws each sheet at its own scale.
36. The design guideline's "Linear filtering" says which sheets are 1.5x and why (memory against
    crispness at render scale 2, the owner's eye-check); `CONTEXT.md`'s sheet scale names 1.5.
37. The decoded memory of the archer's pages and of all atlases, before and after, is measured
    from the manifest and recorded here (§ Verification), and in I-JS7C8-12's VRAM gate.
38. The bake stays deterministic (R27).
39. Pointers: FS-3V7GC R1 ("baked at `scale` 2") and FS-JS7C8 R1 ("baked with the class's sheet at
    2x") read "at the class's scale, 1.5 from its FS-JS7C8 re-bake" for each class from this change
    on.

### Acceptance Criteria

- [x] The validator accepts `scale` 1, 1.5, 2, 3 and 4 and refuses 1.25, 2.5, 3.5, 0.5 and 5; at
      1.5 it refuses a frame size that is not a whole number of screen px and a `trim` off the
      3-sheet-px grid (`manifest.test.ts`).
- [x] The baker's frame box at 1.5: frame and anchor whole px, each side of the anchor a multiple
      of two 1x px, the frame exactly 1.5 times the 1x box; at 1 and 2 the box is unchanged
      (`frameBox` tests).
- [x] `trimRect` at grid 3: offset and size multiples of 3, lossless round trip (`trim.test.mjs`).
- [x] `downscale(…, 1.5)` equals a hand-computed area filter (`downscale.test.mjs`).
- [x] At `artScale` 2/3: the display size, the markers' rise, the arcade body (60×60) and the menu
      figure's scale are the 1x sheet's; the roster portrait's crop is whole frame px with the
      44×56 window (`character.test.ts`, `markers.test.ts`, `BarrowspireScene.test.ts`,
      `menuFigure.test.ts`).
- [x] The archer's manifest entry has `scale: 1.5`, `trimmed: true`, its clips, one atlas page; no
      other atlas changes bytes.
- [x] Memory recorded (§ Verification); `npm run bake -- --check` reports no changes; typecheck,
      the full vitest suite and lint pass.
- [x] Guideline and `CONTEXT.md` updated.

### Edge States

- **Fractional render scale.** A 1.5x sheet drawn at its true size has its frame, anchor and cuts
  on two-screen-px steps: whole backing px at render scale 1, 1.5 and 2, so ADR-0058's sub-px
  offset of a trimmed frame is gone there. At 1.25 and 1.75 it remains, at most half a backing px.
- **The menu hero** (its 1.3 menu scale, a sprite scale of 0.87 on a 1.5x sheet; the character
  creation preview likewise): its cuts are still drawn up to a fraction of a backing px from where
  the whole frame would draw them, as ADR-0058 describes for the 2x hero.
- **The frame box grows** by at most one 1x px on each side of the anchor (the rounding to `q`):
  the frame in screen px can be up to 2 px wider and taller than its 2x bake; the anchor fraction
  moves by that px. Nothing in play moves: every size is screen px.
- **A crown that puts the roster portrait's top on an odd screen px**: the crop starts one px
  higher (one more px of headroom); the head is never cut.
- **Two scales at once**: until slices 6–8 the archer is 1.5x and the other classes 2x; each sheet
  is read at its own scale.
- **An older manifest** (the archer at 2, or no `scale`): drawn at its own scale, as before.

### Out of Scope

- Baking creatures, folk, the boss or props at 1.5 (each its own work and reader check, ADR-0058).
- Any fractional scale other than 1.5.
- Re-baking the knight, wizard or mercenary here (FS-JS7C8 slices 6–8 do it at 1.5).
- Changing the render-scale cap or the groups' residency (ADR-0056, ADR-0059).

### Verification (2026-11-12, branch `feat/run-sheets-1p5x`, I-HF0WW-8)

- **Bake.** The archer re-baked at 1.5 with every clip (and FS-JS7C8's fast run, I-JS7C8-13):
  252×225 frames (168×150 screen px; the 2x bake's 332×300 was 166×150, the frame box grown by one
  1x px on each side of the anchor's x), anchor (105, 171) px, fraction (0.4167, 0.76), crown 78,
  512 frames, trimmed. The leg-clearance guard passes at 1.5 (2/3 1x px). Only `archer-0.png`
  and `manifest.json` changed; `archer-1.png` is gone; every other atlas keeps its bytes.
- **Texture memory** (decoded, width × height × 4, from the manifest):

  | archer sheet | pages | page px | RGBA | PNG bytes |
  |---|---|---|---|---|
  | main (2x, 336 frames) | 1 | 2924 × 3844 | 44.96 MB | 6,289,416 |
  | I-JS7C8-12 (2x, 512 frames) | 2 | 4092 × 3760 + 4088 × 1416 | 84.70 MB | 6,557,998 + 2,992,142 |
  | this bake (1.5x, 512 frames) | 1 | 3820 × 2716 | 41.50 MB | 5,749,502 |

  −51.0 % against the 2x bake, −7.7 % against main's 2x archer without the new clips; the trimmed
  frames alone hold 39.31 MB. The four class groups: 216.58 → 173.38 MB (knight 47.98, wizard
  36.51, mercenary 47.39, all still 2x). All atlases: 771.00 → 727.80 MB.
- **Readers at 1.5** (unit tests): `artScale` 2/3, `dress` sizes a 246×216 frame to 164×144
  screen px and composes the menu hero's 1.3; `markerBase` seats the markers where a 1x sheet's
  sit; `keepBodySize` keeps the 60×60 body; `MenuFigure` keeps its size at 1, 1.3 and 1.5, and the
  roster portrait's crop is whole frame px (it was 70.5, 31.5 on a synthetic sheet with an odd
  crown and anchor; the shipped archer's anchor (70, 114) and crown 78 land on the grid as they
  are). The bust portrait reads the frame's own px and no scale.
- **Suite.** The resident-page tests that failed with the archer on two pages (33) pass again;
  the whole client vitest, typecheck and lint pass; `npm run bake -- --check` reports no changes.

## Change: The guard measures a leg through the cloth
Status: work-order
Date: 2026-11-12

> Written `--from-thread` on 2026-11-12 during FS-JS7C8's class re-bakes (I-JS7C8-6..8). The
> guard (§C R19) refused the shared fast run on the three long garments: the knight's hauberk
> 13.02 px, the wizard's robe 6.27, the mercenary's coat 2.66 (limit 2/3 px at 1.5x). Told so, the
> owner chose to change the garment rig ("改衣服的骨架", 2026-11-12) so the hems follow the legs.
> Before changing it, each flagged leg vertex was checked a second way, along a level ray from the
> pelvis out through it against the garment's triangles as they hang: of the run's flagged
> vertices, almost all lie under cloth (the ray meets the cloth beyond them) or below the hem
> (the ray meets no cloth: a kicked heel under a lifted hem, seen beneath it, not through it).
> What truly crosses the cloth goes 0.41 px past it at most (the robe), 0.10 (the hauberk), none
> (the coat), under the limit, with today's garments. The over-count is the guard's: it cuts each
> band of rings square to the axis between their centres, and a hem tilted by a stride or a heel
> reads a leg under it as out. So the fix is the measure, not the cloth: the garments keep their
> rig, look and swing, which the owner's words were after ("no leg through it", the cloth still
> hanging as cloth). Anchored here: §C owns the guard and R19 its measure.

### Requirements

22. The guard keeps its ring measure (R19) as the first pass. A leg vertex it puts outside the cloth
    is measured again along the level ray from the pelvis's vertical axis out through the vertex,
    against every cover's surface (its quads between consecutive rings) as posed:
    - cloth beyond the vertex: it lies under the cloth (inside);
    - cloth only between the axis and the vertex: it is through the cloth, by its distance past
      the outermost crossing;
    - no cloth on the ray: no cloth covers it (below the hem, in an opening), as R19's null.
    The limit, the death's exemption, `KNOWN_CLIPPING` and `MIRRORED_LEGACY` are unchanged.
23. No garment, rig or clip changes for this; the guard only gates, so no sheet's bytes move by it.

> **Edited in place on 2026-11-12 (still a work-order): the robe in the run.** After playing the
> wizard at 1.5x, the owner said: "法師跑步會輕微破圖 膝蓋處會凸出衣服 腰部似乎也有一點" (the wizard's
> run breaks slightly: at the knee the leg pokes out of the robe, and a little at the waist too),
> then "法袍後面小腿處的裙擺綠色區塊跑動時似乎會被黑色吃掉" (at the back of the robe, around the calves,
> the green panel of the hem seems to be eaten by black while running). The guard (R19, R22) had
> passed the run at 0.41 px. Rendered from the bake's camera in all 8 facings with every part in a
> flat colour, the run showed the leading knee through the gown and the teal scapular in keys 1 and
> 5 (up to 26 baked px a frame at 1.5x), the thigh's root at the pinched waist (up to 3; 1 at rest),
> and the black gown through the scapular (up to 29 px a frame) and flung out past its back panel
> behind the calves (the back panel's lower band 576-883 px a back facing in the run against
> 1,494 in the walk): the panel was not shaded dark, the gown in front of it. Two causes, both
> measured: the guard read the knee as uncovered, not through (below), and the scapular was skinned
> apart from the gown (`legFollow` 0.3 against 0.5, its own panel weight, rings at other heights),
> so the layer that follows the legs further came out through the other; the gown also trailed past
> the back panel's hem at rest. The owner had already chosen to change the garment rig for this
> ("改衣服的骨架"), which R23 had set aside; R25-R27 do it for the robe. The knight's hauberk and the
> mercenary's coat show no leg through the cloth by the same check, and keep their rig.

24. Each band of rings claims the points between the planes square to its axis through its two
    centres, so where a stride bends the line of the ring centres (a robe's front swung forward over
    the knee, its back flung out behind) the outside of the bend lies past one band's end and before
    the next one's start, in no band, and R19 read a leg there as uncovered. Such a point is measured
    on the ring at the bend, in the plane square to the two bands' mean axis, and goes on to R22's
    level ray when it reads outside. Every sheet but the wizard reads as before; the wizard's run as
    cut before reads 1.08 px and fails the bake.
25. A panel worn over a garment (`skirt({ over })`, the mage's scapular over her gown) is cut on
    that garment's rig: its rings are the garment's ring for ring (heights, centres, trail), its
    radii out from them by its own (`rTop - over.rTop` easing to `rBottom - over.rBottom`) and
    `OVER_CLEAR` (0.002 H), its skin weights the garment's at the same ring, its hem lifted to its
    own `bottom` on the last ring, where the weights beneath no longer change. The panel never sinks
    a baked px under the garment, measured along the garment's normal where it lay over it in bind.
26. A robe's thigh may carry the cloth over the knee it bends (`skirt({ kneeCover })`, H under the
    knee where the thigh's share starts passing to the panels; 0 as before): the mage's 0.05, the
    least in 0.01 steps that keeps her leading knee in through the run.
27. Over a garment's top, where the torso alone covers the thigh's root, `legs({ under: { torso } })`
    draws the root in under the torso's wall when it is the narrower (the mage's pinched waist).
28. The check of R24-R27, in the clip tests: from the bake camera in all 8 facings, no thigh or knee
    vertex lying outside the cloth round it on R22's level ray, and no vertex of the thigh's root, is
    left unhidden on the knight, the wizard and the mercenary at rest, through the run, the walk and
    both attacks on the move.

> **Edited in place again on 2026-11-12 (still a work-order): the cloaks, the dashes, the quiver.**
> The owner, on the robe: "法師長袍修正 沒問題" (the robe fix is fine: knee, waist, green panel). Of
> the dashes a baked px long left on the back panel at the knee in a few run frames (Verification
> below), first "可以" (acceptable), then, after playing: "法師跑步時 膝蓋背後關節處 衣服綠色區塊會有黑點"
> (in the wizard's run, behind the knee joint, the green panel shows black dots), so they go after
> all. On the play branch: "騎士後退攻擊 腳會穿過斗篷" (in the knight's backward step while attacking
> his feet pass through his cloak), "弓箭手後退攻擊 腳跟處也會穿過斗篷" (the archer's heels too), and
> "弓箭手背後的箭袋 底部會吃進斗篷裏 可以擺正一點" (the bottom of the quiver on the archer's back sinks
> into her cloak; set it straighter), then "目前我知道跑步跟平常站立時都會吃進斗篷" (he has seen it in
> the run and standing). Measured, not guessed: the dots are the black gown through the teal
> panel (an ID render: the gown's colour inside the panel's, 254 px over the run's 64 frames); the
> cloak checks below read the legs and boots through the cloaks and the quiver inside the archer's.

29. **Cloaks are guarded as garments are.** A cloak (anatomy.js `cloak`, tagged) must not show a leg
    or a boot through it: each leg vertex and each vertex of a mesh riding a shin or a foot is
    measured on R22's level ray against the cloak's surface as posed (cloth only between the axis and
    the vertex: through, by its distance past it), and no clip but the death may show one through by
    more than CLEARANCE_PX baked px (clearance.js `cloakClearance`, `cloakClearanceError`). The bake
    holds the playable classes (the trimmed sheets) to it; the creatures' rag cloaks are held to it
    once each is re-baked (today the ghost's attack reads 8.95 px), so their pixels do not move.
    Seen red: the knight's `backpedal_attack` 18.8 px (653 vertex-facings in view from the bake
    camera), the archer's 10.5 (268), the knight's standing `attack` 7.6 on its last key.
30. **The backward step and the knight's attack carry the cloak out behind.** `backpedal_attack`
    carries its cloth as half a walk would (FS-JS7C8 R10: `BACKPEDAL_ATTACK_SPEED` +0.5, was −0.5,
    which pressed the cloak forward against the legs; from +0.3 neither cloak is crossed), and the
    knight's standing attack carries his cloak the same way (`KNIGHT_ATTACK_CLOTH` 0.5, was still:
    the slash's stance sets his right foot back under it; 0.25 left 3.3 px). The cloak still hangs
    heavy, as in a slow walk: no flap, no bell.
31. **A panel is cut on its garment's columns as on its rings (amends R25).** A panel worn over a
    garment (`skirt({ over })`) has its arc snapped to the garment beneath's columns (`over.segs`
    round the full turn) and one column per column, so each of its faces lies over a face of the
    garment; the mage's gown is cut at 64 columns and her scapular's 10 lie on them (were 32, and 16
    across the panel's own arc: behind the knee in the run the panel's vertices followed the skin's
    turn from one thigh to the other while the gown's coarser face cut straight across, and the
    panel dipped under it). R25's measure is taken on the gown's own face where the panel vertex lay
    over it in bind (nearest point, its barycentric weights), not on a ring row read at one column,
    which the rings' tilt put a row off: the cut before reads 0.91 px under the gown in the run and
    fails; the cut now at most 0.28 (one vertex, at the crease), under a baked px.
32. **The archer's quiver rides over her cloak.** It hangs `QUIVER_TILT` 17° off the spine (was 29),
    its mouth toward the right shoulder and the fletching over it, seated 0.15 of her torso's depth
    behind the chest (was 0.1), its foot tipped out 0.12 rad with the cloak's flare
    (classStyles.js `ARCHER_QUIVER`); its strap holds the cloak's top to her back (anatomy.js
    `cloakBones({ strap })`, cloak0's and cloak1's drag and fling at 0.2 and 0.4), so the run's drag
    no longer swings the cloak out past the case's foot. No point of the case is inside the cloak on
    any frame of the idle, the walk, the run, the attack, `walk_attack`, `backpedal_attack` or the
    death. Seen red: its foot 5.5 px inside the cloak in the idle (62-77 of 208 case points every
    frame, hidden in the back and side facings), 21.1 in the run, 10.2 the walk, 17.8 the death.

### Acceptance Criteria

- [ ] The knight's hauberk, the wizard's robe and the mercenary's coat, each on its class's rig and
      style, pass the guard at 1.5x through `run`, `walk`, `walk_attack` and `backpedal_attack`
      (seen red: 12.71, 6.27, 2.04 px on the run).
- [ ] The existing guard tests still hold: a garment skinned to the opposite thigh fails, the
      thighs wider than a tunic's top fail at rest, a belt is cover, a death is exempt.
- [ ] A full bake passes with every `KNOWN_CLIPPING` sheet still past the limit and under its
      ceiling; `npm run bake -- --check` reports no changes.
- [ ] The guard measures a point on the outside of a bend in the rings (R24); it fails the wizard's
      run as cut before (seen red: 0.41 px, passing).
- [ ] From the bake camera, no hip, thigh or knee of the knight, the wizard or the mercenary is seen
      through the garment or the waist in any facing at rest, in `run`, `walk`, `walk_attack` and
      `backpedal_attack` (R28; seen red: the wizard's waist at rest and her knee in the run).
- [ ] The mage's scapular never sinks a baked px under her gown in those clips (seen red: -0.73 px
      at rest, -2.14 in the run, cut as before); her robe reaches no further in the run (its hem
      0.427 H from the pelvis, as before).
- [x] The owner judges the wizard's run on the contact sheet: no leg through the robe, the teal back
      panel as clear in the run as in the walk ("法師長袍修正 沒問題", 2026-11-12).
- [ ] No leg or boot of the knight or the archer through the cloak by a baked px in the idle, the
      walk, the run, the attack, `walk_attack` and `backpedal_attack` (R29-R30; seen red: 18.8 px and
      10.5 on `backpedal_attack`, 7.6 on the knight's attack).
- [ ] The gown never through the scapular by a baked px on the face measure (R31; seen red: 0.91 px
      in the run as cut before); the ID render shows no gown in the panel in the run's back facings.
- [ ] The archer's quiver case nowhere inside her cloak in any clip, the fletching over the right
      shoulder (R32; seen red: 5.5 px in the idle, 21.1 in the run).
- [ ] The owner judges the knight's and the archer's `backpedal_attack`, the wizard's run from the
      back and the archer's quiver on the contact sheets.

### Edge States

- **A heel under a lifted hem** is uncovered, not through: the owner judges it on the contact
  sheet like any leg below a hem.
- **A ray that grazes the cloth's edge** (the open front's split) may miss it; the vertex then
  counts as uncovered, as an opening always has.

### Out of Scope

- Changing the knight's or the mercenary's garment rig: the check of R28 finds no leg through their
  cloth. (Was: any garment's skinning, "not needed for the guard; reopened if the contact sheet
  shows a leg through the cloth": the owner's sheet did, for the robe, R25-R27.)
- The flat-colour render of the check (a review probe, not a bake step): the clip tests hold the
  geometry.

### Verification (2026-11-12, branch `feat/run-sheets-1p5x`)

- **Unit.** The three garments on their classes' rigs pass at 1.5x through `run`, `walk`,
  `walk_attack` and `backpedal_attack` (the run read 12.71 / 6.27 / 2.04 px before); the earlier
  guard tests hold.
- **Bake.** The wizard, the knight and the mercenary re-baked at 1.5x with the run: the guard
  reads the wizard's run at 0.41 px, every other class clip at 0; every `KNOWN_CLIPPING` sheet
  still clips past the limit and under its ceiling; `npm run bake -- --check` reports no changes.
- **The robe in the run (R24-R28; I-JS7C8-7).** Unit: the guard measures a point on the outside of a
  bend (seen red: null); from the bake camera no hip, thigh or knee of the three classes is seen
  through the cloth at rest, in the run, the walk and both attacks on the move (seen red: the
  wizard's waist at rest, 23-28 vertex-facings a pose, her knee in run keys 1 and 5); the scapular
  never sinks a baked px under the gown (seen red: -0.73 px at rest, -2.14 in the run, cut as
  before); the guard fails the robe as cut before (1.08 px; it read 0.41). Rendered with every
  part in a flat colour from the bake's camera in all 8 facings at 1.5x (a review probe): leg px in
  the wizard's run 0 (was 102 at the knee, up to 26 a frame, and 23 at the waist), gown px through
  the teal 6 over the run (was 456, up to 29 a frame), the teal in the back views' lower band 3,800-3,900
  px a facing in the run (was 576-883; the walk 3,600-4,200), its mean light as the walk's; a pair
  of dashes about a baked px long remains on the back panel at the knee's height in a few run
  frames, unmoved by a wider OVER_CLEAR, left for the owner's eye (he first said "可以", then asked
  for them gone: R31). The knight and the mercenary:
  no leg through the cloth, no garment change. Bake: every class clip reads 0 px; every
  `KNOWN_CLIPPING` sheet reads as before; only the three classes' pages and the manifest changed;
  `npm run bake -- --check` reports no changes.
- **The cloaks, the dashes, the quiver (R29-R32; I-JS7C8-6, -7, -12).** Unit: the cloak check on
  the knight's and the archer's rigs and styles reads 0 on every clip but the knight's walk (0.21
  px, under the limit) (seen red: 18.8 / 10.5 px on `backpedal_attack`, 7.6 on the knight's
  attack); the scapular at worst 0.28 px under the gown at one crease vertex (seen red: 0.91 cut as
  before); the quiver case outside the cloak on every frame of every clip (seen red: 5.5 px in the
  idle, 21.1 in the run). ID render of the wizard's run at 1.5x, all 8 facings: gown px inside the
  teal panel 4 over 64 frames, none in the back facings (was 254). Bake: the archer, the knight, the
  wizard and the mercenary re-baked once each; every creature's bytes unchanged.

