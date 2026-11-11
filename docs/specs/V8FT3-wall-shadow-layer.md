# FS-V8FT3: Wall shadow layer

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Wall shadow layer → FS-V8FT3`: [FS-2325V](2325V-pre-rendered-isometric-art.md) (timber wall pieces and posts, the bake's shadow catcher, the painted ground), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (masonry partition walls and posts), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (exterior wall pieces, door heads, the two looks), [FS-KE075](KE075-floor-1-dungeon.md) (a dungeon floor's wall runs and chunked ground) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art; the bake's light), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art authored in code), [ADR-0036](../adr/0036-buildings-have-an-exterior-and-an-interior.md) (two looks per building), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (Phaser 4; masks only through `maskInView`), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colour by token: see R14), [ADR-0074](../adr/0074-a-dungeon-wall-on-a-cell-edge-sorts-by-the-corner-of-its-footprint-away-from-the-cells-it-faces.md) (a dungeon piece's `depthAt` is not its back corner) · Builds on: [FS-XK2B6](XK2B6-walls-on-the-cell-boundary.md) (a dungeon floor's walls on the cell boundary; its §I.27 wall plan is what a dungeon floor casts from) · Vocabulary: **wall foot** ([`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Wall foot", added 2026-11-12: what R13 calls a wall's foot, never its footprint); *wall run* is, on a dungeon floor, an **edge run** ("Wall edge"), and elsewhere a wall as `planWalls` cuts it

> Promoted `--from-thread` on 2026-11-11 from the locked scoping notes: the owner's approved
> charter "牆影不疊深". Requirements marked **(charter default)** are that charter's, each with its
> reason. Those marked **(spec)** fill an acceptance-level gap the charter left, and are this spec's
> own; the ones the owner should look at are listed under "Left to the owner". Not challenged:
> client presentation only, and the owner sees it in the browser before it ships. Code citations
> are against the working tree at `ccea4130`.
>
> **Respecced 2026-11-12** (`write-a-spec`, no interview; the owner said "好" to resuming it) onto
> [FS-XK2B6](XK2B6-walls-on-the-cell-boundary.md), walls on the cell boundary, which landed on
> main with ADR-0074 while slices 2–4 were held. What changed: a dungeon floor's walls are the
> edge runs and posts of `wallPlan`, so a run's foot is the strip from its edge to one thickness on
> its wall cells' side (R13, R15, R16); a dungeon floor's ground lies under walkable cells only, so
> a shadow shows only where it falls into a walkable cell (R23), and a north or an east wall's
> shadow falls behind the wall, where almost none of it is left (Facts, Edge States); a wall's
> thickness has one client source (R12, R13). The building rules (§F), the art (§B) and the paint
> rules (§E R19–R22, R24) are unchanged. Code citations in the text changed by this respec are
> against `75756076`.

## Summary

Along the tower's walls the floor shows rows of dark diagonal lines (owner, playtest 2026-11-11).
Every wall piece carries its own baked ground shadow, neighbouring pieces overlap by a hair, and
where two shadows overlap the floor is darkened twice. Walls keep their shadows, but the client now
draws them: one shadow per wall run, all of them flattened into one layer that darkens the ground
exactly once, however many shadows cross. This holds for the dungeon's masonry walls, the timber
walls of village and run houses, building exteriors, and their corner posts.

## Bounds

Issues under this FS may change:

- game-client wall and ground drawing (`src/render/world`, the wall and ground wiring in
  `src/scenes/BarrowspireScene.ts` and `src/scenes/HubScene.ts`), and their tests;
- `game-client/tools/bake`: the wall-piece models, the catalogue entries of the sheets R4 and R5
  name, and one dependency-free module for the facts of R12 and R13;
- the baked output in `game-client/public/art` for the atlas groups R8 names;
- `game-client/docs/design-guideline.md` (R9).

