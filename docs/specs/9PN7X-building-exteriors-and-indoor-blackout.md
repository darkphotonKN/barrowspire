# FS-9PN7X: Building exteriors and indoor blackout

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Closed building exteriors", "Indoor blackout" → this FS (brownfield: "Town building interiors → FS-B0H2D" and "Tower interior run look → FS-8RBQY" stay the shipped half) · Related ADRs: [ADR-0036](../adr/0036-buildings-have-an-exterior-and-an-interior.md) (buildings have an exterior and an interior; **governs this FS**), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art, footprint draw order), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (built in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (canvas tokens only) · Builds on: [FS-2325V](2325V-pre-rendered-isometric-art.md) §B (bake pipeline), §C.2–§C.5 (cut-away walls, roof lift, occluder fade), [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md) §E (town interiors, R20–R22), [FS-8RBQY](8RBQY-tower-interior-run-look.md) §A–§D (world theme, rooms, masonry sheets, floor bands), [FS-MRZH7](MRZH7-function-npc-markers.md) (function NPC markers) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" (*building*, *building type*, *building exterior*, *interior look*, *indoor blackout*, *silhouette*, *dark opening*)

> Promoted `--from-thread` on 2026-11-01 from the draft's scoping notes (Kranti, `/scope-it`,
> 2026-11-01) and the coordinator's charter, which the owner approved wholesale. No interview was
> run. Every decision here is **(not challenged)**: client presentation only, and the cost of
> error is low (baked PNGs and draw rules revert cleanly). Decisions taken from the charter, not
> from the owner's own words in scoping, are marked **[charter default]** with their reason.
> Code citations are against `54be688a` (`main`).
>
> Reference, not code to merge: the throwaway spike on local branch `spike/opaque-interiors`
> (commit `6aa8f625`, `HubScene.ts` only, every line marked `SPIKE`) has working blackout
> geometry: `projectRect` + `raise` + `outsideConvex` (`src/render/iso/shapes.ts`), a 5 world px
> pad, 24 screen px headroom over the wall top, depth 500 (over light-map 135 and halos 136,
> under vignette 905 and markers 950). The run scene's dormant `updateIndoorMask`
> (`src/scenes/BarrowspireScene.ts:3670`) is the same geometry.

## Summary

Today you can see into every building from the street: its south and east fronts are low
cut-away walls, and a roof fades whenever the player is near it. With this feature a building
seen from outside is a closed block: four full-height walls in its own outward surface, under a
roof or a stone cap that never fades, with a dark opening where its door is. Step through the
door and it snaps to the interior look that ships today (cut-away fronts, furnished, lit) while
everything outside the building goes to the canvas's darkest ink. Walk behind a building and
your character shows through it as a dim silhouette. It holds for the hub's town buildings
(timber) and the Spire's rooms (masonry). It is purely visual: the server sends what it sends
today.

## Requirements

### §0. The boundary (binds every section)

1. **game-client only.** No file under `game-server/` changes. No proto, no WS field, no wire
   message, no game rule, collision, range or interaction changes. Walls, doors, rooms, chests,
   monsters and players arrive in the broadcast exactly as today. What is hidden is hidden from
   the canvas only; the server keeps sending it (accepted: there is no PvP, and the most a
   player could learn by reading the socket is who or what is inside a building).
2. **ADR-0036 is the governing decision.** Every building has two looks: the **building
   exterior** (player outside it) and the **interior look** (player inside it).
3. **New art is built in code and baked through the existing bake tool** (ADR-0020, ADR-0021,
   FS-2325V §B): authored under `game-client/tools/bake/page/`, baked with `npm run bake`. No
   stock model, texture or sourced asset. Each new sheet's manifest `source` is
   `authored: tools/bake/page/…`.
