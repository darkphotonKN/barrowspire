---
id: I-Q14EV-1
status: done
implements: FS-Q14EV
blocked_by: []
labels: [ready-for-agent]
title: "FS-Q14EV slice 1: winged demon boss baked on the shared rig, plus the guideline's boss-tier amendment"
---
Implements FS-Q14EV §0, §A, §B

**First slice. It ends at a HITL gate:** the owner approves the demon's contact sheet before this
issue closes. Slice 2 (I-Q14EV-2) waits for it, because both bakes rewrite
`tools/bake/page/catalogue.js` and `public/art/manifest.json`, and slice 2 reuses the digitigrade
leg segment added here.

> Coordination: other bake work may be in flight on the same branch (FS-KYPQ9 touches
> `catalogue.js` and `manifest.json`). Rebake from the merged tree. Never hand-merge manifest JSON.

## Files owned

- `game-client/docs/design-guideline.md`, the "Enemy design language" section and the "Enemies"
  bullet under "Characters / Enemies" only.
- `game-client/tools/bake/page/characters/rig.js`: the digitigrade lower-leg segment, the wing
  bone chains and the tail chain, as `createRig` creature-variant options.
- `game-client/tools/bake/page/characters/` demon builder (a new module, or `cast.js`), its
  materials and clips, and the `CAST` entry `creature_demon_base` in group `boss`.
- `game-client/tools/bake/page/catalogue.js` (only if registration needs it).
- `game-client/public/art/`: new `boss-*.png` atlas(es) and additive `manifest.json` entries.
- Only if the demon overflows one 4096² page (FS-Q14EV §B.7): `tools/bake/lib/pack.mjs` (+ test),
  `tools/bake/bake.mjs`, `tools/bake/lib/contact.mjs`, `src/render/art/manifest.ts`,
  `library.ts`, `phaser.ts` and their tests.
- `game-client/src/render/art/manifest.test.ts`.

## What to Build

1. **Guideline amendment first** (FS-Q14EV §B.1, owner request 2026-10-08). "Undead and
   barrow-born only" stays the rule for fodder and brutes. Add the boss-tier exception (infernal
   beings the Spire summons, demons, may appear as bosses only). Add the green-hide clause (dark,
   desaturated hide green allowed as a boss body material; emissives stay ember red; green never
   an emissive or marker). Attribute both to the owner's request. Make the "Enemies" summary
   bullet consistent with them.
2. **Rig variant options** (§B.2): a digitigrade extra lower-leg segment, wing chains (upper arm,
   forearm, three or more fingers with a skinned membrane between them), and a tail chain, on
   `createRig` as creature-variant options, so no existing build changes.
3. **The demon** (§B.2–§B.6): horned, clawed arms separate from the wings, digitigrade legs, a
   tail. Boss tier: crown at least 1.8× the delver mean, aiming for about 2.0× at the skull. The
   hide is a dark, desaturated bog/lich green mixed from `BARROW` tokens, never `arcane` as-is.
   Eyes use `hostileEye`, the only emissive. Wings and tail are spring-lagged.
4. **Clips** (§B.6): `idle` (wings half-furled, breathing, tail sway), `walk` (heavy, slow,
   digitigrade), `attack` (a roar wind-up of head back, jaw open and wings flared, held at least
   0.4 s, then the strike and recovery; its own frame count and fps), and `death` (falls heavily,
   wings collapse, eyes go out by the last frame).
5. **Fit the sheet** (§B.7): bake once and measure. If the sheet overflows one atlas page,
   implement per-animation page spill: the packer, an optional `ArtAnimation.atlas`, the
   validator, `ArtLibrary`/Phaser resolution and the contact `index.html`, with unit tests.
   Existing entries carry no new field. If the sheet fits, skip this step and say so in the
   hand-back.
6. **Manifest tests** (§A.13) for `creature_demon_base`: it exists, sits in group `boss`, has 8
   directions and the 4 clips, has an `authored:` source, and meets the crown ratio of at least
   1.8×.
7. **HITL gate** (§A.14): `npm run bake` writes `tools/bake/review/contact-sheet.png` (1×) and
   `contact-creature_demon_base-2x.png`, covering the demon × 8 directions × idle, walk, attack and
   death. **Stop and hand the contact sheets to the owner for approval.** If the owner rejects
   them, rework and rebake. Do not close the issue.

## Acceptance Criteria

- [ ] The guideline carries the boss-tier exception and the green-hide clause, attributed to the
      owner (2026-10-08), and the "Enemies" bullet doesn't contradict them.
- [ ] `creature_demon_base` is in `manifest.json` in group `boss` with 8 directions × `idle`,
      `walk`, `attack`, `death`, and `source: "authored: tools/bake/page/characters/…"`.
- [ ] The crown ratio is at least 1.8× the delver mean, asserted in `manifest.test.ts`.
- [ ] `attack` opens with the roar wind-up, held at least 0.4 s before the strike.
- [ ] The hide base colour is less saturated than `arcane` and darker than `arcaneDeep`. No hex
      literals appear in new bake code, and the only emissive is `hostileEye`.
- [ ] Every pre-existing atlas `sha256` and sheet entry is unchanged. The manifest diff is
      additive only.
- [ ] If the sheet overflowed a page: per-animation `atlas` is packed, validated, resolved and
      tested. Otherwise the hand-back records that it fit.
- [ ] `npm run bake -- --check` exits 0 after the committed bake.
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.
- [ ] `git diff -- game-server/` is empty.
- [x] **HITL:** the owner approved the demon's contact sheet at 1× and 2× (2026-10-08; troll recoloured to barrow mud and stone in the same review).

## Blocked By

None.

## Spec Reference

FS-Q14EV §0 (boundary), §A (roster pipeline: sheet naming, `boss` group, clips, provenance, tier,
eyes, springs, wind-up, determinism, tests, the HITL gate), and §B (demon and guideline amendment,
incl. §B.7 oversized-sheet spill). User stories 1–6, 10–18, 20–23.

## TDD Approach

- RED: `manifest.test.ts` expects `creature_demon_base` in group `boss` with the 4 clips × 8
  directions, an `authored:` source and a crown of at least 1.8× the delver mean. It fails until
  the bake lands.
- RED (only if overflowing): `pack.test.mjs` packs a sheet larger than one page and expects
  per-animation pages. `manifest.test.ts` validator cases accept a valid `animation.atlas` and
  reject an unknown one.
- GREEN: the rig options, the demon build and clips, and (if needed) the spill, then rebake.
