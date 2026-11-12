# FS-1SEF0: Minimap modes: enlarged and overlay

> Status: work-order · SPECIFICATION.md: none (a change FS has no thin line; owners [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) "Minimap" (§E), [FS-F6F88](F6F88-multi-floor-delves.md) "Floor transitions" (the floor indicator, req 29, placed by FS-56CKV §B), and [FS-56CKV](56CKV-minimap-look-and-run-hud-layout.md), the dev position readout's only spec (§C), each carry a stub) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md) (origin 0, zoom = render scale), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (pixel rounding), [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (fog and minimap are presentation; unchanged here) · Supersedes in part: FS-SRA9J §E.19 (M toggles the minimap, on each time a run scene starts) and its Out of Scope's "a full-screen map"; FS-56CKV §B.11's and §C.18's "the minimap toggled off with M", and its Out of Scope's "a full-screen map, zoom" · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Minimap**, **Map overlay**, **Region**

## Summary

In a run, M no longer hides the minimap: it steps through three ways of showing it. **Normal** is
today's top-right minimap. **Enlarged** is the same minimap half as large again, 324 × 162, at the
same corner, with the floor indicator, the escaped count and the dev readout moving down with it.
**Overlay** is the floor's map drawn over the whole view as in Path of Exile 2: centred on the
player and moving with them, see-through, with no panel and no frame, the corner left to the floor
indicator and the escaped count. The chosen mode is remembered in the browser, across floors,
runs and refreshes.

Asked by Nick on 2026-11-12, with the minimap's look (FS-56CKV) done and liked ("小地圖目前很好"):
"幫我做一個放大1.5倍的模式跟像poe2一樣蓋在在整個畫面半透明的模式先透過按M切換", then "1.5倍大小記得要把
地圖相關會擠壓或是下方的文字跟著往下調". The coordinator's defaults were put to him and he answered
three ("1 循環 2跟著移動 3好"): **M cycles the three modes only, with no off step**; **the overlay is
centred on the player and moves with them**; **about 40% opacity is fine**. Each requirement below
says **owner** (his words or his answers), **charter default** (the coordinator's locked default,
not yet overridden), or **derived here** and why. Recorded without adversarial review: no
`challenge-me` pass.

**Why a change FS.** The request changes the minimap's own behaviour (FS-SRA9J §E: what M does,
and a full-screen map its Out of Scope excluded), the place of the floor indicator under it
(FS-F6F88 req 29, laid out by FS-56CKV §B), and the dev readout's place (FS-56CKV §C, its only
spec). Several capabilities move at once, so it is one work order of its own (`docs/specs/README.md`,
The FS ledger). No thin line changes: the overlay is the minimap shown another way, not a new
capability ("Minimap → FS-SRA9J" survives it).

## Facts this spec rests on

Verified 2026-11-12 on `feat/run-minimap-look` at 708af7c1; client paths under `game-client/src/`.

- **M today** (`scenes/BarrowspireScene.ts`, `bindRunInput`): a `keydown-M` event, ignored while the
  menu is open, on a held key's repeat and while chat is typing, calls `toggleMinimap`, which flips
  `minimapOn` (true each time a run scene starts, `resetRun`) and shows or hides the floor's
  `Minimap`. Nothing about the minimap is stored in the browser.
