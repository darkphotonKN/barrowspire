---
id: I-JS7C8-30
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-27, I-JS7C8-28, I-JS7C8-29]
labels: []
title: "FS-JS7C8 slice 30: the wizard's three sheets drop walk_attack and backpedal_attack and are re-baked once with her sprint and pointed cast; the frame box held or escalated, the other sheets byte-identical, atlas report, old-vs-new contact sheet, docs (game-client)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (R130–R136)

**Lane: agent; hands the owner's contact sheet to I-JS7C8-31, but nothing after it waits on it
(W6).** This is the one bake of `char_wizard_base`, `char_wizard_spellwarden` and
`char_wizard_pyromancer`. `animationSelect.ts` and `character.ts` are not changed (R132).

## What to Build

1. **Her clip set (R131).** `WIZARD_SHEET`'s animations are exactly `idle`, `walk`, `attack`,
   `death`, `run` (`run` is `SPRINT_RUN`), built without `withWalkAttack`. The looks inherit it
   through `specRow` (cast.js:622). `RUNNING_CLASS_ANIMATIONS` stays for the knight.
2. **The tests that name her clips:**
   - `src/render/art/animationSelect.test.ts:486`: `WALK_ATTACKERS` without `mage`.
   - `src/render/art/manifest.test.ts:1280`: `OWN_CLIPS.char_wizard_base` → `["run"]`; the wizard
     out of :1384's `BACKPEDALLING`.
   - `tools/bake/page/characters/clearance.test.mjs:404`: `MOVING.wizard` → `["run", "walk"]`; the
     scapular check at :501 without her attacks on the move.
   - `classMotion.test.mjs`: `CARRIED` (:631) without the two clips for her; the cast's "is the one
     attack the walk_attack and backpedal_attack draw" (:741-745) goes, or moves to the knight;
     her sheet test as the mercenary's (:1075-1082), with `["idle", "walk", "attack", "death",
     "run"]`.
   - `mageLooks.test.mjs:115` follows her sheet (no change expected).
   If no `selectAnimation` case covers a sheet with `run` and no `walk_attack`, add one: `attack`
   turned to the aim while attacking on the move, `run` at `speed / RUN_PACE` otherwise.
3. **The bake (R133).** `npm run bake` once. The leg guard, the cloak guard and I-JS7C8-28's guards
   pass the three sheets' baked frames with no exemption. `npm run bake -- --check` is clean. Only
   the three wizard atlases and their manifest entries change. Confirm that the archer's, the
   knight's and the mercenary's manifest entries and atlas `sha256` are byte-identical to
   `22cabd3a`.
4. **The frame box (R130, E2).** Each frame box at most 222 × 192, 225 × 195, 225 × 198, or as the
   coordinator's E2 pick restates it. If the bake would grow one past that, stop before committing
   the bake and report back.
5. **The report (R135).** For each sheet, in this issue's "Built" section: atlas pages and
   dimensions, RGBA and PNG bytes before and after, the change in per cent, and the frame box
   before and after. Before (`22cabd3a`): `wizard-0` 2056 × 4000 (32.9 MB, PNG 4,906,841 B),
   `wizard_spellwarden-0` 3116 × 2700 (33.7 MB, 5,261,079 B), `wizard_pyromancer-0` 2224 × 3764
   (33.5 MB, 5,148,652 B). *Estimate:* 64 → 36 frames a facing, about 18–20 MB each.
6. **The comparison for the owner (R134).** For each sheet: the new run and the new cast beside
   `22cabd3a`'s, 8 facings, at game scale and ×2; an animated preview (the run at its fps ×
   `200 / RUN_PACE`, the cast at 12 fps); and ×4 details of the staff or focus at key 3 in `e`, `ne`
   and `n`, and of the gown's front on run keys 2 and 6. Write them as I-JS7C8-24 did, into the
   worktree's gitignored `game-client/tools/bake/review/`. Regenerate the regular, looks and
   dark-room contact sheets.
7. **Docs (R136).** `game-client/docs/design-guideline.md`'s clip list and the
   `tools/bake/lib/contact.mjs` header: the wizard runs with the sprint's lean and cadence (her carry
   as before), her cast points the staff along the aim, and her sheets carry no attack-on-the-move
   clips.

## Acceptance Criteria

- [ ] In `public/art/manifest.json` the three wizard sheets carry `idle`, `walk`, `attack`, `death`,
      `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and no `walk_attack`,
      `backpedal_attack` or `backpedal`.
- [ ] The archer's, the knight's and the mercenary's manifest entries and atlases are byte-identical
      to `22cabd3a`'s.
- [ ] The shipped-sheet tests name the wizard without the two clips and the knight with them.
      `animationSelect.ts` and `character.ts` are unchanged.
- [ ] The leg, cloak, scapular and staff/focus guards pass the three sheets at bake with no
      exemption.
- [ ] `npm run bake -- --check` is clean.
- [ ] Each frame box is within R130 (or the bake stopped and E2 was reported). The atlas report is
      recorded.
- [ ] The comparison exists for the three sheets, and its paths are recorded here.
- [ ] The guideline and `contact.mjs` notes are updated.
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

I-JS7C8-27, I-JS7C8-28, I-JS7C8-29

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: W5, W6; E2; R130–R136; the Acceptance
Criteria's "Manifest and client" bullets; Edge States "Casting on the move", "Mixed parties",
"The dark-room strip".

## TDD Approach

- RED: the shipped-sheet tests changed to the wizard without the two clips. They fail against
  `22cabd3a`'s manifest. Then her sheet options' clip list.
- GREEN: `WIZARD_SHEET` without `withWalkAttack`, then the bake.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`WIZARD_SHEET`)
- `game-client/public/art/manifest.json`, `game-client/public/art/wizard-0.png`,
  `wizard_spellwarden-0.png`, `wizard_pyromancer-0.png` (baked, never edited by hand)
- `game-client/src/render/art/animationSelect.test.ts`, `game-client/src/render/art/manifest.test.ts`
- `game-client/tools/bake/page/characters/clearance.test.mjs`, `classMotion.test.mjs`, `mageLooks.test.mjs`
- `game-client/tools/bake/lib/contact.mjs`, `game-client/docs/design-guideline.md`
