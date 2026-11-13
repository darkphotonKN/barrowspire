# FS-56CKV: Minimap look and the run HUD's layout

> Status: work-order · SPECIFICATION.md: none (a change FS has no thin line; owners [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) "Minimap", [FS-F6F88](F6F88-multi-floor-delves.md) "Floor transitions" (the floor indicator, req 29), [FS-BDA7X](BDA7X-character-leveling.md) "Character level and experience display" (req 42), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) "Health and class resource bars on the HUD" (R20), [FS-R82NV](R82NV-party-formation.md) "Party frames" (R34) each carry a stub) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4, `fullAuto` rounding), [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (fog and minimap are presentation; unchanged here) · Supersedes in part: FS-SRA9J §E.20 (the minimap's place) and §E.22 (how its content is drawn, not what it is), including its "visible brighter", now one fill for every shown region *(Amended 2026-11-12, one fill; added)*; and §E.23's redraw on every change of state, now only on a change to what is drawn *(Amended 2026-11-12, one fill; added)*; FS-8AY7S's AC "the top left, at x 10, y 84" (now y 56); FS-R82NV R34's "run y 160" (now 132) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Minimap**, **Region**

> **Amended 2026-11-12** by Nick, after slices I-56CKV-1 and I-56CKV-2 and before I-56CKV-3: one
> owner confirmation, documentation only. Asked "沒有小地圖時，座標放在右上那一欄文字的下方，可以嗎？",
> he answered "好": where no minimap is shown, the dev readout stands 4 px under the top-right
> column's last line, right-aligned, in its new look. §C.18 and the Edge State "the readout without
> a minimap" are corrected in place; each says *(Amended 2026-11-12 …)*. The browser check
> (I-56CKV-5) no longer asks it.

> **Amended 2026-11-12 (second)** by Nick, after looking at the minimap in the browser with
> I-56CKV-1 in. He said "小地圖每個區塊不用匡起來" (the regions should not each be outlined), then
> "可以只匡最外邊嗎" (outline only the outermost edge). So one thin line runs round the outer
> boundary of everything shown, the explored and visible regions taken together, where they meet
> unexplored ground or the void; no line is drawn where two shown regions meet (room to corridor,
> explored to visible). The fills, the vignette, the glyphs and the dots are unchanged, and the
> line keeps its token and its 1.3:1 against each fill. §A.5 is replaced, and the Summary, §A.3,
> §E.23, story 4, the outline criterion and the doorway Edge State are corrected in place; each
> says *(Amended 2026-11-12, outer outline only …)*.

> **Amended 2026-11-12 (third)** by Nick, after the outer outline went in. He said
> "小地圖還有路的地方可以不要匡起來嗎" (the places on the minimap that are corridors, "路", should not
> be outlined either). So the line runs only along a **room's** outer edge: a seen room cell's side
> that faces unexplored ground or the void. A corridor's sides get no line at all, explored or
> visible, and where a room meets a seen region (a doorway onto a corridor, or another room) there
> is no line, as before. The outline is therefore no longer always closed: where a room's edge stops
> at a doorway it ends there, an open run of line; it stays unbroken round every corner it turns.
> The fills, the vignette, the glyphs, the dots, the token and the 1.3:1 are unchanged. §A.5 is
> replaced, and the Summary, §A.3, §E.23, story 4, the outline criterion and the doorway and corner
> Edge States are corrected in place, and two Edge States are added; each says *(Amended
> 2026-11-12, rooms only …)*.

> **Amended 2026-11-12 (fourth)** by Nick, after looking in the browser with the rooms-only outline
> in. He said "小地圖似乎還是一樣 房間中有路的地方要留缺口不要包起來 ... 像poe2那樣": the rooms still
> read closed; wherever a path leaves a room, its outline must have a gap, as on Path of Exile 2's
> map, where walls are lines and every opening shows as an opening. So the derived edge state of the
> third amendment ("the doorway faces unexplored ground, so the line runs across it, closed; once
> the corridor is seen the line opens there") is overruled: **a seen room's outline has a gap at
> every doorway, whether or not the region beyond it has been seen.** A doorway is a side of a room's
> cell that faces a cell of another region, of any kind and in any exploration state; a room's side
> facing a cell that is not walkable (shell or void) gets the line. The line is now the room's
> walls, not the edge of what is seen. This shows where an unexplored corridor leaves a seen room,
> and that is deliberate: the gap tells the player a way out exists there, though not where it
> leads; the corridor itself stays unfilled and unlined until seen. The fills, the vignette, the
> glyphs, the dots, the frame, the layout, the token and the 1.3:1 are unchanged. §A.5 is replaced,
> and the Summary, the outline criterion and the doorway Edge States are corrected in place, and
> one Edge State is added; each says *(Amended 2026-11-12, gap at every doorway …)*.

> **Amended 2026-11-12 (fifth)** by Nick, asked what "不用特別亮起來" meant. He said
> "目前的區域不特別亮": the region the player stands in is not lit up. As on Path of Exile 2's map,
> every region the party has seen is drawn the same. So **every shown region, explored or visible,
> takes one fill, and the minimap no longer tells visible from explored.** This supersedes, here,
> the part of FS-SRA9J §E.22 that draws the two states apart ("visible brighter"); FS-SRA9J's text
> is not edited, and its stub already points here. The one fill is today's explored fill, `slate`
> (`minimapExplored`), **derived here**: it is the calmer map, since most of a mapped floor already
> wears it (every region behind the party), so only the party's own patch changes; it keeps 1.52:1
> over the backing, the outline gains contrast against it (2.37:1, was 1.62:1 against the lighter
> fill), and the amber glyphs read better on it (5.0:1, was 3.4:1). Where the player is stays told
> by their own dot, larger and on top (§A.7). The `minimapVisible` token goes, nothing else reading
> it. Since nothing drawn on the map layer depends on visible against explored any more (the glyphs
> show once their region is seen, either state; the outline reads the floor's grid and the seen
> set; the dots are their own layer), the map is redrawn only when the set of seen regions or the
> fixtures found change, never when a seen region turns visible or explored. The fog of war in the
> world is unchanged. The vignette, the outline, the glyphs, the dots, the frame, the layout and
> the `minimapEdge` token are unchanged. §A.4 is replaced, and the header, the Summary, §A.5, §A.8,
> §E.23, story 3, the fill and redraw criteria and the edge-of-map and doorway Edge States are
> corrected in place; each says *(Amended 2026-11-12, one fill …)*.

> **Amended 2026-11-12 (sixth)** by Nick, after looking at the minimap with the fourth and fifth
> amendments in. He said "小地圖很多是邊的地方都沒有匡線": many places that are edges have no line.
> They are the corridors' walls, left bare by the third amendment. **The third amendment was the
> coordinator's misreading, not the owner's request.** His "小地圖還有路的地方可以不要匡起來嗎" was
> read as "a corridor gets no line at all"; read with the line that followed it, "房間中有路的地方
> 要留缺口不要包起來 ... 像poe2那樣", he meant: where a path leaves a room, leave a gap; do not close
> the room round it. The rule he wants, as on Path of Exile 2's map: **walls are lines, openings
> are gaps.** Every shown region, room or corridor, explored or visible, gets the line on each cell
> side that faces a cell that is not walkable (shell or void, or off the grid). No side between two
> walkable cells gets one, whatever their regions, kinds or exploration states: a doorway, a
> corridor meeting a room or another corridor, a shown region meeting an unexplored one are all
> gaps. A corridor's sides are therefore lined as a room's are. Corners join with no gap; a run
> stops where a gap begins. This replaces the third amendment's "rooms only, no line on a corridor"
> and the Edge States it derived ("Only corridors seen … no line at all", a seen room and a seen
> corridor reading "the room told apart by its line"); the fourth amendment's gap at every doorway
> stands, now for every shown region. **Derived here:** with every region shown the line is the
> walls of the whole floor, closed loops only. The fills, the vignette, the glyphs, the dots, the
> frame, the layout, the `minimapEdge` token and its 1.3:1 are unchanged. §A.5 is replaced, and the
> Summary, §A.3, §E.23, story 4, the outline criterion and the doorway, corridor and corner Edge
> States are corrected in place, and three Edge States are added; each says *(Amended 2026-11-12,
> walls are lines …)* or *(derived here, walls are lines …)*.

## Summary

In a run, the top-right minimap is drawn finer and in the game's own look: candle-lit at its
edges, every region the party has seen in one dark stone, the one it stands in no lighter, the
walls of every seen room and corridor outlined, open wherever a path leaves, and the switch, escape door and stairs as small drawn glyphs. It moves to the
top of the top-right corner, with the floor indicator and the escaped count under it in smaller
type. In dev builds the x/y position line moves into the minimap's bottom-left corner, small and
dim, and the top-left HUD (XP bar, resource bars, party frames) moves up into the space it leaves.
The minimap's frame, size and content are unchanged. *(Amended 2026-11-12, outer outline only; was: "each room and
corridor outlined".)* *(Amended 2026-11-12, rooms only; was: "the whole shown floor outlined once
round its outer edge".)* *(Amended 2026-11-12, gap at every doorway; was: "the seen
rooms outlined along their outer edge only, never a corridor".)* *(Amended 2026-11-12, one fill;
was: "explored rooms in dark stone, the ones the party stands in a step lighter".)* *(Amended
2026-11-12, walls are lines; was: "the seen rooms outlined along their walls only, open at every
doorway, never a corridor".)*

Charter run "小地圖精緻化", 2026-11-12. The owner's words: "把右上角地圖有可能精緻一點嗎 配合遊戲主題
然後地圖位置移動到逃離人數跟樓層資訊上方 字可以小一點"; "左上的x y點位移動到地圖匡內左下角 字可以小一點
左上的其他資訊往上移動補原來的空位"; "地圖外匡暫時不改了 其他核准". Each requirement below is a
**charter default** (the locked decisions, approved by the owner) or says **derived here** and
why. Recorded without adversarial review: no `challenge-me` pass.

**Why a change FS.** The request moves five capabilities' designs at once: the minimap's look and
place (FS-SRA9J §E), the floor indicator's place and size (FS-F6F88 req 29), the run's XP bar
(FS-BDA7X req 42), the resource bars' top (FS-8AY7S R20 and its AC "x 10, y 84") and the party
frames' run top (FS-R82NV R34, "run y 160"). The top-right column's order and the top-left stack's
shift are one layout, so they are one work order. The dev position readout has no owning FS or
line; it is a dev aid (`src/ui/positionReadout.ts`) and is specified here. No thin line changes.

## Facts this spec rests on

Verified 2026-11-12 on main 28a7a377; client paths under `game-client/src/`.

- **The top-right column** is anchored at `TOP_RIGHT_HUD` (`scenes/BarrowspireScene.ts`: top-right,
  dx −10, dy 10 + `FULLSCREEN_BUTTON_CLEARANCE` = 44), right-aligned (origin 1, 0). From the top:
  "Escaped: N" (14 px, `palette.frameBright` on `palette.hudPanel`, padding 10/5); 6 px under it
  "Floor N of M" (14 px, `palette.hudText` on `hudPanel`, padding 10/5, hidden until it has a
  label); 6 px under that the minimap (`minimapRect(right, floorBottom)`, `MINIMAP.gap`). All at
  depth 1000. `relayoutHud` re-anchors them on resize and re-crispens the texts (FS-ZAJMH R5).
- **The minimap** (`ui/minimap.ts`): 216 × 108; a `hudPanel` backing at 0.85 with a 1 px
  `palette.frame` rim at 0.6 (`PANEL`); the floor's iso diamond fitted inside a 4 px inset
  (`MINIMAP.inset`); explored and visible regions as flat filled cell footprints
  (`minimapExplored` = slateLight, `minimapVisible` = slateLight tinted 0.4 toward vellum); found
  fixtures as 4 px `interactable` squares in a 1 px `markerStroke` ring (`MARK`); party dots,
  `markerAlly` r 2 and `markerSelf` r 3, each in a 1 px `markerStroke` ring (`DOT`). Two Graphics
  layers, map and dots, each redrawn only when what it shows changes (§E.23). Built when a floor's
  map with regions is in (`dungeon.minimap`), so it is added after the HUD texts, at their depth.
- **Floor 1's fit:** 72 × 48 cells of 80 px project to a 2:1 diamond fitted at 200 × 100 in the
  panel: its top vertex at (108, 4), its left at (8, 44), its bottom at (128, 104), its right at
  (208, 64). The panel's bottom-left corner below the line from (8, 44) to (128, 104) holds no floor.
- **The position readout** (`createPositionReadout`): a text at (10, 10), 14 px, `hudText` on
  `hudPanel`, padding 10/5, depth 1000, "X: … Y: …" refreshed every frame ("Awaiting the deep..."
  before the player; a " | Indoor/Outdoor" suffix only where the world look has an indoor label,
  never on a tower floor, FS-8RBQY §B.3). Shown only when `showsPositionReadout()` (dev builds, or
  the `NEXT_PUBLIC_SHOW_POSITION_READOUT` override).
- **The top-left stack in a run:** the XP bar at `PROGRESS_HUD_AT.run` (10, 44), 180 × 34; the
  resource bars at `RESOURCE_HUD_AT.run` (10, 84), derived from it (+ 34 + 6); the potion cell
  right of them, top-aligned; the party frames at `PARTY_FRAMES_PLACEMENT.run` top 160, derived
  from the bars at their tallest (+ 52 + 24). The hub's XP bar is at (16, 16). A field's bars are
  at (10, 16) (`RESOURCE_HUD_AT.field`). `partyFramesLayout.test.ts` pins the frames' clearance
  from the chat window; `ResourceHud.test.ts` pins y 84.
- **The game's vignette** (`utils/atmosphere.ts`) is a canvas texture with a radial gradient in
  `palette.inkDeep` (`VIGNETTE_STOPS`), so it looks the same under both renderers. Phaser 4.2.1's
  `Graphics.fillGradientStyle` is documented "a WebGL only feature".
- **The dev gallery** tracks two families, effects and item icons (`dev/gallery/families.ts`,
  FS-1819Q R3). HUD chrome is not tracked.
- The design guideline sets no minimum HUD type size; 12 px is already HUD type (`ProgressHud`,
  `torchBar`), and 10–11 px is used in the run scene and the gear overlay.

## Requirements

### §A. The minimap's look

1. **The frame is not changed.** The panel's `hudPanel` backing (alpha 0.85) and its 1 px brass
   rim (`palette.frame`, 0.6) are drawn exactly as today, and nothing inside the frame is drawn
   over the rim. **(charter default: owner, "地圖外匡暫時不改了")**
2. **A soft vignette round the inside edge**, so the map reads lit by a candle: `palette.inkDeep`,
   the game vignette's ink, strongest at the rim's inside edge and easing to nothing toward the
   middle, inside the rim only. No warm glow is added in the middle. It is smooth to the eye at
   render scales 1, 1.5 and 2 (a canvas texture's gradient, as the game's vignette is, or steps
   no wider than 2 logical px and no more than 0.08 alpha apart), and looks the same under the
   WebGL and canvas renderers: never Phaser's WebGL-only `fillGradientStyle`. Its reach and its
   edge alpha are named constants in `ui/minimap.ts`, so they can be tuned. **(charter default;
   derived here: an amber or torch-warm glow in the HUD would read as the interactable channel,
   and the gradient rule keeps the canvas fallback whole)**
3. **Layer order inside the frame**, bottom to top: backing, region fills, the walls'
   outline, vignette, fixture glyphs, party dots, then the readout (§C). The vignette dims the floor, never
   a glyph, a dot or the readout. **(derived here: what a player looks for is never dimmed)** *(Amended 2026-11-12, outer outline only; was:
   "region edges".)* *(Amended 2026-11-12, rooms only; was: "the outer outline".)* *(Amended
   2026-11-12, walls are lines; was: "the rooms' outline".)*
4. **Every shown region in one dark stone**: an explored region and a visible one are filled
   alike, in `minimapExplored` (`slate`), so the minimap does not tell visible from explored and
   the region the party stands in is not lit up. The fill keeps ≥ 1.3:1 against the backing
   (`hudPanel`), measured as a WCAG contrast ratio. Still stone, never amber or the ally green,
   which the glyphs and dots keep. Where the player is, their own dot tells (§A.7). The
   `minimapVisible` token is removed. **(owner, 2026-11-12, asked what "不用特別亮起來" meant:
   "目前的區域不特別亮", as Path of Exile 2's map draws every seen region the same; the fill
   derived here: the explored `slate` is the calmer map, worn already by most of a mapped floor,
   and it gives the outline and the glyphs more contrast than the lighter fill did)** *(Amended
   2026-11-12, one fill; was: "Explored regions a dark stone, visible ones a step lighter", the
   visible fill ≥ 1.3:1 against the explored and the lighter, from the `minimapExplored` and
   `minimapVisible` tokens.)*
5. **Walls are lines, openings are gaps**: one thin line, 1 logical px, on each side of a shown
   region's cell, room or corridor (`kind` "room" or "corridor"), explored or visible, that faces a
   cell that is not walkable (a shell or void cell, or off the grid: no region at all). A side
   between two walkable cells gets no line, whatever their regions, their kinds and their states
   (explored, visible or unexplored): a doorway, a corridor meeting a room or another corridor, and
   a shown region meeting an unexplored one are all gaps, as on Path of Exile 2's map. A corridor's
   walls are lined as a room's are; never a line along a cell's rect inside a region. Each stretch
   is drawn once; where the line turns a corner it runs on unbroken, no gap, and where a room's wall
   meets a corridor's at the side of a doorway it runs on into it, one wall; where a wall stops at
   a gap the line ends there, an open run, never closed back on its start. With every region shown
   the line is the walls of the whole floor, closed loops only **(derived here)**. The line keeps
   ≥ 1.3:1 against the one fill it bounds (§A.4), in its token (`minimapEdge`). An unexplored
   region has no fill and no line, as today; only the gap in a shown region's line shows where it
   opens. Showing that gap before the region beyond is seen is a deliberate owner choice: it tells
   the player a way on exists there. **(owner, 2026-11-12: "房間中有路的地方要留缺口不要包起來 ...
   像poe2那樣", then, on seeing the corridors bare, "小地圖很多是邊的地方都沒有匡線")** *(Amended
   2026-11-12, walls are lines; was: "One thin line along the seen rooms' walls, a gap at every
   doorway, and none on a corridor", only a seen room's cell sides lined, "A corridor's sides
   (`kind` "corridor") get no line, whatever its state and whatever it faces", "closed loops only
   round a room with no doorway"; the third amendment's misreading.)* *(Amended 2026-11-12, one
   fill; was: "each fill it bounds".)* *(Amended 2026-11-12, gap at every doorway;
   was: "One thin line along the seen rooms' outer edge", on each side "that faces a cell of no
   seen region (an unexplored region, or no region at all)", no line only "where a seen room meets
   another seen region".)* *(Amended 2026-11-12, rooms only; was: "One thin line round the outer
   edge of what is shown", the union of every seen region including corridors, "as closed
   loops".)* *(Amended 2026-11-12, outer outline only; was: "Each seen region has a thin edge line"
   along its own footprint, a boundary two seen regions share drawn once.)*
6. **The switch, the escape door and the stairs as small drawn glyphs** in place of the squares:
   the switch a lever (a base and a slanted handle with a knob), the escape door an arch, the
   stairs a few steps. Each in the interactable channel (`palette.interactable`) on a dark
   `markerStroke` ring 1 px wide round its shape, centred where today's mark sits, seated on whole
   logical px, within 9 × 9 logical px and at least 7 px wide, so the three read apart at render
   scale 1. The ink keeps ≥ 3:1 against its ring. Shown when they are today (once their region is
   explored, §E.22). **(charter default; derived here: the ring is what carries contrast, since
   amber on the visible fill alone is under 2:1, as a field marker's outline does)**
7. **Party dots keep a dark ring, the player's own a little larger**: `markerAlly` r 2 and
   `markerSelf` r 3, each in a 1 px `markerStroke` ring, the player's drawn over the rest. This is
   today's rule, kept and now pinned; each ink keeps ≥ 3:1 against its ring. **(charter default)**
8. **Drawn in code, tokens only.** No baked art and no texture file; colours from `palette` tokens
   (ADR-0013), a token added only where none fits, named for its role and noted in the palette's
   comment. The minimap's size (216 × 108), inset, projection and content (FS-SRA9J §E.21–§E.24)
   are unchanged, and each layer is still redrawn only when what it shows changes (§E.23); the
   vignette, which shows nothing that changes, is drawn once per minimap. The map layer (fills,
   outline, glyphs) shows which regions are seen and which fixtures are found, not which seen
   region is visible, so it is redrawn when a region is first seen or a fixture found, and not
   when a seen region turns visible or explored. **(charter default)** *(Amended 2026-11-12, one
   fill; the redraw sentence added, since one fill leaves nothing drawn that tells the two states
   apart.)*

### §B. The top-right column

9. **Order, from the top: the minimap, then the floor indicator, then the escaped count**, each
   right-aligned on `TOP_RIGHT_HUD`'s x as today. The minimap's top is the column's top,
   `anchorAt(TOP_RIGHT_HUD).y` (44 at every width): the anchor is unchanged, so the column still
   stands clear of the fullscreen button (FS-ZAJMH R18). The floor indicator stands 6 px under the
   minimap (`MINIMAP.gap`), the escaped count 4 px under the floor indicator. **(charter default:
   owner, "地圖位置移動到逃離人數跟樓層資訊上方"; derived here: "the top" is the column's top, since
   the corner itself is the fullscreen button's, and the gaps)**
10. **Smaller type:** the floor indicator and the escaped count at 12 px (from 14), padding 8 × 3
    (from 10 × 5), each keeping its colour, backing and face (`CANVAS_FONT.body`). **(charter
    default; derived here: the padding values)**
11. **Where no minimap is shown, the column closes up:** the floor indicator's top is the column's
    top, and the escaped count stands under it. "No minimap" is every case where none is up: a
    floor without regions (floors 2–3, the dev test room), a dungeon floor before its map is in,
    and the minimap toggled off with M. While the floor indicator has no label (hidden), the
    escaped count stands where it would. The column re-lays when any of these changes: a floor
    built or left, M pressed, the floor label set. **(charter default for a floor with no minimap;
    derived here: M and the not-yet-built floor follow the same rule, since M exists to clear the
    corner, FS-SRA9J story 10, and one rule keeps the column from holding an empty hole)**
12. **Resize:** `relayoutHud` places the whole column from its anchor, the minimap included, and
    re-crispens its texts (FS-ZAJMH R5). **(derived here)**
13. **Clearances hold** at logical widths 1080 and 1280 (FS-SRA9J §E.20–21): nothing in the
    column covers the fullscreen button, a 600 px top-centre notice or the target frame
    (FS-48CTQ); the minimap's left edge stays at x ≥ 854 at 1080. **(derived here: the column's x
    is unchanged, only its order)**

### §C. The dev position readout

14. **Inside the minimap's frame, bottom-left**, where a minimap is shown: its text's left edge and
    bottom edge 4 px inside the panel's (`MINIMAP.inset`), so it sits inside the rim. **(charter
    default: owner, "左上的x y點位移動到地圖匡內左下角")**
15. **Its look: 10 px (from 14), no backing box, dim and semi-transparent**: a HUD text token at a
    partial alpha, both named constants. Its ink, over the darkest the vignetted backing gets
    under it, keeps ≥ 3:1. Its text is unchanged ("X: … Y: …", "Awaiting the deep..."). **(charter
    default: owner, "字可以小一點"; derived here: the 3:1 floor, so a dev reads it at a glance)**
16. **Over the minimap**: it draws above both minimap layers (its depth over `MINIMAP.depth`),
    since the minimap is built after it at the HUD's depth. **(derived here)**
17. **It never covers the floor on floor 1**: its box lies in the panel's bottom-left corner below
    the floor diamond's lower-left edge (Facts), at its widest text. **(derived here, from the
    fit; a later floor whose diamond reaches the corner is an Edge State)**
18. **Where no minimap is shown** (the cases of §B.11), it stands in the top-right column, 4 px
    under the column's last line, right-aligned, in the same look. **(charter default, adapted:
    the locked decision kept it at the top left as today, which would cover the XP bar at y 16;
    see Edge States, "the readout without a minimap". Confirmed by the owner, 2026-11-12: "好".)**
    *(Amended 2026-11-12; was: "Owner to confirm.")*
19. **Still dev builds only** (`showsPositionReadout`, unchanged); a production build draws no
    readout and keeps nothing for it. It follows the minimap on resize, on M, and on a floor
    change, re-crispened when it moves. **(charter default)**

### §D. The top-left stack in a run

20. **The XP bar moves up to y 16**, as in the hub, at x 10 (`PROGRESS_HUD_AT.run` = (10, 16)).
    Everything derived from it moves with it: the resource bars to (10, 56)
    (`RESOURCE_HUD_AT.run`), the potion cell beside them, the party frames' run top to 132
    (`PARTY_FRAMES_PLACEMENT.run`). Every build and every floor. **(charter default: owner,
    "左上的其他資訊往上移動補原來的空位"; derived here: x stays 10, since the decision moves y only and
    the hub's x 16 is the hub's inset; production moves too, since the gap filled is one a
    production build already had)**
21. **The party frames' clearance from the chat window still holds**, and grows by 28 px; the
    frames also stay clear of the XP bar, the resource bars, the potion cell, the T panel and the
    prompts, as `partyFramesLayout.test.ts` pins today. **(charter default)**
22. **The hub and the fields are unchanged**: the hub's XP bar at (16, 16) and frames at y 56, a
    field's bars at (10, 16) and frames at y 92. **(derived here)**

### §E. Docs and gallery

23. **The design guideline's "UI Chrome" gains a "Minimap" bullet** naming this look in one
    paragraph (unchanged frame; candle vignette in `inkDeep`; every seen region in one dark stone,
    the walls of every seen room and corridor outlined, every opening a gap; amber glyphs in a dark ring; dots in a dark ring; drawn in code), marked
    "*(Added by FS-56CKV, 2026-11-12.)*", as the countdown and health-bar bullets are.
    **(derived here: a canvas look others will match belongs in the guideline, its single source
    of truth for appearance)** *(Amended 2026-11-12, outer outline only; was: "outlined regions".)*
    *(Amended 2026-11-12, rooms only; was: "one outline round the shown floor".)*
    *(Amended 2026-11-12, one fill; was: "dark-stone explored, lighter visible".)*
    *(Amended 2026-11-12, walls are lines; was: "the seen rooms' outer edge outlined, no corridor".)*
24. **No dev-gallery card.** The gallery tracks effects and item icons only; HUD chrome is not a
    tracked family, so none is added. **(charter default)**

## User Stories

1. As a player, I want the minimap to look like part of the barrow, so that the HUD does not break the game's mood.
2. As a player, I want the map's edges to fall into shadow like the rest of the screen, so that it reads candle-lit.
3. As a player, I want every room I have seen drawn the same, the one I stand in no brighter, so that the map reads as one calm floor plan and my own dot tells me where I am. *(Amended 2026-11-12, one fill; was: "rooms I have explored and rooms my party stands in to read apart at a glance, so that I know where we are".)*
4. As a player, I want the walls of every room and corridor I have seen drawn as a line, with a gap wherever a path leaves, so that the map reads as one floor plan whose openings show me the ways on. *(Amended 2026-11-12, outer outline only; was: "each room and corridor outlined".)* *(Amended 2026-11-12, rooms only; was: "what I have seen outlined once round its outer edge".)* *(Amended 2026-11-12, walls are lines; was: "the rooms I have seen outlined along their outer edge, with no line on a corridor or across a doorway, so that the map reads as one floor plan whose rooms stand out from the paths between them".)*
5. As a player, I want the stairs, the escape door and the switch drawn as what they are, so that I can tell them apart without guessing.
6. As a player, I want my own dot a little larger than my party's, so that I find myself first.
7. As a player, I want the minimap's frame to stay as it is, so that the change does not disturb what I already know.
8. As a player, I want the minimap at the top of the corner, so that the map, the thing I glance at most there, comes first.
9. As a player, I want the floor and the escaped count small and under the map, so that they take less room.
10. As a player on a floor with no minimap, I want the floor and the escaped count at the top of the corner, so that the corner holds no empty gap.
11. As a player who hid the minimap with M, I want the corner to close up, so that hiding it actually clears the corner.
12. As a player, I want my XP bar, my bars and my party frames at the very top left, so that the top left holds no empty gap.
13. As a player in a party, I want my party frames to keep clear of the chat window, so that neither covers the other.
14. As a player resizing the window, I want the whole top-right column to follow its corner, so that nothing is left behind.
15. As a player in the hub or a field, I want my HUD where it was, so that only the run's corners change.
16. As a developer, I want my x/y inside the minimap's corner, small and dim, so that it is at hand without taking the top left.
17. As a developer on a floor without a minimap, I want my x/y still shown, out of the bars' way, so that the aid works on every floor.
18. As a developer, I want the readout to never cover a room on the minimap, so that the aid does not hide what it sits on.
19. As a developer, I want a production build to show no readout, so that players never see it.
20. As a developer, I want the minimap's look in the design guideline, so that the next HUD piece matches it.
21. As a developer, I want the vignette and the type sizes as named constants, so that a later tune is values-only.
22. As a player on the canvas renderer fallback, I want the minimap to look the same, so that no device gets a broken map.
23. As a player on a high-density screen, I want the glyphs, edges and text crisp at every render scale, so that the finer look stays fine.

## Acceptance Criteria

- [ ] The minimap's backing and rim are drawn with today's calls and values (`hudPanel` 0.85; 1 px `frame` 0.6), and nothing is drawn over the rim (`minimap.test.ts`).
- [ ] The vignette is in `palette.inkDeep`, inside the rim, strongest at the inside edge and nothing at the middle; drawn once per minimap, not on a content change; never through `fillGradientStyle`; steps, if any, no wider than 2 px and no more than 0.08 alpha apart.
- [ ] Draw order inside the frame: backing, fills, edges, vignette, glyphs; dots on their own layer above; the readout above both.
- [ ] An explored region and a visible one are drawn the same, in the one fill `minimapExplored`; no `minimapVisible` token remains; the fill vs backing ≥ 1.3:1; the edge line ≥ 1.3:1 against the fill (contrast ratios over the tokens, in a test). *(Amended 2026-11-12, one fill; was: "Explored fill vs backing ≥ 1.3:1, visible vs explored ≥ 1.3:1, visible the lighter; the edge line ≥ 1.3:1 against each fill it bounds".)*
- [ ] The outline is the shown regions' walls: a corridor's sides facing a cell that is not walkable are lined, seen alone or beside a room, as a room's are; no line on any side between two walkable cells, whatever their regions, kinds or states (a doorway onto a seen corridor, a doorway onto an unexplored one, a corridor meeting another corridor, two rooms, a region's own cells); on the fixture floor with every region shown, every shown cell side facing a cell that is not walkable is covered by a drawn run, each exactly once, none missing (counted), no run on a side between two walkable cells, and the runs all closed loops; no gap where the line turns a corner; open runs ending at a gap stroked without `closePath`, closed loops with it. *(Amended 2026-11-12, walls are lines; was: "The outline follows the seen rooms' walls only: on the fixture floor, no line on any side of a corridor (seen alone or beside a room), none across a doorway … none between a region's own cells or between two rooms; every side of a seen room's cell facing a cell that is not walkable drawn exactly once".)* *(Amended 2026-11-12, gap at every doorway; was: "none across a doorway between a seen room and a seen corridor", and each side "facing unexplored ground or the void" drawn.)* *(Amended 2026-11-12, outer outline only; was: "a boundary shared by two seen regions is drawn once".)* *(Amended 2026-11-12, rooms only; was: "the outer edge of the seen regions together … as closed loops".)*
- [ ] The switch, escape door and stairs each draw a distinct glyph within 9 × 9 px and at least 7 px wide, in `interactable` on a 1 px `markerStroke` ring, centred on whole px where the mark sits today, only once their region is explored; ink vs ring ≥ 3:1.
- [ ] Dots: ally r 2, self r 3, each in a 1 px `markerStroke` ring, self drawn last; ink vs ring ≥ 3:1.
- [ ] Size, inset, projection and content unchanged: FS-SRA9J's `minimapRect` size, `minimapProjection` and `minimapContent` tests still pass as written; the map redraws when a region is first seen or a fixture found, and not when a seen region only turns visible or explored. *(Amended 2026-11-12, one fill; was: "the redraw counts (§E.23) unchanged".)*
- [ ] No raw colour literal added outside `utils/theme.ts` / `utils/canvasPalette.ts`; the token fence passes.
- [ ] Top-right column at logical widths 1080 and 1280 with a minimap: the minimap's top at the column's top (y 44), the floor indicator's top 6 px under its bottom, the escaped count's top 4 px under the floor indicator's bottom, every right edge on `TOP_RIGHT_HUD`'s x.
- [ ] Both lines at 12 px, padding 8 × 3, their colours, backings and face unchanged.
- [ ] With no minimap shown (a floor without regions; a dungeon floor before its map; M off): the floor indicator's top at the column's top, the escaped count under it; with the floor indicator hidden, the escaped count takes its place; pressing M re-lays the column both ways.
- [ ] On resize the column re-anchors from `TOP_RIGHT_HUD` and its texts are re-crispened.
- [ ] Nothing in the column overlaps the fullscreen button, a 600 px top-centre notice or the target frame at 1080 and 1280; the minimap's left edge ≥ 854 at 1080.
- [ ] With a minimap shown in a dev build: the readout's text at 10 px, no backing, its left and bottom edges 4 px inside the panel's, at a depth over `MINIMAP.depth`; its ink ≥ 3:1 over the darkest vignetted backing under it.
- [ ] On the fixture floor, the readout's box at its widest text ("X: 5760 Y: 3840") lies below the floor diamond's lower-left edge.
- [ ] With no minimap shown in a dev build: the readout stands 4 px under the column's last line, right-aligned, same look; it moves as the column does (M, floor change, resize).
- [ ] A production build (`showsPositionReadout()` false) creates no readout.
- [ ] `PROGRESS_HUD_AT.run` is (10, 16), `RESOURCE_HUD_AT.run` (10, 56), `PARTY_FRAMES_PLACEMENT.run.top` 132; the hub's and the field's placements unchanged (`ResourceHud.test.ts`, `partyFramesLayout.test.ts`).
- [ ] In a run, the party frames at their tallest (four rows) clear the chat window, the XP bar, the resource bars, the potion cell, the T panel and the prompts (`partyFramesLayout.test.ts`).
- [ ] The design guideline's "UI Chrome" has a "Minimap" bullet marked "Added by FS-56CKV".
- [ ] No dev-gallery card or family is added.
- [ ] Headless captures of the minimap at render scales 1, 1.5 and 2 on the fixture floor (some regions explored, one visible, all three fixtures found, two dots, the readout), checked by eye for crisp glyphs, dots and text.
- [ ] Typecheck and the full vitest suite pass.
- [ ] Nick's browser check passes: floor 1 and a tower floor, 1080 and 1280 wide, windowed and fullscreen, a dev build and a production build.

