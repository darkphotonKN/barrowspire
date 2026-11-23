---
id: I-JS7C8-18
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-16, I-JS7C8-17]
labels: []
title: "FS-JS7C8 slice 18: the archer's three sheets drop walk_attack and backpedal_attack and are re-baked once with the sprint; atlas report, old-vs-new contact sheet, docs (game-client)"
---
Implements FS-JS7C8 §Change: The archer's sprint and low-ready bow (R79–R85)

**Lane: agent; ends at the owner's contact-sheet gate (I-JS7C8-19).** The one bake of
`char_archer_base`, `char_archer_hunter` and `char_archer_shadow_ranger`. `animationSelect.ts`
and `character.ts` are not changed (R80).

## What to Build

1. **Her clip set (R79).** `ARCHER_SHEET`'s animations are exactly `idle`, `walk`, `attack`,
   `death`, `run` (the 16 fps run from I-JS7C8-16), built without `withWalkAttack`. The Hunter and
   the Shadow Ranger inherit it through `specRow` (`cast.js:629`). The other classes' sheets keep
   `walk_attack` and `backpedal_attack`.
2. **The tests that name her clips.** These read the committed manifest or her sheet options:
   - `src/render/art/animationSelect.test.ts`: "should give %s walk_attack" without the archer.
   - `src/render/art/manifest.test.ts`: `OWN_CLIPS.char_archer_base` → `["run"]`, and the
     archer out of the `RUNNING` list's `backpedal_attack` test.
   - `tools/bake/page/characters/clearance.test.mjs:331`: `SHEETS.archer` → `ARCHER_SHEET.animations`,
     with the clip lists her sheet no longer carries dropped for her.
   - `archerLooks.test.mjs:112`: the clip list without them.
   - `clips.test.mjs:412-421`: the aim-line checks on her `walk_attack` and `backpedal_attack` go
     (her `attack`'s stays).
   Add a `selectAnimation` case for a sheet with `run` and no `walk_attack`, if none exists: it
   plays `attack` turned to the aim while attacking on the move, and `run` at `speed / RUN_PACE`
   otherwise (R80).
3. **The bake (R82).** `npm run bake` re-bakes the three sheets once. The leg, cloak and quiver
   guards pass them with no exemption (nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`).
   `npm run bake -- --check` is clean afterwards. Check by eye at ×2 that the bow passes through
   neither the cloak nor the quiver.
4. **The report (R84).** For each of the three sheets: atlas pages and dimensions before and after,
   RGBA bytes before and after, and the change in per cent, recorded in this issue's "Built"
   section. Main: `archer-0` 2532 × 4060 (41.1 MB), `archer_hunter-0` 2636 × 3924 (41.4 MB),
   `archer_shadow_ranger-0` 2532 × 4060 (41.1 MB). The estimate is about 23–25 MB each. A sheet
   that grows against main is escalated.
5. **The comparison for the owner (R83).** For each sheet, the new run beside main `970f2dc7`'s run,
   8 facings, at game scale and ×2, plus an animated preview playing each at its fps × `200 /
   RUN_PACE`. Write it from the old committed atlas or through `tools/bake/lib/contact.mjs`, as
   I-JS7C8-13 did, into the session scratchpad. Regenerate the regular, looks and dark-room contact
   sheets.
6. **Docs (R85).** `game-client/docs/design-guideline.md`'s clip list: the archer's run is a sprint
   (about 20° forward, a quicker, shorter stride with knee drive and heel kick, the bow held
   two-handed low in front at about 45°), and her sheets carry no attack-on-the-move clips. The
   `tools/bake/lib/contact.mjs` header notes say the same.

## Acceptance Criteria

- [ ] In `public/art/manifest.json` the three archer sheets carry `idle`, `walk`, `attack`,
      `death`, `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and no
      `walk_attack`, `backpedal_attack` or `backpedal`. Every other sheet is as on main.
- [ ] The shipped-sheet tests name the archer without the two clips and the other three classes
      with them.
- [ ] `animationSelect.ts` and `character.ts` are unchanged. The `selectAnimation` case for `run`
      without `walk_attack` passes.
- [ ] The leg, cloak and quiver guards pass the three sheets at bake, with no exemption added.
- [ ] `npm run bake -- --check` is clean.
- [ ] The atlas report is recorded; no archer atlas grows against main.
- [ ] The comparison (new run beside main's, 8 facings, 1x and ×2, animated preview) exists for the
      three sheets, and its paths are recorded here.
- [ ] The guideline and `contact.mjs` notes are updated.
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in `game-client`
      pass.

## Blocked By

I-JS7C8-16, I-JS7C8-17

## Spec Reference

FS-JS7C8 §Change: The archer's sprint and low-ready bow: D7–D9; R79–R85; the Acceptance Criteria's
"Manifest and client" bullets and the guards bullet; Edge States "Attacking on the move", "Mixed
parties", "The dark-room strip".

## TDD Approach

- RED: the shipped-sheet tests updated to the archer without the two clips (they fail against
  main's manifest), and her sheet options' clip list.
- GREEN: `ARCHER_SHEET` without `withWalkAttack`, then the bake.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`ARCHER_SHEET`)
- `game-client/public/art/manifest.json`, `game-client/public/art/archer-0.png`,
  `archer_hunter-0.png`, `archer_shadow_ranger-0.png` (baked, never edited by hand)
- `game-client/src/render/art/animationSelect.test.ts`, `game-client/src/render/art/manifest.test.ts`
- `game-client/tools/bake/page/characters/clearance.test.mjs`, `archerLooks.test.mjs`,
  `clips.test.mjs`
- `game-client/tools/bake/lib/contact.mjs` (notes; the comparison if written there)
- `game-client/docs/design-guideline.md`

## Built (2026-11-23, agent); waiting on the owner's contact sheet (I-JS7C8-19)

`ARCHER_SHEET` is `{ ...ANIMATIONS, run: { ...RUN_ANIMATIONS.run, fps: 16 } }` at 1.5x, built
without `withWalkAttack`; the Hunter and the Shadow Ranger take it through `specRow`.
`animationSelect.ts` and `character.ts` are unchanged. One `npm run bake`; `npm run bake -- --check`
reports no changes. The bake touched only `archer-0.png`, `archer_hunter-0.png`,
`archer_shadow_ranger-0.png` and their manifest entries; every other sheet and atlas in
`manifest.json` is byte-identical to main. The leg, cloak and quiver guards pass the three sheets
with nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.

| Atlas | Main 970f2dc7 | Now | RGBA |
|---|---|---|---|
| `archer-0` (1 page) | 2532 × 4060, 41.1 MB | 1960 × 2708, 21.2 MB | −48.4% |
| `archer_hunter-0` (1 page) | 2636 × 3924, 41.4 MB | 1868 × 2840, 21.2 MB | −48.7% |
| `archer_shadow_ranger-0` (1 page) | 2532 × 4060, 41.1 MB | 1960 × 2708, 21.2 MB | −48.4% |

About −60 MB resident over the three. The frame box holds: 252 × 225 (base, Shadow Ranger) and
252 × 231 (Hunter), anchors and crowns as on main. The run's own extent grew inside it (base
x 45–198 → 39–228, y 48–201 → 33–204, in the sheet's px) but stays inside the box the other clips
already set. Her idle, walk, attack and death frames keep main's trims.

A throwaway check (not committed) intersected every edge of the bow's meshes with the cloak's and
the quiver's triangles on the 8 baked run frames of all three looks: no crossing. Its control found
the expected crossings of the grip through the left fist and the string through the right.

The comparison for the owner (gitignored, in the worktree's `game-client/tools/bake/review/archer-sprint/`):
`run-old-vs-new-1x.png` (game scale), `run-old-vs-new-2x.png` (×2), `run-old-vs-new-detail.png`
(the baked px ×2), each the three sheets' main run beside the new, 8 facings × 8 frames, and
`run-old-vs-new-anim.html`, each facing old | new, playing at its fps × 200 / 194. The regular,
looks (`contact-looks-archer.png`) and dark-room (`contact-darkroom-archer.png`) sheets in
`game-client/tools/bake/review/` are regenerated with her five clips.