4. **Canvas colour tokens only** (ADR-0013). Every colour in new bake and client code is a
   `BARROW` token or a blend/shade of tokens (`tools/bake/page/palette.js`, `BARROW_HEX` /
   `palette` in `src/utils/canvasPalette.ts`). No hex literal, no new token in
   `src/utils/theme.ts`. `npm run lint:fence` passes.
5. **Deterministic.** The bake stays byte-stable (`npm run bake -- --check` exits 0 after the
   committed bake). Every new plan (exterior pieces, cap pieces, dark openings, blackout
   geometry) is a pure function of the broadcast's walls and doors. No `Math.random`.
6. **The design guideline changes in two places only:** the "Occlusion is cut-away, then fade"
   rule (`game-client/docs/design-guideline.md`, ~l.87) and a new building-exterior section
   (§F.6). It lands with the art (§F), so the art SSOT never contradicts the canvas.

### §A. Where the player is (lines: "Closed building exteriors", "Indoor blackout")

1. A **building** is a group of server walls sharing a `house_id`, its rect the bounding box
   `housesFrom` builds (`src/render/world/houses.ts`). Furnishings (FS-B0H2D R19) are not
   building walls. In the hub that is each town building; in the Spire, each room; in the
   exterior theme, each house.
2. The player is **inside** building B when `insideHouse(playerPos, B)` holds on the player's
   eased world position: the test the roof lift already uses (edges inclusive, so a player
   standing in the door gap is inside). At most one building is the player's at a time; if two
   rects ever both contain the position, the first in `housesFrom` order wins.
3. **No hysteresis [charter default].** The inside test is used as is. Reason: the spike did not
   flicker at the threshold. A hysteresis is added only if flicker is seen in review, and then
   by a follow-up, not silently.
4. **Instant snap.** Entering or leaving swaps every look in this FS in the same frame: no
   cross-fade, no tween. It reads like a door shutting.

### §B. The building exterior (line: "Closed building exteriors")

1. **One exterior per building type.** Two today: **timber** (`TIMBER_WALLS`, prefix `""`: town
   buildings, and the exterior theme's houses) and **masonry** (`MASONRY_WALLS`, prefix
   `tower_`: Spire rooms, every floor band). A building's type is the `WallSheets` its scene
   draws walls with; the exterior's sheets are named by that same `WallSheets` (§F.2), so a world
   theme picks both looks at once.
2. **Four full-height walls.** While the player is outside building B, B's south and east walls
   are drawn at full height in the building type's **exterior pieces** (§F.2) instead of the low
   cut-away pieces. Its north and west walls stay the full-height back pieces they are today.
   Every corner post on the south and east sides is drawn full height with the type's existing
   back post (`post_back` / `tower_post_back`) [least new art: a post is a column, the same from
   both sides]. Piece geometry is unchanged: same `cutWall` centreline cut, tile span, trim and
   anchor, only the sheet and height differ, so the exterior and interior pieces of one wall
   stand on exactly the same footprint.
3. **A top that never fades.** Timber buildings keep their baked roof (`planRoof`). Masonry
   buildings get a new baked **stone cap** (§F.3) laid over the room at the back walls' top
   (`BAKE.WALL_BACK`). Neither takes the occluder fade, ever (§E.4).
4. **One stone cap [charter default].** The cap is the same on every floor band. Reason: the
   band look (`TOWER_BANDS`, `src/render/world/worldTheme.ts`) varies only variant shares,
   ground and dressing, not a tint, so a per-band cap would be new art for no rule. Least new art.
