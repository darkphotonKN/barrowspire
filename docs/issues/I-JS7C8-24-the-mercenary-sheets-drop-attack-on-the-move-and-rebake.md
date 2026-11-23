---
id: I-JS7C8-24
status: done
implements: FS-JS7C8
blocked_by: [I-JS7C8-21, I-JS7C8-22, I-JS7C8-23]
labels: []
title: "FS-JS7C8 slice 24: the mercenary's three sheets drop walk_attack and backpedal_attack and are re-baked once with the sprint and the trailing sword; the frame box held, the other sheets byte-identical, atlas report, old-vs-new contact sheet, docs (game-client)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (R107–R113)

**Lane: agent; ends at the owner's contact-sheet gate (I-JS7C8-25).** This is the one bake of
`char_mercenary_base`, `char_mercenary_duelist` and `char_mercenary_sellsword`.
`animationSelect.ts` and `character.ts` are not changed (R108).

## What to Build

1. **His clip set (R107).** `MERCENARY_SHEET`'s animations are exactly `idle`, `walk`, `attack`,
   `death`, `parry`, `run` (the sprint's run from I-JS7C8-21; `parry` 4 frames at 24 fps, not
   looping), built without `withWalkAttack`. The Duelist and the Sellsword inherit it through
   `specRow` (cast.js:622). `RUNNING_MERC_ANIMATIONS` (clips.js:119) goes if nothing reads it.
2. **The tests that name his clips** (they read the committed manifest or his sheet options):
   - `src/render/art/animationSelect.test.ts:470`: `WALK_ATTACKERS` without `mercenary`.
   - `src/render/art/manifest.test.ts:1281`: `OWN_CLIPS.char_mercenary_base` → `["parry", "run"]`;
     the mercenary out of :1284's `backpedal_attack` test.
   - `tools/bake/page/characters/clearance.test.mjs`: :332 `SHEETS.mercenary` on his new set; :399
     and :466 without his attacks on the move; the cloakless control at :538-544 reads his old
     `backpedal_attack` from an explicit set, as the archer's `before` does (:529-536).
   - `mercLooks.test.mjs:86-95` and :115: the clip lists without them.
   - `classMotion.test.mjs:267-277` (the `CLASSES` sheet test) and :608-628 (the carry on
     `walk_attack`/`backpedal_attack`): without him for those two clips.
   Add a `selectAnimation` case for a sheet with `parry` and `run` and no `walk_attack`, if none
   exists: `attack` turned to the aim while attacking on the move, `parry` while guarding, `run`
   at `speed / RUN_PACE` otherwise.
3. **The bake (R109).** `npm run bake` once. The leg and cloak guards and I-JS7C8-22's blade
   guards pass the three sheets' baked run frames with no exemption. Check R99 (every sword mesh
   at least 0.06 H off the ground) on the baked frames of all three looks too.
   `npm run bake -- --check` is clean. Only the three mercenary atlases and their manifest entries
   change. Confirm the archer's, the knight's and the wizard's manifest entries and atlas
   `sha256` are byte-identical to `2018f786`.
4. **The frame box (R110, M7).** Each mercenary frame box is at most 297 × 261. If the trailing
   blade would grow it, stop before committing the bake and report back (the escalation).
5. **The report (R112).** For each sheet, recorded in this issue's "Built" section: atlas pages and
   dimensions, RGBA and PNG bytes before and after, the change in per cent, and the frame box
   before and after. Before (`2018f786`): `mercenary-0` 3428 × 3280 (45.0 MB RGBA, PNG
   5,992,571 B), `mercenary_duelist-0` 3508 × 3300 (46.3 MB, 6,291,293 B),
   `mercenary_sellsword-0` 3032 × 3724 (45.2 MB, 5,976,696 B), each 297 × 261. Estimate: 68 → 40
   frames a facing, about 25–27 MB each.
6. **The comparison for the owner (R111).** For each sheet, the new run beside `2018f786`'s run, 8
   facings, at game scale and ×2, an animated preview playing each at its fps × `200 / RUN_PACE`,
   and a ×4 detail of the sword and the right leg at the lowest and heel-kick frames. Write it as
   I-JS7C8-18 did, into the worktree's gitignored `game-client/tools/bake/review/`. Regenerate
   the regular, looks and dark-room contact sheets.
7. **Docs (R113).** `game-client/docs/design-guideline.md` clip list (:284-310) and the
   `tools/bake/lib/contact.mjs` header (:1-10): the mercenary runs the archer's sprint with the
   sword trailing behind, point down and off the ground, and carries no attack-on-the-move clips.

## Acceptance Criteria

