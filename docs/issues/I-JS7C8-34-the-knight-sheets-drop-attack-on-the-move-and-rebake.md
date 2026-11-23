---
id: I-JS7C8-34
status: done
implements: FS-JS7C8
blocked_by: [I-JS7C8-33]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 34: the knight's three sheets drop walk_attack and backpedal_attack (and the Berserker's off-hand twins of them), re-baked once with his sprint; frame box held, the other sheets byte-identical, atlas report, old-vs-new contact sheet, docs (game-client)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (R149–R154, R157)

**Lane: agent.** This slice hands the owner's contact sheet to I-JS7C8-37, but nothing after it
waits on that (K6). It is the one bake of `char_knight_base`, `char_knight_guardian` and
`char_knight_berserker`. `animationSelect.ts` and `character.ts` are not changed here (R150). The
dead code goes in I-JS7C8-35.

## What to Build

1. **His clip set (R149).** `KNIGHT_SHEET` becomes `{ animations: { ...ANIMATIONS, attack: {
   ...ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH }, run: SPRINT_RUN }, scale: 1.5 }`, built without
   `withWalkAttack` and without `RUNNING_CLASS_ANIMATIONS`. `BERSERKER_SHEET` stays
   `withOffhand(KNIGHT_SHEET.animations)`, so it gains `attack_offhand` alone. The Guardian
   inherits through `specRow`.
2. **The tests that name his clips.** In `src/render/art/animationSelect.test.ts`, `WALK_ATTACKERS`
   (:504) is empty. Once no class has the clip, the case becomes a test that no sheet carries
   `walk_attack`. The off-hand test (:601-610) checks `attack_offhand` alone. In
   `src/render/art/manifest.test.ts`, `OWN_CLIPS.char_knight_base` (:1280) becomes `["run"]`, and
   `BACKPEDALLING` (:1380) is empty or goes. In `tools/bake/page/characters/clearance.test.mjs`,
   `MOVING.knight` (:405) becomes `["run", "walk"]` and `CLOAKED.knight` (:535) drops the two clips.
   The knight's cloak control on `backpedal_attack` (:551-560) builds its clips explicitly, as the
   archer's does. In classMotion.test.mjs, `CARRIED` (:688) loses the two clips for him. "the
   knight's slash is the one attack his walk_attack and backpedal_attack draw" (:937-959) goes. The
   shield test (:1009) reads `attack` alone. Give him a sheet test like the wizard's (:1234),
   `["idle", "walk", "attack", "death", "run"]`. axe.test.mjs `SWINGS` and the twin tests, and
   warriorLooks.test.mjs (:41-46), follow the Berserker's sheet. If any of them builds a clip that is
   no longer on the sheet, it builds it explicitly until I-JS7C8-35.
3. **The bake (R152).** Run `npm run bake` once. The leg and cloak guards pass the three sheets'
   baked frames with no exemption, and `npm run bake -- --check` is clean. Only `knight-0`,
   `knight_guardian-0`, the Berserker's page(s) and their manifest entries change. Confirm that every
   other manifest entry (archer, mercenary, wizard, creatures, boss, folk) and every atlas `sha256`
   is byte-identical to `23717cbb`.
4. **The frame box (R151, K5).** Each frame box and anchor is at most 276 × 228 at (114, 168) (base,
   Guardian) and 267 × 240 at (108, 183) (Berserker). If the bake would grow one, stop before
   committing it and report back.
5. **The report (R154).** Put it in this issue's "Built" section, for each sheet: atlas pages and
   dimensions, RGBA and PNG bytes before and after, the change in per cent, and the frame box before
   and after. Before (`23717cbb`): `knight-0` 3716 × 3056 (45.4 MB, PNG 7,352,196 B),
   `knight_guardian-0` 2900 × 3968 (46.0 MB, 7,709,743 B), `knight_berserker-0` 4096 × 3840 (62.9 MB,
   8,191,437 B), `knight_berserker-1` 4096 × 1792 (29.4 MB, 4,055,125 B). *Estimate:* 64 → 36 frames a
   facing (base, Guardian), and 99 → 43 for the Berserker.
6. **The comparison for the owner (R153).** For each sheet: the new run beside `23717cbb`'s, 8
   facings, at game scale and ×2; an animated preview playing the run at its fps × `200 / RUN_PACE`;
   ×4 details of the blade at the front and the back of the pump in `e`, `ne` and `n`; and the
   hauberk's back over the calf on run keys 1 and 5. Write them as I-JS7C8-30 did, into the
   worktree's gitignored `game-client/tools/bake/review/`. Regenerate the regular, looks and
   dark-room contact sheets.
7. **Docs (R157).** Update `game-client/docs/design-guideline.md`'s clip list and the
   `tools/bake/lib/contact.mjs` header. The knight runs with the sprint's lean and cadence on his own
   legs, with his blade carried raised and the wrist held back. No class carries an attack on the
   move. The dual-wielder line names `attack_offhand` alone. "The knight keeps both until his own
   run is redone" goes.

## Acceptance Criteria

