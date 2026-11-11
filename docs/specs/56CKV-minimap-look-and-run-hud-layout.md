# FS-56CKV: Minimap look and the run HUD's layout

> Status: draft · SPECIFICATION.md: none (a change FS has no thin line; owners [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (Minimap), [FS-F6F88](F6F88-multi-floor-delves.md) (floor indicator), [FS-BDA7X](BDA7X-character-leveling.md) (level and XP bar), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (resource bars), [FS-R82NV](R82NV-party-formation.md) (party frames) each carry a stub) · Related ADRs: [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) · Surface: game-client only

## Scoping notes (raw)

Charter run "小地圖精緻化", 2026-11-12. The owner's words: "把右上角地圖有可能精緻一點嗎 配合遊戲主題
然後地圖位置移動到逃離人數跟樓層資訊上方 字可以小一點"; "左上的x y點位移動到地圖匡內左下角 字可以小一點
左上的其他資訊往上移動補原來的空位"; "地圖外匡暫時不改了 其他核准". The locked decisions below are his
approval under the charter; no `challenge-me` pass. Each is a **charter default** with its reason;
where this run had to settle something the decisions left open it says **derived here**.

**Shape.** One change FS with pointer stubs, not a `## Change:` on FS-SRA9J: the request moves five
capabilities' designs at once (the minimap's look and place, FS-SRA9J §E; the floor indicator's
place and size, FS-F6F88 req 29; the run's XP bar, FS-BDA7X req 42; the resource bars' top,
FS-8AY7S R20 and its AC "x 10, y 84"; the party frames' run top, FS-R82NV R34's "run y 160"), plus
the dev position readout, a dev aid with no owning FS or line (`src/ui/positionReadout.ts`). The
column's order and the stack's shift are one layout and are sliced together, so one work order.
No thin line changes: every touched line names a capability that survives this.

Verified today (main 28a7a377): top right, from the top, "Escaped: N" (14 px, `frameBright` on
`hudPanel`, padding 10/5), "Floor N" (14 px, `hudText` on `hudPanel`), then the minimap 6 px under
it (`minimapRect`), 216 × 108 on `hudPanel` 0.85 with a 1 px `frame` rim at 0.6, explored and
visible regions as flat fills (`minimapExplored` = slateLight, `minimapVisible`), fixtures as 4 px
amber squares in a `markerStroke` ring, dots `markerAlly` r 2 / `markerSelf` r 3 with a 1 px
`markerStroke` ring. The column is anchored at `TOP_RIGHT_HUD` (dx −10, dy 10 + 34, the fullscreen
button's clearance). Top left: the readout at (10, 10), 14 px, `hudText` on `hudPanel`, dev builds
only (`showsPositionReadout`); the XP bar at (10, 44) (`PROGRESS_HUD_AT.run`); resource bars at
(10, 84) (`RESOURCE_HUD_AT.run`); party frames at top 160 (`PARTY_FRAMES_PLACEMENT.run`). The hub's
XP bar is at (16, 16).

Decisions:

- **The frame is not changed** (charter default; owner "地圖外匡暫時不改了"): the panel's `hudPanel`
  backing and 1 px brass rim stay exactly as drawn today, nothing drawn over the rim.
- **Inside the frame, finer and in the game's look** (charter default; owner "精緻一點 配合遊戲主題"):
  a soft vignette round the inside edge, as the game's own vignette (`inkDeep`, `utils/atmosphere.ts`),
  so the map reads candle-lit; explored regions a dark stone, visible a step lighter, each region
  with a thin edge line, so they read finer than flat fills and still apart at a glance; the
  switch, escape door and stairs as small drawn glyphs (a lever, an arch, a few steps) instead of
  squares; party dots with a dark ring, the player's own a little larger (already r 3 vs r 2; kept).
  Drawn in code, no new baked art; tokens only, a token added only where none fits (ADR-0013).
  Size (216 × 108) and content unchanged.
  - **derived here:** no warm glow in the middle: amber/torch tone in the HUD reads as the
    interactable channel. The "candle" is the darkening at the edges only.
  - **derived here:** the vignette lies over the fills and edges and under the glyphs and dots, so
    nothing a player looks for is dimmed; it stays inside the rim.
  - **derived here:** Phaser's `fillGradientStyle` is WebGL only (its own doc comment, Phaser 4.2.1),
    so the vignette is a canvas texture or fine steps, the same under both renderers.
  - **derived here:** a region's edge is the outline of its footprint (the union of its cells), not
    each cell's rect, so a room never reads as a grid; a shared edge between two seen regions is
    drawn once.
  - **derived here:** glyphs and dots keep their dark `markerStroke` ring and their ink keeps ≥ 3:1
    against it, so they read on either fill (the field-marker outline mechanism); amber on the
    visible fill alone is under 2:1, so the ring is load-bearing.
- **The minimap to the top of the top-right column, then the floor indicator, then the escaped
  count** (charter default; owner "地圖位置移動到逃離人數跟樓層資訊上方"). Type 14 → 12 px with smaller
  padding, right-aligned as today. Where a floor has no minimap, the two lines move back to the top.
  - **derived here:** "the top" is the column's top at `TOP_RIGHT_HUD` (y 44), still stepped down
    clear of the fullscreen button (FS-ZAJMH R18; FS-SRA9J §E.20 "never covers the fullscreen
    button"). The anchor is unchanged.
  - **derived here:** padding 8/3, 6 px under the minimap (`MINIMAP.gap`), 4 px between the lines.
  - **derived here:** "no minimap" covers every case where none is shown: a floor without regions,
    the floor map not yet in, and M toggled off (M exists to clear the corner, FS-SRA9J story 10).
    The column closes up. A hidden floor indicator (no label yet) closes up too.
- **The readout into the minimap's frame, bottom-left, 14 → 10 px, no backing, dim** (charter
  default; owner "左上的x y點位移動到地圖匡內左下角 字可以小一點"). Still dev builds only.
  - **derived here:** it draws above the minimap (the minimap is built after the HUD, at the same
    depth, so it would cover it otherwise).
  - **derived here:** on floor 1 (72 × 48 cells fitted 200 × 100 in the panel), the panel's
    bottom-left corner lies outside the floor's iso diamond (its left vertex at y 44, its bottom
    at x 128), so the readout covers backing and vignette only, never a region.
  - **derived here:** its ink keeps ≥ 3:1 against the darkest the vignetted backing gets under it
    (dim, but a dev reads it at a glance). 10 logical px is ≥ 10 device px at every render scale.