5. **Dark opening at entrances.** While the player is outside B:
   - a **town door gap** (a gap between two collinear wall segments of B, as the hub server
     cuts it: `hubDoorWidth = 50`, centred in the south wall) is drawn as the type's dark
     opening (§F.4): its frame, flat `palette.inkDeep` inside. The gap is found from the walls
     (a pure helper), never from a client constant;
   - an **open Spire door** (a `DoorState` with `is_open` in B's wall) is drawn as the dark
     opening in place of the door's open frame;
   - a **closed or locked Spire door** draws as a door, exactly as today (`door_x`/`door_y`,
     frame `unlocked`).
   Either way you see the way in, not the room.
6. **The interior look while inside.** While the player is inside B, B draws as it ships today:
   the cut-away south and east fronts and front posts, its roof lifted (hub) or its cap hidden
   (Spire), the open door's own frame, the room furnished (FS-B0H2D R19–R22) and lit (§D.6).
   Every other building keeps its exterior (and is under the blackout, §D).
7. **Placeholders.** Without art (no manifest, or a missing exterior/cap/opening sheet) a
   building still closes: the exterior side falls back to a full-height placeholder block, the
   cap to a flat placeholder slab at the wall top (like `placeholderRoof`), the dark opening to
   a flat `palette.inkDeep` quad over the gap. Never invisible, never the open room.
8. **Nothing inside shows over the top.** From outside, no part of a building's interior (back
   wall dressing, sconce flames and halos, tall furnishings, the spiral stair) shows above or
   through its roof or cap. Lights inside are off (§D.6); objects inside are hidden (§C).

### §C. Hidden from outside: one rule (lines: "Closed building exteriors", "Indoor blackout")

1. **The rule [charter default].** A world object is hidden when its world position is inside a
   building the player is not in, or when the player is inside a building and the object's
   position is not inside that building. Reason: one rule, so nothing leaks.
   `hidden(pos, buildings, playerBuilding)` is a pure, tested helper; FS-B0H2D's `hiddenIndoors`
   (`src/render/world/hubInteriors.ts:196`) is its first half and is replaced by it or rebuilt
   on it.
2. **What it covers.** Every drawn thing with a world position, read each frame from its eased
   position where it moves: player and NPC bodies and their legs, monsters, their name plates,
   HP bars, glowing eyes and sigils, containers (chests, the stash chest), floor items (drop
   piles, sacks), projectiles, effects anchored in the world, run dressing, stairs, the escape
   door and switch. Markers drawn above the blackout (depth ≥ 500: name plates and bars at 950,
   951) are hidden explicitly, since the blackout does not cover them.
3. **The player is never hidden.** The player's own body, plate and aim line always show.
4. **Party included.** Teammates follow the rule like everyone else: no body and no name plate
   while they are outside the player's building, or inside another building.
5. **Function NPC markers over a closed building [charter default].** A function NPC inside a
   building the player is not in keeps his name plate and sigil (FS-B0H2D R21, FS-MRZH7); his
   body hides. The stash chest's "Stash" marker (FS-VPD8Y) behaves the same. Reason: it is a
   marker that tells the street where the shop is, not a view inside. **The indoor blackout
   still hides it:** while the player is inside a different building, these markers hide with
   everything else.

### §D. The indoor blackout (line: "Indoor blackout")

1. **Everything but this building.** While the player is inside building B, everything outside
   B (the street, corridors, open floor, the perimeter, every other building, everyone in them)
   is filled with `palette.inkDeep` (= `BARROW_HEX.pitch`): the canvas's darkest ink, not `#000`.
   The web UI's "soot, never black" rule does not govern the canvas.
