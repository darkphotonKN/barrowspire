---
id: I-KYPQ9-3
status: done
implements: FS-KYPQ9
blocked_by: [I-KYPQ9-2]
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 3: hub props baked and moved clear of the residents, new dressing, lit lamps and braziers"
---
Implements FS-KYPQ9 §A.1–§A.5, §A.7–§A.9

**Hub lane.** This slice can run in parallel with I-KYPQ9-5 and I-KYPQ9-6 (the run lane). It
bakes, so it waits for I-KYPQ9-2, the other bake slice, because both write the catalogue and the
manifest. It owns `HubScene.ts` until I-KYPQ9-4 takes over.

## Files owned

- `game-client/tools/bake/page/models/props.js`, or a sibling such as `models/town.js`.
- `game-client/tools/bake/page/catalogue.js`. **After I-KYPQ9-2. No other slice bakes
  concurrently.**
- `game-client/public/art/**` (`props-*.png`, any reflowed atlas, `manifest.json`). **After
  I-KYPQ9-2.**
- `game-client/src/render/art/manifest.test.ts`. **After I-KYPQ9-2.**
- `game-client/src/scenes/HubScene.ts`: `drawScenery` and the prop placement only.
- `game-client/src/render/world/hubKeepOut.ts` (new; `HUB_KEEP_OUT` and the placement tables)
  and `hubKeepOut.test.ts`.
- `game-client/src/render/world/scene.ts` / `index.ts`, only if `addProp` needs a small
  extension. **Additive only:** new exports or optional parameters, no signature changes to
  existing ones.

**Not touched:** `BarrowspireScene.ts`, `src/render/effects/**`, `src/render/lighting/**`.

## What to Build

1. **Bake the new sheets** (§A.1), authored in code (ADR-0021) and registered in the catalogue
   and the manifest:
   - `market_stall` with three awning variants (`oxblood`, `arcaneDeep`, `barrowBrown`);
   - `cart`, `hay_cart`, `well`, `crate`, `crate_stack`;
   - `fence_x`, `fence_y`, `fence_post`;
   - `water_trough`, `woodpile`, and `sacks` in two variants (grain, market goods);
   - `signpost`, `washing_post`, `washing_line`, `flower_box`;
   - `chimney`, baked here so that I-KYPQ9-4 does not need to bake.

   `barrel`, `lamp_post` and `brazier` are reused as they are.
2. **The keep-out rule** (§A.3): one client constant `HUB_KEEP_OUT` holding K3–K6, with a
   comment naming `hub_map.go` and `constants/game.go` as the source. The footprint is the
   square `x ± r, y ± r`, and a fence run is that square swept along the whole run.
3. **Restyled props** (§A.2, §A.4): stalls, carts, the well, crates and fences draw their baked
   sheets through the existing `addProp`/`place` path. The coordinates are exactly the §A.4
   table, including the moved stall ×2, the hay cart, the crate, the crate stack and the
   Woodcutter fence run. Crates draw `crate`/`crate_stack`, no longer `barrel`. Fence runs are
   cut into `fence_x`/`fence_y` segments with a `fence_post` at each end, on both axes. The
   Graphics branches stay only as the no-manifest fallback.
4. **New dressing** (§A.5): every row of the §A.5 table at its coordinate, through `place()` and
   `blocked()`.
   - **Tall** props join `occluders`.
   - **Lit** props stamp the light-map through their manifest light on the existing
     `place(…)` → `lightMap.add` path: two lamp posts and two braziers (§A.8).
   - The washing line sorts by its span midpoint, and its footprint is its two posts.
   - Variant picks are by index or `tileHash(x, y, SCENERY_SEED)`.
5. **Decoration only** (§A.7): no `setInteractive`, no hit area, no cursor change, no physics
   group, nothing added to any message.
6. **Fallback** (§A.9): no manifest, or a missing sheet, gives the placeholder where one
   exists, and nothing for new dressing types, logged once.

## Acceptance Criteria

- [ ] Keep-out vitest:
  - every placement in §A.4 (kept and moved) and §A.5 clears K1–K7 using its table `r`, from
    `HUB_KEEP_OUT` and the hub building rects;
  - fence runs are checked along every segment;
  - a bad-placement fixture fails it: one prop inside a `PATHS` rect, and one fence run whose
    start clears but whose span crosses a `PATHS` rect.
- [ ] The manifest schema vitest covers every §A.1 sheet: frame size, anchor, directions and
      frame counts, an `authored: <module>` source with the project licence, and, on lit props,
      a light whose colour is a `BARROW` key.
- [ ] Grep and code review:
  - no new prop calls `setInteractive`, adds a hit area, joins a physics group or changes the
    cursor;
  - every new ground prop goes through `blocked()`;
  - `blocked()` and `ROOF_EAVE` are unchanged (coordinator ruling 4).
- [ ] Diff review: no `sendMessage`/`SocketManager` change and no input binding change in
      `HubScene.ts` (§0.2).
- [ ] `npm run bake` then `npm run bake -- --check` exits 0 with no drift. A second
      `npm run bake` leaves `git status -- public/art` unchanged. Every atlas is ≤ 4096².
- [ ] No `0x`/`#` colour literal in code this slice touches.
- [ ] `game-client/CONTEXT.md` defines **Dressing** under "Rendering terms". It is already in
      the working tree; verify it and do not rewrite it.
- [ ] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [ ] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass.
- [ ] Visual check by the coordinator against the Reference (FS-2325V look, guideline Part I),
      with hub screenshots: every §A.4/§A.5 prop shows baked at its coordinate, lamps and
      braziers light the ground, and residents never cross a prop. Not a HITL gate.
- [ ] No commits.

## Blocked By

I-KYPQ9-2: both slices write the bake catalogue and the manifest.

## Spec Reference

FS-KYPQ9 §A.1 (sheets), §A.2 (restyle via `addProp`), §A.3 (keep-out K1–K7), §A.4 (kept and
moved props), §A.5 (new dressing), §A.7 (decoration only), §A.8 (light budget), §A.9 (fallback).
User stories 1, 2, 3, 5, 6, 7, 8, 30.

## TDD Approach

- RED: the keep-out vitest over the §A.4/§A.5 tables plus the two bad fixtures, which fails
  until `HUB_KEEP_OUT` and the swept-footprint check exist. Then manifest schema assertions for
  the new sheets.
- GREEN: write the constant and the placement tables, author and bake the sheets, then switch
  `drawScenery` to the tables.
