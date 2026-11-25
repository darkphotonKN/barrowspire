---
id: I-5FZ4J-8
status: done
implements: FS-5FZ4J
blocked_by: []
labels: [ready-for-agent]
title: "FS-5FZ4J slice 8: bake the sealed-floor props and their contact sheet"
---
Implements FS-5FZ4J §K R57

**Files:** `game-client/tools/bake/` (catalogue, models), `game-client/public/art/` (baked output
and manifest), `game-client/src/render/art/` tests that pin sheets and resident page counts. Not
`BarrowspireScene.ts` or `gameState.ts` (the client slices own those). Code map: the shared notes
folder's `code-map-game-client.md` §4.

## What to Build

Every prop of §K R57 modelled in code in the bake tool (ADR-0020, ADR-0021), Ultima Online
fidelity (believable proportions, readable silhouettes, textured stone and iron), colours from
`BARROW` tokens only (ADR-0013; the fenced bake models take no colour literals). Multi-state props
framed together so a state swap never moves the sprite; frame names are the states the client
plays (`up`/`down`, `up`/`pressed`, `cold`/`lit`, `shut`/`open`, `full`/`dry`, `dormant`/`prayed`,
`armed`/`sprung`). The hallowed altar reuses the `altar(state)` model with a holy recolour (warm
gold, pale stone, candlelight), not a copy. A brazier for the seal is the run brazier's model with a
`cold` state. Pack them as one new group (`sealed`, or named to fit the catalogue) resident for the
run; update the resident-page test and pin the new sheets against the shipped manifest. Add the
group to the contact sheet's review (`reviewSheets` and the group loop in `tools/bake/lib/contact.mjs`)
so a contact sheet of it is written. Decide the look; record the calls in the issue's closing note.

## Acceptance Criteria

- [ ] `npm run bake` produces the group; `npm run bake -- --check` passes after it.
- [ ] Every §K R57 prop and state is in the manifest, pinned by a test.
- [ ] A contact sheet of the group is written under `tools/bake/review/`; its path is reported.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None.

## Spec Reference

FS-5FZ4J §K R57.

## Closed (2026-11-25)

Baked as the resident `sealed` group (`public/art/sealed-0.png`), modelled in
`game-client/tools/bake/page/models/sealed.js` (in the bake model colour fence). Contact sheet:
`game-client/tools/bake/review/contact-sealed-2x.png`. The art calls, for the client slices:

- **Sheets** are named by the wire's kinds: `seal_lever`, `pressure_plate`, `stone_block`,
  `seal_brazier`, `stair_key`, `bridge_lever`, `mural`, `lore_shrine`, `gate_x`/`gate_y`,
  `pit_cell`, `bridge_cell`, `secret_cracks`, `trap_<kind>`, `healing_fountain`, `hallowed_altar`.
- **The lever shows its glyph.** `seal_lever` is a waist-high stone pillar with an iron lever
  (not the escape `switch`); besides `up`/`down` it carries a `glyph_<glyph>` frame per glyph
  (crow, key, flame, eye, serpent, moon): only the brass glyph in the pillar's two panels, drawn
  over the lever at the same spot. Beyond R57's list, but Lever Order cannot be read without it.
- **The gate is one piece per cell.** A piece is exactly one cell (80 px) along its axis with no
  jamb (the corridor walls are its jambs); `gate_x` for a gate running along world x. Lay one,
  centred, on each cell of `barriers[].cells`; the bars keep their spacing across the joins.
  `open` winds the portcullis up under the beam, its spiked foot above a delver's head.
- **Pits are painted ground.** `pit_cell` frames `open` (north and west neighbours are pit too),
  `n`, `w`, `nw` (the rock face falling from that floor edge, with lip stones). South and east
  edges never show a face. Draw it in the ground band. `bridge_cell` replaces a lane's pit cell
  once lowered (it carries the dark under its planks); `x` for a crossing along world x.
- **Secret door cracks** are a decal at a masonry wall piece's own spot, drawn over it, on every
  piece of the door's face: `x`/`y` on a back piece, `front_x`/`front_y` on a cut-away one. The
  lintel seam sits at one height so it runs on across pieces. Not amber: the client's pool and
  prompt mark it actionable.
- **Traps** bake at full strength; the client draws `armed` faint (R51). Blood (oxblood) on the
  sprung spikes; the fire jet in fire's ramp (a fire effect); the gas a sour bile-olive, not the
  arcane green that means safe. `trap_gas_vent` has `armed`, `sprung` (the cloud at its height)
  and `puff`, 6 frames at 10 fps, not looped. The dart wall always faces world +y (no axis on the
  wire). No trap declares a light.
- **The fountain's water** is dark with a glow at its heart in health's colour (oxbloodText), the
  guideline's restoring channel; no light declared. `dry`: empty to a cracked floor, a tide-mark.
- **The hallowed altar** is `altar(state, "hallowed")`, the same model and frame: pale warm
  limestone, gold banding the slab and in the cross, candles burning and holy water holding their
  light (`dormant`); `prayed`: the candles cold stubs, the water dark. It declares its candlelight
  (`amberBright`, radius 140), which the client should light only while dormant.
- **The seal's brazier** is `brazier("cold" | "lit")`, the run's own model (default `lit`, so the
  run's `brazier` sheet keeps its bytes); `cold` is dead coals and ash. Its sheet declares the run
  brazier's light, to be lit only when lit.
- **The mural** is a free-standing stele turned to the camera, all six glyphs painted on it: the
  order is the client's lore line, so one frame serves every floor. The **lore shrine** keeps one
  candle burning (no declared light).
