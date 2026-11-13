---
id: I-3EBCA-14
status: done
implements: FS-3EBCA
blocked_by: []
labels: [ready-for-agent]
title: "FS-3EBCA slice 14: the Inventory corner icon is a bronze knockout rucksack, tested, with screenshots for the owner (game-client)"
---
Implements FS-3EBCA §Change: The inventory icon is a bronze knockout rucksack (Requirements R1–R14, Acceptance Criteria all but "By eye")

The owner, 2026-11-13: 「icon如果是實心 然後線條用穿透背景的方式呢」, 「背包我想改成那種比較圓的背包 目前有點太長」,
「背包兩側在加側袋」, then, after the in-game preview: 「古銅反白好了」 (the `?bag=bronze` variant).

## What to Build

Make the preview's `bronze` variant permanent, as tested code. The preview is the throwaway commit
`7bb0857b` (branch `spike/backpack-preview`). Read it with
`git show 7bb0857b:game-client/src/ui/backpackPreview.ts` and
`git show 7bb0857b -- game-client/src/ui/HudCorner.ts`. Port its geometry and method. Do not merge
or cherry-pick it, and do not bring its `?bag=` switch.

- **The knockout** (R1–R8), in `HudCorner.ts` or a small module beside it (for example
  `src/ui/knockoutRucksack.ts`, with its own test file):
  - the round rucksack's shapes: bedroll, body, two low side pockets, flap, hasp, ring;
  - a render texture of the slot's size times `k = 2 × renderScale`, at depth 1000, scroll factor
    0, scale `1 / k`, on the slot's centre;
  - the silhouette filled in `TINT_IDENTITY` and the 1.6 px cuts erased, then `render()`, and the
    drawing graphics destroyed;
  - the tint and alpha set per state: idle `mix(palette.frame, palette.interactable, 0.5)` at
    0.85, hovered `mix(palette.frame, palette.interactableBright, 0.5)` at 1;
  - rebuilt when `viewport.renderScale` changes (`viewport.onChange`), moved on `relayout`, and
    destroyed and unwatched in `HudCorner.destroy`.
- **The fallback** (R9): when the scene lacks `make.graphics` or `add.renderTexture`, or making the
  texture throws, draw the same rucksack in the icon's own graphics as lines at `GLYPH_LINE_W` (the
  preview's `drawRoundBag`), in the row's amber, with no fill. The slot is never empty.
- **`Ink` stays stroke-only** for the other four glyphs (R11). The fills live only in the
  knockout's own drawing graphics. Remove `drawBackpack` and the haversack's geometry.
- **Tests.**
  - Give `HudCorner.test.ts`'s fake scene an optional `make.graphics` and `add.renderTexture` that
    record what they are given, with their arguments (size, position, depth, scroll factor, scale,
    tint, alpha, `draw`, `erase`, `render`, `destroy`).
  - Replace the block "§ Change: The inventory icon is an inked backpack, as a line haversack" and
    the haversack's case in "FS-QHN87 R2: no notches" with tests of R1–R9: the texture, the
    silhouette's box and parts, the cuts, the tints, the rebuild, the relayout, the destroy, and the
    fallback on today's stand-in and on a throwing one.
  - The FS-J1672 and FS-QHN87 assertions on Menu, Character, Party and the greyed Mailbox stay
    and pass. No test may still name the haversack.
- **Guideline** (R13): update the **Corner row** paragraph of `game-client/docs/design-guideline.md`
  and add this section to its "Added by" note.
- **Screenshots** (R14). Use the existing, git-ignored harness `game-client/tmp/glyphs/`
  (`main.ts`, `shoot.mjs`, `vite.config.mjs`, `index.html`; real WebGL Phaser in headless Chrome
  via `playwright-core`, Vite on port 5937 with `strictPort`). Extend it to render scale 1.5 and to
  hover the Inventory zone. Save under `game-client/tmp/glyphs/out/` and list all sixteen absolute
  paths under "Screenshots" below:
  - twelve of the town row (the four icons plus `MailboxEnvelope` with a count of 3): idle and
    Inventory-hovered × render scale 1, 1.5 and 2 × a light ground (a daylit field's tone) and a
    dark ground (`palette.ground`);
  - three nearest-neighbour enlargements of the idle Inventory slot over the dark ground, one per
    render scale;
  - one of a render scale changed at run time from 1 to 2, to show the rebuild.

  Never commit the harness. Read the source or the official docs for any Phaser 4.2.1,
  Playwright or Vite API you are unsure of. Don't guess.

**The slot.** Read it from `cornerIconFrame("inventory", viewport)` in code and tests, never as
fixed numbers: FS-QHN87's tweak round 2 (in progress in this worktree when this issue was written,
uncommitted) narrows the slots to 54 × 46, 2 px apart, which moves the Inventory slot's centre from
(969, 681) to (981, 681) at 1080 × 720. If that round is in the tree when you start, build on it;
do not revert or touch its files.

