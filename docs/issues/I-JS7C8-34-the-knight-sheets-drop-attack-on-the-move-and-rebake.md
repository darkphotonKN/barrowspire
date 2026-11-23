---
id: I-JS7C8-34
status: open
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

- [ ] In `public/art/manifest.json` the three knight sheets carry `idle`, `walk`, `attack`, `death`
      and `run` (8 frames at 16 fps, looping, 8 facings), and the Berserker's `attack_offhand` too.
      They are at 1.5x and trimmed. None carries `walk_attack`, `backpedal_attack`,
      `walk_attack_offhand`, `backpedal_attack_offhand` or `backpedal`. No sheet in the manifest
      carries any of them.
- [ ] Every non-knight manifest entry and atlas is byte-identical to `23717cbb`'s.
- [ ] Each knight frame box and anchor equals today's or is smaller. The report is recorded here.
- [ ] `npm run bake -- --check` is clean. `npm test`, `npm run lint`, `npm run lint:fence` and
      `npx tsc --noEmit` in `game-client` pass.
- [ ] `animationSelect.ts` and `character.ts` are unchanged.
- [ ] The comparison and the regenerated contact sheets are written, and their paths are recorded
      here for I-JS7C8-37.
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

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
