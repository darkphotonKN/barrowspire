---
id: I-Q14EV-2
status: open
implements: FS-Q14EV
blocked_by: [I-Q14EV-1]
labels: [ready-for-agent]
title: "FS-Q14EV slice 2: wraith, revenant and grave-hound baked, with the quadruped rig variant"
---
Implements FS-Q14EV §0, §A, §C

**Waits for I-Q14EV-1,** including the owner's approval of its contact sheet. Both bakes rewrite
`tools/bake/page/catalogue.js` and `public/art/manifest.json`, and the grave-hound's hind legs
reuse the digitigrade segment slice 1 adds to the rig. This slice also **ends at a HITL gate:**
the owner approves the three creatures' contact sheets before it closes.

## Files owned

- `game-client/tools/bake/page/characters/rig.js`: the quadruped variant (horizontal spine,
  forelimb and hind-limb chains as legs, neck, jaw and tail), as `createRig` options.
- `game-client/tools/bake/page/characters/clips.js` (or a sibling module): the quadruped 4-beat
  walk cycle.
- `game-client/tools/bake/page/characters/` builders for the wraith, revenant and grave-hound,
  their materials and clips, and the `CAST` entries `creature_wraith_base`,
  `creature_revenant_base` and `creature_gravehound_base` in group `bestiary`.
- `game-client/tools/bake/page/catalogue.js` (only if registration needs it).
- `game-client/public/art/`: new `bestiary-*.png` atlas(es) and additive `manifest.json` entries.
- `game-client/src/render/art/manifest.test.ts`.

## What to Build

1. **Wraith** (§C.1, fodder, crown 0.85–1.05× the delver mean). It floats and has no legs (no
   leg mesh, lower edge clear of the ground). Tattered hooded rags with ragged hems trail on
   spring bones. Long reaching arms. `walk` is a bobbing glide with the rags streaming. `attack`
   draws both arms back, then reaches. `death` unravels into a heap of cloth with no body left.
2. **Revenant** (§C.2, brute, crown 1.3–1.55× and visibly wider). A grave-knight in rusted,
   desaturated plate with a broken helm. It is asymmetric: one heavy, lower arm gripping a notched
   blade whose tip drags on `walk`. `walk` is heavy and slow. `attack` heaves the blade up and
   back, then cleaves down. `death` staggers, then topples hard with the blade dropping.
3. **Quadruped rig variant** (§C.3), within ADR-0021 §1: `createRig` overrides plus added bones,
   the same bone naming, and the same `applyPose`/`simulateSprings`/baker path. No second skeleton
   system. It has its own 4-beat lateral-sequence walk (left hind, left fore, right hind, right
   fore). No leg crosses the body in any facing.
4. **Grave-hound** (§C.4, fodder, crown at most 1.0×). Skeletal: ribcage, spine, long skull with
   a jaw, bone legs, a bony spring tail. Low and fast, with a higher stride rate than a delver's.
   `attack` crouches back on the haunches, then lunges with the jaw open. `death` scatters its
   bones across the ground.
5. **All three** (§A): 8 directions × `idle`, `walk`, `attack`, `death`. `hostileEye` is the only
   emissive, and the eyes are out by the last death frame. Colours come from `BARROW` (grave
   materials, the cold desaturated end). No gore. The wind-up on every attack is readable.
6. **Manifest tests** (§A.13) for each of the three sheets: it exists, sits in group `bestiary`,
   has 8 directions and the 4 clips, has an `authored:` source, and meets its §A.6 crown ratio.
7. **HITL gate** (§A.14): `npm run bake` writes `tools/bake/review/contact-sheet.png` (1×) and a
   `contact-<sheet>-2x.png` for each of the three, covering every creature × 8 directions × each
   clip. **Stop and hand the contact sheets to the owner for approval.** If the owner rejects
   them, rework and rebake. Do not close the issue.

## Acceptance Criteria

- [ ] `creature_wraith_base`, `creature_revenant_base` and `creature_gravehound_base` are in
      `manifest.json` in group `bestiary`, each with 8 directions × `idle`, `walk`, `attack`,
      `death`, and an `authored: tools/bake/page/characters/…` source.
- [ ] Crown ratios are asserted in `manifest.test.ts`: wraith 0.85–1.05, revenant 1.3–1.55,
      grave-hound at most 1.0 (all against the delver mean).
- [ ] The grave-hound uses the quadruped rig variant with a 4-beat lateral-sequence walk, and no
      second skeleton system is introduced.
- [ ] Deaths: the wraith unravels, the hound's bones scatter, the revenant topples with weight. No
      gore. Eyes are out on each death clip's last frame.
- [ ] No hex literals appear in new bake code, and the only emissive is `hostileEye`.
- [ ] Every atlas `sha256` and sheet entry present before this slice (including slice 1's
      `boss-*` and `creature_demon_base`) is unchanged. The manifest diff is additive only.
- [ ] `npm run bake -- --check` exits 0 after the committed bake.
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.
- [ ] **HITL:** the owner approved the three creatures' contact sheets at 1× and 2×.

## Blocked By

I-Q14EV-1 (shared bake outputs `catalogue.js` and `manifest.json`, and the digitigrade rig
segment).

## Spec Reference

FS-Q14EV §0 (boundary), §A (roster pipeline: naming, `bestiary` group, clips, provenance, tiers,
eyes, springs, wind-up, determinism, tests, the HITL gate), and §C (wraith, revenant, quadruped
rig variant, grave-hound). User stories 7–19, 21–23.

## TDD Approach

- RED: `manifest.test.ts` expects the three sheets in group `bestiary` with the 4 clips × 8
  directions, `authored:` sources and their crown ratios. It fails until the bake lands.
- GREEN: the quadruped rig variant and walk cycle, the three builders and clips, then rebake.