- **The minimap** (`ui/minimap.ts`, FS-56CKV §A): a 216 × 108 panel (`MINIMAP`), the floor's iso
  diamond fitted in a 4 px inset; four layers made in this order at depth 1000 and so drawn in it:
  the map (backing, 1 px brass rim, the one fill, the walls' 1 px line), the vignette (an image of
  the 216 × 108 canvas texture `minimapVignette`), the marks (the 7 × 7 glyphs on a 1 px ring in a
  9 × 9 box), the dots (ally r 2, self r 3, each in a 1 px ring). The map and marks are redrawn only
  when the seen regions or the fixtures found change; the dots only when one moves a whole px; all
  are drawn about the panel's top-left and moved by `place`. On floor 1 the fit scale is 0.02604
  (the world's iso diamond, 7680 × 3840, into 208 × 100).
- **Graphics are not vertex-rounded.** Phaser 4.2.1 rounds quads only in its image, stamp, tile
  and vertex transformers (`renderer/webgl/renderNodes/transformer/`); a `Graphics` draws where its
  coordinates fall. A shape stays crisp only where its edges fall on whole logical px at a whole
  render scale.
- **The column** (`ui/topRightColumn.ts`, FS-56CKV §B): from `anchorAt(TOP_RIGHT_HUD)` (x = width −
  10, y 44), the minimap's rect at the top when one is shown, the floor indicator 6 px under it, the
  escaped count 4 px under that; with none shown they close up to y 44. The readout
  (`ui/positionReadout.ts`) stands 4 px inside the shown minimap's bottom-left, else 4 px under the
  column's last line, right-aligned.
- **What else is at the top** (logical px): the fullscreen button in the canvas's corner, above
  y 44; the target frame 260 × 46 at y 10, centred (`ui/targetFrame.ts`), the boss's 378 × 54,
  ending at y 64, x 351–729 at width 1080 *(Corrected 2026-11-12, I-1SEF0-3's capture: was "378 × 64")*; a notice, 20 px text in 20 × 10 padding centred on (width/2, 100), so
  y 78–122, its width its text's (no wrap), at depth 2000 over the HUD; the climb's floor card about
  the view's middle at depth 950–951. The world arrival card (FS-PQ2TW, branch
  `feat/world-arrival-card`, not on this branch) centres 0.3 of the view's height above its middle,
  at depth 960–961.
- **Depths:** the world band from 100 (`WORLD_DEPTH`), the light-map 135, the fog's veils at the
  blackout's 500, dust 902 and the vignette 905 (`render/lighting/vignette.ts`), the aim line 940,
  the floor veil 950, the HUD 1000 (bars, frames, chat, the target frame, the column, and the
  overhead markers, `render/markers/markers.ts`), the gear overlay 1100, notices and the menu 2000.
- **The camera** follows the player (or, spectating, the watched teammate) with a lerp of 0.1 at
  origin 0 and zoom = render scale (ADR-0056, `render/viewport/camera.ts`), and Phaser moves it in
  its own pre-render, after the scene's `update`. A world object (scroll factor 1) at world point
  P draws at (P − scroll) × zoom; a figure stands at `worldToScreen(position)` (`render/iso/draw.ts`
  `standAt`).
- **Storage:** the client keeps per-browser choices in `localStorage` through a `KeyValueStore`
  (`characters/roster.ts`; e.g. `barrowspire_active_character_id`), reached lazily since Next
  renders on the server.

## Requirements

### §A. The modes and M

1. **Three modes, in this order: normal, enlarged, overlay.** Normal is today's minimap (FS-56CKV
   §A, §B). Enlarged is §B. Overlay is §C. **(owner)**
2. **M cycles them: normal → enlarged → overlay → normal.** There is no off step: nothing hides the
   minimap any more. M keeps its other rules (FS-SRA9J §E.19): a keydown event, never a captured
   key; ignored while the menu is open, on a held key's repeat and while chat is typing. Each press
   takes effect at once, no tween. **(owner, 2026-11-12: "1 循環", replacing the coordinator's
   default "normal → enlarged → overlay → off → normal")**
3. **Only where a minimap exists.** On a floor without regions (a floor of buildings, the dev test
   room) there is no minimap in any mode, as today, and M does nothing there, nor on a dungeon floor
   before its map is in. **(charter default for the floor of buildings; derived here: a key that
   shows nothing and silently changes a setting the player cannot see would surprise; the mode is
   changed only where its effect is seen)**
4. **The mode is remembered in this browser**, in `localStorage` under
   `barrowspire_minimap_mode`, as `normal`, `enlarged` or `overlay`. It is read when a run scene
   starts and written on each M press; it holds across a floor change, a new run and a refresh.
   **(charter default)**