They may **not**: touch `game-server/`, proto, api-gateway, OpenAPI or the generated client; change
the light's direction or strength; change any sheet R4 and R5 do not name; edit the existing text
of a shipped FS. A slice that finds one of these unavoidable stops and escalates.

## Facts this spec rests on

- **The cause.** `bakeProps` (`tools/bake/page/baker.js`) renders every prop sheet over a
  `ShadowMaterial({ opacity: 0.5 })` catcher unless the sheet says `shadow: false`. A wall piece is
  `LENGTH = 1.024` tile long (`models/architecture.js`, `models/tower.js`, `models/building.js`) and
  stands one tile from its neighbour, so two pieces' shadows overlap along every joint and the
  overlap is drawn at 50% twice. The outer wall already casts nothing long (`contactShadowOnly`,
  `models/tower.js`: "a run of tall pieces would stack their shadows into stripes across the
  floor").
- **The light.** `LIGHT_DIR = (-1, 2.83, 1)`, normalised, in three.js axes (+x is world x, +z is
  world y, +y is up). A point h tiles above the ground shadows h / 2.83 tiles toward world +x and
  h / 2.83 tiles toward world -y (`shadowOf`), which is due screen-right. A back wall
  (`WALL_BACK = 3.6`) casts about 51 world px each way, 81 screen px; a front wall
  (`WALL_FRONT = 1.1`) about 15.5 world px, 25 screen px.
- **What the client can read.** `src/render/world/bake.ts` mirrors `projection.js`,
  `dimensions.js` and, since slice 1, `shadow.js`, which holds the key light, the catcher's colour
  and opacity, each material's wall foot (`WALL_FOOT`) and the post's (`POST_FOOT`); `bake.test.ts`
  imports all three and fails on drift. All three are dependency-free; `baker.js` and the three
  wall models read `shadow.js`. A material's sheets name their `BAKE.WALL_FOOT` entry
  (`WallSheets.thickness`, `thicknessPx`): the one number the client holds for a wall's thickness,
  read alike by a dungeon floor's wall plan, its pieces and posts, the fog's slabs and the shadow
  feet. (Before slice 1 the light was a private constant of `baker.js` and each thickness of its
  model file.)
- **Two ways to drop a shadow in the bake.** A sheet with `shadow: false` hides the catcher and is
  framed by its models alone; its parts still shade one another. A mesh with `userData.noShadow`
  casts on nothing, its own piece's faces included (`prep`).
- **Frames.** A tower piece and an exterior piece carry the timber piece as an invisible frame
  guide, so their frame and anchor equal the timber piece's (FS-8RBQY, FS-9PN7X §F). The anchor is
  the model's origin, so a piece stands on the same screen px whatever its frame.
- **Sheets by atlas group** (`catalogue.js`): `architecture` holds `wall_{back,front}_*`,
  `post_{back,front}` and the roof pieces; `tower` holds `tower_wall_*`, `tower_post_*`, the tower
  ground, the perimeter, the dressing and the stairs; `building` holds `wall_exterior_*`,
  `tower_wall_exterior_*`, the four door heads, `tower_cap` and the gables.
- **Where walls are drawn.** `planWalls` (`walls.ts`) cuts a wall into pieces along its rect's
  centreline and stands a post at each end; `addWalls` and `addBuildings` (`scene.ts`) place them.
  A dungeon floor's walls stand on its wall edges (FS-XK2B6): `wallPlan(walls, grid, thicknessPx)`
  (`dungeon.ts`) gives its edge runs, each with its line, two ends (cell corners), wall side,
  height and thickness, one height a run (`edgeHeight`), and a post at every corner a run ends at,
  set half a thickness to the wall side where the walls' thicknesses cross; `dungeonWalls` cuts
  each run into whole pieces, two per cell, each piece's centre half a thickness into its wall
  cell, so its face stands on the edge. A dungeon piece's `depthAt` is not always its back corner
  (ADR-0074): its footprint is `at`, `axis`, `keep` and the thickness. A village building, and a
  room on a floor of buildings, is drawn in two looks
  (`planBuildings`, `buildingLooks.ts`): south and east walls full height from outside, cut away
  from inside. The Inn's partition is low masonry (`INTERIOR_PARTITION`). A wall of no house is
  drawn full height.
- **The ground.** `GroundLayer` (`scene.ts`) paints into render textures once and skips a paint
  asked again with the same houses, look and seed. A dungeon floor's ground is 512 px chunks, a
  chunk's texture made only when a tile falls in it (FS-KE075 §H.44), and a ground piece is laid
  only when the point it is placed by lies on a walkable cell (FS-XK2B6 §E): 65 of the sample
  floor's 128 chunks have a texture (71 while the shell had ground). A wall cell beyond its walls
  and the void are the camera's background, `palette.inkDeep`. A piece near a wall may reach a few
  px past the edge (FS-XK2B6 Edge States). The hub's ground is one texture. A run's walls come once
  per floor, from the floor map (FS-KE075 §H.43); each dungeon floor gets a new `GroundLayer`
  (`fitFloor` refits on a new cell grid).
- **The engine allows the flattening.** Phaser 4.2.1 `DynamicTexture.draw(entries, x, y, alpha)`:
  "The `alpha` and `tint` values are only used by Texture Frames. Game Objects use their own alpha".
  `stamp(key, frame, x, y, { alpha })` draws one texture frame at one alpha, and `erase` cuts a
  shape out (`GroundLayer.fadeEdge` uses it). So shapes drawn opaque into a scratch texture, then
  that texture drawn once into the ground at 50%, darken each px once. No mask is needed. Read
  again in the installed 4.2.1 on 2026-11-12: `stamp` pushes one command carrying its `alpha`
  (default 1) and `blendMode` (default 0, normal), and both the WebGL handler
  (`DynamicTextureHandler`) and the canvas path draw the frame at that alpha.
  `TextureManager.addDynamicTexture(key, width, height, forceEven)` makes a scratch texture; its
  `destroy` frees the key. A target reads what a command draws when its own `render()` runs, so a
  scratch goes only after the ground has rendered.
- **Where a dungeon wall's shadow falls.** The light throws toward world +x and −y. A back wall on
  a room's west edge casts 50.9 px east across the room's floor; a cut-away wall on its south edge
  15.5 px north into the room. A north wall's thickness lies north of the room's edge and its
  shadow falls further north, at most 60.5 px (50.9 + the 9.6 px thickness) into an 80 px wall
  cell; an east wall's lies east and casts further east, 25.1 px. Both land on their own wall
  cells and the void, so in front of them a room's floor shows nothing. Only past a run's end can
  one reach walkable floor: where the outline steps, the north wall's shadow runs 50.9 px past its
  east end onto the cell beside it, which the shadow of the step's own west-facing wall already
  covers. A post's shadow lies within its walls'.
- **What is seen when.** From outside, a building's roof or cap covers its footprint and never
  fades (FS-9PN7X §B); from inside, the blackout covers everything outside the building (§D.1). A
  dungeon floor has no buildings (FS-KE075 §H.47).
- **Colour.** The catcher is three.js's default `ShadowMaterial` colour, black. `BARROW` has no
  black: its darkest is `pitch` `#100c0a`.

## Requirements

### A. What casts

1. **In scope (charter default).** The tower's masonry walls (a dungeon floor's walls, the rooms of
   a floor of buildings, the Inn's partition), the timber walls of village and run houses, building
   exterior walls, walls of no house, and the corner posts of all of these. Reason: the owner
   widened it from the tower to the village ("不只塔的 村莊的也要調整").
2. **By its own height (charter default).** A full-height (back) wall casts as a wall `WALL_BACK`
   tall, a cut-away (front) wall as one `WALL_FRONT` tall, a post as tall as the sheet it is drawn
   with. Reason: the shadow must belong to the wall the player sees. **(spec)** The coping above
   the wall top (0.1 tile) is not added: about 2 screen px.
3. **Everything else keeps its baked shadow (charter default).** Roofs, caps and gables (which have
   none), door leaves, props, furnishings, chests, characters and monsters; the tower's outer
   wall keeps its contact shadow. **(spec)** Where one of those baked shadows lies on a wall's
   shadow the two still add, as they do today; this FS removes the darkening between walls only.

### B. Wall art (bake)

4. **No baked ground shadow (charter default).** These sheets are baked with no ground shadow:
   `wall_{back,front}_{plain,brace,window,torch}_{x,y}`, `post_{back,front}`;
   `tower_wall_back_*`, `tower_wall_front_*`, `tower_post_{back,front}`;
   `wall_exterior_{plain,brace,window}_{x,y}`, `tower_wall_exterior_{plain,pillar}_{x,y}`.
   Reason: a shadow in the sprite is drawn again by every neighbour.
5. **Door heads too (spec).** `door_head_{x,y}` and `tower_door_head_{x,y}` are baked with no
   ground shadow. Reason: a head is the exterior wall carried over a door gap (FS-9PN7X §F), and
   a head with a baked shadow would lie over the wall shadows either side of it.
6. **Only the ground shadow goes (spec).** A piece's own faces look as they do today: its parts
   still shade one another (the coping on the face, a sconce on the stone). So the sheet is baked
   without the catcher; its meshes still cast.
   **Exception (amended 2026-11-12, review fix round 1).** `tower_wall_back_cobweb_{x,y}`: the
   small web at the piece's far end moved 0.01 tile inward (`models/tower.js`, `partitionWall`),
   so about 100 to 116 opaque px of each of its frames differ from before. Reason: R7. Turned a
   quarter, the web spans 0.36 tile along the piece and reached 0.01 tile past its end, beyond
   the timber frame guide; the baked ground shadow's bounds used to hold it inside the frame, and
   with that shadow gone the guide alone frames the piece, so left where it was the web would have
   grown the frame past the timber piece's. No other sheet's faces change.
7. **Placement unchanged (spec).** A piece stands on the same screen px as before. A frame may
   shrink to the piece; a tower piece's and an exterior piece's frame and anchor still equal the
   timber piece's.
8. **Three atlas groups, nothing else (spec).** `architecture`, `tower` and `building` are
   repacked. Every atlas of every other group keeps its `sha256`, and every sheet R4 and R5 do not
   name keeps its frame, anchor and pixels (its place in a repacked atlas may move).
   `npm run bake -- --check` passes once the bake is committed.
9. **Guideline (spec).** The design guideline's "baked contact shadows that fall screen-right"
   gains the exception: a wall's shadow is not in its sprite; the client paints wall shadows into
   the ground, flat, by the bake's light. Dated, citing this FS.
10. The bake's review sheets (the tower contact sheet, the mock building) show the pieces as baked,
    with no ground shadow under a wall.

### C. The light, read once

11. **The bake's light (charter default).** A wall shadow falls where the bake's key light would
    throw it: a point h tiles up lands h · (-Lx / Ly) tiles along world x and h · (-Lz / Ly) along
    world y, for the key light direction (Lx, Ly, Lz). Reason: wall shadows must agree with the
    baked shadows of props and chests standing beside them.
12. **One definition (spec).** The key light's direction and the catcher's opacity are defined once,
    in a dependency-free module of `tools/bake/page/` that the baker reads; `BAKE` mirrors them and
    `bake.test.ts` fails on drift, as for the wall heights. The values are today's: no pixel of any
    sheet changes from this (`npm run bake -- --check` passes with the module in place). No client
    source holds the light or the opacity as a number of its own.
13. **The foot (spec, respecced 2026-11-12).** A wall's shadow starts at the ground the wall as
    drawn stands on. A wall `planWalls` cuts stands on a strip centred on its rect's centreline, as
    thick as the bake builds that material's piece. A dungeon floor's edge run stands on the strip
    from its edge line to one thickness on its wall cells' side, from one end of the run to the
    other (FS-XK2B6 R2, R27). A post's foot is its square, centred where it stands (on a dungeon
    floor, where its walls' thicknesses cross). These sizes are defined once in the bake
    (`shadow.js`) and mirrored once in `BAKE`; a wall's thickness is read through its material's
    sheets (`WallSheets.thickness`), which name their `BAKE.WALL_FOOT` entry, so the wall plan, the
    pieces, the fog and the shadow can never disagree on it. Reason: FS-XK2B6 R2 put a thickness
    beside each material's sheets while slice 1 put the same number in `BAKE`; the bake owns it
    (the art is rendered from the model that reads it), and the client keeps one mirror of it with
    the other bake facts `bake.test.ts` holds equal.
14. **Black, as the bake's (spec).** The shadow is the catcher's colour, black, at the catcher's
    opacity. It is carried in `BAKE` as a fact of the bake, not added to the palette. Reason: baked
    and painted shadows must be one colour, and `pitch` at 50% is lighter than black at 50%.

### D. Shape

15. **One shadow per run (charter default).** Each wall run casts one shape, never one per piece: on
    a dungeon floor an edge run of `wallPlan` (FS-XK2B6 R3), from end to end; elsewhere a wall as
    `planWalls` cuts it. Reason: a joint inside a run is then never painted twice. **(spec)** The
    shape is the ground outline of the foot swept along the light to the wall's top: the convex
    hull of the foot and the foot moved by R11's offset for its height. A run whose pieces differ in
    height casts one such shape per stretch of equal height; a dungeon floor's edge run is one
    height, so it casts one.
16. A post casts the same way from its own foot and height: on a dungeon floor one post per corner
    a run ends at, as tall as the tallest run ending there (FS-XK2B6 R4).
17. A wall that ends part-way along a tile casts to where it ends, as its last piece is trimmed. (A
    dungeon floor's runs are whole cells, never trimmed.)
18. **Hard edges (charter default).** No blur, feather or gradient in v1. Reason: the owner will
    look and decide on softening.

### E. One flat layer in the ground

19. **Opaque first, then 50% once (charter default).** Every wall shadow is drawn opaque, and the
    result is laid on the ground once at the bake's opacity. A px of ground under five wall shadows
    is as dark as a px under one. Reason: corners and posts, where shadows of different runs cross,
    must not darken either.
20. **In the ground, nothing kept (charter default).** The shadows are painted into the ground's
    own render textures. After painting, no game object, texture or render target exists for them.
    Reason: floor 1's ground chunks already hold about 65 MiB of RGBA; a second layer would double
    it.
21. **No seam (spec).** A shadow crossing from one ground chunk into the next is whole: no gap, no
    line and no double strip at the edge.
22. **Painted once (spec).** The shadows are painted when the ground's walls are known, over the
    ground already painted, without repainting its tiles (FS-KE075 §H.44's "painted once" holds).
    A ground that is repainted (another look, seed or set of houses) gets its shadows again; the
    same ground never gets them twice.
23. **Only on ground (spec, respecced 2026-11-12).** On a dungeon floor a shadow shows only where
    it falls into a walkable cell: what falls on a wall cell or the void is cut at the walkable
    cells' edge, since no ground lies there (FS-XK2B6 §E) and black at 50% would show on the
    background. The cut is made in the scratch surface, before it is laid on the ground, so a
    shadow over several walkable cells is still drawn as one shape, with no seam between cells. A
    shadow never makes a chunk's texture: the chunks that have one, and their memory, are as
    before.
24. **Still, under everything (charter default).** A wall fading over the player does not fade its
    shadow. The fog, the light-map and the ground's tint lie over the shadows as over the ground.
    Reason: the shadow is ground now.

### F. Buildings

25. **Indoor walls as any other (charter default).** The walls inside a village building and the
    Inn's partition cast like any wall; their shadows are simply not seen while the roof covers
    them.
26. **Each side of the wall by the look it is seen in (spec).** Outside a building's footprint the
    ground carries the shadows of its exterior look (all four sides full height); inside the
    footprint, those of its interior look (south and east cut away). Each is cut at the footprint's
    edge. Reason: the ground is painted once, a building's south and east walls have two heights,
    and each patch of ground is only ever seen in one look: outside under the exterior, inside
    under the interior, with the blackout over the rest.
27. **A door gap (spec).** Outside, a building's shadow runs across a door gap as if the wall were
    whole: from outside the gap holds a shut door under its head. Inside, the gap casts nothing.
28. A wall of no house casts by the height it is drawn at.
29. A room on a floor of buildings follows R25 to R28 as a village building does.

### Left to the owner

Decided here so the work can proceed, each cheap to change:

- R26, which look a building's wall casts by.
- R12, where the light is defined: mirrored with a parity test (today's pattern). The manifest
  could carry it instead (it already carries the tile), at the cost of a manifest field.
- R14, the shadow is black, a fact of the bake rather than a palette token.
- R5, door heads lose their baked shadow with the walls.
- On a dungeon floor a room's north and east walls cast nothing onto the floor in front of them:
  their shadows fall behind them, on void (Facts, R23). That is the light's direction and the
  walls' new place, not a choice; the owner sees it at the browser check.
- No contact shadow is added at a wall's foot. The painted shadow starts at the foot on the lee
  side; the lit side (south and west faces) has nothing on the ground, where today a soft fringe of
  a few px showed. Whether the look needs one is judged at the browser check.

## User Stories

1. As a player in the tower, I want the floor beside a wall evenly shaded, so that I see a wall's
   shadow and not a row of stripes.
2. As a player, I want walls to keep their shadows, so that the rooms do not look flat.
3. As a player, I want a corner where two walls meet no darker than the shadow either side of it,
   so that corners do not read as stains.
4. As a player, I want a post's shadow to melt into its walls' shadows, so that a post is not a
   dark blot.
5. As a player, I want a low wall to cast a short shadow and a tall wall a long one, so that the
   shadow fits the wall I see.
6. As a player, I want a wall's shadow to fall the same way as the shadow of the chest beside it,
   so that the room has one light.
7. As a player in the village, I want the houses' walls shaded the same even way, so that town and
   tower look like one world.
8. As a player walking behind a tall wall, I want the wall to fade and its shadow to stay, so that
   the floor does not flicker as I pass.
9. As a player inside a house, I want its cut-away walls to cast short shadows, so that the room
   looks as it is drawn.
10. As a player outside a house, I want its full walls to cast full shadows across the street, so
    that the house stands on the ground.
11. As a player exploring, I want unexplored floor veiled as before, shadows and all, so that a
    shadow never gives a room away.
12. As a player, I want no slower floor load and no more memory used, so that a big floor still
    runs.
13. As a player crossing a floor, I want no line where the ground's chunks meet, so that a shadow
    is one shape.
14. As the owner, I want the shadow's direction and strength to come from the bake, so that
    changing the light later is one edit and a re-bake.
15. As the owner, I want hard edges first, so that I can judge softening by looking.
16. As an art reviewer, I want the review sheets to show wall pieces with no ground shadow, so that
    I can see the sprite carries none.
17. As a developer, I want the shadow shapes planned by a pure function, so that their geometry is
    tested without a canvas.

## Acceptance Criteria

Plan (pure, tested):

- [ ] For a wall of height h the cast offset is h / 2.83 tiles along world +x and world -y, from
      `BAKE`'s light: 3.6 gives 50.9 world px each way (81.4 screen px, due right), 1.1 gives 15.5.
- [ ] A run of n pieces of one height gives one shape, whatever n; a run of two heights gives one
      shape per stretch.
- [ ] A shape is the convex hull of the foot and the foot moved by the offset.
- [ ] A wall `planWalls` cuts stands on a foot centred on its centreline, between its ends, as
      thick as its material's sheets say (`BAKE.WALL_FOOT`).
- [ ] Every post of `planWalls` gives one shape from its square foot and its own height.
- [ ] A wall 2.75 tiles long casts from a foot 2.75 tiles long.
- [ ] A dungeon floor's shapes come from `wallPlan` and `dungeonWalls`: on the sample floor, exactly
      one foot per edge run, the strip from its edge line to one thickness on its wall cells' side
      between its two ends, and one square per post of the plan, where its walls' thicknesses
      cross.
- [ ] For a building: no exterior-look shape reaches inside the footprint and no interior-look
      shape reaches outside it; outside, the shape of a wall with a door gap is unbroken across the
      gap; inside, the gap casts nothing.
- [ ] The perimeter wall, roofs, caps, gables and door leaves give no shape.

Paint:

- [ ] All shapes of one ground texture are drawn opaque into one scratch surface, and that surface
      is laid on the ground texture once, at `BAKE`'s shadow opacity and colour. Nothing draws a
      shape onto the ground at an alpha below 1.
- [ ] After painting, the scratch surface is destroyed; the scene's display list and texture
      manager hold nothing for shadows.
- [ ] A shape lying across two chunks is drawn into both from the same screen px.
- [ ] Painting shadows does not clear a ground texture or stamp a ground tile; asking for the same
      walls' shadows again paints nothing; a ground repaint paints them once more.
- [ ] On the sample floor the chunks with a texture are the same 65 before and after, and no
      shadow px is laid on a wall cell or the void: every px a shadow covers is in a walkable
      cell.
- [ ] Every shadow over walkable cells is laid whole: the cut takes only what lies on a wall cell
      or the void.
- [ ] A fading occluder changes no ground texture.
- [ ] Without the wall sheets (placeholder walls) or without the ground's art, no wall shadow is
      painted and nothing fails.

Light:

- [ ] The key light's direction, the catcher's opacity and colour, and the wall and post foot sizes
      are each defined once under `tools/bake/page/` in a dependency-free module; `baker.js` and the
      wall models read them; `bake.test.ts` holds `BAKE` equal to them.
- [ ] No source under `src/` holds 2.83, the shadow's 0.5 or a wall thickness as its own number
      outside `BAKE`; each material's sheets name their `BAKE.WALL_FOOT` entry, and a test holds
      each equal to `shadow.js` and each wall model building with it.

Art:

- [ ] The catalogue bakes every sheet of R4 and R5 with no ground shadow, and no other sheet's
      shadow setting changes.
- [ ] Atlases outside `architecture`, `tower` and `building` keep their `sha256`; in those three,
      every sheet not named keeps its frame size and anchor in the manifest.
- [ ] A tower piece's and an exterior piece's frame size and anchor equal the timber piece's.
- [ ] `npm run bake -- --check` passes.
- [ ] The design guideline carries R9's exception.
- [ ] `npx vitest run --maxWorkers=4` and `npm run lint` in game-client pass.

By eye (owner, browser, and the review sheets):

- [ ] On floor 1, along a room's west wall (running along world y): one even shadow, no stripes;
      along its south wall a short one; its north and east walls cast nothing onto the floor in
      front of them.
- [ ] At an inside corner and at a post: no darker patch.
- [ ] A chest or a brazier beside a wall: its shadow falls the same way as the wall's.
- [ ] In the village: each house's shadow outside, even, unbroken past its door; inside a house,
      short shadows from the cut-away walls and a long one from the back walls.
- [ ] Walking behind a tall wall: the wall fades, the shadow does not move or fade.
- [ ] A wall piece's own faces look as before (R6); nothing of a shadow is left in a sprite.
- [ ] Hard edges: keep, or soften (the owner's call, a follow-up either way).
- [ ] The foot of a wall on its lit side: fine bare, or wants a contact shadow.

## Edge States

- **Between slices.** Client shadows with the old art darken every wall twice (baked and painted);
  new art without the client shadows leaves walls with none. Neither ships: the slices merge as one
  branch. On a dungeon floor slice 2 alone shows it: where a west or a south wall's painted shadow
  lies, the old baked strip under each piece is still in the sprite, so that floor is darkened
  twice, and the stripes are still there under it.
- **A baked shadow on a painted one.** A chest's, a door leaf's or a brazier's baked shadow lying
  in a wall's shadow adds to it, as it does today (R3).
- **A shadow reaching void.** Cut at the walkable cells' edge (R23). On a dungeon floor there is no
  shell ground any more (FS-XK2B6 §E): a north or an east wall's shadow falls behind the wall and
  is cut whole, and a west wall's stops where its room or corridor ends, at the next wall cell.
- **A ground piece past an edge.** A ground piece laid by a walkable cell may reach a few px past
  the edge into a wall cell (FS-XK2B6 Edge States). The shadow is cut at the edge, so that sliver
  carries none; it lies under the wall's own thickness, behind its face.
- **A shadow falling under another wall.** Painted on the ground; the wall's sprite stands over it.
- **A run one cell long.** Two pieces between two posts (FS-XK2B6), one shape as any run.
- **A straight wall that changes height.** Two runs and a post on the wall's line between them
  (FS-XK2B6 R4): a back run's shadow and a front run's meet under the post, which casts as the
  taller; the overlap is opaque in the scratch, so it is no darker.
- **Walls before ground, ground before walls.** The dungeon's ground is painted before its walls
  are built; the shadows are added when the walls are (R22). The hub and a floor of buildings paint
  the ground for their houses and add the shadows in the same step.
- **A new floor.** The ground of the floor left is destroyed with its shadows; the next floor's
  ground gets its own. Nothing is carried over. (Amended 2026-11-12, review fix round 1.) A climb
  between floors of buildings of one size keeps the ground (`fitFloor`): it forgets the floor
  left's shadows as the new floor is fitted, so the new floor's paint lays none of them on its
  tiles, and its own are laid over it once, with no second repaint.
- **Walls that change within a floor.** A run's walls come once per floor (FS-KE075 §H.43). Should
  a wall come or go later, the shadows are those of the walls known when they were painted, as the
  houses' flagstones are.
- **A tinted or lifted ground.** The tint multiplies the shadow with the ground. Lift and edge fade
  belong to field worlds, which have no walls.
- **Chunks hidden far from the camera.** The shadow is in the chunk's texture and hides with it.
- **The scratch surface.** No larger than the ground texture it serves (512 px a side on a dungeon
  floor), and freed before the next is made.
- **Merging with other re-bakes.** Another branch that re-baked `building` (or `tower`,
  `architecture`) conflicts in the atlas PNG and `manifest.json`. Merge the models and the
  catalogue, then run `npm run bake`: the bake is deterministic, and the conflict is never resolved
  by hand.

## Out of Scope

- Roofs, caps, gables, door leaves, props, furnishings, chests, characters and monsters: their
  baked shadows stay.
- The tower's outer (perimeter) wall and its contact shadow.
- Field worlds: no walls.
- The light's direction, strength and colour; the catcher's opacity; any re-bake beyond R4 and R5.
- Soft edges, penumbra, ambient occlusion, a contact shadow at a wall's foot (owner's call after
  the browser check).
- Removing the darkening where a baked shadow lies on a wall shadow (R3).
- Shadows that move, or that follow a door opening.
- Placeholder walls (no art): they never had a shadow.
- A manifest schema change; a new `BARROW` token.
- Anything in `game-server/`, proto, the gateway, a database.
- An ADR. One may be worth recording once the owner has seen it: "a wall's shadow is painted by the
  client into the ground, flat; only free-standing things bake their own".