Files expected: `game-client/src/ui/HudCorner.ts`, `game-client/src/ui/HudCorner.test.ts`,
optionally one new module and its test beside them, and `game-client/docs/design-guideline.md`
(the Corner row paragraph only). Not `hudCornerLayout.ts`, `cornerLabel.ts`,
`MailboxEnvelope.ts`, `carvedPanel.ts`, `canvasPalette.ts`, `theme.ts`, the other four glyphs,
any scene, `public/art` or `tools/bake` (§ Bounds). A slice that finds one of these unavoidable
stops and escalates.

## Acceptance Criteria

- [ ] With a scene that can make textures, one render texture is made, for Inventory: depth 1000,
      scroll factor 0, on the slot's centre, `round(f.width·k) × round(f.height·k)` with
      `k = 2 × renderScale` and `f = cornerIconFrame("inventory", viewport)`, at
      scale `1 / k`. The icon's own graphics records no op.
- [ ] Into it: fills in `TINT_IDENTITY` at 1 only, then an erase of strokes all 1.6 wide (logical),
      then `render()`. The drawing graphics are destroyed. No other colour, no gradient.
- [ ] The silhouette (logical px): 36–42 wide, 28–34 tall, wider than tall, centred within 1 px,
      inside the slot. The bedroll's top is the top, and it is half to all of the body's width. The
      pockets are the left and right extremes, start below the body's middle, are no taller than a
      third of the box, and the silhouette is mirror-symmetric within 0.01 px.
- [ ] Cuts: flap edge, two ties, a closed rolled end, roll/body seam, hasp, ring (radius 1.5–2.5,
      below the flap's lowest point), a flap and a seam per pocket. No cut uses `lineBetween`.
- [ ] Tint and alpha: idle `mix(frame, interactable, 0.5)` at 0.85; hovered `mix(frame,
      interactableBright, 0.5)` at 1. Hover and leave make no new texture and draw nothing.
- [ ] `relayout` to 1280 moves it to the slot's new centre with no new texture. A render scale of 1 → 2
      builds anew at `k = 4` and destroys the old. A width change alone builds nothing.
- [ ] `destroy` destroys the image and unwatches: a later render-scale change builds nothing and
      throws nothing.
- [ ] The fallback, on today's stand-in and on one whose `add.renderTexture` throws: strokes only,
      all `GLYPH_LINE_W`, amber 0.85 idle and bright 1 hovered with every point unchanged, no
      fill, no angled `lineBetween` meetings; bedroll, flap, ring and a pocket each side; box
      36–44 × 28–36, centred on the slot within 1 px, before and after a `relayout`.
- [ ] Menu, Character, Party and the greyed Mailbox are drawn exactly as at `84d82e8a`. The
      Inventory zone, cursor, `covers`, press and label are unchanged.
- [ ] `Ink` has no fill method. No test names the haversack. No raw colour literal.
- [ ] The guideline's Corner row paragraph reads as R13 and cites FS-3EBCA § Change: The inventory
      icon is a bronze knockout rucksack.
- [ ] The sixteen PNGs exist, and their absolute paths are listed under "Screenshots" below. No
      harness file is committed, and nothing of `7bb0857b` is merged.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass in `game-client`.

## Screenshots

(Filled in by the slice: sixteen absolute paths, each named for its state, render scale and
ground.)

## Blocked By

None.

## Spec Reference

FS-3EBCA §Change: The inventory icon is a bronze knockout rucksack, R1–R14, § What this changes in
its owners and § Edge States; user stories 1–18, 20 and 21; charter K1–K6, and K7's render
scales for the screenshots. Supersedes § Change: The inventory icon is an inked backpack as built.
Narrows, without editing them, FS-3EBCA R3, FS-J1672 R2 and R3, and FS-QHN87 R1, R7 and R9 for
this one icon.

## TDD Approach

- RED: on a fake scene with `make.graphics` and `add.renderTexture`, the row makes one texture
  for Inventory of `round(f.width·k) × round(f.height·k)` at scale `1 / k` on the slot's centre. Fills are
  `TINT_IDENTITY`, cuts are erased at 1.6, and the tint is the bronze at 0.85. Then hover, relayout,
  a render-scale change and destroy each do what R5–R8 say. On today's fake, the line fallback's
  box and parts hold. The four other glyphs' blocks still pass.
- GREEN: the knockout drawer and the fallback, ported from the preview's geometry. Then the
  guideline edit and the screenshots.