5. **Storage that fails or holds nothing known starts at normal.** Every read and write is in a
   try/catch. No value, a value that is not one of the three, and the old value `off` (a stored
   "off" never existed before this change, but an older build's or a hand-set one is read as normal
   and nothing more) all read as normal. With storage unavailable (blocked, a private window, the
   server render) the mode starts at normal, M still cycles it for the scene, and nothing throws.
   **(charter default; owner's follow-up, 2026-11-12: an old "off" is treated as normal)**
6. **A floor change keeps the mode:** the next floor's minimap is built in the mode in force.
   **(charter default)**
7. **The off-only path goes.** `minimapOn` and the minimap's shown/hidden switch exist only for M's
   off step; with no way in left they are removed. The column's "no minimap shown" layout
   (FS-56CKV §B.11) stays: it is still reached by a floor without regions, a dungeon floor before
   its map, and now the overlay (§D.13). **(owner's follow-up, 2026-11-12: drop any off-only layout
   path that has no way in, keep the floor-without-regions case)**

### §B. Enlarged

8. **324 × 162 logical px, the column's top at the top**: right-aligned on `TOP_RIGHT_HUD`'s x, its
   top at the column's top (y 44 at every width), as the normal minimap stands. **(charter
   default)**
9. **The map in it scales by 1.5 with it, with no blur; its marks do not.** The map's scale is
   **`MINIMAP_ENLARGED.scale` = 1.5**; its marks' is a value of its own, **`MINIMAP_ENLARGED.marks`
   = 1** (tunable, separate from the map's scale). Lengths that lie on the pixel grid are 1.5 ×
   today's rounded to whole logical px: the panel (324 × 162), its inset (6), its rim (2 px, from
   1). Lines off the grid are 1.5 × exactly, as they are anti-aliased at any size: the walls' line
   1.5 px. The floor's diamond is fitted in the bigger inset, so its scale is 1.5 × the normal
   map's. The vignette is painted for the bigger panel, its reach 27 px (1.5 × 18) and its edge
   alpha unchanged, inside the 2 px rim; nothing is drawn over the rim. The glyphs and the party's
   dots are drawn at `MINIMAP_ENLARGED.marks`, so at the normal minimap's size and as it draws
   them, the same as the map overlay's (§C.16): each glyph 9 × 9 (its 7 × 7 ink on its 1 px ring;
   was 14 × 14, each of its px the whole-px span `round(1.5·i)` to `round(1.5·(i + 1))`), every
   edge on a whole logical px, seated on a whole logical px and held inside the rim; the player's
   own dot r 3 in a 1 px ring (r 4 across; was r 4.5 in 1.5, r 6 across) and an ally's r 2 in a
   1 px ring (r 3 across; was r 3 in 1.5, r 4.5 across), centred on whole logical px and held
   inside the rim. The glyph keeps its ring and the ink's 3:1 against it. Colours, tokens, layer
   order and contrast (FS-56CKV §A) are unchanged. **(charter default; derived here: ADR-0057
   rounds no `Graphics`, so the map is drawn at its size, not scaled as an object, and the rounding
   rule keeps every grid edge on whole px; owner, 2026-11-12, "1.5被地圖的標記也改小一點ep 2倍一樣大",
   read by the coordinator as: on the 1.5 × (enlarged) map make the marks smaller too, the same
   size as on the big map (the overlay, §C.16, `marks` = 1); not asked back. Derived here: the
   marks drawn exactly as the normal minimap's, on its logical-px grid, so at render scale 1 and
   2 every glyph edge is on a whole backing px and at 1.5 they blend as the normal minimap's do
   (Edge States); the overlay seats its marks on the backing grid only because it moves in the
   world)**
10. **Redraw:** switching between normal and enlarged redraws the map, marks and dots once at the
    new size and swaps the vignette's image; otherwise each layer redraws only when what it shows
    changes, as at normal size (FS-56CKV §A.8). **(derived here)**
11. **Everything under it moves down with it**, keeping its gaps: the floor indicator 6 px under the
    enlarged map's bottom (y 212), the escaped count 4 px under that, and the dev readout 4 px
    inside the enlarged map's bottom-left corner, at its own size (10 px, unscaled). **(owner:
    "1.5倍大小記得要把地圖相關會擠壓或是下方的文字跟著往下調")**