2. **Geometry** (the spike's, kept): the hole is B's projected floor rect grown by 5 world px,
   raised by the wall top plus 24 screen px of headroom (so tall back-wall dressing is never
   clipped), as the hexagon `[topUp, rightUp, right, bottom, left, leftUp]`; the dark is
   `outsideConvex(hole, reach)` with a reach covering the whole map. The wall top is
   `BAKE.WALL_BACK * BAKE.VPX` with baked walls, the scene's placeholder wall height without.
   The geometry is a pure, tested function.
3. **Depth.** 500: over the world, the light-map (135), halos (136) and world effects (≥ 140);
   under the dust (902), vignette (905), markers (950, 951) and HUD (≥ 1000). Outdoor lamp
   pools and halos never glow through it.
4. **Off while outside.** Outside every building the blackout is not drawn at all.
5. **One shared module [charter default].** The blackout is one module under
   `src/render/world/`, used by `HubScene` and `BarrowspireScene` alike. The run scene's
   dormant `indoorMask` (`BarrowspireScene.ts` ~489, 2680, 3615–3692) is replaced by it, not
   kept beside it. Reason: one blackout, one geometry, one depth.
6. **Room lights [charter default].** A building's own lights (a hub house's wall flames,
   hearth and forge; a Spire room's sconces and any light standing in it, the interactable
   pools of FS-8RBQY §B.7 included) are lit only while the player is inside that building, as
   hub buildings already do (`showInteriors`, the light-map's under-roof gate). Reason: from
   outside the room is closed, and a pool on a closed cap would leak the inside. Hall and street
   lights are unchanged.
7. **Both worlds.** The hub's town buildings and the Spire's rooms both get the blackout. In the
   Spire, "indoor" now means *inside a room*: the tower theme's "a floor is all indoors"
   (FS-8RBQY §B.3) still describes the floor as a whole, and the run HUD's position text keeps
   its tower behaviour (no "Indoor"/"Outdoor" suffix) [scope: HUD unchanged].
8. **Torn down with the floor.** In the run scene the blackout is cleared and hidden at the
   per-floor seam (`leaveFloor`), like the mask it replaces, and rebuilt for the new floor.

### §E. The silhouette (line: "Closed building exteriors")

1. **When.** While the player is outside every building and any piece of a building exterior
   (exterior or back wall piece, post, roof or cap piece, dark opening, door) covers them, the
   player shows through as a **silhouette**. "Covers" is the occluder test that ships
   (`occludes`, `src/render/world/occlusion.ts`): the piece's screen bounds overlap the
   player's body, and its footprint sorts nearer the viewer.
2. **Player only [charter default].** Party members, other players and NPCs never silhouette.
   Reason: a smaller v1, and the blackout hides others indoors anyway.
3. **Method [charter default].** A dim, tinted copy of the player's current body frame, drawn
   at the player's position above every building piece and below the blackout, markers and HUD.
   The tint is a canvas token at reduced alpha (chosen in review, recorded in the issue). Shown
   only while covered; hidden the instant nothing covers. Reason: no new art, and it reads as
   "you are behind this" without opening the building.
4. **Buildings leave the occluder fade.** Every piece of a building (walls with a `house_id`,
   their posts, roofs, caps, dark openings, doors in them) is removed from `Occluders`; the
   silhouette takes over. Trees, tall props, the tower perimeter and walls with no `house_id`
   keep the 40% fade (`FADED_ALPHA`), unchanged.
5. **Not for the player's own building.** Inside a building, its cut-away fronts are how the
   room is seen; nothing of it silhouettes the player.

### §F. Art: the exterior pieces (line: "Closed building exteriors")

1. **One bake, one review, before any wiring.** Every sheet below is authored and baked in one
   slice, which ends with a contact sheet. **The owner approves the look before any slice wires
   these sheets in.** Pure planning and drawing helpers may be built against the names pinned
   here in parallel; nothing ships to a scene until the approval.
2. **Exterior wall pieces**, one per building type. Same tile span, anchor, origin and
   `WALL_BACK` height as the type's back pieces, so `cutWall` and `trimCrop` are unchanged. The
   camera-facing face is the building's **outward** surface: no interior dressing (no sconce,
   banner, cobweb, torch), and **no declared light**.
   - Timber: `wall_exterior_{plain,brace,window}_{x,y}`. The window is shuttered or dark, never
     lit.
   - Masonry: `tower_wall_exterior_{plain,pillar}_{x,y}`.
   - `WallSheets` gains the exterior variant table, so the band tables (which spread
     `...MASONRY_WALLS`) inherit it.