- **The top-left stack moves up** (charter default; owner "左上的其他資訊往上移動補原來的空位"): the
  XP bar from y 44 to y 16, as in the hub, and the resource bars (y 84 → 56), the potion cell and
  the party frames (top 160 → 132) with it. The frames' clearance from the chat window only grows.
  - **derived here:** x stays 10 (the decision moves y only; the hub's x 16 is the hub's inset).
  - **derived here:** it moves in every build and on every floor: the gap it fills is the
    readout's old place, which production never had either.
- **Dev gallery** (charter default): the gallery's tracked families are effects and item icons
  only (`src/dev/gallery/families.ts`, FS-1819Q R3). HUD chrome is not tracked, so no card.

**Conflict found, settled by a charter default, escalated.** "Where there is no minimap, the readout
stays at the top left as today" collides with "the XP bar moves to y 16": the readout at (10, 10)
would cover the XP bar on every floor without regions (floors 2–3, the test room). Rejected: keep
the stack at y 44 where there is no minimap (the HUD would jump between floors and differ from
production); squeeze the readout above the XP bar (16 px of room for a 13 px line at the canvas
edge). Default taken: where no minimap is shown, the readout stands in the top-right column under
its last line, right-aligned, in its new look. Its home is the top-right column either way. Owner
to confirm.

Alternatives rejected: a `## Change:` on FS-SRA9J alone (the stack's and floor indicator's values
live in other FSs, whose ACs name them); baked minimap art (owner: drawn in code; guideline "UI
Chrome" asks for smooth fills and soft edges for world panels); a new frame (owner: not now).

Edge cases raised: arrival on a floor (no minimap until the floor map is built, column at the top,
then the minimap takes the top); a floor change rebuilds the minimap; spectating keeps it; the
target frame and a 600 px top-centre notice stay clear (the minimap's x is unchanged, x ≥ 854 at
1080); resize re-anchors everything, the readout included and re-crispened; render scales 1, 1.5, 2.

Constraints: ADR-0013 (tokens; the fence rejects `0xRRGGBB` in `src/render`), ADR-0057 (Phaser 4,
`fullAuto` pixel rounding), ADR-0063 (fog is presentation; untouched), design guideline "UI
Chrome". Bounds: game-client only; no bake, no baked art, no server.

Open: the readout's place on floors with no minimap (above). Nothing else.