12. **Clearances at logical widths 1080 and 1280:** the enlarged map, the floor indicator and the
    escaped count overlap neither the fullscreen button, the target frame nor the boss's target
    frame (the boss frame ends at x 729, the enlarged map starts at x 746 at 1080), nor the climb's
    floor card (about the view's middle, below y 206), nor the world arrival card (its centre at
    y 144 at a 720 px view; its widest part, the top floor's line, measured 360 px in the body face
    at 19 px, x 360–720 at 1080), nor the top-left stack. A top-centre notice is clear of the
    enlarged map up to 412 px wide at 1080 and 612 px at 1280; see Edge States for a wider one at
    1080.
    **(charter default; derived here: the figures)**

### §C. The overlay (the **map overlay**)

13. **The floor's map over the whole view**, as Path of Exile 2's overlay: every seen region in the
    one fill, the walls as lines with every opening a gap, the glyphs, the party's dots, drawn by the
    minimap's own rules (FS-56CKV §A.4–§A.7) and from the same content. No backing panel, no rim,
    no vignette. **(owner)**
14. **Centred on the player and moving with them**: the overlay is the world's iso projection
    scaled by `MINIMAP_OVERLAY.scale` about the figure the camera follows, the player, or while
    spectating the watched teammate, so that figure's own point on the overlay lies on the figure on
    screen and the rest of the floor lies in its true direction from them. It moves with them every
    frame and never lags the camera. **(owner, 2026-11-12: "2跟著移動"; derived here: the figure the
    camera follows, so a spectator's overlay is about whom they watch, as the view is)**
15. **Its scale is 1/8 of the world's projection** (`MINIMAP_OVERLAY.scale` = 0.125, a starting
    value, tunable): floor 1's diamond is 960 × 480 logical px, about the view, so the whole floor
    is in sight from most places, and a cell of 80 world px is a 16 × 8 px diamond. **(derived
    here: large enough that a corridor reads and every glyph sits apart, small enough that the
    floor fits the view; a value the owner tunes by eye)**
16. **See-through: the regions' fill and the walls' line at 40% opacity** (`MINIMAP_OVERLAY.alpha`
    = 0.4, tunable), so the game shows through; the walls' line 2 logical px wide
    (`MINIMAP_OVERLAY.edge`, tunable). The glyphs and the dots are drawn at full opacity, at
    **`MINIMAP_OVERLAY.marks` = 1**, the one named scale for every mark on the overlay (tunable),
    two thirds of the enlarged map's 1.5 (§B.9), so the normal minimap's own size: each glyph 9 × 9
    (its 7 × 7 ink on its 1 px ring; was 14 × 14), the player's own dot r 3 in a 1 px ring (r 4
    across; was r 4.5 in 1.5, r 6 across), an ally's r 2 in a 1 px ring (r 3 across; was r 3 in
    1.5, r 4.5 across). Each glyph's px is drawn as the whole-**backing**-px span it scales to at
    the render scale of now (nearest neighbour, as §B.9 on the logical grid), seated on the
    backing-px grid the overlay stands on (§C.19), so a glyph's every edge is on a whole backing px
    at render scale 1, 1.5 and 2, and a re-fit to another render scale redraws the marks once; the
    dots' centres are on that grid as before. The glyph keeps its ring and the ink's 3:1 against
    it; the normal minimap's marks are unchanged (the enlarged map's were too, until §B.9 put them
    at this same size on 2026-11-12). Colours are the minimap's tokens.
    **(owner, 2026-11-12: "3好" to about 40%; derived here: the line's width, since a 1 px line at
    40% over a lit floor is lost, and full opacity for what a player looks for, as FS-56CKV §A.3
    never dims a glyph or a dot; owner, 2026-11-12, "最大的圖的標記小一點" (on the biggest map, make
    the marks smaller): about two thirds of the size they had, as the enlarged map's at 1.5, a
    starting value; derived here: two thirds of 1.5 is the normal minimap's 1, which lies on whole
    px at every whole render scale and keeps the ring readable, and the backing-px spans keep
    the glyph crisp at 1.5 too)**
