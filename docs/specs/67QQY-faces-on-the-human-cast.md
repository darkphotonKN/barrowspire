# FS-67QQY: Faces on the human cast

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Faces on the human cast" → this FS · Related: [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (pre-rendered 3D baked to sprites), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (the class sheets are 2x) · Surface: game-client only (bake tool, baked art, art guideline)

## Summary

Every human character built on the shared head gets a proper face: the same eyes, nose and mouth on everyone, men and women alike. The head becomes one smooth surface with its upper face pressed flat like the lower half, the nose sits a little lower, and the eyes, brows, nostrils and mouth are painted onto a thin shell over the face. The brows take the character's hair colour, darkened. Nothing about play, the client runtime or the manifest schema changes: this is new art, re-baked.

The owner picked it on 2026-11-08 from faces rendered through the real bake rig, camera and key light: **"B2, before iteration, nose slightly lower"**. The parameters below are what that harness built.

## Facts this spec rests on

- `head(rig, mat, o)` (`game-client/tools/bake/page/characters/anatomy.js`) is two intersecting ellipsoids (cranium and jaw) plus a 6-sided cone nose. The two meet in a jagged seam across the face under the eyes. `o.jaw` scales the jaw's width (the wizard's is 0.88); `o.nose === false` drops the nose.
- It is called by the four classes (`cast.js`: knight, archer, wizard, mercenary) and by every hub resident (`folk.js`: `folk_resident_trousers` in rust and slate, `folk_resident_skirt` in green and flax, the Spirewarden, the quartermaster). Creatures (`boar.js`, `forlorn.js`, the ghoul, troll and others) build their own heads and are not touched.
- The shared skin tone is `GEAR.skin` in `fabrics.js`, used for heads, necks and hands through `fabrics().skin`.
- A resident's palette variants are made by `paletteSlots` (`folk.js`): `use(slot, meshes)` marks meshes, and each variant's `dress()` replaces those meshes' materials with `folkFabrics(name)[slot]`. Today the slots are `cloth`, `under` and `hair`. `dress()` swaps whole materials, so a mesh in the `hair` slot is painted with the hair material itself.
- At game scale a face on a 2x class sheet is about 22 px tall and an eye 1 to 2 px; folk are 1x sheets, so half that. Character creation draws the class sheets at ×1.5.
- `npm run bake` writes `public/art/` and the review contact sheets in `tools/bake/review/` (gitignored, `lib/contact.mjs`). `npm run bake -- --check` exits 1 when the output would change.
- The design guideline already rules that glowing eyes belong to the hostile channel and are the one emissive part of a hostile ("Eyes are the accent, and they are in the hostile channel"), and that the owner approves a contact sheet.

## Requirements

All measures are in rig height fractions (H); `[_, hy, hz] = jointAt(rig, "head")`, `r = rig.p.headR`.

### A. One head surface

1. `head()` builds one mesh, not two: the smooth union (k = 0.014) of
   - the cranium, centre `(0, hy+0.058, hz-0.002)`, radii `(0.92r, 1.02r, 1.0r)`, and
   - the jaw, centre `(0, hy+0.028, hz+0.016)`, radii `(0.72·jaw·r, 0.72r, 0.78r)`, with `jaw` the existing per-character option.
2. The mesh is a sphere whose vertices are pushed out to that signed-distance surface; 48×36 segments is the expected resolution. There is no seam across the face.
3. The upper face is pressed flat: the head's surface is the smooth max (softness 0.012) of the union and the face plane `z = hz + 0.058 − 0.17·(y − (hy+0.054)) − 0.5·x²/r`. The plane passes through the front of the mouth, leans back a little toward the brow and curves gently round the cheeks, so the front reads as a face, never a flat mask.
4. `head()`'s signature and options (`jaw`, `nose`) stay as they are; no caller changes for the head itself.

### B. The nose

5. The nose stays today's cone (`ConeGeometry(0.009H, 0.024H, 6)`, `rx 1.35`), moved 0.004 H lower: its base at `hy+0.042`, its z riding the face plane (`hz + 0.058 + 0.006 + 0.17·0.004`). `nose: false` still drops it.

### C. Painted features

