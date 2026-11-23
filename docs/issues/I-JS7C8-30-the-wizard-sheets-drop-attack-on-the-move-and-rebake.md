---
id: I-JS7C8-30
status: done
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

- [x] In `public/art/manifest.json` the three wizard sheets carry `idle`, `walk`, `attack`, `death`,
      `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and no `walk_attack`,
      `backpedal_attack` or `backpedal`.
- [x] The archer's, the knight's and the mercenary's manifest entries and atlases are byte-identical
      to `22cabd3a`'s.
- [x] The shipped-sheet tests name the wizard without the two clips and the knight with them.
      `animationSelect.ts` and `character.ts` are unchanged.
- [x] The leg, cloak, scapular and staff/focus guards pass the three sheets at bake with no
      exemption.
- [x] `npm run bake -- --check` is clean.
- [x] Each frame box is within R130 (or the bake stopped and E2 was reported). The atlas report is
      recorded.
- [x] The comparison exists for the three sheets, and its paths are recorded here.
- [x] The guideline and `contact.mjs` notes are updated.
- [x] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.
- [x] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in `game-client` pass.

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

## Built (2026-11-23, agent); waiting on the owner's contact sheet (I-JS7C8-31)

`WIZARD_SHEET` is `{ ...ANIMATIONS, run: SPRINT_RUN }` at 1.5x, built without `withWalkAttack`.
The Spellwarden and the Pyromancer take it through `specRow`. `RUNNING_CLASS_ANIMATIONS` and
`withWalkAttack` stay for the knight. `animationSelect.ts` and `character.ts` are unchanged.

- **Tests.** Her clips: `classMotion.test.mjs` (her sheet in her sprint's describe; `CARRIED`
  already reads each sheet). The cast's "one attack the attacks on the move draw" test moved to
  the knight, whose attacks on the move draw his slash. `clearance.test.mjs`: `MOVING.wizard` is
  `["run", "walk"]`, and the scapular check reads it and asserts her sheet carries neither clip.
  The controls that need her old run still build it from `RUNNING_CLASS_ANIMATIONS`.
  `mageLooks.test.mjs` follows her sheet with no change. The shipped sheets:
  `animationSelect.test.ts` (`WALK_ATTACKERS` is the knight alone; the wizard and her looks carry
  exactly her five clips, with `run` at 16 fps looping in the 8 facings) and `manifest.test.ts`
  (`OWN_CLIPS.char_wizard_base` is `["run"]`, and `BACKPEDALLING` is the knight). New
  `selectAnimation` cases on her sheet: attacking on the move plays `attack` turned to the aim at
  its authored rate, and the run plays at `speed / RUN_PACE`.
- **One bake.** `npm run bake`, then `npm run bake -- --check` reports no changes. The leg and
  cloak guards ran at bake. The see-through, scapular and staff/focus guards pass in the tests on
  the poses the bake uses, for all three sheets, with no exemption.
- **Only her entries changed.** Against `b0e03f10`'s manifest, which is byte-identical to
  `22cabd3a`'s and, for these sheets, to `2018f786`'s: every `sheets` entry but the three wizard
  ones and every `atlases` entry but `wizard-0`, `wizard_spellwarden-0` and `wizard_pyromancer-0`
  is identical. That covers the archer's, the knight's and the mercenary's entries and their
  `sha256`. `version`, `tile` and `facings` are unchanged. 268 sheets.

| Atlas (1 page each) | Before | Now | RGBA | PNG bytes |
|---|---|---|---|---|
| `wizard-0` | 2056 × 4000, 32.9 MB | 2096 × 2076, 17.4 MB | −47.1% | 4,906,841 → 2,680,048 (−45.4%) |
| `wizard_spellwarden-0` | 3116 × 2700, 33.7 MB | 2004 × 2216, 17.8 MB | −47.2% | 5,261,079 → 2,877,580 (−45.3%) |
| `wizard_pyromancer-0` | 2224 × 3764, 33.5 MB | 2592 × 1700, 17.6 MB | −47.4% | 5,148,652 → 2,798,474 (−45.6%) |

Each sheet drops from 512 to 288 frames (64 → 36 a facing), which frees about 48 MB resident
over the three.

| Sheet | Box before, anchor | Box now, anchor | Crown |
|---|---|---|---|
| `char_wizard_base` | 222 × 192, (87, 147) | **234 × 186**, (96, 135) | 74 |
| `char_wizard_spellwarden` | 225 × 195, (87, 147) | **237 × 189**, (99, 138) | 74 |
| `char_wizard_pyromancer` | 225 × 198, (87, 153) | **234 × 192**, (96, 141) | 74 |

E2 (b): each box is +12 px wide and 6 px shorter, as I-JS7C8-29 predicted. The trimmed frames place
the drawn width at the cast: the left edge at `attack` `sw` keys 3–4 and the right at `attack`
`ne` keys 3–4. Keys 3 and 4 tie at the trim's grain, and the replay names key 4. Every other clip
spans 195 px across. The top edge now comes from `death` `w` key 0, and the bottom from the
cast's `se` keys 3–4.

**The comparison for the owner** (R134) is in the worktree's gitignored
`game-client/tools/bake/review/wizard-sprint/`. The old side is `b0e03f10`'s wizard, the same as
`22cabd3a`'s and `2018f786`'s.

- `run-old-vs-new-1x.png` / `.html` and `run-old-vs-new-2x.png` / `.html`: each look's run, 8
  facings × 8 frames, old beside new.
- `cast-old-vs-new-1x.png` / `.html` and `cast-old-vs-new-2x.png` / `.html`: the same for the cast,
  7 frames.
- `run-old-vs-new-anim.html`: the run, old | new, at its fps × 200 / 194.
  `cast-old-vs-new-anim.html`: the cast at 12 fps, holding its last key for half a second.
- `cast-old-vs-new-detail.png`: ×4 of cast keys 3 and 4 in `e`, `ne` and `n`.
  `run-old-vs-new-detail.png`: ×4 of run keys 2 and 6, the gown's front over the knee, in every
  facing.
- `inspect/`: each of those rows cut out per look and facing
  (`<sheet>-{run,cast}-<facing>-{x2,x4}.png`).
- The old and new atlases it was cut from (`old-*.png`, `new-*.png`, `old/manifest.json`) and the
  script (`make.mjs`).

The regular sheets (`contact-sheet*.png`), the looks sheet (`contact-looks-wizard.png`), the
dark-room strip (`contact-darkroom-wizard.png`) and `contact-char_wizard_*-2x.png` in
`game-client/tools/bake/review/` are regenerated with her five clips.

**Seen at ×2 and ×4 (for the owner to judge):**

- **The cast.** At keys 3–4 the arm reaches out all but straight at chest height, and the staff
  carries on from the fist along the facing, a little below level. In `ne` and `sw` (across the
  screen) it reads as pointing at a target. In `n` and `e` it reads the same once the isometric
  slant is allowed for: up-right and down-right. The orb is never over her head; today's strike
  stood it over her crown.
- **In `w`, with her back to the camera,** the arm is hidden behind her. The staff shows
  only as a rod coming out from beside her head, up-left. On the Spellwarden's key 5 the focus's
  haft crosses behind her head on screen. Nothing intersects in 3D (the head guard clears 0.26 H),
  but at ×2 it can read as a stick behind the head.
- **The focus at the sleeve.** At ×4, keys 3–4 in `ne`, the focus's butt runs back past the fist
  under the forearm's sleeve. It shows as a dark rod along the sleeve's underside, not through it.
  At game scale it cannot be seen. The 0.0019 H margin does not show as clipping.
- **The Pyromancer's flame** stands upright out of the levelled cage (R129), and reads as fire
  carried on a pointed staff.
- **The run.** The trunk leans clearly further forward than before, at a quicker cadence. The
  gown's back flares out behind. On run keys 2 and 6 at ×4 (read in `s`, `sw`, `se` and the
  Spellwarden's `e`), no knee or thigh shows through the gown's front. The Spellwarden's focus
  crosses the gown's front diagonally in `e`, as it did before. The sceptre is carried back and leans as before.