3. **Stone cap**: `tower_cap`, a one-tile flat masonry slab, variants like a ground tile, drawn
   at the back walls' top and laid to cover the room rect (overhang allowed where a part tile
   would otherwise leave a gap). One cap for every band (§B.4).
4. **Dark opening frames**: `door_dark_{x,y}` (timber) and `tower_door_dark_{x,y}` (masonry). A
   full-height frame (lintel and reveals) sized to the run door width (50 world px) with flat
   darkness inside, read from a `BARROW` token at its darkest. The `_y` axis matches the door
   sheets' convention.
5. **Atlas and fidelity.** The new sheets go in one new atlas group, `building` (not
   "exterior", which names the run theme), additive only: every
   pre-existing atlas `sha256` and sheet entry unchanged. Same palette ramp, light direction and
   contact shadow as the shipped world sheets (design guideline Part I). Exterior and interior
   pieces of one type read as one building.
6. **Design guideline amendment** (§0.6). "Occlusion is cut-away, then fade" becomes: from
   outside, buildings are closed blocks and never fade (a covered player shows as a silhouette);
   the cut-away is how a room the player is in is seen; trees and tall props keep the ~40% fade.
   A new building-exterior section states: one exterior per building type, four full-height
   walls in the type's outward surface, roof or stone cap that never fades, a dark opening at
   entrances, the indoor blackout in `inkDeep`. Cites ADR-0036 and this FS.

### §G. Verification

1. **Unit tests for the pure pieces [charter default]:** the inside test and building pick
   (§A), exterior and cap planning (§B, §F), door-gap finding (§B.5), the hide rule and marker
   rule (§C), the blackout geometry (§D.2), the silhouette's cover test (§E.1). Reason: the
   rules are where regressions hide; the look is judged by eye.
2. **The look is verified by the contact sheet and screenshots.** The contact sheet gates the
   art (§F.1). Each wiring slice hands back screenshots: a building from outside (front and
   behind with the silhouette), a doorway from outside, and the same building from inside with
   the blackout.
3. **No live doorway walk is assumed.** The owner's running hub may build houses without door
   gaps, so a screenshot may force the inside state client-side (for example, setting the
   player's drawn position inside a building from the Browser pane's JavaScript tool, or a scene
   test that drives the state). No debug flag or URL switch ships.
4. **The agent never starts a backend.** Client-only checks in the Browser pane against a stack
   that is already running; otherwise the screenshots come from forced client state, and the
   issue says so.
5. **Review gate: `/code-review` is kept [charter default].** Reason: this is drawing logic and
   a new inside/outside state, not styling only.

## User Stories

1. As a player in the town, I want each building to look like a closed block from the street, so
   that the town reads as buildings and not as open dollhouses.
2. As a player, I want to walk through a door and have the room open up around me, so that
   entering a building feels like going inside.
3. As a player inside a building, I want everything outside to go dark, so that being indoors
   feels enclosed.
4. As a player, I want the change at the doorway to snap like a door shutting, so that the walls
   changing height never pop mid-fade.
5. As a player, I want to see where a building's door is from outside, as a dark opening, so
   that I know how to get in without seeing the room.
6. As a player walking behind a building, I want to see my character through it as a
   silhouette, so that I never lose myself without the building opening up.
7. As a player, I want roofs to stay solid when I stand near them, so that a house never turns
   see-through just because I walked past.
8. As a player, I want trees and tall props to keep fading when I am behind them, so that
   outdoor scenery behaves as it always has.
9. As a player in the street, I want the people inside a building hidden, so that a closed
   building looks closed.
10. As a player inside a building, I want no one outside to show, teammates included, so that the
    dark outside is truly dark.
11. As a player in the street, I want the Quartermaster's name and sigil to stay over his store,
    so that I can still find the shop.
12. As a player inside the Inn, I want the Quartermaster's marker hidden with the rest of the
    town, so that nothing floats in the dark.
13. As a delver in the Spire's halls, I want each room to be a closed stone block, so that I do
    not see what waits inside until I go in.