6. The features are painted, not sculpted, on a transparent shell 0.0006 H off the head surface. Its UVs are projected straight from the front; a vertex whose normal faces away (`nz < 0.2`) maps to a transparent corner. One 512² canvas covers x −0.06…0.06 and y hy−0.02…hy+0.10.
7. The face drawing is **one shared drawing**: the same eyes, sockets, nostrils and mouth on every character, painted once per bake, with no per-character and no per-palette face canvas. It paints:
   - eyes: almonds at `(±0.022, hy+0.054)`, half-width 0.0105, half-height 0.0045, whites (`vellum` mixed toward `barrowBrown` 0.18), a dark iris of radius 0.0052 offset 0.001 toward the nose, and an upper lid line;
   - deep-set shading (the "B2" of the pick): a soft socket shade round each eye, a darker hollow under the brow, and a crease line over the lid;
   - nostrils: two soft dots at `(±0.007, hy+0.034)`;
   - the mouth: a lip ellipse at `hy+0.0245` (half-width 0.012) with a dark parting line.
8. The shell's material is a lit `MeshStandardMaterial` with the canvas as its map, `transparent`, `depthWrite: false`, a polygon offset, and it casts no shadow. It is never emissive: a human's eyes take the scene's light like the rest of the face (the guideline keeps glowing eyes for hostiles).

### D. Brows from the hair

9. The brows are arched strokes from x ±0.009 to ±0.034 at about `hy+0.065`, drawn on their own layer over the face, not in the shared face drawing, so their colour can follow the hair.
10. **Brow colour is the character's hair tone darkened (~0.7).** *Charter default: flax or rust brows at the hair tone itself vanish on skin at 1 to 2 px; darkened, they read.* The wizard's follow her raven hair, the mercenary's his dark hair, the quartermaster's his grey, each resident palette's its own hair. A character with no hair of its own (the knight under his coif, the archer under her cowl, the Spirewarden under the hood) takes `GEAR.hairDark` darkened the same way (a gap filled at promotion, not a scoping decision); its brows are mostly or wholly hidden in any case.
11. **On a hub resident the brows change with the hair.** *Charter default: a resident sheet bakes each palette by `variant.dress()` on one rig, so a brow coloured once would wear the first palette's hair on every variant.* The brow layer is registered through `paletteSlots`' `use`, keyed to the hair, so each variant's `dress()` repaints the brows with that palette's darkened hair tone. Because `dress()` swaps whole materials, the brows take a brow material derived per palette from the palette's hair tone (beside `hair` in `folkFabrics`), not the hair material itself, which would paint them at the hair tone and texture. The eyes, nose and mouth stay the one shared drawing (R7).

### E. Skin brightness

12. The flat face takes the high key light (from screen-left and above) at a grazing angle, so it bakes a shade darker than today's dome, which faced up into the light. This is lighting, not a mesh or shadow fault (verified in the scoping harness: normals are correct, and with shadows off the brightness is unchanged). The shared skin tone `GEAR.skin` is lifted, so necks and hands lift with it.
13. **The lift matches today's mean face brightness on the mercenary's SE idle frame, then the owner confirms it by eye on the contact sheet.** *Charter default: a measurable target, with the eye final.* Before any change, measure the mean luminance of the face's skin pixels (brow to chin, cheek to cheek, excluding beard and hair) on the mercenary's SE idle frame 0 as baked today; lift `GEAR.skin` until the same measure on the new bake matches it (to within 2 of 255). Record both values and the new tone in the issue's hand-off. If the owner judges it wrong on the contact sheet, the eye wins and the tone is adjusted by eye.

### F. Who wears it

14. Every character built on `head()` gets the new head, nose, face and brows: knight, archer, wizard, mercenary, both resident builds in all their palettes, the Spirewarden and the quartermaster. *(Rejected: bare faces only. One head, no second one to maintain.)* Under the archer's cowl and the Spirewarden's hood the face shows only as far as today's does.
15. No face differs by character or by sex beyond what already differs (beards, hair, jaw width, figure).

### G. Hoods, hair and beards over the new face

16. **The archer's cowl veil, the hair fringes and the mercenary's moustache are checked on the contact sheet and fixed in scope only if broken.** *Charter default: each was sized to today's head and is likely fine, so they are verified, not pre-emptively reworked.* Specifically:
    - the archer's cowl (`cowl()`, `shade: 2`, sized `R·0.97/1.08/1.2`) still covers and shades the flattened front down to the mouth;
    - the hair caps (`hair()`, `hairFall`, `faceLocks`) are sized off `headR`; the flattening moves the face inward under the fringe, and nothing of the head or the face shell newly pokes through;
    - the mercenary's lowered nose meets the top of his trimmed beard's moustache (`shortBeard`) cleanly;
    - the knight's flattened face, sitting slightly deeper in the mail coif's opening, still reads.
    A fix, if one is needed, stays in `anatomy.js`, `cast.js` or `folk.js` options for that garment.