17. **Above the fog and the world, below the HUD:** at depth 920 (`MINIMAP_OVERLAY.depth`), over
    the world, the fog, the dust and the vignette (905), under the aim line (940), the floor veil and
    its card (950), the world arrival card (960), the HUD and the overhead markers (1000), the gear
    overlay and notices. **(charter default; derived here: the value, and the aim line kept on top,
    since it is the player's aim)**
18. **It takes no input.** Its layers are never interactive, so a click, a hover, an attack and
    movement reach the game exactly as with no overlay. **(charter default)**
19. **Move it, do not repaint it.** Its map and marks are drawn once per content change (a region
    first seen, a fixture found) and on entering the mode, about the floor's own origin; following
    the player is a change of the layers' position only, on whole **backing** px: the figure's
    whole backing px less its point's whole backing px on the overlay, at the render scale of now,
    the grid every figure is drawn on (ADR-0057); the dots, placed from the figures' drawn positions
    and seated on the same grid, stand there and lie on their figures. **The map and marks are then
    held against the screen:** each frame, once the camera is set up and before anything is drawn,
    from the scroll the frame is drawn at, they stay where they were shown on screen while the
    stand is within **the hold, two backing px,** of that, and otherwise go to within two backing
    px of it, per axis, on whole backing px. So on screen they slide one way as the player walks, never back, an
    axis the walk does not move holds still, they come to rest once the player stops, and they are
    never more than two backing px off the figure's point (the dots stay on it, so a dot may sit up
    to two backing px off the map's own point for its figure). The dots are
    redrawn only when one moves a whole backing px. Per frame with no change of content the overlay
    draws nothing anew. **(owner's
    brief; derived here: the whole-px position keeps a still frame still, FS-ZAJMH R4; owner,
    2026-11-12: "全畫面地圖人物的座標會一直抖動", then "還是有抖動感 可以加一些平滑效果嗎": on whole
    logical px the map stepped back and forth under the figure at render scale 1.5 and 2, which
    draw the figure on a finer grid. Measured in headless Chrome with the real camera, walking at
    200 world px a second: easing the overlay's centre (100 ms) added lag and kept the back-steps;
    sub-px placement glides, but a Graphics is never rounded, so every line edge blends a little
    differently each frame; whole backing px measured as even as sub-px against the figure with
    every line on the grid. Then, the same day, "最大的全螢幕還是會有震動感" and "人在左右移動時地圖點位不是
    直線 會鋸齒狀上下移動": the figure itself, eased toward 30 Hz broadcasts against the camera's lerp
    and its scroll floored onto the backing grid, steps a backing px or two back and forth on
    screen, unnoticed on the figure; the map, tied to it and sliding at 1/8 of the walk, stepped
    back with it. Measured in headless Chrome with the real camera at real fullscreens (1512 × 982
    and 1728 × 1117 at device pixel ratio 2, 1920 × 1080 at 1, 1.25 and 2, 2560 × 1440 at 1 and 1.5,
    and fractional scales 1.06, 1.39, 1.94), walking world x, world y and screen right at 60 and
    120 fps with and without ±8 ms of broadcast jitter: 10 to 34 back-steps a second on screen,
    each one or two backing px, 1.4 to 3.1 screen px once a canvas capped at render scale 2 is
    stretched to the screen (FS-ZAJMH R3); held, none at any of them, the map within one backing px
    of the figure's point. Smoothing the centre (an exponential, an alpha-beta tracker, a
    critically damped spring) and sub-px placement were measured and not taken: each left
    back-steps under jitter or put the map up to 3 to 7 logical px off the figure while the camera
    caught up. Held within one backing px, ±8 ms of broadcast jitter still left at most 1.7
    back-steps a second of one backing px at render scale 2; offered a hold of two backing px,
    which removes them at the cost of the map sitting up to two backing px off the dot, the owner
    answered on 2026-11-12 "好": the hold is two backing px)**
