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

## Summary

In a run, the top-right minimap is drawn finer and in the game's own look: candle-lit at its
edges, every region the party has seen in one dark stone, the one it stands in no lighter, the seen
rooms outlined along their walls only, open at every doorway, never a corridor, and the switch, escape door and stairs as small drawn glyphs. It moves to the
top of the top-right corner, with the floor indicator and the escaped count under it in smaller
type. In dev builds the x/y position line moves into the minimap's bottom-left corner, small and
dim, and the top-left HUD (XP bar, resource bars, party frames) moves up into the space it leaves.
The minimap's frame, size and content are unchanged. *(Amended 2026-11-12, outer outline only; was: "each room and
corridor outlined".)* *(Amended 2026-11-12, rooms only; was: "the whole shown floor outlined once
round its outer edge".)* *(Amended 2026-11-12, gap at every doorway; was: "the seen
rooms outlined along their outer edge only, never a corridor".)* *(Amended 2026-11-12, one fill;
was: "explored rooms in dark stone, the ones the party stands in a step lighter".)*

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
3. **Layer order inside the frame**, bottom to top: backing, region fills, the rooms'
   outline, vignette, fixture glyphs, party dots, then the readout (§C). The vignette dims the floor, never
   a glyph, a dot or the readout. **(derived here: what a player looks for is never dimmed)** *(Amended 2026-11-12, outer outline only; was:
   "region edges".)* *(Amended 2026-11-12, rooms only; was: "the outer outline".)*
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
5. **One thin line along the seen rooms' walls, a gap at every doorway, and none on a corridor**:
   1 logical px on each side of a seen room's cell (`kind` "room", explored or visible) that faces
   a cell that is not walkable (a shell or void cell, or off the grid: no region at all). A side
   that faces a cell of another region is a doorway, and gets no line, whatever that region's kind
   (room or corridor) and whatever its state (explored, visible or unexplored): a room's outline is
   open wherever a path leaves it, as on Path of Exile 2's map, whether or not the party has seen
   the path. A corridor's sides (`kind` "corridor") get no line, whatever its state and whatever it
   faces, and never a line along a cell's rect inside a region. Each stretch is drawn once, and
   where the line turns a corner it runs on unbroken, no gap; where a room's wall stops at a doorway
   the line ends there, so the outline is open runs of line, and closed loops only round a room
   with no doorway; an open run is never closed back on its start. The line keeps ≥ 1.3:1 against
   the one fill it bounds (§A.4), in its token (`minimapEdge`) *(Amended 2026-11-12, one fill;
   was: "each fill it bounds")*. An unexplored region has no fill and no line,
   as today; only the gap in a seen room's line shows where it opens. Showing that gap before the
   corridor beyond is seen is a deliberate owner choice: it tells the player a way out exists
   there. **(owner, 2026-11-12, on seeing the rooms still closed: "小地圖似乎還是一樣
   房間中有路的地方要留缺口不要包起來 ... 像poe2那樣")** *(Amended 2026-11-12, gap at every doorway;
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
    the seen rooms' outer edge outlined, no corridor; amber glyphs in a dark ring; dots in a dark ring; drawn in code), marked
    "*(Added by FS-56CKV, 2026-11-12.)*", as the countdown and health-bar bullets are.
    **(derived here: a canvas look others will match belongs in the guideline, its single source
    of truth for appearance)** *(Amended 2026-11-12, outer outline only; was: "outlined regions".)*
    *(Amended 2026-11-12, rooms only; was: "one outline round the shown floor".)*
    *(Amended 2026-11-12, one fill; was: "dark-stone explored, lighter visible".)*
24. **No dev-gallery card.** The gallery tracks effects and item icons only; HUD chrome is not a
    tracked family, so none is added. **(charter default)**

## User Stories

1. As a player, I want the minimap to look like part of the barrow, so that the HUD does not break the game's mood.
2. As a player, I want the map's edges to fall into shadow like the rest of the screen, so that it reads candle-lit.
3. As a player, I want every room I have seen drawn the same, the one I stand in no brighter, so that the map reads as one calm floor plan and my own dot tells me where I am. *(Amended 2026-11-12, one fill; was: "rooms I have explored and rooms my party stands in to read apart at a glance, so that I know where we are".)*
4. As a player, I want the rooms I have seen outlined along their outer edge, with no line on a corridor or across a doorway, so that the map reads as one floor plan whose rooms stand out from the paths between them. *(Amended 2026-11-12, outer outline only; was: "each room and corridor outlined".)* *(Amended 2026-11-12, rooms only; was: "what I have seen outlined once round its outer edge".)*
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
- [ ] The outline follows the seen rooms' walls only: on the fixture floor, no line on any side of a corridor (seen alone or beside a room), none across a doorway, whatever the region beyond it and whether or not it is seen (a seen room beside an unexplored corridor leaves a gap there), none between a region's own cells or between two rooms; every side of a seen room's cell facing a cell that is not walkable drawn exactly once; no gap where the line turns a corner; open runs ending at a doorway stroked without `closePath`, closed loops with it. *(Amended 2026-11-12, gap at every doorway; was: "none across a doorway between a seen room and a seen corridor", and each side "facing unexplored ground or the void" drawn.)* *(Amended 2026-11-12, outer outline only; was: "a boundary shared by two seen regions is drawn once".)* *(Amended 2026-11-12, rooms only; was: "the outer edge of the seen regions together … as closed loops".)*
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
- **A seen room and a seen corridor sharing a doorway:** no line across the doorway and none
  along the corridor; the room's line ends at each side of the doorway, an open run. Both read as
  one patch of stone, explored or visible, the room told apart by its line. *(Amended 2026-11-12,
  one fill; was: "Where both are explored they read as one patch of stone".)* Accepted: the
  owner asked for the rooms' outer edge only. *(Amended 2026-11-12, outer outline only; was: "the
  shared edge is drawn once".)* *(Amended 2026-11-12, rooms only; was: "Two seen regions sharing
  a doorway … the outline runs round the pair as one shape".)*
- **A seen room beside an unexplored corridor:** the line stops at the doorway, a gap, just as
  where the corridor is seen; the corridor beyond has no fill and no line until it is seen. The
  gap tells the player a way out exists there, before they have seen where it goes: a deliberate
  owner choice. **(owner, 2026-11-12: "房間中有路的地方要留缺口不要包起來 ... 像poe2那樣")**
  *(Amended 2026-11-12, gap at every doorway; was: "the doorway faces unexplored ground, so the
  line runs across it, closed; once the corridor is seen the line opens there", derived here.)*
- **A seen room with no doorway** (none on today's floors): its line is one closed loop.
  **(derived here, gap at every doorway, 2026-11-12)**
- **Only corridors seen** (a corridor explored, its rooms not yet): its fill shows and no line at
  all. Accepted: the owner asked for no line on a corridor. **(derived here, rooms only,
  2026-11-12)**
- **A seen room touching another only at a corner:** the line passes through that corner point
  twice, once for each, unbroken. **(derived here)** *(Amended 2026-11-12, rooms only; was: "A
  seen region … stays closed".)*
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