### H. The art guideline

17. `game-client/docs/design-guideline.md` gains a **Faces** rule under *Characters / Enemies*: one shared face on every human; features painted on, never sculpted; the upper face flat like the lower; brows from the hair, darkened; a human's eyes never emissive (glowing eyes stay the hostile channel). It is marked *(Amended at the owner's pick, 2026-11-08.)*, like the class amendments.

### I. Verification

18. **Presentation-only: no `/code-review` gate and no new tests.** *Charter default: the change is art, and its acceptance is how it looks.* Verification is a full `npm run bake` in `game-client` and the review contact sheets in `tools/bake/review/`, approved by the owner. The existing bake tests (`tools/bake/**/*.test.mjs`, the leg-clearance guard, the trims) still pass; typecheck, the vitest suite and lint stay green since no `src/` code changes.
19. The acceptance view is the baked pixels at game scale, never close-ups.
20. Every human sheet re-bakes, so `npm run bake -- --check` reports changes by design before the re-bake is committed, and none after it.

## User Stories

1. As a player, I want my hero to have eyes, a nose and a mouth, so that the character I play looks like a person and not a mannequin.
2. As a player of the wizard, I want her face to read as hers with the same eyes as everyone else, so that the class reads by hair, figure and gear, not by a different face.
3. As a player of the mercenary, I want his face, beard and moustache to sit together cleanly, so that the bareheaded class that is carried by his face looks right.
4. As a player of the knight, I want the face behind the nasal and coif to read, so that the knight is a man in mail and not an empty helm.
5. As a player of the archer, I want the cowl to keep her face in shadow to the mouth as it does today, so that the ranger's look is not changed.
6. As a player on a Retina or fullscreen canvas, I want the faces to come through at the sharper 2x pixels, so that the extra detail shows where the screen allows it.
7. As a player on a 1x screen, I want the face to read as eyes and a mouth even at 1 to 2 px per eye, so that the faces do not turn into noise.
8. As a player in character creation, I want the ×1.5 figure to show a clean face, so that the hero I pick looks finished.
9. As a player walking the hub, I want the residents, the Spirewarden and the quartermaster to have the same kind of face as the heroes, so that the town feels like one world.
10. As a player, I want a resident's brows to match the hair of that resident, so that a flax-haired goodwife does not wear raven brows.
11. As a player, I want no seam across a character's face, so that the head reads as one surface.
12. As a player, I want the upper face as flat as the lower, so that no puffy brow mass makes the face look odd.
13. As a player, I want faces no darker than they are today, so that the cast does not look sickly under the key light.
14. As a player, I want human eyes never to glow, so that glowing eyes always mean a hostile.
15. As a player, I want hands and necks to match the lifted face, so that skin is one tone on the body.
16. As a player, I want hair and fringes to sit over the face as they do now, so that nothing pokes through the new head.
17. As the owner, I want one shared face drawing for everyone, so that there is one face to maintain and no character drifts.
18. As the owner, I want the parameters I picked built exactly, so that the shipped face is the one I approved in the variants session.
19. As the owner, I want to approve the faces on the contact sheet at game scale, so that the art is judged where players see it.
20. As the owner, I want the skin lift to start from a measured target, so that the first contact sheet is close and my eye only has to confirm it.
21. As a developer, I want `head()` to keep its signature and options, so that no caller and no creature changes.
22. As a developer, I want the face rule written into the design guideline, so that a future human character gets the same face without re-deciding it.
23. As a developer, I want the bake to stay deterministic, so that a re-bake with no input change shows no diff.
24. As a developer, I want no runtime or manifest schema change, so that the client draws the new sheets exactly as it drew the old ones.

## Acceptance Criteria