- [x] In `public/art/manifest.json` the three knight sheets carry `idle`, `walk`, `attack`, `death`
      and `run` (8 frames at 16 fps, looping, 8 facings), and the Berserker's `attack_offhand` too.
      They are at 1.5x and trimmed. None carries `walk_attack`, `backpedal_attack`,
      `walk_attack_offhand`, `backpedal_attack_offhand` or `backpedal`. No sheet in the manifest
      carries any of them.
- [x] Every non-knight manifest entry and atlas is byte-identical to `23717cbb`'s.
- [x] Each knight frame box and anchor equals today's or is smaller. The report is recorded here.
- [x] `npm run bake -- --check` is clean. `npm test`, `npm run lint`, `npm run lint:fence` and
      `npx tsc --noEmit` in `game-client` pass.
- [x] `animationSelect.ts` and `character.ts` are unchanged.
- [x] The comparison and the regenerated contact sheets are written, and their paths are recorded
      here for I-JS7C8-37.
- [x] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

## Built (2026-11-23, agent); waiting on the owner's contact sheet (I-JS7C8-37)

`KNIGHT_SHEET` is `{ ...ANIMATIONS, attack: { ...ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH },
run: SPRINT_RUN }` at 1.5x, built without `withWalkAttack` and without `RUNNING_CLASS_ANIMATIONS`.
`BERSERKER_SHEET` stays `withOffhand(KNIGHT_SHEET.animations)`. `withOffhand` twins only the attack
clips a sheet carries, so the Berserker gains `attack_offhand` alone with no code change to it. The
Guardian takes it through `specRow`. No class sheet reads `RUNNING_CLASS_ANIMATIONS` now. It,
`withWalkAttack` and the retired `OFFHAND_OF` entries stay for I-JS7C8-35. `animationSelect.ts` and
`character.ts` are unchanged.