20. **While the overlay is up the corner holds no map**: the top-right minimap is not shown, the
    column closes up (§D). **(charter default)**

### §D. The column and the readout

21. **The column lays out by the mode:** normal, as FS-56CKV §B.9 (the 216 × 108 map at the top);
    enlarged, the 324 × 162 map at the top and the rest under it (§B.11); overlay, as "no minimap
    shown" (FS-56CKV §B.11): the floor indicator at the column's top (y 44), the escaped count under
    it. **(charter default)**
22. **The readout follows:** inside the shown map's bottom-left (normal or enlarged), 4 px in; with
    the overlay, 4 px under the column's last line, right-aligned (FS-56CKV §C.18). It keeps its
    look (10 px, dim, no backing) in every mode. **(charter default)**
23. **The column re-lays** on M, on a floor built or left, on the floor label set, and on resize
    (`relayoutHud`, re-crispened), as FS-56CKV §B.11–§B.12 say; FS-56CKV §B.11's and §C.18's case
    "the minimap toggled off with M" is replaced by "the overlay up". **(derived here)**

### §E. Docs and gallery

24. **The design guideline's "UI Chrome" gains a "Map overlay" bullet** after the Minimap bullet,
    naming the enlarged size and the overlay's look in one paragraph, marked "*(Added by FS-1SEF0,
    2026-11-12.)*". **(derived here: a canvas look belongs in the guideline)**
25. **`game-client/CONTEXT.md`'s "Minimap"** says M cycles its modes, and **"Map overlay"** is
    added. **(derived here: a new term)**
26. **No dev-gallery card**: HUD chrome is not a tracked family (FS-1819Q R3, FS-56CKV §E.24).
    **(derived here)**

## User Stories

1. As a player, I want M to step the minimap through its sizes, so that I choose how much map I see.
2. As a player, I want a bigger minimap in the corner, so that I read a large floor without squinting.
3. As a player, I want the bigger minimap to push the floor and escaped lines down, so that nothing hides under it.
4. As a player, I want the bigger map drawn as sharply as the small one, so that it does not look stretched.
5. As a player, I want the whole floor's map over the screen, as in Path of Exile 2, so that I plan my route while I keep playing.
6. As a player, I want that map centred on me and moving as I move, so that I always know which way a room lies from where I stand.
7. As a player, I want the map over the screen see-through, so that I still see monsters and the floor under it.
8. As a player, I want my clicks and attacks to work with the map over the screen, so that it never costs me a fight.
9. As a player, I want my bars, frames, chat and notices on top of the map, so that the HUD stays readable.
10. As a player, I want the corner cleared while the big map is up, so that I do not see the floor twice.
11. As a player, I want the floor and escaped lines at the top of the corner while the big map is up, so that the corner holds no gap.
12. As a player, I want M to go round again to the small map, so that one key brings back what I had.
13. As a player, I want my choice kept when I climb a floor, so that I do not set it again.
14. As a player, I want my choice kept when I start a new run or refresh the page, so that the game remembers how I like it.
15. As a player on a browser that blocks storage, I want the game to start with the normal map and still let M work, so that nothing breaks.
16. As a player who once hid the minimap in an older build, I want to come back to the normal map, so that I am not stuck with no map.
17. As a player on a floor of buildings, I want M to do nothing, so that a key press there does not change my map unseen.
18. As a player watching my party after death, I want the big map centred on whom I watch, so that it shows the floor around them.
19. As a player resizing the window, I want the column and the bigger map to follow the corner, and the big overlay to stay on me, so that nothing is left behind.
20. As a player at the narrowest window, I want the bigger map clear of the target frame, so that I always see what I fight.
21. As a developer, I want my x/y to follow the map, inside its corner or under the column, so that the aid is always at hand.
22. As a developer, I want the overlay's scale, opacity, line width and mark size as named constants, so that a later tune is values-only.
23. As a player, I want the big map not to cost frame rate when I walk, so that the game stays smooth.
24. As a player on the canvas renderer fallback, I want all three modes to look the same, so that no device gets a broken map.
25. As a player, I want the bigger corner map's marks no bigger than the small map's and the big overlay's, so that a larger map does not crowd its rooms with large marks.