- [ ] `head()` builds one seamless mesh, the smooth union of cranium and jaw with the upper face pressed to the face plane, at the parameters of R1 to R3; its signature and options are unchanged.
- [ ] The nose is today's cone, 0.004 H lower, riding the face plane (R5).
- [ ] A transparent, lit, non-emissive face shell carries one shared drawing of eyes, deep-set sockets, nostrils and mouth on every human character (R6 to R8).
- [ ] Brows are their own layer, coloured from the character's hair tone darkened ~0.7; on both resident sheets each palette variant shows brows from its own hair (R9 to R11).
- [ ] `GEAR.skin` is lifted so the mercenary's SE idle face matches today's mean face brightness within 2 of 255; the before and after values and the new tone are in the hand-off (R12, R13).
- [ ] The knight, archer, wizard, mercenary, both resident builds (rust, slate, green, flax), the Spirewarden and the quartermaster all show the new face; no creature sheet changes (R14).
- [ ] On the contact sheet the archer's cowl still shades her face to the mouth, no hair fringe or lock is pierced by the head or the face shell, the mercenary's nose meets his moustache cleanly, and the knight's face reads in the coif; anything broken is fixed (R16).
- [ ] `game-client/docs/design-guideline.md` carries the Faces rule, marked as amended at the owner's pick (R17).
- [ ] A full `npm run bake` in `game-client` has re-baked `public/art/` sheets and the manifest; `npm run bake -- --check` then reports no changes; the existing bake tests, typecheck, vitest and lint pass; no file under `src/` and no manifest schema field changed (R18 to R20).
- [ ] The owner approves the review contact sheets in `tools/bake/review/` at game scale (R18, R19).

## Edge States

- **Tiny scale.** At 1x an eye is about 1 px. The painted almond must still read as a dark point with lighter surround, not vanish into the skin or bloom into a smear; the contact sheet at game scale is the judge.
- **Back and side facings.** The shell's front projection sends away-facing vertices (`nz < 0.2`) to a transparent corner, so a N, NE or NW facing shows no smeared paint on the back of the head, and an E or W profile shows the features only as far as they wrap.
- **Hooded and helmeted heads.** The archer's cowl veil and the Spirewarden's hood hide the face as far as they do today; the knight's coif frames it slightly deeper. If the veil no longer covers the flattened front, the cowl's options are adjusted (R16).
- **Beard over mouth.** The mercenary's moustache covers part of the painted mouth; the paint must not show through the beard, and the lowered nose must not sink into or float above the moustache.
- **Palette variants.** A resident sheet bakes several palettes on one rig through `dress()`; brows that stayed on the first palette's colour across variants would be a defect (R11).
- **Characters with no visible hair.** The knight, archer and Spirewarden take the darkened `GEAR.hairDark` brow tone; where the brows are hidden this is invisible, where a sliver shows it must not read as a stripe.
- **Death clip.** The face rides the head bone through every clip including the death; no new expression, and the shell must not separate from the head in any pose.
- **Leg-clearance guard and trims.** Head-only changes leave the leg guard's values unchanged; a trim box may shift by a pixel where the head's outline moved, which is expected.
- **Skin lift misses by eye.** If the measured match still looks wrong on the contact sheet, the owner's eye overrides the number (R13).
- **Bake drift.** `--check` failing before the re-bake is committed is expected; failing after it means the bake is not deterministic, which is a defect.

## Out of Scope

- Expressions, blinking, a death face.
- A different face per character or per sex.
- Face or skin-tone choice in character creation (parking lot).
- Creatures: the ghoul, troll, zombie, ghost, demon and boar keep their own heads.
- Any `src/` runtime code, any manifest schema change, anything in `game-server`.
- Sculpted features (eyeballs, lids, brow ridge as geometry), a nose grown from the head surface, a painted nose contact shade, and the B1 Clean and B3 Hard paint variants: all compared and rejected in scoping (see below).

## Alternatives compared and rejected (scoping record)

- Round 1, head unchanged: **A Sculpted** (eyeballs, lids, brow ridge, nose and lips as geometry) was doll-like close up, its lit brow ridge read as pale bars ("glasses") at game scale, and its nostrils collided with the mercenary's moustache. **C Shadowed** (sculpted brow and nose, eyes as deep shade, no whites) was readable but sunken and stern. **B Painted** won: the only one whose eyes came through in the baked pixels.
- Round 2, flat seamless head: **B1 Clean** (B's paint as is), **B2 Deep-set** (picked), **B3 Hard** (heavier straight brows, narrow eyes, muted lips; pushed the mage masculine).
- Round 3, nose only, on B2: separate smooth parts (a "doll" nose with a hard edge), grown from the head surface (natural, but caught the light pale and needed a 160×120 head mesh), grown plus a painted contact shade (most natural). The owner kept the round-2 cone, lowered.
- Skin: keeping the face darker, or deciding the lift only by eye, were rejected for a measured lift confirmed by eye (R13).
- Brows: one neutral dark for everyone (as in the harness) was rejected for brows from the hair (R10).