14. As a delver, I want monsters, chests and items inside a room hidden until I enter, so that a
    room is a place to discover.
15. As a delver inside a room, I want the halls and other rooms dark, so that the room I am in is
    my whole world until I step out.
16. As a delver, I want a closed or locked room door to look like a door, and an open one to show
    a dark opening, so that I can read which rooms I can walk into.
17. As a delver, I want a room's sconces to light only while I am in it, so that a closed room
    does not glow through its cap.
18. As a delver, I want outdoor lamps and hall sconces never to glow through the dark while I am
    in a room, so that the blackout holds.
19. As a delver, I want projectiles and effects from outside my room hidden, so that nothing
    leaks through the dark.
20. As a delver changing floors, I want the blackout gone and rebuilt with the new floor, so
    that I never arrive in the dark of the floor below.
21. As a player in the Spire on any floor band, I want the rooms capped the same way, so that the
    tower reads as one building type.
22. As the owner, I want to approve the new exterior art on a contact sheet before any scene
    uses it, so that I judge the look before it ships.
23. As the owner, I want the design guideline to say buildings are closed from outside, so that
    the art SSOT matches the canvas.
24. As a developer, I want one blackout module for both scenes, so that the geometry and depth
    are fixed in one place.
25. As a developer, I want the hide rule to be one pure function, so that "who is hidden" is
    tested once and cannot drift between scenes.
26. As a developer, I want exterior pieces cut on the same footprint as the cut-away pieces, so
    that swapping looks never moves a wall.
27. As a developer, I want a building to close even without art, so that a missing sheet never
    shows an open room or an invisible wall.
28. As a reviewer, I want screenshots of a building outside, behind and inside, so that I can
    verify the look without a live doorway walk.

## Acceptance Criteria

- [ ] From outside, a hub town building shows four full-height timber walls (south and east in
      `wall_exterior_*`) under its roof; the roof never fades; the door gap shows `door_dark_x`.
- [ ] From outside, a Spire room shows four full-height masonry walls (south and east in
      `tower_wall_exterior_*`) under `tower_cap`; the cap never fades; an open door shows
      `tower_door_dark_*`; a closed door shows the door as today.
- [ ] Inside a building, it draws as today's interior look: cut-away fronts, roof lifted or cap
      hidden, furnished and lit; every other building keeps its exterior.
- [ ] Entering or leaving swaps all looks, the blackout and the hide rule in the same frame
      (scene test).
- [ ] Inside any building, everything outside its blackout hole is `palette.inkDeep` at depth
      500, over the light-map and halos, under the vignette and markers, in both scenes.
- [ ] Inside a building, no body, name plate, HP bar, eyes, sigil, container, floor item,
      projectile or effect positioned outside it shows, teammates included.
- [ ] Outside, nothing positioned inside a building shows, except a function NPC's (and the
      stash chest's) name plate and sigil over a closed building.
- [ ] A function NPC's marker hides while the player is inside a different building.
- [ ] A building's own lights (wall flames, hearth, forge, sconces, interactable pools) are lit
      only while the player is inside it; outdoor lights never show through the blackout.
- [ ] Behind a building, the player shows as a dim tinted silhouette; no other character does;
      it hides the moment nothing covers the player.
- [ ] No piece of a building is in `Occluders`; trees, tall props, the perimeter and walls with
      no `house_id` still fade to `FADED_ALPHA`.
- [ ] `BarrowspireScene` has no `indoorMask` of its own: the shared blackout module is used by
      both scenes, and is torn down and rebuilt at the per-floor seam.
- [ ] Without art, a building still closes (placeholder full-height sides, slab top, flat dark
      opening).
- [ ] Every new sheet in §F is in `manifest.json` in one new group with an `authored:` source;
      exterior pieces declare no light and share the back pieces' heights, span and anchor
      (asserted in `manifest.test.ts`); the manifest diff is additive only.