- [x] In `public/art/manifest.json` the three mercenary sheets carry `idle`, `walk`, `attack`,
      `death`, `parry`, `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and
      no `walk_attack`, `backpedal_attack` or `backpedal`.
- [x] The archer's, the knight's and the wizard's manifest entries and atlases are byte-identical
      to `2018f786`'s.
- [x] The shipped-sheet tests name the mercenary without the two clips and the knight and wizard
      with them. `animationSelect.ts` and `character.ts` are unchanged. The `selectAnimation`
      case passes.
- [x] The leg, cloak and blade guards pass the three sheets at bake with no exemption; R99 holds
      on the baked frames.
- [x] `npm run bake -- --check` is clean.
- [x] Each frame box is at most 297 × 261. The atlas report is recorded, and no atlas grows.
- [x] The comparison exists for the three sheets, and its paths are recorded here.
- [x] The guideline and `contact.mjs` notes are updated.
- [x] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.
- [x] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in `game-client`
      pass.

## Blocked By

I-JS7C8-21, I-JS7C8-22, I-JS7C8-23

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: M5, M7, M8; R107–R113; the Acceptance Criteria's "Manifest and client" bullets and the guard
bullet; Edge States "Attacking on the move", "Mixed parties", "The dark-room strip".

## TDD Approach

- RED: the shipped-sheet tests changed to the mercenary without the two clips. They fail against
  `2018f786`'s manifest. Then his sheet options' clip list.
- GREEN: `MERCENARY_SHEET` without `withWalkAttack`, then the bake.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`MERCENARY_SHEET`),
  `game-client/tools/bake/page/characters/clips.js` (`RUNNING_MERC_ANIMATIONS`)
- `game-client/public/art/manifest.json`, `game-client/public/art/mercenary-0.png`,
  `mercenary_duelist-0.png`, `mercenary_sellsword-0.png` (baked, never edited by hand)
- `game-client/src/render/art/animationSelect.test.ts`, `game-client/src/render/art/manifest.test.ts`
- `game-client/tools/bake/page/characters/clearance.test.mjs`, `mercLooks.test.mjs`,
  `classMotion.test.mjs`
- `game-client/tools/bake/lib/contact.mjs`, `game-client/docs/design-guideline.md`

## Built (2026-11-23, agent); waiting on the owner's contact sheet (I-JS7C8-25)

`MERCENARY_SHEET` is `{ ...ANIMATIONS, parry: MERC_ANIMATIONS.parry, run: SPRINT_RUN }` at 1.5x,
built without `withWalkAttack`. The Duelist and the Sellsword take it through `specRow`.
`RUNNING_MERC_ANIMATIONS` is gone, since nothing read it. `animationSelect.ts` and `character.ts`
are unchanged. The `selectAnimation` case covers a sheet with `parry` and `run` and no
`walk_attack`.

One `npm run bake`; `npm run bake -- --check` is clean. Only the three mercenary atlases and
their manifest entries changed. Compared against `2018f786`, every other `atlases` and `sheets`
entry in `manifest.json` (the archer's, the knight's and the wizard's included) is identical, and
`tile` and `facings` are unchanged. The leg, cloak and blade guards pass the baked run frames
with no exemption. R99 holds on them: the sword's lowest point is 0.217 H over the ground (frame
4, all three looks).

| Atlas (1 page each) | `2018f786` | Now | RGBA | PNG bytes |
|---|---|---|---|---|
| `mercenary-0` | 3428 × 3280, 45.0 MB | 1696 × 3528, 23.9 MB | −46.8% | 5,992,571 → 3,510,694 (−41.4%) |
| `mercenary_duelist-0` | 3508 × 3300, 46.3 MB | 1876 × 3284, 24.6 MB | −46.8% | 6,291,293 → 3,637,824 (−42.2%) |
| `mercenary_sellsword-0` | 3032 × 3724, 45.2 MB | 1700 × 3532, 24.0 MB | −46.8% | 5,976,696 → 3,486,160 (−41.7%) |

Each sheet drops from 544 to 320 frames. The frame box is 297 × 261 on all three before and after
(M7 held), with anchors and crowns unchanged. That frees about 64 MB resident over the three.

The comparison for the owner is in the worktree's gitignored
`game-client/tools/bake/review/merc-sprint/`:

- `run-old-vs-new-1x.png` / `.html` (game scale) and `run-old-vs-new-2x.png` / `.html` (×2): each
  of the three sheets' `2018f786` run beside the new one, 8 facings × 8 frames.
- `run-old-vs-new-detail.png` / `.html`: the baked px.
- `run-old-vs-new-anim.html`: each facing old | new, playing at its fps × 200 / 194.
- `inspect/`: per-facing ×2 strips for each look, and the ×4 details of the sword and the right leg
  (`*-x4-f45.png`, four facings for each look).
- The old and new atlases it was cut from (`old-*.png`, `new-*.png`) and the script
  (`make.mjs`).

The regular, looks (`contact-looks-mercenary.png`) and dark-room (`contact-darkroom-mercenary.png`)
sheets, and `contact-char_mercenary_*-2x.png`, in `game-client/tools/bake/review/`, are
regenerated with his six clips.

`game-client/docs/design-guideline.md`'s clip list and the `tools/bake/lib/contact.mjs` header
say it: his run is the archer's sprint, the sword trailing low behind him with the point down and
off the ground, and his sheets carry no attack-on-the-move clips and keep the parry.
