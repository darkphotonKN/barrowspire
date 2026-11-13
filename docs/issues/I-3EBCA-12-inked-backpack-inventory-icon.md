---
id: I-3EBCA-12
status: done
implements: FS-3EBCA
blocked_by: []
labels: [ready-for-agent]
title: "FS-3EBCA slice 12: the Inventory corner icon is an inked backpack, with screenshots for the owner (game-client)"
---
Implements FS-3EBCA §Change: The inventory icon is an inked backpack (Requirements R1–R13, Acceptance Criteria all but "By eye")

The owner, 2026-11-13: 「道具藍幫我重做成一個背包的圖示 可以圖示複雜有質感一點」, then, after a baked realistic
try that was dropped: 「感覺風格不太對 可能還是要複雜的圖示 不要寫實風格」, 「黑暗奇幻風格」.

(Ids I-3EBCA-10 and I-3EBCA-11 belong to the abandoned `feat/client-backpack-icon-baked` branch and
are skipped on purpose.)

## What to Build

- In `HudCorner.ts`, replace `drawBag` with a backpack drawer. The backpack is drawn with Phaser
  Graphics into the Inventory icon's existing graphics, centred on the slot's centre `(f.x + 29,
  f.y + 23)`, and redrawn where `draw` redraws today. It shows R1's parts (flap, two straps with
  brass buckles, side pouch, tied bedroll, shoulder strap, stitching, three to five scratches), in
  R2's style:
  - a 2.5 px `palette.ink` silhouette outline (over 2 px, so WebGL joins its corners; see the
    section's § Facts);
  - 1–1.5 px ink part lines;
  - flat fills;
  - ink hatching at 0.6 alpha or less.
- One table of the backpack's tones at the top of the file (R3), each a `palette` token or a
  `mix` / `shade` / `tint` of tokens. No hex literal and no new token.
- The amber edge (R6): a 1 px line along the outer side of the silhouette outline,
  `interactable` at 0.85 idle and `interactableBright` at 1 hovered. It is the only op that differs
  between idle and hover.
- The `Ink` type stays stroke-only for the other four glyphs. The backpack drawer takes its own,
  wider `Pick` that adds the fill methods it uses, so FS-J1672 R3 stays enforced by the types for
  the four.
- Size (R4): the whole drawing, edge included, is 32–36 px tall and at most 44 px wide, centred
  within 1 px.
- Update the `HudCorner.test.ts` FS-J1672 block. "No fill" and "stroked in its glyph's ink alone"
  now cover Menu, Character, Party and the greyed Mailbox. Add a block for this section. The fake
  graphics need `moveTo`, `lineTo` and any other method the drawer calls (`fillPoints`,
  `strokePoints`, `fillEllipse`, …) recorded with their arguments, so the bounding box can be
  measured.
- Rewrite the **Corner row** paragraph of `game-client/docs/design-guideline.md` as R12 says.
- **Screenshots (R13).** Render the row and save eight PNGs:
  - idle and hovered;
  - at render scale 1 and 2;
  - over a light ground (a daylit field's tone) and a dark ground (`palette.ground`, the town's
    dusk).

  Each shows the whole row at backing resolution. Also save one nearest-neighbour enlargement of
  the Inventory slot per render scale. List all ten absolute paths under "Screenshots" below. The
  harness is throwaway: keep it under `game-client/tmp/` (git-ignored) or outside the worktree, and
  never commit it.
  - **One way to render it:** the bake pipeline's headless Chrome. `tools/bake/bake.mjs` launches
    `chromium` from `playwright-core` with `channel: "chrome"` (the installed Google Chrome), and
    falls back to a Playwright Chromium. Point that at a small Phaser page that mounts a
    `HudCorner` over a filled ground at 1080 × 720, with the camera zoomed per
    `src/render/viewport/camera.ts`. Hover can be shown by calling the zone's `pointerover` or by
    moving the mouse there. Then call `page.screenshot` with a `clip`.
  - **Bundling:** `HudCorner` imports through the `@/` alias, so a Vite dev server (the client's
    own config) is the likely way to serve the page. Read the source or official docs for any
    Phaser 4.2.1 or Playwright API you are unsure of. Don't guess.

Files expected: `game-client/src/ui/HudCorner.ts`, `game-client/src/ui/HudCorner.test.ts`,
`game-client/docs/design-guideline.md` (the Corner row paragraph only). Not `hudCornerLayout.ts`,
`cornerLabel.ts`, `MailboxEnvelope.ts`, `carvedPanel.ts`, `canvasPalette.ts`, `theme.ts`, any
scene, `public/art` or `tools/bake` (§ Bounds). A slice that finds one of these unavoidable stops
and escalates.

## Acceptance Criteria

- [ ] The Inventory icon fills in at least four distinct tones (body leather, darker leather,
      brass, cloth), none amber, with no `fillGradientStyle`. Every fill colour, and every stroke
      colour but the amber edge's, is `palette.ink` or one named in the backpack's tone table.
- [ ] The outline is `palette.ink` with a width over 2. Hatching is `palette.ink` at 0.6 or less
      and width 1 or less. Stitching and scratches are `palette.ink`, width 1 or less.
- [ ] Idle strokes include `interactable` at 0.85 and no `interactableBright`. Hovered strokes
      include `interactableBright` at 1 and no `interactable`. Every other op is identical idle and
      hovered.
- [ ] The bounding box of everything it draws is 32–36 px tall, at most 44 px wide, inside
      (940, 658, 58, 46), and centred within 1 px of (969, 681) at 1080 × 720 and of (1169, 681) at
      1280. It follows a `relayout`.
- [ ] Menu, Character, Party and the greyed Mailbox fill nothing and are stroked as before.
- [ ] The Inventory zone, hand cursor, `covers`, press and "Inventory (I)" label are unchanged.
      `destroy` takes the graphics down. The row creates no image, texture or render texture.
- [ ] The guideline's Corner row paragraph reads as R12, and cites FS-3EBCA § Change: The inventory
      icon is an inked backpack.
- [ ] The ten PNGs exist, and their absolute paths are listed under "Screenshots" below. No
      harness file is committed.
- [ ] No raw colour literal. `npx vitest run --maxWorkers=4 --minWorkers=1`,
      `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.

## Screenshots

(Filled in by the slice: ten absolute paths, each named for its state, render scale and ground.)

## Blocked By

None.

## Spec Reference

FS-3EBCA §Change: The inventory icon is an inked backpack, R1–R13 and § What this changes in its
owners; user stories 1–15 and 17; D1–D6, and D7's screenshots. Narrows, without editing them,
FS-3EBCA R3 and FS-J1672 R2, R3 for this one icon.

## TDD Approach

- RED: in `HudCorner.test.ts`, the Inventory graphics' recorded ops show:
  - fills in at least four tones, none amber;
  - an ink stroke wider than 2;
  - the amber edge at 0.85 idle and bright at 1 hovered, with every other op unchanged;
  - a bounding box 32–36 tall and at most 44 wide, centred on (969, 681), and on (1169, 681) after
    a widen and `relayout`.

  Meanwhile the FS-J1672 block, narrowed to the other four, still passes.
- GREEN: the backpack drawer and its tone table. Then the screenshots and the guideline edit.

## Superseded

2026-11-13: built and looked at, then superseded by FS-3EBCA § Change: The inventory icon is a bronze knockout rucksack (I-3EBCA-14/15).