- [ ] The owner has approved the contact sheet of the §F sheets before any scene wires them.
- [ ] The design guideline's occlusion rule is amended and a building-exterior section added
      (§F.6); nothing else in it changes.
- [ ] Unit tests cover the inside test, exterior and cap plans, door gaps, the hide and marker
      rules, the blackout geometry and the cover test.
- [ ] Screenshots: a hub building and a Spire room from outside, from behind (silhouette), at the
      doorway from outside, and from inside (blackout). Forced client state is acceptable.
- [ ] On Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in `game-client/`;
      `npm run bake -- --check` exits 0.
- [ ] `git diff -- game-server/` is empty.

## Edge States

- **Standing on the threshold:** the door gap is within the building rect, so the player there
  is inside. No hysteresis (§A.3); if flicker shows in review, a follow-up adds one.
- **Two rects containing one position** (adjacent rooms sharing a wall line): the first in
  `housesFrom` order is the player's building; collision normally keeps a player off the line.
- **A Spire room with more than one doorway:** each gap or open door gets its dark opening; the
  blackout hole is the room rect regardless of how many doors it has.
- **A room touching the perimeter wall:** the perimeter is outside the room and goes dark. The
  24 px headroom band over the back walls may show the top of the perimeter or scenery behind;
  accepted (architecture, never an entity: the hide rule hides every entity there).
- **A locked Spire room:** from outside, a closed door as today; the blackout applies only once
  the player is inside.
- **A door that opens or closes while the player is outside:** the dark opening and the door
  frame swap on the state change, as the door's frame does today.
- **A hub building with no door gap** (the owner's running hub may build them so): no dark
  opening is drawn; the building is still closed. The player cannot enter it, so its interior
  look is only reachable by forced state in verification.
- **An entity crossing the doorway:** it hides or shows the frame its eased position crosses the
  building edge, from either side.
- **A projectile fired from inside to outside** (or the reverse): shown while inside the player's
  building, hidden once outside it.
- **Teleports and respawns** that put the player inside or outside a building: the next frame's
  inside test decides; no state survives from before.
- **Player not yet spawned or gone** (death, extraction, scene shutdown): no building is the
  player's; the blackout is off and every building shows its exterior. The silhouette is hidden.
- **Floor change in the Spire:** the blackout clears at `leaveFloor` and the new floor starts
  with the player outside every room until the inside test says otherwise.
- **Tall back-wall dressing** (sconces, banners) poking above `WALL_HEIGHT` inside: kept clear by
  the 24 px headroom when inside; covered by the cap, and its light off, when outside.
- **Missing sheets:** placeholders per §B.7; a warning once per missing sheet, as the hub does
  for indoor dressing.
- **Function NPC standing in the doorway:** inside the building by the inside test, so his
  marker follows §C.5 and his body follows the rule.
- **The exterior run theme** (unused): it shares the timber pieces and the shared blackout, so it
  inherits closed houses if revived; it is not separately verified (Out of Scope).

## Out of Scope

- **Any server, proto, wire or game-rule change.** Visibility on the server, interest
  management, collision, door rules: untouched. game-client only.
- **Silhouettes for anyone but the player** (party, other players, NPCs).
- **A cross-fade or animation at the doorway**, and a threshold hysteresis unless review finds
  flicker.
- **Per-floor-band caps** or per-building exterior variety beyond the variant tables.
- **The exterior run theme** beyond what it gets for free from the shared timber pieces and the
  shared blackout. Not verified, not tuned.
- **Fields and the forest** (no buildings), the hub's Spire facade (a prop, not a building with
  walls), the tower perimeter's own look.
- **Any design guideline change** other than the occlusion rule and the new building-exterior
  section.
- **A debug flag or URL switch** to force the inside state in production code.
- **New colour tokens.** Canvas tokens only (ADR-0013).
- **Sourced or stock art.** Everything is authored in code and baked through the existing tool.