## Edge States

- **Arriving on a dungeon floor:** until its map is in there is no minimap, so the column sits at
  the top (§B.11) and the readout under it; when the minimap is built it takes the top and the
  lines step down under it, once. Accepted: it happens as the floor appears, before play.
- **A floor change:** the minimap is destroyed and rebuilt (§E.23); the column closes up and opens
  again, as on arrival.
- **M pressed:** the column closes up or opens at once, no tween. Accepted: the player asked for it.
- **Spectating** (FS-SRA9J §E.24): the minimap stays, so the column and the readout stay as they
  are. The readout still reads this client's own position, as today.
- **Floor indicator not yet labelled:** the escaped count takes its place under the minimap or at
  the top; it moves down once when the label arrives.
- **The readout without a minimap (decision adapted, confirmed by the owner 2026-11-12):** the locked decision kept the
  readout at the top left where there is no minimap, as today. With the XP bar at y 16 it would
  cover the bar on every floor without regions, so it stands under the top-right column instead
  (§C.18). Rejected: keeping the stack at y 44 where there is no minimap (the HUD would jump from
  floor to floor and differ from production) and squeezing the readout above the XP bar (16 px of
  room for a 13 px line at the canvas edge). Confirmed by the owner, 2026-11-12 ("好" to
  "沒有小地圖時，座標放在右上那一欄文字的下方，可以嗎？"). *(Amended 2026-11-12; was: "decision adapted,
  escalated" and "Owner to confirm.")*
- **The readout over a lit ground** (no minimap, no backing): it may read less well over a bright
  patch of floor. Accepted for a dev aid; the run's floors are dark at the screen's edge.
- **A later floor whose diamond reaches the bottom-left corner:** the readout would cover a little
  of the floor there. Accepted; it is a dev aid, and §C.17 is pinned to floor 1's fit.
- **A tower floor's "| Indoor/Outdoor" suffix** is never shown on a tower floor (FS-8RBQY §B.3),
  and only a tower-look floor has an indoor label; such a floor has no minimap, so a long readout
  only ever stands in the column.
- **Regions at the minimap's edge:** the vignette darkens the fill and the outline near the rim,
  over every seen region alike. *(Amended 2026-11-12, one fill; was: "the visible fill stays the
  lighter wherever both meet".)*
- **A seen room and a seen corridor sharing a doorway:** no line across the doorway; at each side
  of the doorway the room's wall line runs on into the corridor's, unbroken, so the two read as one
  walled patch of stone with the corridor leading out of the room. *(Amended 2026-11-12, walls are
  lines; was: "none along the corridor; the room's line ends at each side of the doorway, an open
  run … the room told apart by its line", and "Accepted: the owner asked for the rooms' outer edge
  only".)* *(Amended 2026-11-12, one fill; was: "Where both are explored they read as one patch of
  stone".)* *(Amended 2026-11-12, outer outline only; was: "the shared edge is drawn once".)*
  *(Amended 2026-11-12, rooms only; was: "Two seen regions sharing a doorway … the outline runs
  round the pair as one shape".)*
- **A seen room beside an unexplored corridor:** the line stops at the doorway, a gap, as it is
  where the corridor is seen; the corridor beyond has no fill and no line until it is seen, and
  then its walls' line runs on from the room's at each side of the doorway. The
  gap tells the player a way out exists there, before they have seen where it goes: a deliberate
  owner choice. **(owner, 2026-11-12: "房間中有路的地方要留缺口不要包起來 ... 像poe2那樣")**
  *(Amended 2026-11-12, gap at every doorway; was: "the doorway faces unexplored ground, so the
  line runs across it, closed; once the corridor is seen the line opens there", derived here.)*
  *(Amended 2026-11-12, walls are lines; was: "just as where the corridor is seen; the corridor
  beyond has no fill and no line until it is seen".)*
- **A seen corridor beside an unexplored room:** its walls are lined up to its mouth, where the
  line stops, a gap onto the room beyond, which has no fill and no line until seen. **(derived
  here, walls are lines, 2026-11-12)**
- **A corridor meeting another corridor** (none on today's floors): no line where they meet, seen
  or not; their walls run on into each other. **(derived here, walls are lines, 2026-11-12)**
- **A seen room with no doorway** (none on today's floors): its line is one closed loop.
  **(derived here, gap at every doorway, 2026-11-12)**
- **Only corridors seen** (a corridor explored, its rooms not yet): its fill shows and its walls
  are lined, open at each mouth onto an unexplored room. *(Amended 2026-11-12, walls are lines;
  was: "its fill shows and no line at all. Accepted: the owner asked for no line on a corridor",
  derived from the third amendment's misreading.)*
- **Every region shown:** the line is the walls of the whole floor, closed loops only, no gap,
  since every opening then joins two shown regions whose walls run on into each other. **(derived
  here, walls are lines, 2026-11-12)**
- **A seen region touching another only at a corner:** the line passes through that corner point
  twice, once for each, unbroken. **(derived here)** *(Amended 2026-11-12, rooms only; was: "A
  seen region … stays closed".)* *(Amended 2026-11-12, walls are lines; was: "A seen room".)*
- **The party walking back into a region seen before:** nothing on the map layer changes, so it
  is not redrawn; only the dots move. **(derived here, one fill, 2026-11-12)**
- **Canvas renderer fallback:** the vignette is a canvas texture or fills, so it is the same.
- **Party frames at their shortest or with no party:** placed by the same fixed top; nothing jumps.

## Out of Scope

The minimap's frame (owner: not now); its size, projection or content; a full-screen map, zoom,
pings or monsters on the minimap; the switch's on/off state on its glyph; fog of war itself
(FS-SRA9J §A–§D, ADR-0063, ADR-0068); any baked art or the bake; the hub's and fields' HUD; the
fullscreen button and the `TOP_RIGHT_HUD` anchor; the target frame, notices and spectate HUD; the
readout's content or its build switch; a dev-gallery family for HUD chrome; any server, proto or
gateway change.

## Change: Minimap modes: enlarged and overlay → FS-1SEF0

## Change: Minimap in the town and the fields → FS-P0HSP

## Change: Minimap at the top, fullscreen button beside it
Status: work-order
Date: 2026-11-12

Owner layout change for the top-right corner (Nick, 2026-11-12): "地圖移動到最上面 全螢幕按鈕移動到地圖左側
地圖變2倍蛇才移動到右上角" (move the minimap to the very top; move the fullscreen button to the
minimap's left side; only when the map is enlarged does the button move to the top-right corner),
then, the same day, "其他文字也要跟著往上移動" (the other text must move up too). The enlarged mode is
1.5 × in code (FS-1SEF0 §B); "2倍" is read as the enlarged mode. Written `--from-thread` from the
coordinator's charter defaults; no interview, no `challenge-me` pass. Each requirement says
**owner**, **charter default** or **derived here**.

> **Amended 2026-11-12** by Nick, after approving I-56CKV-6 in the browser ("小地圖可以"): two
> owner changes, the section edited in place while it is still a work order. First,
> "1.5倍地圖時全螢幕按鈕一樣要在地圖左側" (with the map enlarged, 1.5 ×, the fullscreen button must
> also sit at the map's left). This replaces his earlier "地圖變2倍蛇才移動到右上角": the enlarged map
> now stands at the very top too (y 10), the button at its left, top-aligned, and the column's lines
> follow the enlarged map's bottom up. Only the overlay and no map keep the button in the corner.
> Second, "hover時也有要提示文字" (on hover there should be a hint text too): the button shows a hint
> on hover and on keyboard focus (C9). C3, C4, C5, C7, C8, the Acceptance Criteria and the Edge
> States are corrected in place; each says *(Amended 2026-11-12, enlarged beside)* or *(Amended
> 2026-11-12, hint)*. New slice: I-56CKV-7.

**Why here.** §B owns the top-right column's order and corner; the column's other modes (FS-1SEF0
§B.8, §D.21) and the town's and fields' corner (FS-P0HSP §G.35) all stand on `TOP_RIGHT_HUD` from
§B.9, and the button's corner is FS-ZAJMH R18. One layout, so one change, here; FS-ZAJMH, FS-1SEF0
and FS-P0HSP carry pointer stubs. No thin line changes.

### Requirements

C1. **Normal mode: the minimap at the very top.** In every world with a minimap (a run's dungeon
    floor, the town, a field), while the minimap is shown in its normal mode, its top is the view's
    top inset, **y 10**, and its right edge on `TOP_RIGHT_HUD`'s x (10 px in from the right) as
    before: the column's corner is `TOP_RIGHT_EDGE` (top-right, dx −10, dy 10), with no band left
    above the map for the button. **(owner: "地圖移動到最上面"; derived here: 10 is the column's own
    inset from the right edge and the target frame's top, FS-48CTQ §E.14, so the corner's inset is
    the same both ways)**
C2. **Normal mode: the fullscreen button to the minimap's left.** Its top on the minimap's top
    (y 10), its right edge `MINIMAP.gap` (6 px) left of the minimap's left edge: at logical width
    1080 the map spans x 854–1070 and the button x 828–848, at 1280 x 1054–1270 and 1028–1048;
    20 × 20 as today. It follows the minimap on resize and on M. **(owner: "全螢幕按鈕移動到地圖左側";
    derived here: top-aligned, and the gap the column keeps under the map)**
C3. **Enlarged mode: the map at the very top too, the button at its left**, as in normal: the
    324 × 162 map's top at **y 10** on `TOP_RIGHT_EDGE`, its right edge 10 px in from the right; the
    button's top on the map's top, its right edge `MINIMAP.gap` (6 px) left of the map's left edge:
    at logical width 1080 the map spans x 746–1070 and the button x 720–740, at 1280 x 946–1270 and
    920–940. *(Amended 2026-11-12, enlarged beside; was: "the button back in the corner, the enlarged
    map under it … the 324 × 162 map's top at y 44 (`TOP_RIGHT_HUD`, FS-1SEF0 §B.8)", owner
    "地圖變2倍蛇才移動到右上角".)* **(owner: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側")**
C4. **The overlay, and wherever no minimap is shown, keep the button in the corner** *(Amended
    2026-11-12, enlarged beside: the enlarged map no longer among them)*: the map
    overlay (FS-1SEF0 §C.20), a run's floor without regions, a dungeon floor before its map is in,
    the town or a field before its first state, and every scene with no minimap (the menus). The
    column then starts at y 44 under it as today (§B.11, FS-1SEF0 §D.21). The button stays
    clickable over the overlay as today. **(charter default)**
C5. **Everything under the minimap follows its bottom edge**, in every mode and world: in a run the
    floor indicator 6 px under the map's bottom, the escaped count 4 px under that, the dev readout
    inside the map's bottom-left (§C.14) or 4 px under the column's last line (§C.18). With the
    normal map at y 10 the floor indicator's top is y 124 (was 158) and the escaped count's 149
    (was 183), at 1080 and 1280; with the enlarged map at y 10 the floor indicator's top is y 178
    (was 212) and the escaped count's 203 (was 237) *(Amended 2026-11-12, enlarged beside; was:
    "enlarged, unchanged (212, 237)")*. The town and the fields stand nothing under their minimap
    (FS-P0HSP §G.36), so only the map moves there. **(owner: "其他文字也要跟著往上移動")**
C6. **One rule, decided once.** Where the button stands is decided with the column's layout, from
    the minimap's mode and size, and handed to the button (DOM over the canvas, FS-ZAJMH R18) in
    logical units from the canvas's top and right edges, so it lands where the canvas draws the map
    at every fit and render scale. A scene that handed it a place takes it back when it ends (a
    floor change, leaving the run, the town or the field, the page unmounting), and the button goes
    back to the corner; a later scene's place is never undone by an earlier scene's end. **(derived
    here)**
C7. **Clearances hold at 1080 and 1280** (§B.13, FS-1SEF0 §B.12, FS-P0HSP §G.37), with the button
    beside the normal map: it overlaps neither the map, either target frame, a 600 px top-centre
    notice in a run, the hub's queue line, its arrival card nor the party panel, and nothing else in
    the column overlaps it. **(derived here)** Beside the enlarged map the same holds, but one:
    at 1080 the button (x 720–740, y 10–30) lies over the last 9 px of the boss's target frame
    (x 351–729, from y 10); at 1280 it is clear of it (the frame ends at 829). The enlarged map
    itself keeps FS-1SEF0 §B.12's clearances, its x unchanged. *(Amended 2026-11-12, enlarged
    beside: the overlap follows from the owner's rule and the 1080 view; reported, not resolved
    here; see Edge States.)* **(derived here)**
C8. **The button's own look and behaviour are unchanged** but for its hint (C9): its size, palette
    (ADR-0025), fade, names, focus and the presses it keeps from the game (FS-ZAJMH R18–R23). Tokens
    only; no new art. *(Amended 2026-11-12, hint: the browser's own `title` tooltip goes, so no
    second tip stands beside the hint.)* **(charter default)**
C9. **The hover hint.** Hovering the button, or reaching it by keyboard (Shift+Tab; `:focus-visible`),
    shows a one-line hint: **"Fullscreen"** while windowed, **"Exit fullscreen"** in fullscreen.
    The game binds no key to fullscreen (FS-ZAJMH R22; the frame goes fullscreen only from the
    button), so the hint is text only, no "(key)". It stands beside the button on screen and never
    under the map: **below** the button, right-aligned on its right edge, 4 px under its foot, where
    the button keeps the corner; **to its left**, centred on its height, 6 px off, where it stands
    beside the map (normal or enlarged). Its look matches the game's one existing hover tip, the
    canvas item tip (FS-4R9M9 R59: a near-opaque dark ground, a faint hairline, a 6 px corner, vellum
    text), in the button's web tokens (ADR-0025): `--color-bg-dropdown` ground, a 1 px
    `--color-border` hairline, `--color-text` in `--font-body`, at the top-right column's line size
    and padding (12 px, 8 × 3, §B.10), all in logical units times the canvas's scale like the
    button. It takes no pointer events, so it never covers or steals a press from the button or the
    game, and it is hidden from assistive technology (the button's accessible name already says
    it). No new art. *(Amended 2026-11-12, hint: added.)* **(owner: "hover時也有要提示文字";
    coordinator's brief for the words and the place; derived here for the look)**

### Acceptance Criteria

- [ ] Run, normal, at logical widths 1080 and 1280: the minimap at (width − 226, 10) 216 × 108; the
      button's top 10 and its right edge 6 px left of the map's left (x 848 at 1080, 1048 at 1280);
      the floor indicator's top at the map's bottom + 6 (124), the escaped count's 4 px under it.
- [ ] Run, enlarged, at 1080 and 1280: the map at (width − 334, 10) 324 × 162; the button's top 10
      and its right edge 6 px left of the map's left (x 740 at 1080, 940 at 1280); the floor
      indicator at 178, the escaped count at 203. *(Amended 2026-11-12, enlarged beside; was: "the
      button in the corner …; the map at (width − 334, 44) …; the floor indicator at 212".)*
- [ ] Run, overlay and a floor without regions: the button in the corner, the floor indicator at 44.
- [ ] Pressing M in a run moves the button: normal → enlarged, still at the map's left (the map
      grown leftward and down from the same top), → overlay to the corner, back to normal beside the
      map again; the column's lines move with the map each time. *(Amended 2026-11-12, enlarged
      beside; was: "normal → enlarged to the corner, overlay stays there".)*
- [ ] Town and field, normal at 1080 and 1280: the map's top at 10, right edge on width − 10, the
      button beside it as in a run; enlarged, the map at 10 and the button at its left; overlay,
      the button in the corner; M moves it each step. *(Amended 2026-11-12, enlarged beside; was:
      "enlarged, the map at 44 and the button in the corner".)*
- [ ] Hint (C9): "Fullscreen" windowed and "Exit fullscreen" fullscreen, shown on hover and on
      `:focus-visible` only, below the button in the corner and to its left beside the map, taking
      no pointer events, hidden from assistive technology, tokens only; no `title` tooltip.
      *(Amended 2026-11-12, hint: added.)*
- [ ] A scene's end hands the corner back; an earlier scene's end does not move a later scene's
      button.
- [ ] The button renders at its handed place, in logical units times the canvas's CSS scale; with
      nothing handed, in the corner as today.
- [ ] Clearances of C7 at 1080 and 1280.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] Nick's browser check: a run's floor 1, the town and a field, 1080 and 1280 wide, windowed and
      fullscreen, M through all three modes, and the hint on hover and on Shift+Tab. *(Amended
      2026-11-12, hint: the hint added.)*

### Edge States

- **M pressed:** the button jumps between the normal map's left, the enlarged map's left and the
  corner at once, with the map; no tween. Accepted: the map itself jumps. *(Amended 2026-11-12,
  enlarged beside.)*
- **A boss fight at 1080 with the map enlarged:** the button stands over the boss frame's right
  9 px (C7), faded until hovered; at 1280, and with the map normal, it is clear. Reported to the
  owner with this change. *(Amended 2026-11-12, enlarged beside: added.)*
- **The hint in the corner** (the overlay, no map): it hangs under the button over the column's
  first line (y 44) while hovered or focused; it is gone when the pointer or focus leaves.
  **(derived here)** *(Amended 2026-11-12, hint: added.)*
- **The hint after a click:** the click hands focus back to the game (FS-ZAJMH R22), so the hint
  stays only while the pointer rests on the button; its words follow the state at once (the
  windowed "Fullscreen" becomes "Exit fullscreen"). *(Amended 2026-11-12, hint: added.)*
- **A floor change in a run:** the minimap is destroyed and rebuilt; the button goes to the corner
  while no map is up and back beside the map once it is built, as the column closes up and opens.
- **A floor without regions** (floors 2–3, the dev test room): the button in the corner throughout.
- **Leaving for the town or a field, or back:** the leaving scene takes its place back; the next
  scene hands its own once its minimap is built, the corner meanwhile.
- **Fullscreen:** the place is in logical units, so the button stays beside the map in either state.
- **Hover:** the button is still faded until hovered; beside the map it sits over the world, as it
  sat over it in the corner.
- **The invite prompts and the ready check in the town** stand from y 92, under the button's foot
  (y 30); they still draw over the map's left at 1080 (FS-P0HSP §G.38).

### Out of Scope

The button's look, size, behaviour or key (but for the hint, C9); the minimap's look, size or modes; the top-left stack;
the target frame and notices (the boss frame's overlap at 1080 is reported, not moved); any server
change. *(Amended 2026-11-12, enlarged beside and hint.)*

## Change: Map mode icon
Status: work-order
Date: 2026-11-12

Owner request (Nick, 2026-11-12): "右上角地圖左下角多加小icon hover顯示可以切換大小或是模式(M)" (add a
small icon at the bottom-left corner of the top-right map; on hover it shows that it switches the
map's size or mode, with its key, M). Written `--from-thread` from the coordinator's defaults; no
interview, no `challenge-me` pass. Each requirement says **owner**, **charter default** (the
coordinator's brief) or **derived here**.

**Why here.** This FS owns the minimap's chrome and look (§A), the top-right corner in every world
(§Change: Minimap at the top, fullscreen button beside it, C1–C6) and the dev readout's place (§C,
its only spec), and the readout must move out of the icon's way. What a press does is FS-1SEF0
§A.2's M and FS-P0HSP §F.31–§F.33's, unchanged: the icon is a second way to press M, not a new
behaviour of the modes. One change, here; FS-1SEF0 and FS-P0HSP carry pointer stubs. No thin line
changes: the icon is the minimap's control, not a capability of its own.

### Requirements

D1. **The icon: a small code-drawn glyph, nested squares** (`MINIMAP_MODE_ICON`): a 7 × 7 ink of
    two nested squares round a dark middle in `palette.interactable` (amber: it can be acted on,
    the guideline's "Gameplay accent"), on a 1 px `palette.markerStroke` ring with the shape's own
    dark filled, so a 9 × 9 dark tile like a map mark's (§A.6, `MINIMAP_GLYPH`), every rect on a
    whole logical px. Hovered, the ink is `palette.interactableBright`. Tokens only, no new token,
    no baked art. **(owner: "小icon"; charter default: the glyph, amber, brighter on hover; derived
    here: the marks' build, so it sits in the map's own type)**
D2. **Where, in normal and enlarged, in a run, the town and a field:** its 9 × 9 box `MINIMAP.inset`
    (4) px in from the shown map's left and bottom edges, the same 4 px in either size (the icon
    keeps its size, as the marks do, FS-1SEF0 §B.9). At logical width 1080: normal, the map x
    854–1070 y 10–118, the box x 858–867 y 105–114; enlarged, the map x 746–1070 y 10–172, the box
    x 750–759 y 159–168; at 1280 each x 200 more. The floor's diamond leaves the panel's
    bottom-left corner empty (Facts: floor 1's fit; the town's and fields' worlds project 2:1 too),
    so the icon covers no ground, line, mark or dot. **(owner: "右上角地圖左下角")**
D3. **In the overlay: in the top-right corner, left of the fullscreen button.** With the overlay up
    the corner holds no map and the button stands in its corner (§Change C4), x width − 26 to
    width − 6, y 6–26. The icon's box stands 6 px (`MINIMAP.gap`) left of the button, centred on
    its height: x width − 41 to width − 32, y 12–21 (1039–1048 at 1080, 1239–1248 at 1280).
    **(charter default offered "the same relative corner of the overlay map, or else the
    overlay's top-left"; derived here, the corner beside the button: the overlay's map moves with
    the player and its corners leave the view, and the view's own corners hold the XP bar's stack
    and the chat window; beside the button is where the map stood a press ago, clear of the column
    under it, the target frame and the boss's)**
D4. **Nowhere without a minimap:** no icon is drawn and none takes a press on a run's floor without
    regions, a dungeon floor before its map is in, the town or a field before its first state, and
    every scene with no minimap. It is built with its minimap and goes with it (a floor change,
    leaving the run, the town or the field). **(charter default)**
D5. **Its hit area is its own:** the box grown 2 px each side, 13 × 13, inside the map in a panel
    mode (never on its rim). Only a press or a hover inside it is the icon's: everything outside,
    the rest of the map included, reaches the game exactly as today (the minimap itself takes no
    input). It hears no wheel and starts no drag. A press already another panel's first (the open
    gear overlay, the chat window, the party panel, an invite prompt, in the order each scene
    checks them) stays that panel's. **(charter default; derived here: 2 px, since a 9 px target is
    small and 13 px still sits inside the map)**
D6. **A press on it is M:** a primary press steps the mode exactly as M does, normal → enlarged →
    overlay → normal, written to `barrowspire_minimap_mode` (FS-1SEF0 §A.2, §A.4; FS-P0HSP §F.31,
    §F.32), the corner, the button and the column re-laid as on M, under M's own guards in that
    scene: in a run not while the menu is open or chat is typing (FS-1SEF0 §A.2); in the town not
    while chat is typing or the menu, a dialogue card or the letter panel owns the keys; in a field
    not while chat is typing (FS-P0HSP §F.33). A press in its hit area, any button, guarded or not,
    is never an attack, a cast, a Shadow Shot hold or a loot; a guarded one does nothing at all.
    **(owner: "可以切換大小或是模式(M)"; charter default: same guards, same key)**
D7. **The hover hint.** While the pointer is in the hit area and a press would act (no guard
    holds), the ink brightens and a one-line hint shows: **"Map mode (M)"** (one mode key for the
    cycle; terse, as the fullscreen button's). It goes when the pointer leaves the hit area or the
    canvas, or a guard comes to hold. Its look is the fullscreen button's hint (§Change C9) in the
    game palette, since it is drawn on the canvas (ADR-0025): the canvas item tip's ground
    (`palette.mapEdge` at 0.97, a 1 px `palette.frame` hairline at 0.5, a 6 px corner, the
    `tipGround` the hint's look was taken from), `palette.hudText` in the body face at 12 px,
    padding 8 × 3, whole logical px. It stands **to the left of the map**, its right edge 6 px left
    of the map's left edge and its middle on the icon's, never over the map; in the overlay 6 px
    left of the icon. Drawn over the HUD (`MINIMAP.depth` + 2), under the gear overlay, notices and
    the menu; it takes no input. The canvas takes no keyboard focus, so the icon is not reached by
    Tab; its key, M, is the keyboard's way and the hint names it. **(owner: "hover顯示";
    charter default: the words and the fullscreen hint's style; derived here: the side, the depth,
    no focus)**
D8. **The dev readout moves out of its way:** in a panel mode it stands 4 px inside the shown map's
    **top-right** corner, right-aligned (its top-right on the point), normal and enlarged; with the
    overlay up, or no map, 4 px under the column's last line as before (§C.18). Nothing else on the
    map moves. This replaces §C.14's bottom-left, and FS-1SEF0 §B.11's and §D.22's "bottom-left".
    *(Amended 2026-11-12 before the build, top-right: was "bottom-right", the brief's example. A
    world wider than it is deep, floor 1's 72 × 48 cells, projects to a diamond whose bottom vertex
    stands right of the middle (x 128 of 216), so the panel's bottom-right corner leaves a small
    empty triangle (84 × 40) and the readout's widest line would lie over the floor by the bottom
    vertex. The diamond is symmetric about its centre, so the top-right corner's empty triangle is
    the bottom-left's own, which the readout was measured clear in (§C.17).)* **(charter default:
    out of the icon's way; derived here: the corner)**
D9. **Docs and gallery:** the design guideline's Minimap bullet gains a sentence for the icon and
    the readout's corner; `game-client/CONTEXT.md` gains **Map mode icon**. No dev-gallery card:
    HUD chrome is not a tracked family (FS-1819Q R3, §E.24). **(derived here)**

### Acceptance Criteria

- [ ] Normal and enlarged, at logical widths 1080 and 1280, in a run, the town and a field: the
      icon's 9 × 9 box at (map.x + 4, map.bottom − 13); its hit area 13 × 13 round it; at 1080 the
      box x 858–867 y 105–114 normal and x 750–759 y 159–168 enlarged.
- [ ] Overlay: the box at x width − 41, y 12, left of the fullscreen button in its corner; no icon
      on a floor without regions, before a floor's map, before the town's or a field's first state.
- [ ] The glyph: 7 × 7 nested squares in `interactable` on a 1 px `markerStroke` ring with the dark
      filled, every rect on whole px inside its box; `interactableBright` while hovered; the ink
      3:1 or better against the ring.
- [ ] A primary press in the hit area steps the mode as M does and writes the stored mode; under M's
      guards (run: menu, chat typing; town: chat, menu, dialogue, letter panel; field: chat) it
      does nothing; in a run and a field it is never an attack or cast; a press 1 px outside the
      hit area is the game's as today.
- [ ] Hover in the hit area shows "Map mode (M)", to the left of the map (right edge map.x − 6) or of
      the icon in the overlay, centred on the icon, item-tip ground and tokens, depth over the HUD;
      it goes on leaving the hit area or the canvas, and is not shown while a guard holds.
- [ ] The dev readout 4 px inside the map's top-right, right-aligned, normal and enlarged, at 1080
      and 1280, its widest line above floor 1's diamond's upper-right edge; under the column in the
      overlay and with no map. *(Amended 2026-11-12 before the build, top-right.)*
- [ ] The guideline's Minimap bullet and `CONTEXT.md`'s **Map mode icon**; no gallery card.
- [ ] No raw colour literal added; the token fence passes.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] Nick's browser check: a run's floor 1, the town and a field, 1080 and 1280 wide, each mode:
      the icon's look and place, the hint on hover, a click stepping the mode as M does, the
      readout in the top-right, and the overlay's icon beside the button.

### Edge States

- **A press on the icon while chat is typing:** nothing happens, not even an attack; the key M
  would type a letter there, and the press keeps the same rule. **(derived here)**
- **The hint beside the normal map at 1080 and a top-centre notice wider than 434 px:** the
  notice (2000) draws over the hint's left end for its seconds. Accepted: both are brief.
- **The hint over the town's invite prompts or ready check at 1080** (x 592–892 from y 92, under
  the map's left, FS-P0HSP §G.38): while hovered, the hint draws over the prompt's right end; it
  goes when the pointer leaves. Accepted.
- **The hint over the arrival card at 1080 with the map enlarged:** the card's widest line ends at
  x 720 and the hint starts near x 650 at y about 153–174; while hovered the hint is on top.
  Accepted, as the card is gone in seconds.
- **A press that steps to the overlay:** the icon jumps to the corner beside the button under the
  pointer's old place; the pointer is then outside it and the hint goes. Accepted: the map jumps
  too (§Change, "M pressed").
- **The gear overlay open over the corner:** a press there is the overlay's; the icon neither
  steps nor brightens.
- **An archer drawing a Shadow Shot:** a press on the icon is ignored, as every other press is
  while the hold lasts (FS-JTNPR req 16); M still steps the mode. **(derived here)**
- **Render scales 1.5 and 2:** the icon's rects are on whole logical px, crisp at 1 and 2 and
  blended at 1.5 as the normal minimap's glyphs are; the hint's text is rasterised at the render
  scale of now and again on re-layout (FS-ZAJMH R5).

### Out of Scope

A keybinding setting; a separate control per mode; a menu of modes; keyboard focus on the canvas;
the minimap's look, sizes or modes; the fullscreen button and its hint; the target frame and
notices; any server change.

## Change: Map name
Status: work-order
Date: 2026-11-12

Owner request (Nick, 2026-11-12): "小地圖右上角顯示目前地圖的名字" (show the current map's name in the
minimap's top-right corner). Then, the same day, two refinements of the enlarged mode, which he
calls "兩倍" (it is 1.5 × in code, FS-1SEF0 §B): first "兩倍地圖時不顯示" (with the map enlarged, do not
show it), then, replacing that, "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊" (with the map enlarged, the
map's name stands to the left of the fullscreen icon). Written `--from-thread` from the
coordinator's defaults; no interview, no `challenge-me` pass. Each requirement says **owner**,
**charter default** (the coordinator's brief) or **derived here**.

**Why here.** This FS owns the minimap's chrome (§A), the top-right corner in every world (§Change:
Minimap at the top, fullscreen button beside it) and the dev readout's place (§C, §Change: Map mode
icon D8), and the readout must move out of the name's way. The words are FS-PQ2TW's (§C R19–R23),
read, not copied: one table names every place. No thin line changes: the name is the minimap's
label, not a capability of its own.

> **Amended 2026-11-12** by Nick, after looking at the name in the browser with I-56CKV-9 in. Four
> answers, the same day, each written into the requirement it settles:
> 1. On the overlay, asked whether "兩倍" meant it too: "目前這樣" (keep it as it is). E5 stands,
>    and the open question in the Edge States is closed.
> 2. "地城樓層顯示兩次 拿掉下面的" (a dungeon floor is shown twice, take away the one below): the
>    run's floor line goes from under the map wherever the map name names the floor; the escaped
>    count moves up into its place. E9 is replaced.
> 3. "有小地圖時 x y座標不是要顯示在地圖框框內右下角嗎" (with a minimap, shouldn't the x/y readout be
>    inside the map's frame, at its bottom-right?): it stands there in normal mode, on the name's
>    plate. E8 is replaced.
> 4. "2倍地圖時座標顯示在地區名稱左邊" (with the map enlarged, the readout stands left of the place's
>    name): with the map enlarged the readout and the name share one line beside the fullscreen
>    button. E8 is replaced (with 3), and E11 is added.
>
> Each changed line says *(Amended 2026-11-12, …)*.

### Requirements

E1. **The words are the arrival card's title** (`placeCard(place).title`, FS-PQ2TW R19, R23): one
    table, no second list. The town: "The Town". A field: "Gentle Meadows", "The Forlorn Forest",
    "Dev Test Room" (dev builds only). A run: its floor's card title, "The First Floor" on floor 1,
    "The Second Floor" … "The Tenth Floor" above it, "Floor 11" and up past the ordinals; a Master
    Spire's floors read as any run's, never naming it (FS-M8CSE R10, FS-PQ2TW R3). **(charter
    default: reuse the arrival card's naming)**
E2. **Its look: small HUD text on a faint dark plate.** 11 px body face (`CANVAS_FONT.body`),
    letter-spaced 1 px as the HUD's status text is, in `palette.hudText` (vellum), on a plate of
    `palette.hudPanel` at 0.75 alpha padded 4 × 2, square-cornered like the column's lines; whole
    logical px. Its ink keeps 4.5:1 or better over the plate laid on the minimap's fill and on a
    ground as light as vellum itself, so it reads over the map and over the world. Drawn over both
    minimap layers (`MINIMAP.depth` + 1), under the map mode icon's hint. Tokens only, no new
    token, no art. **(charter default: vellum, letter-spaced, a faint dark plate; derived here: the
    size, alpha and padding, and the 4.5:1)**
E3. **Normal mode: inside the map's top-right**, right-aligned, its plate's top-right `MINIMAP.inset`
    (4) px in from the panel's top and right edges: at logical width 1080 the map x 854–1070 y
    10–118, the plate's right edge 1066, its top 14; at 1280 each x 200 more. It is far from the map
    mode icon in the bottom-left (§Change: Map mode icon D2). **(owner: "小地圖右上角")**
E4. **Enlarged mode: left of the fullscreen button**, outside the map, right-aligned `MINIMAP.gap`
    (6) px left of the button's left edge and centred on its height: at 1080 the button x 720–740 y
    10–30, so the plate's right edge 714, its middle y 20; at 1280 914. **(owner:
    "兩倍地圖時地圖名稱顯示在全螢幕icon的左邊", replacing his "兩倍地圖時不顯示")**
E5. **Overlay: in the top-right corner, left of the map mode icon**, which stands left of the
    fullscreen button there (§Change: Map mode icon D3): the plate's right edge 6 px left of the
    icon's box, centred on the button's height (y 16): at 1080 the right edge 1033, at 1280 1233.
    The corner holds no map, so the name keeps to the button row, above the column's first line
    (y 44). **(charter default: "beside the map mode icon / fullscreen button row"; derived here:
    left of the icon, so neither is covered; owner, asked whether "兩倍" meant the overlay too:
    "目前這樣", keep it as it is, 2026-11-12)** *(Amended 2026-11-12, overlay settled: the open
    question closed.)*
E6. **Nowhere without a minimap**, as the icon (D4): none on a run's floor without regions, a
    dungeon floor before its map is in, the town or a field before its first state. It is built
    with its minimap and goes with it, so it names the place again on every world change and on
    every floor climbed. **(charter default)**
E7. **It gives way at the top centre.** Beside the enlarged map's button the plate stands at y
    about 11–29 and x about 600–714 at 1080 (800–914 at 1280), where a run's target frame (from y
    10; x 410–670 normal and 351–729 boss at 1080, 510–770 and 451–829 at 1280, FS-48CTQ §E.14) and
    the town's queue line (from y 20, top centre) can stand. Wherever its plate would overlap one of
    them while that one is shown, the name is hidden, and shows again when it goes; it is never
    drawn under or over them. The run's notices (centred on y 100) and the town's and fields'
    (from y 72) stand below its foot, and the arrival card lower still; it never runs off the
    view's left. **(derived here: the owner's place, the coordinator's "never under the boss target
    frame / top-centre notices"; hiding is the one way that keeps both, since at 1080 no width
    left of the button is clear of the boss frame)**
E8. **The dev readout keeps out of the name's way, in the map where there is one.** *(Amended
    2026-11-12, readout in the map: replaces "under the column's last line in every mode".)*
    - **Normal mode: inside the map's bottom-right**, right-aligned, its plate's bottom-right
      `MINIMAP.inset` (4) px in from the panel's bottom and right edges: at 1080 the map x
      854–1070 y 10–118, so the plate's right edge 1066, its bottom 114; at 1280 each x 200 more.
      It stays clear of the map mode icon in the bottom-left (D2) and of the name in the top-right
      (E3). Over floor 1's diamond in that corner: accepted, the owner asked for the corner.
      **(owner: "有小地圖時 x y座標不是要顯示在地圖框框內右下角嗎", 2026-11-12)**
    - **Enlarged: left of the map name**, on the name's line (E11). **(owner:
      "2倍地圖時座標顯示在地區名稱左邊", 2026-11-12)**
    - **Overlay and no map: 4 px under the column's last line**, right-aligned on its right edge
      (§C.18's place), as before. **(charter default, unchanged)**
    - **Its look: the name's plate.** 10 px body face in `palette.hudText` (vellum) at full alpha,
      on a plate of `palette.hudPanel` at 0.75 padded 4 × 2, as the name's (E2), in every place;
      its ink keeps 4.5:1 or better over the plate laid on the minimap's fill, the backing and a
      ground as light as vellum. This replaces §C.15's "no backing box, dim and semi-transparent"
      and its 3:1: over the map's fill a dimmed, unbacked line does not read. **(charter default:
      "small HUD text on the same faint plate the map name uses"; derived here: full alpha, since
      a partial alpha would thin the plate too, and the 4.5:1, the name's)**
    - Dev builds only, as before (`showsPositionReadout`); only the run draws one (the town and the
      fields have none, and this change adds none). **(unchanged)**
E9. **The run's floor line goes wherever the map name names the floor.** *(Amended 2026-11-12,
    floor line dropped: replaces "the run's floor line stays as it is".)* While the floor's minimap
    is built, and with it its name ("The First Floor"), the "Floor N" line under the map is hidden
    in every mode (normal, enlarged, overlay), and the escaped count stands where it stood: 6 px
    under the map normal and enlarged (y 124 and 178 at 1080 and 1280), the column's top in the
    overlay (y 44). The line still shows wherever no name names the floor: a floor without regions
    (a floor of buildings, the dev test room), and a dungeon floor before its map is in; there it
    keeps its place, the column's top (y 44), the escaped count 4 px under it (y 69). It goes and
    comes as the name does: built with the floor's minimap, back when the minimap goes (a climb,
    a floor of buildings, the run's end). **(owner: "地城樓層顯示兩次 拿掉下面的", 2026-11-12;
    derived here: the overlay too, since the name shows the floor there; the line kept where no
    name shows it, so the floor is always said once)**
E10. **Docs and gallery:** the design guideline's Minimap bullet gains a sentence for the name and
    the readout's new place; `game-client/CONTEXT.md` gains **Map name**. No dev-gallery card: HUD
    chrome is not a tracked family (FS-1819Q R3, §E.24). **(derived here)**
E11. **Enlarged: the readout and the name on one line beside the button.** The readout's plate is
    right-aligned `MINIMAP.gap` (6) px left of the name's plate's left edge, centred on the
    button's height as the name is (middle y 20 at 1080 and 1280); where the floor has no name, 6
    px left of the button. It gives way as the name does (E7): hidden while its plate overlaps a
    shown target frame, shown again when the frame goes (only the run has a readout, so never the
    town's queue line). The pair never runs off the view's left, nor meets the run's top-left
    stack (§D), at 1080 and 1280 with the widest floor name and the widest readout. **(owner:
    "2倍地圖時座標顯示在地區名稱左邊", 2026-11-12; derived here: the 6 px, the middle, the fallback
    with no name, the give-way)** *(Added 2026-11-12, readout left of the name.)*

### Acceptance Criteria

- [ ] The name per world: "The Town"; "Gentle Meadows", "The Forlorn Forest", "Dev Test Room";
      "The First Floor" on floor 1, "The Second Floor" on floor 2, and so on; each the arrival
      card's title for that place.
- [ ] Normal, at 1080 and 1280, in a run, the town and a field: the plate's top-right at
      (map right − 4, map top + 4), 1066/1266 and 14; its box clear of the map mode icon's.
- [ ] Enlarged, at 1080 and 1280: the plate's right edge 6 px left of the fullscreen button
      (714 / 914), its middle on the button's (y 20), outside the map; never left of x 0.
- [ ] Overlay, at 1080 and 1280: the plate's right edge 6 px left of the map mode icon (1033 /
      1233), its middle y 16; clear of the icon and the button.
- [ ] No name without a minimap; a new name with every world and every floor.
- [ ] Hidden while its plate overlaps a shown target frame (a run) or the queue line (the town);
      shown again once it goes; the notices' bands lie below its foot.
- [ ] The look of E2, its 4.5:1, tokens only; the token fence passes.
- [ ] The dev readout, at 1080 and 1280: normal, its plate's bottom-right at (map right − 4, map
      bottom − 4), 1066/1266 and 114; enlarged, its plate's right edge 6 px left of the name's
      plate, middle y 20, hidden while a shown target frame meets it, never off the view's left
      nor over the top-left stack; overlay and no map, 4 px under the column's last line; never
      over the map mode icon or the name. Its plate the name's, its ink 4.5:1. *(Amended
      2026-11-12, readout in the map.)*
- [ ] The floor line hidden under the map in every mode while the floor's name shows, the escaped
      count in its place (y 124 normal, 178 enlarged, 44 overlay, at 1080 and 1280); shown at the
      column's top on a floor without regions and before a dungeon floor's map is in. *(Amended
      2026-11-12, floor line dropped.)*
- [ ] The guideline's Minimap bullet and `CONTEXT.md`'s **Map name**; no gallery card.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] Nick's browser check: a run's floor 1 and a climb, the town and a field, 1080 and 1280 wide,
      each mode: the name's words, place and look; the readout under the column; a boss or a
      hovered monster at 1080 with the map enlarged.

### Edge States

- **Normal mode on floor 1:** the plate's widest line ("The First Floor") reaches past the empty
  triangle the diamond leaves in the panel's top-right, so its left end lies over the diamond's
  upper-right edge by a few px. Accepted: the plate is there to read over the map, as the owner
  asked for the corner. **(derived here)**
- **The overlay and "兩倍":** the owner's "兩倍" is the enlarged mode; asked whether he meant the
  overlay too, he answered "目前這樣": the overlay keeps E5. *(Amended 2026-11-12, overlay
  settled.)*
- **A target frame at 1080 with the map enlarged and the readout beside the name:** the readout
  stands further left than the name, so any frame that hides the name hides it too, and the normal
  frame can hide it while the name still shows. Both are back the moment the frame fades out.
  *(Added 2026-11-12, readout left of the name.)*
- **The readout's text changes every frame:** right-aligned, so it grows to the left, away from
  the name and the button; in normal mode its widest ("Awaiting the deep...", or a floor's largest
  "X: … Y: …") stays clear of the map mode icon. *(Added 2026-11-12, readout in the map.)*
- **The map mode icon's hint in the overlay** ("Map mode (M)", 6 px left of the icon) draws over
  the name while hovered (its depth is higher); it goes when the pointer leaves. Accepted.
- **The fullscreen button's hint beside the enlarged map** (DOM, to the button's left, §Change C9)
  covers the name while hovered or focused. Accepted: both are brief.
- **A target frame at 1080 with the map enlarged:** the name is hidden while any frame is up (both
  sizes overlap it there); at 1280 only the boss frame and a hovered monster's frame overlap a long
  name. It is back the moment the frame fades out.
- **M pressed:** the name jumps with the map, to its new place at once; no tween.
- **Resize:** re-placed and re-rasterised with the corner (FS-ZAJMH R5).

### Out of Scope

A name for the town other than "The Town" (FS-PQ2TW O1); new words for any place; the floor line's
words; the minimap's look, sizes or modes; the target frame, notices and the queue line; any server
change.

## Change: Fullscreen in the OPTIONS panel → FS-T3DWX

## Change: The enlarged map keeps its labels inside
Status: work-order
Date: 2026-11-14

Owner request (Nick, 2026-11-14): 「小地圖1.5倍時 區域名稱跟座標也要放在地圖內跟1倍時的位置一樣」 (with
the minimap at 1.5 ×, the area name and the coordinates must also sit inside the map, where they sit
on the 1 × map). The enlarged mode is 1.5 × in code (FS-1SEF0 §B). An approved owner decision,
written `--from-thread` from the coordinator's charter; no interview. Each requirement says
**owner**, **charter default** or **derived here**.

**Why here.** This FS owns the map name and the dev readout's places (§Change: Map name, E3–E8,
E11). FS-T3DWX § Change: The top-right HUD fills the button's spot, G3, moved the enlarged map's
pair right by the old button's width but kept them outside the map; it carries a pointer stub to
this section. No thin line changes: the name and the readout are the minimap's labels, not
capabilities of their own.

**Supersedes:** §Change: Map name E4 (the name left of the enlarged map), E8's "Enlarged: left of
the map name" bullet, E11 (the readout and the name on one line beside the map) and the parts of
E7, the Acceptance Criteria and the Edge States that place either of them beside the enlarged map;
FS-T3DWX G3's name and readout (the enlarged map itself does not move). E3, E8's normal, overlay
and no-map bullets, E9, FS-T3DWX G4 (the overlay) and G5 (no map) are unchanged.

**Facts (read 2026-11-14 on main 6328e797).** The enlarged map is 324 × 162 at (W − 334, 10): x
746–1070, y 10–172 at width 1080; x 946–1270 at 1280. Its map mode icon is a 9 × 9 box at (map x +
4, map bottom − 13), its hit 2 px wider each way (§Change: Map mode icon, D2, D5). The boss target
frame is the widest thing at the top centre, x 351–729 at 1080 and 451–829 at 1280, from y 10
(FS-48CTQ §E.14). `minimapNamePlace` (`ui/minimapName.ts`) and `positionReadoutPlace`
(`ui/positionReadout.ts`) each keep one branch for the enlarged map, fed by `MINIMAP_NAME.beside`,
`POSITION_READOUT.beside`, and the run scene's `enlarged` flag and name box.

### Requirements

F1. **Enlarged: the name inside the map's top-right, by the normal map's rule (E3).** Right-aligned,
    its plate's top-right `MINIMAP.inset` (4) px in from the enlarged map's own top and right edges:
    at 1080 the plate's right edge 1066, its top 14; at 1280 1266 and 14. Measured from the enlarged
    map's rect, so the same rule places it in either size. **(owner)**
F2. **Enlarged: the readout inside the map's bottom-right, by the normal map's rule (E8).**
    Right-aligned, its plate's bottom-right `MINIMAP.inset` (4) px in from the enlarged map's own
    bottom and right edges: at 1080 1066 and 168; at 1280 1266 and 168. It no longer depends on the
    name: with or without a name it stands there. **(owner)**
F3. **Clear of each other and of the icon.** With the widest floor name and the widest readout, at
    1080 and 1280, both plates lie inside the enlarged map, neither meets the other, and neither
    meets the map mode icon's hit in the map's bottom-left. **(derived here: the 162 px height
    leaves more room between the two than the normal map's 108)**
F4. **The give-way rule stands.** Each is still hidden while its plate overlaps a shown target
    frame (a run) or the town's queue line or its Leave button (E7, and E11's give-way for the
    readout), and shown again when that goes. Inside the enlarged map no target frame reaches them
    (the boss frame ends at x 729 at 1080 and 829 at 1280, the map starts at 746 and 946), so while
    a frame stands they now stay shown. **(derived here; the coordinator: "inside the map they
    should rarely meet it")**
F5. **Nothing else moves.** The normal map's name and readout (E3, E8), the overlay's (FS-T3DWX
    G4), the no-map readout (G5), the floor line's rule (E9), the look of both (E2, E8), the map's
    sizes and place, and the map mode icon and its hint are as they were. **(charter default)**
F6. **What only placed them outside goes.** The name's `beside` (its middle under the enlarged
    map's top), the readout's `beside` (its gap left of the name), the readout's enlarged branch and
    its reading of the enlarged flag and of the name's plate are removed where nothing else uses
    them. **(charter default)**
F7. **Docs.** The design guideline's map section and `game-client/CONTEXT.md`'s **Map name** say
    the name and the readout stand inside the map in normal and enlarged mode alike. No gallery
    card (FS-1819Q R3). **(charter default)**

### Acceptance Criteria

- [ ] Enlarged, at 1080 and 1280, in a run, the town and a field: the name's plate top-right at
      (map right − 4, map top + 4), 1066/1266 and 14, the same rule as the normal map's.
- [ ] Enlarged, at 1080 and 1280, in a run: the readout's plate bottom-right at (map right − 4,
      map bottom − 4), 1066/1266 and 168, with a name and without one; the same rule as the normal
      map's.
- [ ] The widest name and readout inside the enlarged map, clear of each other and of the map mode
      icon's hit, at 1080 and 1280.
- [ ] With the map enlarged at 1080, a shown boss or normal target frame leaves both shown; a cover
      laid over either still hides it, and it is back once the cover goes.
- [ ] Normal, overlay and no map: the name and the readout where they were (E3, E8; FS-T3DWX G4,
      G5).
- [ ] No `MINIMAP_NAME.beside`, `POSITION_READOUT.beside`, or enlarged branch in
      `positionReadoutPlace` is left in `game-client/src`.
- [ ] The guideline's map section and `CONTEXT.md`'s **Map name** match.
- [ ] Typecheck, lint, the token fence and the full vitest suite pass.
- [ ] **Owner's look (HITL):** with the map enlarged, in the run, the town and a field, at a
      windowed and a fullscreen size, the name in the map's top-right and (in the run) the
      coordinates in its bottom-right, as on the normal map; a boss or a hovered monster's frame
      leaves them shown.

### Edge States

- **The name over the enlarged diamond:** as on the normal map (§Change: Map name, Edge State
  "Normal mode on floor 1"), a long name may lie over the floor diamond's upper-right edge by a few
  px. Accepted: the owner asked for the same place.
- **The readout's text changes every frame:** right-aligned, so it grows to the left, toward the
  map mode icon; its widest stays clear of the icon (F3).
- **M pressed:** both jump with the map, to their new place at once, no tween; normal ↔ enlarged
  keeps them in the same corners, only further from the map's left and bottom.
- **Resize:** re-placed and re-rasterised with the corner (FS-ZAJMH R5), as before.
- **A minimap with no name** (none today): the readout still stands in the bottom-right, since
  its place no longer reads the name's.

### Out of Scope

The overlay and no-map places; the map's sizes, modes or look; the name's words; the readout's
words; the target frame, the notices and the queue line; any server change.