## Acceptance Criteria

- [ ] M cycles normal → enlarged → overlay → normal; never off; ignored while the menu is open, on a repeat and while typing in chat; bound as a keydown event, never a captured key (`BarrowspireScene.test.ts`).
- [ ] On a floor without regions and on a dungeon floor before its map, M changes nothing, stored or shown.
- [ ] The mode is written to `localStorage` `barrowspire_minimap_mode` on each M press and read when a run scene starts; a floor change and a new run scene keep it; no value, an unknown value and `off` read as normal; a throwing read starts at normal and a throwing write is swallowed, M still cycling (`minimapMode.test.ts`).
- [ ] No `minimapOn` field and no shown/hidden switch on the minimap remain; the column's "no minimap shown" layout is reached by a floor without regions, a dungeon floor before its map, and the overlay.
- [ ] Enlarged: the panel 324 × 162 at the column's top, right-aligned; the backing and a 2 px rim in today's tokens and alphas; the inset 6; the floor's fit 1.5 × the normal map's; the walls' line 1.5 px; the marks at `MINIMAP_ENLARGED.marks` (1), separate from the map's `MINIMAP_ENLARGED.scale` (1.5): the dots r 3 and r 2, each in a 1 px ring, centred on whole px inside the rim; each glyph 9 × 9 with its 1 px ring, the normal minimap's glyph px for px, every rect on whole px, inside the rim; the vignette painted at 324 × 162, reach 27, inside the rim (`minimap.test.ts`).
- [ ] Switching normal ↔ enlarged redraws each layer once; a walk across seen regions in either size redraws the map no more than at normal size.
- [ ] Enlarged column at 1080 and 1280: the floor indicator's top 6 px under the map (y 212), the escaped count 4 px under it, the readout 4 px inside the map's bottom-left at 10 px; none overlaps the fullscreen button, either target frame or the top-left stack; the enlarged map's left edge at 746 at 1080, right of the boss frame's 729; a notice clear up to 412 px wide at 1080 and 612 px at 1280.
- [ ] Overlay: no backing, rim or vignette drawn; the fill and the walls' line at alpha 0.4, the line 2 px; glyphs and dots at alpha 1 and at `MINIMAP_OVERLAY.marks` (1): each glyph 9 × 9 with its 1 px ring, every rect edge on a whole backing px at render scale 1, 1.5 and 2, the self's dot r 3 and an ally's r 2, each in a 1 px ring, centred on whole backing px; the normal marks (9 × 9, r 3 and r 2) unchanged and the enlarged map's the same (§B.9; was 14 × 14, r 4.5 and r 3 in 1.5); layers at scroll factor 1 and depth 920; none interactive.
- [ ] Overlay placement: for a focus at world point f, a world point p draws at `worldToScreen(f) + 0.125·(worldToScreen(p) − worldToScreen(f))` minus the camera's scroll, within 1 px (the whole-px placement); the focus is the player, or the watched teammate while spectating.
- [ ] Overlay cost: as the player walks with no new region seen, the map and marks are not redrawn (counted) and the per-frame work is the layers' position; the dots redraw only when one moves a whole backing px; at render scales 1 to 2, fractional ones too, at 60 and 120 fps, walking world x, world y or screen right, the map and marks never step back on screen, hold still on an axis the walk does not move, keep within two backing px (the hold) of the figure's point, with ±8 ms of broadcast jitter at render scale 2 too, and the self's dot lies on the figure's backing px; a frame-time measurement with the overlay up is reported against normal.
- [ ] With the overlay up the corner shows no map; the floor indicator at y 44, the escaped count under it, the readout 4 px under the column's last line, right-aligned.
- [ ] Every mode is rebuilt in the mode in force after a floor change; a resize re-lays the column; the overlay needs no re-layout on resize.
- [ ] No raw colour literal added; the token fence passes.
- [ ] The design guideline's "UI Chrome" has a "Map overlay" bullet marked "Added by FS-1SEF0"; `CONTEXT.md` names the modes and the map overlay; no gallery card.
- [ ] Headless captures of each mode at 1080 × 720 and 1280 × 720, looked at by eye.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] Nick's browser check passes: floor 1 at 1080 and 1280, each mode, walking with the overlay up, a refresh keeping the mode, and a floor of buildings.

