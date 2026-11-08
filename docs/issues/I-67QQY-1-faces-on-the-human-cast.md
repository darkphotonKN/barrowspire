---
id: I-67QQY-1
status: done
implements: FS-67QQY
blocked_by: []
labels: [ready-for-agent]
title: "FS-67QQY slice 1: one seamless flat-faced head with a painted shared face, brows from the hair and lifted skin on every human, re-baked (game-client)"
---
Implements FS-67QQY §Requirements A–I (R1–R20)

**Lane: agent (AFK), closed by the owner's contact-sheet approval (HITL).** One slice for the
whole FS, at the owner's request: the head, the face and the skin lift only show together in one
bake, and the owner judges them on one contact sheet.

## What to Build

Every character built on `head()` (knight, archer, wizard, mercenary, both resident builds in all
their palettes, the Spirewarden, the quartermaster) gets the face the owner picked ("B2, before
iteration, nose slightly lower"), at the exact parameters of FS-67QQY R1–R11:

1. **Measure first (R13).** On today's bake, before any change, take the mean luminance of the
   face's skin pixels (brow to chin, cheek to cheek, no beard or hair) on the mercenary's SE idle
   frame 0. This is the skin-lift target.
2. **One head surface (R1–R4).** `head()` in `anatomy.js` builds one mesh: the smooth union
   (k 0.014) of cranium and jaw, with the upper face pressed by a smooth max (softness 0.012) to
   the face plane, as a sphere pushed to the signed-distance surface (about 48×36). Signature
   and options (`jaw`, `nose`) unchanged.
3. **Nose (R5).** Today's cone, 0.004 H lower, riding the plane.
4. **Painted face (R6–R8).** A transparent, lit, non-emissive shell 0.0006 H off the head,
   front-projected UVs (away-facing vertices to a transparent corner), carrying **one shared**
   512² drawing per bake: almond eyes with whites, iris and lid line, deep-set socket shade,
   brow hollow and lid crease, nostrils, mouth. No per-character or per-palette face canvas.
   A new face module beside `anatomy.js` (e.g. `characters/face.js`) is fine if it keeps
   `anatomy.js` readable.
5. **Brows (R9–R11).** Their own layer, coloured from the character's hair tone darkened ~0.7
   (`GEAR.hairDark` darkened where a character has no hair of its own). On residents the brow
   layer is registered through `paletteSlots`' `use`, keyed to the hair, so each `dress()`
   repaints it from that palette's hair: a brow material per palette derived from its hair tone
   beside `hair` in `folkFabrics` (the hair material itself would paint brows at the hair tone).
6. **Skin lift (R12–R13).** Lift `GEAR.skin` in `fabrics.js` until the step-1 measure on the new
   bake matches the target within 2 of 255. Hands and necks lift with it.
7. **Re-bake (R18, R20).** Full `npm run bake` in `game-client`; commit the re-baked
   `public/art/` sheets and manifest.
8. **Check over the new face (R16).** On the contact sheets: the archer's cowl veil still shades
   her face to the mouth, no hair cap, fringe or face lock is pierced, the mercenary's nose meets
   his moustache cleanly, the knight's face reads in the coif. Fix in scope only what is broken,
   in that garment's options.
9. **Guideline (R17).** Add the Faces rule to `game-client/docs/design-guideline.md` under
   *Characters / Enemies*, marked *(Amended at the owner's pick, 2026-11-08.)*.

## Acceptance Criteria

- [ ] `head()` is one seamless mesh at R1–R3's parameters; signature and options unchanged.
- [ ] The nose is today's cone, 0.004 H lower, on the face plane (R5).
- [ ] One shared, lit, non-emissive painted face on every human character (R6–R8).
- [ ] Brows from the hair, darkened ~0.7; each resident palette variant (rust, slate, green, flax) shows brows from its own hair (R9–R11).
- [ ] `GEAR.skin` lifted so the mercenary's SE idle face matches today's mean within 2 of 255; before, after and the new tone recorded in the hand-off (R13).
- [ ] All human sheets show the new face; no creature sheet changes (R14).
- [ ] Cowl veil, hair fringes, moustache and coif checked on the contact sheet; anything broken fixed (R16).
- [ ] The design guideline carries the Faces rule (R17).
- [ ] Full `npm run bake` done; `npm run bake -- --check` then reports no changes; existing bake tests, typecheck, vitest and lint pass; no file under `src/` and no manifest schema field changed (R18–R20).
- [ ] The owner approves the review contact sheets in `tools/bake/review/` at game scale (R18, R19).

## Verification (presentation-only, not TDD)

FS-67QQY is presentation-only (R18, a charter default): **no `/code-review` gate and no new
tests.** Verification is the full `npm run bake` plus the owner's approval of the review contact
sheets in `game-client/tools/bake/review/`, judged at the baked pixels, never close-ups. The
existing suites must stay green.

## Files expected to touch

- `game-client/tools/bake/page/characters/anatomy.js` (`head()`, nose, face shell, brow layer)
- `game-client/tools/bake/page/characters/face.js` (optional new module for the face shell and canvases)
- `game-client/tools/bake/page/characters/fabrics.js` (`GEAR.skin` lift, brow tones, a per-palette brow material in `folkFabrics`)
- `game-client/tools/bake/page/characters/folk.js` (residents' brows through `use`; brow tone for the quartermaster and Spirewarden)
- `game-client/tools/bake/page/characters/cast.js` (brow tones for the four classes; garment fixes only if R16 finds breakage)
- `game-client/public/art/` re-baked atlas pages and `manifest.json` (data only, no schema change)
- `game-client/docs/design-guideline.md` (Faces rule)

Not touched: anything under `game-client/src/`, the manifest schema, creature heads, `game-server/`.

## Blocked By

None.

## Spec Reference

FS-67QQY §Requirements A–I (R1–R20), §Acceptance Criteria (all), §Edge States; user stories 1–24.