- **Tests.** `classMotion.test.mjs`: each knight style's describe asserts its sheet's clips in
  order at 1.5x (`["idle", "walk", "attack", "death", "run"]`, the Berserker's plus
  `attack_offhand`), red before the sheet change. "the knight's slash is the one attack his
  walk_attack and backpedal_attack draw" is gone, `CARRIED` is the four, and the shield test reads
  `attack` alone. `clearance.test.mjs`: `MOVING.knight` is `["run", "walk"]` and `CLOAKED.knight`
  is the four. The cloak guard's `backpedal_attack` control already builds its clips explicitly
  from `RUNNING_CLASS_ANIMATIONS`, so only its comment changed (its kept-clip fixture is
  I-JS7C8-35's, R155). `axe.test.mjs`: `SWINGS` and the twin tests follow the clips on the
  Berserker's sheet (`attack` / `attack_offhand`), with a test that nothing else is twinned.
  `warriorLooks.test.mjs`: the Berserker alone carries `attack_offhand` and no sheet carries the
  other twins, and the camera check reads idle, run and walk. `animationSelect.test.ts`:
  `WALK_ATTACKERS` and its `walk_attack` cases are replaced by a test that no manifest sheet carries
  any of the four retired clips, plus the knight's three sheets with exactly his clips, and the
  off-hand test reads `attack_offhand` alone. The `selectAnimation` cases with synthetic
  `walkAttack` and `backpedalAttack` flags stay until I-JS7C8-35. `manifest.test.ts`:
  `OWN_CLIPS.char_knight_base` is `["run"]`, `BACKPEDALLING` and its test are gone, and a new
  `KNIGHT_BOX` test holds each knight box and anchor to the pre-change ones (R151).
- **One bake.** `npm run bake` (5 min 52 s), then `npm run bake -- --check`: `bake: no changes`.
  The leg and cloak guards ran at bake with no exemption.
- **Only his entries changed.** Against `a125c245`'s manifest, which is byte-identical to
  `23717cbb`'s and, for these sheets and atlases, to `2018f786`'s: every `sheets` entry but the
  three knight ones (265 of 268) and every `atlases` entry but the knight pages (65) is identical.
  That covers the archer's, the mercenary's, the wizard's, the creatures', the boss's and the
  folk's entries and their `sha256`. `version`, `tile` and `facings` are unchanged. No other PNG in
  `public/art/` changed. `knight_berserker-1.png` is deleted: the Berserker now fits on one page.

| Atlas | Before (`23717cbb`) | Now | RGBA | PNG bytes |
|---|---|---|---|---|
| `knight-0` | 3716 × 3056, 45.4 MB | 1980 × 2932, 23.2 MB | −48.9% | 7,352,196 → 3,966,614 (−46.0%) |
| `knight_guardian-0` | 2900 × 3968, 46.0 MB | 2000 × 2944, 23.6 MB | −48.8% | 7,709,743 → 4,084,802 (−47.0%) |
| `knight_berserker-0` + `-1` | 4096 × 3840 (62.9 MB) + 4096 × 1792 (29.4 MB) | `-0` alone, 1828 × 3796, 27.8 MB | −69.9% | 8,191,437 + 4,055,125 → 4,757,598 (−61.2%) |

The base and the Guardian drop from 512 to 288 frames (64 → 36 a facing), the Berserker from 792
to 344 (99 → 43), as estimated. About 109 MB resident is freed over the three (183.7 → 74.5 MB).

| Sheet | Box before, anchor | Box now, anchor | Crown |
|---|---|---|---|
| `char_knight_base` | 276 × 228, (114, 168) | 276 × 228, (114, 168) | 80 |
| `char_knight_guardian` | 276 × 228, (114, 168) | 276 × 228, (114, 168) | 80 |
| `char_knight_berserker` | 267 × 240, (108, 183) | 267 × 240, (108, 183) | 76 |

Each box and anchor is unchanged (K5): the attack sets every edge, as the FS measured. The new run
fits inside it.

**The comparison for the owner** (R153) is in the worktree's gitignored
`/Users/nick/projects/barrowspire-knight-sprint/game-client/tools/bake/review/knight-sprint/`. The old side is `a125c245`'s knight, the same atlases as `23717cbb`'s and
`2018f786`'s (copied to `old/`).

- `run-old-vs-new-1x.png` / `.html` and `run-old-vs-new-2x.png` / `.html`: each look's run, 8
  facings × 8 frames, old beside new.
- `run-old-vs-new-anim.html`: the run, old | new, each at its fps × 200 / 194 (old 14.4 fps, new
  16.5 fps).
- `run-old-vs-new-detail-blade.png` / `.html`: ×4 of the blade at the front of the pump (keys 3,
  4) and the back (keys 7, 0) in `e`, `ne` and `n`.
- `run-old-vs-new-detail-hauberk.png` / `.html`: ×4 of run keys 1 and 5, the hauberk's back over
  the calf, in every facing.
- `inspect/`: per look and facing, `<sheet>-run-<facing>-x2-grid.png` (old keys 0–7 above, new
  below, in rows of four) and `-x2.png`, and per key the ×4 pairs `-x4-blade-k<n>.png` and
  `-x4-hauberk-k<n>.png`.
- The script that writes them: `make.mjs`.

The regular sheets (`/Users/nick/projects/barrowspire-knight-sprint/game-client/tools/bake/review/contact-sheet.png` and `-2` to `-4`), the looks sheet
(`/Users/nick/projects/barrowspire-knight-sprint/game-client/tools/bake/review/contact-looks-knight.png`), the dark-room strip (`/Users/nick/projects/barrowspire-knight-sprint/game-client/tools/bake/review/contact-darkroom-knight.png`),
`/Users/nick/projects/barrowspire-knight-sprint/game-client/tools/bake/review/contact-char_knight_base-2x.png`, `-guardian-2x.png`, `-berserker-2x.png` and `index.html` are
regenerated with his clips.

**What the comparison shows (for the owner to judge):**

- **The lean.** In the facings across the screen (`ne`, `sw`, `e`) the trunk is clearly further
  forward, the head ahead of the hips, at a quicker cadence. Facing the camera (`s`) or away
  (`n`, `w`, `nw`) it shows mostly as the head and shoulders sitting lower and further forward.
- **The blade under the lean.** It is still carried raised. At ×4 in `ne` and `e`, at both the
  front and the back of the pump, it is at much the same angle on screen as before. At the back of
  the pump it is a little higher, from the wrist held back. In `n` and `w`, at the front of the
  pump, it stands up beside the helm and past it, as before. It never crosses the head on screen.
- **The hauberk and the cloak.** At ×4 on run keys 1 and 5, the hauberk's back hangs to the knee
  over the folded calf in every facing, with no calf or boot through it. The cloak flies out behind
  as before. The Guardian's surcoat lies over the hauberk unchanged.
- **The shield** stays up before the chest. In `e` it turns a little more edge-on under the lean,
  so less of its face shows behind the sword hand than before.
- **The Berserker's two axes** are carried as before, the edges forward and down. Under the lean
  the hands come lower and further forward. In `e` and `sw` the leading axe's head now reaches
  the anchor's ground line on screen on some keys. In `se`, facing the camera, it did so before as
  well. *Measured* on his rig (a throwaway script, not
  committed), the axes' lowest point in the run is **0.074 H** off the ground. It was 0.114 H on the
  old run, and the walk reads 0.082 H and the idle 0.099 H. So the axes never touch the ground. They
  only hang lower ahead of him, and the isometric view draws a point ahead of the feet lower on
  the screen.
- **Clipping.** None seen at ×2 or ×4 on any of the three looks.

## Blocked By

I-JS7C8-33

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: K3, K5, K6; R149–R154, R157; the Manifest-and-client block of the Acceptance
Criteria.

## Files it expects to touch

`game-client/tools/bake/page/characters/classStyles.js`, `classMotion.test.mjs`,
`clearance.test.mjs`, `axe.test.mjs`, `warriorLooks.test.mjs`; `game-client/public/art/manifest.json`,
`knight-0.png`, `knight_guardian-0.png`, `knight_berserker-*.png`;
`game-client/src/render/art/animationSelect.test.ts`, `manifest.test.ts`;
`game-client/docs/design-guideline.md`, `game-client/tools/bake/lib/contact.mjs`.
