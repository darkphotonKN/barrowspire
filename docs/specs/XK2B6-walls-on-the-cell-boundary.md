# FS-XK2B6: Walls on the cell boundary

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Walls on the cell boundary → FS-XK2B6`: [FS-KE075](KE075-floor-1-dungeon.md) (§H.44 ground, §H.46 wall runs and heights, §H.47 wall lights and dressing), [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (§C.13 the fog's wall slabs and posts) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art; draw order by footprint), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (the floor map, unchanged), [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) and [ADR-0068](../adr/0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md) (fog), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (masks only through `maskInView`), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only) · Followed by: FS-V8FT3 (wall shadows, on branch `feat/world-wall-shadow-layer`; rebuilt on this, see §I) · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Wall edge**, **Void**, **Region**, **Wall piece**, **Occluder**

> Promoted `--from-thread` on 2026-11-11 from the locked scoping notes: the owner's approved
> charter "牆畫在格子交界" ("好 核准"). Requirements marked **(charter default)** are that charter's,
> each with its reason. Those marked **(spec)** fill an acceptance-level gap the charter left, and
> are this spec's own. Three consequences the charter told this spec to report and not decide are
> in *Open to the owner*; the requirements follow the charter's words until the owner rules.
> Recorded without adversarial review: no `challenge-me` pass. Code citations are against the
> working tree at `a427b0c3`.

## Summary

On a dungeon floor a wall is a whole 80 px cell to walk into, but it is drawn as a thin wall
through that cell's middle. So a body stops about 36 px short of the wall it sees, a doorway that
is 80 px to walk through looks about 160 px wide, and players miss it and hit what looks like
floor (owner, playtest 2026-11-11: "感覺還離牆面有一些距離就碰撞了").

Each wall is now drawn on the edge between its wall cell and the walkable cell it faces, so the
walls trace the outline of where a body can go. A doorway looks 80 px wide and a corridor looks as
wide as it is. Past the wall there is no floor, only the void's ink. The fog, the wall lights and
everything else placed by a wall follow it. Collision does not change: only where the client
draws.

## Bounds

Issues under this FS may change game-client only: how a dungeon floor's walls, fog, ground, wall
lights and dressing are drawn, their tests, and `game-client/CONTEXT.md`.

They may **not** touch `game-server/`, proto, the gateway, the bake models (`tools/bake`) or the
baked atlases (`public/art`), or the existing text of a shipped FS. A slice that finds one of
these unavoidable stops and escalates.

## Facts this spec rests on

Read 2026-11-11; client paths under `game-client/src/`.

- **Collision is the cell.** A wall cell is a non-walkable cell 8-adjacent to a walkable one, and
  the map's walls cover every one (FS-KE075 R7). A body is a circle of radius 20
  (`PlayerRadius`), so its centre stops 20 px from a wall cell's edge.
- **Where walls are drawn today.** `wallRuns` (`render/world/dungeon.ts`) turns the map's walls
  into runs one cell thick, from the wall cells and the faces they show, never from the server's
  row-merged rects. `planWalls` (`render/world/walls.ts`) cuts each run into pieces along its
  rect's centreline, the middle of the cell, and stands a post at each end, a corner cell's
  centre. `wallRule` gives each piece its height by the cell the piece's own position lies in.
- **The pieces.** One piece is one 40 px tile long, its origin the centre of its footprint. A cell
  is 80 px, so a cell edge is two pieces. A dungeon floor draws the tower's masonry
  (`MASONRY_WALLS`): 0.24 tile thick, 9.6 px, with a post 0.24 tile square
  (`tools/bake/page/models/tower.js` `P_THICK`). The timber wall is 0.18 tile, 7.2 px, the
  charter's "about 7 px". A front wall is 1.1 tiles tall and a back wall 3.6 (`BAKE`), about 43 and
  141 screen px.
- **The sample floor** (`render/world/dungeon.fixture.json`, 72 × 48 cells): 745 wall cells, 650
  of them with a walkable cell directly north, south, west or east. Those 650 show 766 wall edges:
  195 on their north side, 195 south, 188 west, 188 east. 113 cells carry more than one edge. 7
  have walkable cells on opposite sides, all north and south. 58 carry both an edge that is front
  and an edge that is back by R9. No walkable cell faces anything but a wall cell, none lies on
  the grid's edge ring (FS-KE075 §A), and no two walkable cells touch only by a corner.
- **The screen.** A floor point `d` px straight behind a wall, on the same screen column, is
  `0.8 · d` screen px above the wall's foot (`render/iso/projection.ts`). So a 43 px front wall
  covers the floor up to 54 px behind its outer face, and a 141 px back wall up to 176 px.
- **Draw order.** An object sorts by `x + y` of its footprint (ADR-0020 Decision 7, `depthKey`). A wall
  piece sorts by the back corner of its footprint (`WallPiece.depthAt`), a body by its centre.
- **The fog** (`render/world/fog.ts`) cuts the screen into strips half a diamond wide. In a strip
  each cell has one half, and each half's top is a line of one of the floor's two slopes
  (`halfOf`, `topOf`). Today a drawn wall is a slab through the cell's centre, half of it on each
  half, and a post stands at the centre (`wallLayout`). A cell's north and east edges are the two
  outer sides of its right half, its west and south edges those of its left half, and every cell
  corner lies on a strip's side, as a cell's centre does.
- **Ground.** `GroundLayer` paints a ground piece when the point it is placed by passes
  `RegionGrid.hasGround`: a walkable cell or one 8-adjacent to it (FS-KE075 §H.44). The scene's
  placeholder stone uses the same test.
- **Dressing** keeps 24 px off every wall rect of the map (`KEEP_OUT.wall`,
  `render/world/runDressing.ts`), and stands only on a room's own cells (`dressingRooms`). The
  map's rects are the cells, so that distance is already measured from the cell's edge.
- **A wall light** is carried by its piece's sheet and takes the region of the walkable cell
  nearest it (`regionAt`, `render/world/exploration.ts`).
- **The corner fix** this branch stands on (`fix/run-wall-corner-stubs`): a run reaches one cell
  into the wall it meets, so a piece past the post at the corner cell's centre stuck out;
  `PieceRule.betweenPosts` and `withinPosts` drop those pieces, `wallLayout` drops their slabs,
  and the scene's placeholder blocks follow.

## Requirements

### §A. Where a dungeon floor's walls stand

1. **On the wall edge (charter default).** A wall is drawn on each **wall edge**: the side a wall
   cell shares with a walkable cell directly north, south, west or east of it. A room's north wall
   stands on the room's north edge, its south wall on its south edge, west on west, east on east.
   Reason: every wall moves towards the region it bounds and none moves away from one, so the
   place a body stops and the wall it sees agree.
2. **Face on the edge, thickness behind it (charter default).** The wall's face towards the
   walkable cell stands on the edge; its thickness lies on the wall cell's side. **(spec)** So a
   piece's centre is half the wall's thickness inside its wall cell: 4.8 px for the tower's
   masonry. Each material's thickness is written once on the client, beside its sheets, with the
   bake model's number it mirrors; no other source holds it.
3. **Edge runs (spec).** A straight line of wall edges facing the same way, one after another, is
   one **edge run**. Its pieces lie end to end from the cell corner where it starts to the cell
   corner where it ends: two pieces per cell, a whole number, none trimmed. A run of one cell is a
   run like any other. Runs still come from the wall cells and the sides they show, never from the
   server's rects (FS-KE075 §H.46, kept). Reason: a run then ends exactly where the outline of the
   walkable area turns.
4. **Corners at cell corners (charter default).** Where the outline turns, two runs meet at a cell
   corner. **(spec)** One post stands there, where the two walls' thicknesses cross: the cell
   corner, set half a thickness to the wall side along each axis. It is as tall as the tallest
   wall that ends at it, as `planWalls` posts are today. Every end of every run has a post.
5. **A doorway is as wide as it is to walk through (charter default).** The two walls either side
   of a doorway end 80 px apart, and a corridor's two walls face each other across exactly its
   walkable width.
6. **Several edges on one cell (charter default).** A wall cell with walkable cells on two
   opposite sides gets a wall on each of those edges. **(spec)** The same holds for any wall cell
   that shows more than one edge: one wall per edge, up to four.
7. **Nothing through the middle (charter default).** Inside a wall cell nothing is drawn but the
   walls on its edges and the posts at its corners. Its middle is void in v1: no new art and no
   baked wall top. A wall cell with no walkable cell directly beside it (a corner's cell) carries
   no wall. Reason: the owner will look at it before any art is made.

### §B. Heights

8. **By edge (charter default).** An edge that bounds its region on the region's south or east
   side is **front** (cut away, low). Any other edge is **back** (full height). Every edge of one
   run faces the same way, so a run is one height.
9. **Never by the cell under the piece (spec).** A piece's height, whether it may carry a light,
   and its post's height are decided by the edge the piece stands on. Reason: 58 cells of the
   sample floor carry a front edge and a back edge at once, so the cell cannot answer.
10. **Occluders as today (charter default).** A back piece and a back post fade over the local
    player by the occluder rule. A front piece never does.
11. **This replaces the per-cell rule.** FS-KE075 §H.46's "where a wall borders walkable cells on
    both sides, front wins" no longer applies: by the charter's words each edge takes its own
    height. What that hides is *Open to the owner* E1.

### §C. Draw order

12. **By footprint, as today (spec).** A piece sorts by the back corner of its footprint, which
    now lies on the wall edge, and a post by its own place (ADR-0020 Decision 7). No new sort rule is
    added in v1. What that does to a body pressed against a front wall is *Open to the owner* E3.

### §D. Wall lights, dressing, and what else is placed by a wall

13. **Wall lights follow (charter default).** A piece that carries a light carries it to the edge.
    **(spec)** Only a back edge facing a room may hold a lit kind, at today's shares
    (FS-KE075 §H.47); every other edge draws the plain kind in its place. The light belongs to the
    region its edge faces. Which pieces of a wall are lit may differ from today, since a piece's
    kind is hashed from where it stands.
14. **Dressing keeps its distance (charter default).** Run dressing still keeps 24 px off every
    wall cell and stands only on a room's own cells. **(spec)** That distance is now from the wall
    the player sees. The dressing planned for a floor and seed is the same before and after this
    change, piece for piece.
15. **Everything else placed by a wall follows (charter default).** A piece and a post join the
    ground chunk they stand in (FS-KE075 §H.45) and take their fog tint (FS-SRA9J §C.11) from
    where they now stand.

### §E. Ground

16. **Only where a body can walk (charter default).** On a dungeon floor ground is painted under
    walkable cells only. **(spec)** A ground piece is painted when the point it is placed by lies
    on a walkable cell, the test §H.44 uses today with the shell left out. The placeholder stone
    follows the same test. A ground chunk no walkable cell falls in has no render texture.
17. **Outside the wall is void (charter default).** What is left of a wall cell beyond its walls
    shows the canvas's darkest ink (`palette.inkDeep`), as the void does.

### §F. Fog

18. **The fog's walls stand where the drawn walls stand (charter default).** The fog leaves clear
    a slab over each wall edge, raised to that edge's height plus `FOG.headroom`, and a post at
    each corner where a run ends, raised to its height plus `FOG.post`. No slab stands through a
    cell's middle and no post at a cell's centre. This replaces "the wall on its cell's
    centreline" in FS-SRA9J §C.13.
19. **A wall cell is still not veiled (spec).** As today the fog lays no veil over a wall cell
    that borders a region, so a wall's thickness and foot are never covered. With no ground under
    it, what shows there is the void's ink.
20. **The rest of the fog is unchanged (spec).** One veil per screen px, the soft edges, the
    fades, the head clearance over a visible region's floor, and the tint rule: a wall piece shows
    the brightest state of the regions its wall cell borders (FS-SRA9J §C.11, §C.13, §C.26,
    §C.27). The fog is still painted into canvas textures; no mask is added.

### §G. What this covers

21. **Every dungeon floor (charter default).** Since FS-M8CSE every Spire floor is one.
22. **Nothing else, to the pixel (charter default).** The village, a fallback floor of buildings
    and the field worlds draw exactly as today. **(spec)** A wall with no piece rule is still cut
    along its rect's centreline by `planWalls`; no test of a building's, the village's or a
    field's drawing is edited by this FS.
23. **No new art (charter default).** No sheet is added or re-baked, and `npm run bake -- --check`
    passes untouched.
24. **Nothing on the server (charter default).** Collision, the floor map on the wire, monster
    pathing and everything else in `game-server/` are unchanged.

### §H. The corner fix this stands on

25. **What stays (charter default).** Nothing sticks out of a corner. It now holds by how a run is
    cut: a run ends at the cell corner where its post stands, so there is no piece past a post.
    Runs still come from wall cells and their faces, never the server's rects.
26. **What goes (charter default).** On a dungeon floor these rules of FS-KE075 §H.46 no longer
    apply: a run reaching one cell into the wall it meets, a corner's cell being in both its runs,
    the post at a corner cell's centre, runs of one cell being dropped, and a wall cell no run
    reaches standing alone as a one-cell wall. **(spec)** With nothing left to drop,
    `PieceRule.betweenPosts`, `withinPosts`, the scene's placeholder filter and the fog layout's
    "half past the post" rule are removed with their tests, not left unused.

### §I. For what is built on this

27. **The wall plan is data (spec).** The plan a dungeon floor's walls are drawn from can be read
    without drawing anything: each edge run with the line it stands on, its two ends, the side its
    wall cells lie on, its height and its thickness; each post with its place and height. Reason:
    the fog reads it here, and FS-V8FT3 will cast its shadows from each run's foot.

## Open to the owner

The charter told this spec to report these and not decide them. The requirements above follow the
charter's words; each answer below would change one requirement.

- **E1. Full walls where today front wins.** On the 58 cells of the sample floor that carry a
  front edge and a back edge, R8 stands a full-height wall one cell in front of a region: beside a
  corridor that runs along a room (the 7 two-sided cells) and at the 51 corners where the outline
  steps. In the two-sided case a body standing in the corridor, against its own low wall, is
  covered by the room's full wall from the feet up to about 61 px of its 93; at a step, about half
  a body's width is covered. The local player fades the wall; a teammate or a monster is hidden.
  Today that cell is low on purpose, "so nothing in play is hidden" (FS-KE075 §H.46). The other
  reading keeps that: a back edge on a wall cell that also has a walkable cell north or west of
  it is drawn low.
- **E2. A front wall covers the floor behind it.** A cut-away wall on a region's south or east
  edge covers the floor up to about 44 px in from that edge, where today it covers about 9. A body
  pressed against it loses about 19 px of its feet, and a drop pile lying within that strip is
  partly or wholly behind the wall. This is what a cut-away wall on the edge looks like; the
  question is whether it is accepted.
- **E3. A body against a front wall, and which draws over which.** A body pressed against a
  region's south wall sorts after the piece beside it once it is more than 20 px along that piece
  (and the same against an east wall), so it is drawn over a wall that stands in front of it. The
  comparison is the same today, but the wall is 40 px away and nothing shows. Sorting an edge
  piece by its footprint's front corner would put every such body behind the wall, at the cost of
  E2's 19 px.

## User Stories

1. As a delver, I want to stop at the wall I see, so that I do not bump into floor.
2. As a delver, I want a doorway to look as wide as it is, so that I walk through it without
   lining up.
3. As a delver, I want a corridor to look as wide as it is, so that I can tell whether two of us
   fit.
4. As a delver, I want walls to meet cleanly at corners, so that the room reads as one shape.
5. As a delver, I want no floor beyond a wall, so that I do not take it for somewhere to go.
6. As a delver, I want the far wall of a room at full height and the near wall cut away, so that I
   see into the room I stand in as before.
7. As a delver walking behind a full wall, I want it to fade over me, so that I never lose myself.
8. As a delver, I want the fog to end at the walls I see, so that no veil hangs off a wall or
   leaves a strip of lit floor behind one.
9. As a delver, I want a visible room's walls drawn whole, so that the room I am in is complete.
10. As a delver, I want sconces on the walls where the walls now stand, so that the light comes
    from the wall.
11. As a delver, I want rubble and braziers still clear of the walls, so that nothing stands in a
    wall.
12. As a delver in a corridor beside a room, I want a wall on my side and a wall on the room's
    side, so that both read as closed.
13. As a delver in the village, a field or a floor of buildings, I want nothing to change, so that
    this is only about dungeon floors.
14. As a party member, I want every member to see the same walls and dressing, so that we talk
    about the same room.
15. As the owner, I want the cell between a corridor and a room left as plain void first, so that
    I can judge it before any art is made.
16. As the owner, I want each wall's height decided by the side of the region it stands on, so
    that I can see what that hides and rule on it.
17. As the owner, I want collision, the map and monster paths untouched, so that this is a drawing
    change I can take back.
18. As a developer of wall shadows, I want each run's foot as data, so that a shadow starts where
    the wall stands.
19. As a developer, I want one rule for where a run ends, so that no corner needs a fix of its own.

## Acceptance Criteria

The wall plan, on the sample floor (`dungeon.fixture.json`):

- [ ] The plan holds exactly the 766 wall edges: one for every wall cell and walkable cell that
      share a side, and none anywhere else.
- [ ] Every edge is in exactly one run; every run is a whole number of cells long, lies on one
      cell line, and all its edges face the same way.
- [ ] Every run is cut into two pieces per cell, each whole (`keep` 1); no piece lies past a run's
      end and no two pieces of the floor share a place.
- [ ] Every piece's centre is half its material's thickness from its edge, on the wall cell's
      side; none is on a cell's centreline.
- [ ] A post stands at each end of every run, one per corner however many runs meet there, half a
      thickness to the wall side of the cell corner on each axis.
- [ ] A post is back when any run ending at it is back, front otherwise.
- [ ] A run whose wall cells lie south or east of the cells it faces is front; any other is back.
      A wall cell with walkable cells north and south carries a front wall on its north edge and a
      back wall on its south edge.
- [ ] Either side of every doorway, the two runs end 80 px apart; across every corridor cell the
      two facing walls are the corridor's walkable width apart.
- [ ] A wall cell with no walkable cell directly beside it has no piece.
- [ ] The plan is the same for the map's walls merged row by row and merged any other way.
- [ ] Each run can be read as data: its line, its two ends, its wall cells' side, its height, its
      thickness.

Drawing:

- [ ] A dungeon floor's baked pieces and posts stand where the plan says, back pieces and back
      posts among the occluders, each in its ground chunk.
- [ ] Without the wall art, the placeholder blocks stand on the same edges at the same thickness
      and heights.
- [ ] A lit kind appears only on a back run facing a room; its light is queued at the piece's new
      place and belongs to the region the run faces.
- [ ] `betweenPosts` and `withinPosts` are gone from the source and the tests.
- [ ] The dressing planned for the sample floor is identical before and after, and no dressing
      footprint comes within 24 px of a drawn wall's face.

Ground:

- [ ] On the sample floor a ground piece is planned for every tile of every walkable cell and for
      no tile of a wall cell or the void.
- [ ] A ground chunk with no walkable cell in it has no render texture.
- [ ] Without the ground art, the placeholder stone lies under walkable cells only.

Fog:

- [ ] `wallLayout` gives a slab for every wall edge of the plan and a post for every post of the
      plan, and nothing else.
- [ ] With every region unexplored, no fog px lies over any drawn piece or post of the sample
      floor, from its foot to its top.
- [ ] No two fog shapes overlap (the existing partition test).
- [ ] With one region visible, every other region's cell middle is fogged, behind a drawn wall's
      slab, or where a member's head could be (FS-SRA9J's existing test, every region in turn).
- [ ] A wall piece's tint is that of the brightest region its wall cell borders.

Unchanged:

- [ ] No test file of the hub, a field world, a building or the perimeter is edited, and all pass.
- [ ] `git diff` over `game-server/`, `tools/bake/` and `public/art/` is empty.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and `npm run lint` in game-client pass.

By eye (owner, browser):

- [ ] Walking into a north, south, west and east wall of a room, the body stops at the wall.
- [ ] A doorway looks one cell wide, and walking straight at it goes through.
- [ ] Corners close with one post and nothing sticking out, on outer and inner corners.
- [ ] Past every wall is ink: no floor strip, no lit patch, no fog hanging off a wall.
- [ ] Entering a room, its walls stand whole and the next room's fog ends at its own walls.
- [ ] The cell between a corridor and the room it runs beside (E1): the owner's ruling.
- [ ] Standing against a south and an east wall (E2, E3): the owner's ruling.
- [ ] The village, a field and the Inn look as before.

## Edge States

- **A cell with several edges.** Each edge is in its own run; the walls on two adjacent edges meet
  at the cell's corner under one post; walls on opposite edges do not touch.
- **A front and a back wall on one cell.** Each keeps its own height (R9). Their shared post, if
  any, is back.
- **A wall cell between two regions under different fog.** Both its walls take the brighter
  region's tint, as its one wall does today (FS-SRA9J §C.11). The darker region's wall is then
  lighter than its floor.
- **Walkable cells touching only by a corner.** Four runs end at that point, two from each side,
  under one post. A body cannot pass. The sample floor has none.
- **A walkable cell beside something that is not a wall cell.** No edge, so no wall, as today. The
  generator leaves none (FS-KE075 §A).
- **A run of one cell.** Two pieces between two posts.
- **A ground piece wider than a tile.** It is painted when its point is on a walkable cell, so one
  near a wall may reach past the edge, as one near the shell's edge reaches into the void today.
  The owner's browser check looks for it.
- **A wall light on a wall with nothing behind it.** Its pool falls on the void's ink.
- **A piece kind that stands out from the wall** (a pillar's pier, a sconce). It reaches a few px
  over the walkable cell, above the floor. It does not collide.
- **Walls and fog built by different slices.** Between the wall slice and the fog slice the fog's
  slabs still stand on centrelines, so fog shows 40 px off each wall. Between the wall slice and
  the ground slice a strip of floor shows beyond each wall. None of that ships: the three merge
  together.
- **A floor of buildings.** Built only when dungeon generation fails twice; it has no regions, so
  none of this applies.
- **A map that changes floor.** The plan is made once per floor from that floor's map, as walls
  are today (FS-KE075 §H.43).

## Out of Scope

- Collision, wall cells, the floor map, monster pathing, anything in `game-server/`.
- New or re-baked art: a wall top, a thick wall, a filled cell between a corridor and a room.
- A new draw-order rule, or a different height rule for a cell with several edges (E1, E3), until
  the owner rules.
- Wall shadows (FS-V8FT3).
- The minimap, which draws regions and no walls.
- Buildings, the village, field worlds, the perimeter wall.
- Any ADR. The draw-order rule (ADR-0020 Decision 7) is kept; if E3 is answered with a new sort point for
  edge pieces, that answer may want one.