## Edge States

- **A notice wider than 412 px at width 1080 with the enlarged map:** its right end lies over the
  map's left edge for the notice's 3 s; the notice is above the HUD (2000), so it reads whole and
  the map's left strip is covered for that time. At 1280 a notice up to 612 px is clear. Accepted:
  a notice is brief, and most are shorter (measured in the body face: "Escape door opened!" 198 px, "The barrow will not take you yet." 292 px, with padding). **(derived
  here)**
- **Spectating with the overlay:** it is about the watched teammate, as the camera is; the dead
  player's own dot is gone, as on the minimap (FS-SRA9J §E.24). Tab to the next teammate moves the
  overlay with the camera.
- **The followed figure's dot and its sprite:** on the overlay the dots are drawn where the
  figures are drawn (their eased positions, given with the focus each frame), never at the
  broadcast's, which leads the eased sprite; so the followed figure's dot lies on its whole
  backing px (§C.19). The map under it is held against the screen, so the dot may sit up to two
  backing px (the hold, owner 2026-11-12) off the map's own point for the figure. The panel modes keep the broadcast's places.
- **A jump of the figure** (stairs, a teammate watched, a re-fit to another render scale): the map
  goes with it the same frame, within two backing px; on entering the overlay it starts on the
  stand, nothing held from before.
- **The camera at the floor's edge:** the overlay is about the figure, not the view's middle, so it
  stays on the figure wherever the camera stops.
- **Arriving on a floor with the overlay mode:** until the floor's map is in there is no overlay and
  the column is closed up, as for no minimap; the overlay appears once the map is built, under the
  floor veil (950), so it shows as the veil lifts.
- **A floor change with the overlay up:** the overlay goes with its floor and the next floor's comes
  in the same mode.
- **M on a floor without regions:** nothing changes; on the next dungeon floor the stored mode
  shows.
- **Storage blocked:** normal at each run scene's start; M still cycles within the scene; nothing is
  kept.
- **Two tabs:** each reads the stored mode at its run scene's start and writes on M; the last
  written wins at the next start. Accepted.
- **Overlay over a monster or a container:** the 40% fill lies over it; hover, the strike cursor and
  clicks still reach it (§C.18). Its marker and plate (1000) stay above the overlay.
- **Overlay at the view's edge:** the floor beyond the view is simply not seen; nothing clamps or
  fades the overlay at the edge.
- **Canvas renderer fallback:** the overlay is plain fills and lines, the same under both; an
  adjoining pair of cell footprints may show a faint seam at 40% under the canvas renderer's
  anti-aliasing. Accepted for the fallback.
- **Render scales 1.5 and 2:** the enlarged panel, rim and glyphs on whole logical px stay crisp at
  2; at 1.5 they blend as the normal minimap's do. The enlarged map's glyphs, at the normal size
  since 2026-11-12 (§B.9), are the normal minimap's px for px, so they blend at 1.5 exactly as the
  normal minimap's do, never more.

## Out of Scope

Hiding the minimap (M's off step is gone by the owner's choice); zoom, rotation, pings, monsters,
containers or room roles on any mode; a keybinding setting for M; a separate key for the overlay;
an overlay on floors without regions, in the hub or the field worlds; the minimap's look
(FS-56CKV §A, unchanged); the fog of war; the hub's and fields' HUD; the fullscreen button and the
`TOP_RIGHT_HUD` anchor; the target frame, notices, the arrival card and the spectate HUD; a
dev-gallery family for HUD chrome; any server, proto or gateway change.

## Change: Minimap in the town and the fields → FS-P0HSP
