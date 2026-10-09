# FS-8RBQY: Tower interior run look

> Status: shipped · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Tower interior run look", "Per-floor variation of the run look", "Pre-rendered stairs" → this FS (brownfield pair: "Exterior run look → FS-2325V") · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (2D at runtime, build-time bake, footprint draw order), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored in code, never sourced; applies to every sheet here), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from `BARROW` only) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) "Rendering terms" (**World theme** vs **World kind**, **Exterior theme**, **Tower interior theme**, **Room**, **Partition wall**, **Perimeter wall**, **Floor band**, **Dressing**) · Builds on: [FS-F6F88](F6F88-multi-floor-delves.md) (floors, stairs, per-floor rebuild), [FS-2325V](2325V-pre-rendered-isometric-art.md) (baked world, light-map, markers), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (dressing discipline, §A)

> Promoted `--from-thread` from the coordinator's locked charter (2026-10-10, items 1–9) and its
> binding rulings R1–R6 after scope-it. The owner was unavailable and no question was put to
> anyone, so every decision here is **(not challenged)**. The cost of error is bounded: client
> presentation only, baked PNGs and planners revert cleanly, no contract, wire field or game rule
> is touched. Code citations are against `0c3b1c7` (`feat/client-prerendered-art`).
>
> **Charter wording corrected (fact, not a decision change).** Charter item 2 calls today's run
> look "grass/flagstone ground". It is not: `planGround` lays `ground_dirt` for runs
> (`src/render/world/ground.ts:104`), with a 10% decal density of which only 15% are grass tufts
> (`ground.ts:156-158`) and flagstone under each house (`planFloors`, `ground.ts:131-153`). Grass
> is the hub's base. The **exterior theme** in this FS is the run look as it actually ships:
> barrow dirt, tufts and pebbles, flagstone house floors, timber-frame walls and roofs.

## Summary

Every run now climbs floors (FS-F6F88), and the run still looks like an outdoor village. This
feature gives runs an interior look: the delver is inside the Barrowspire, a tower of worn stone
and old timber. The play area is ringed by the tower's outer wall with arrow slits and darkness
beyond, the server's buildings read as rooms divided by masonry partition walls, sconces throw
warm pools into a darker ambient, and the stairs up are a baked spiral stair rising into the dark.
Each floor looks a little different (barrow-earth and bones low down, dressed stone, banners and
iron higher up), seeded from the floor number so every delver sees the same floor. Today's
outdoor look is kept, untouched, as the exterior theme for a future outdoor place.

## Requirements

### §0. The boundary (binds every section)

1. **Client presentation only.** No file under `game-server/` changes. No WS field is added,
   removed or reinterpreted. No game rule, collision, range or message changes. Room layout,
   walls, doors, stairs, chests, escape door and switch positions all come from the broadcast
   exactly as today (`ClientGameState`, `src/types/gameState.ts:211-235`).
2. **Built in code** (ADR-0021). Every new sheet is authored in `tools/bake/page/` and baked
   through the existing pipeline (ADR-0020). No stock model, texture or sourced asset. Each new
   sheet's manifest `source` is `authored: tools/bake/page/…`.
3. **Token-only colour** (ADR-0013). Every colour in new bake code and new client code is a
   `BARROW` token or a blend/shade of tokens (`tools/bake/page/palette.js`, `BARROW_HEX` in
   `src/utils/canvasPalette.ts`). No hex literal, and no new token in `src/utils/theme.ts`.
   `npm run lint:fence` passes.
4. **Deterministic.** The bake is byte-stable (`npm run bake -- --check` exits 0 after the
   committed bake). Every client-side plan in this FS (ground, wall-piece variants, perimeter,
   dressing, light budget) is a pure function of the theme, `floor`, `floor_count` and the static
   entities of the broadcast. `Math.random` is never used on the baked path.
5. **Hub unchanged.** Nothing in `HubScene` or the hub's ground, props, dressing or ambient
   changes.

### §A. World theme seam (line: "Tower interior run look")

1. The client has a **world theme**: `"exterior" | "tower"`, named in one module
   (`src/render/world/worldTheme.ts`). It decides, for the run scene: the ground plan, the wall-piece
   sheet set, whether roofs and the indoor mask exist, the ambient, whether a perimeter wall is
   drawn, and whether run dressing is placed.
2. The run scene's theme is a client constant, defaulting to `"tower"`. There is no UI, no
   config fetch and no server field for it ("selectable later" means changing the constant).
3. **The exterior theme is today's run look, unchanged.** With the constant set to
   `"exterior"`, the run scene draws exactly what it draws at `0c3b1c7`: dirt ground, tufts and
   pebbles, flagstone house floors, timber-frame walls, roofs, the enter-a-house indoor mask, the
   "Indoor"/"Outdoor" HUD suffix, `AMBIENT.run`, no perimeter, no run dressing, and the stairs
   of §E.
4. Every theme-dependent element is built and torn down at the existing per-floor seam
   (`leaveFloor`, `src/scenes/BarrowspireScene.ts:3048`), so a floor change rebuilds the theme's
   perimeter, dressing, ground and fixed lights with everything else (FS-F6F88 req 33).

### §B. Tower interior: ground, partitions, perimeter, light (line: "Tower interior run look")

1. **Ground.** The tower theme lays no grass and no grass-tuft decals. Halls (ground outside any
   room) are worn cut-stone flags with mortar and grime. Room floors (the tile grid under each
   house rect, as `planFloors` lays flagstone today) are old timber planks. The exact hall
   material per floor comes from §C.
2. **Partition walls.** Server walls render as masonry partition walls through the same
   geometry as today: `housesFrom` grouping, `cutWall`/`planWalls` pieces along the centreline,
   a post at each end, and the cut-away rule (north and west sides stand full height, south and
   east are the low cut-away, `src/render/world/walls.ts:66-69`). Only the sheets and the
   variant table change. Back (tall) variants: plain, pillar, sconce, banner, cobweb. Front
   (low) variants: plain, pillar. There is no window variant indoors. Variant choice stays a
   deterministic hash per piece (as `KINDS`, `walls.ts:72-77`), with the shares set per floor
   band (§C).
3. **No roofs indoors** (R1). In the tower theme no roof sheet or placeholder roof slab is
   drawn, so none is registered as an occluder. The whole floor is interior:
   - entering a room never shows the indoor mask (`indoorMask`, `BarrowspireScene.ts:2815`);
   - `underRoof` is false everywhere, so trail glow is always shown and every back-wall light's
     flame halo is always in sight (it is never gated on `currentBuilding`);
   - the HUD position line drops its "| Indoor"/"| Outdoor" suffix
     (`BarrowspireScene.ts:3662`). The floor label and floor card (`src/ui/floor.ts`) stay.
4. **Doors, entrance markers, chests, escape door and switch keep their art.** Door frames
   (`door_x`/`door_y`), the amber entrance markers at each room's south threshold, the `chest`
   sheet, drop piles, `escape_door_x/y` and `switch` are drawn as today. None is restyled.
5. **Perimeter wall** (R2). The tower theme draws a client-only **perimeter wall** ringing the
   play area, the tower's outer wall in thick masonry. It is not a server wall: it has no entity,
   no collision and no message.
   - It stands **outside** `[0,1440]×[0,960]` (the client's `mapWidth`/`mapHeight`,
     `BarrowspireScene.ts:307-308`): its inner face is on the boundary and its whole footprint is
     beyond it.
   - North and west runs stand full height, with arrow-slit pieces at a fixed deterministic
     spacing. South and east runs are low cut-away pieces only, so they never cover a delver,
     the escape door, the switch, a chest or the stairs at the map edge.
   - Corners carry posts. Pieces sort by footprint like any wall piece.
   - Nothing is painted beyond the perimeter: no ground, no sky. The camera background
     (`palette.mapEdge`, pitch) is what shows there.
6. **Light.**
   - The tower theme has its own ambient, darker than `AMBIENT.run` (by relative luminance),
     mixed from tokens in `src/render/lighting/lighting.ts`. The exterior keeps `AMBIENT.run`.
   - A sconce piece declares a warm light in the manifest, like today's `wall_back_torch_*`.
     An arrow-slit piece declares a faint cold light (a cool token blend, lower intensity than
     a sconce). Both are stamped once per floor build through `LightMap.add`.
   - No texture is rebuilt per frame. The light-map stays built once and restamped.
7. **Readability.** Hostile markers and monsters stay above the light-map (FS-2325V §C.9). The
   marker contrast test (`src/render/markers/markers.test.ts`) also covers the tower ambient
   against the darkest tower ground mean and must stay at least 3:1. The tower ambient is never
   lifted to buy readability (design guideline "The readability floor"), and it is never so dark
   that a chest, door, escape door or switch at ambient-only light stops reading as itself.
   The stairs always stand in their own warm pool (§E.3).
8. **Missing art** (R4). When the manifest or a tower sheet is missing, the tower theme falls
   back like every baked sheet today (`showState`, `src/render/world/scene.ts:229-241`):
   partition and perimeter pieces fall back to the existing placeholder wall drawing (the
   perimeter may be skipped entirely), dressing is skipped, and the ground fallback
   (`createMapBackground`, `BarrowspireScene.ts:3433`) is a **neutral dark stone** fill from
   tokens. The sci-fi residue is removed from the fallback: the "spaceship floor" `metalFloor`
   tile, the "viewport windows" with stars and the pulsing "hull lights" are gone in both themes.
   The fallback stays minimal (a flat or lightly mottled stone fill and nothing more).

### §C. Per-floor variation and run dressing (line: "Per-floor variation of the run look")

1. **Floor band.** A floor's **floor band** is `lower`, `middle` or `upper`, derived from
   `floor` and `floor_count` (both on the wire): `t = (floor − 1) / (floor_count − 1)` when
   `floor_count > 1`, else `t = 0`; `t < 1/3` → `lower`, `t < 2/3` → `middle`, else `upper`.
   With `floor_count = 3` this gives floor 1 lower, floor 2 middle, floor 3 upper, and it
   survives a future floor-count change. The band is the only thing that varies the look per
   floor.
2. **What each band changes** (all within the sheets of §B and §D):

   | Band | Hall ground | Back-wall variant lean | Dressing lean |
   |---|---|---|---|
   | lower | flags with barrow earth (`ground_dirt`) breaking through in patches, edged by the flags/dirt transition | cobweb, plain; no banner | roots, bone piles, rubble |
   | middle | flags | plain, pillar, sconce; few banners | rubble, broken crates, chains |
   | upper | dressed stone | pillar, sconce, banner; no cobweb | chains, braziers, banners on walls; no roots, no bones |

   Room floors are planks in every band. The exact shares are the implementer's, tuned at the
   coordinator's visual review, and live in one table.
   Braziers are **lit dressing**: the reused `brazier` keeps its manifest light, which is a fixed
   light counted and dropped under §C.6 (at most two per floor).
3. **Seeding.** Ground, wall-piece variants and dressing hash from (theme, floor, tile or
   position) and server positions only. `GroundLayer` takes the floor seed, so it repaints a
   different floor when the floor changes (today it reuses the per-kind seed,
   `ground.ts:39-41`). Two clients given the same broadcast draw the same floor.
4. **Run dressing** is dressing in the CONTEXT.md sense, as FS-KYPQ9 §A.7 binds it: never
   `setInteractive`, never given a hit area or cursor change, never in a physics group or
   collider, never in a message. The floor set is rubble, bone piles, broken crates, roots,
   chains (a heap of chain and manacles on the floor) and the existing `brazier`. Banners and
   cobwebs are not free props; they are back-wall variants (§B.2).
5. **Computed keep-out** (R3). Dressing is planned after the floor's static entities are known
   and is computed from them, never from hand-copied constants (contrast
   `src/render/world/hubKeepOut.ts`). A dressing footprint is rejected when it:
   - overlaps a wall rect grown by 24 world px;
   - lies within a door's threshold zone: the door rect grown by 40 px on every side and
     extended 60 px to the south (the approach lane, since the server always puts the door in
     the south wall);
   - lies within 60 px (`INTERACT_RANGE`) of the stairs, the chest, the escape door or the
     switch;
   - lies within 30 px of the play-area edge.

   Drop piles that appear later are not part of the keep-out: a drop pile landing on dressing is
   acceptable, since dressing never blocks. Density is bounded (a fixed count per floor, at most
   16 props), and a candidate that fails the keep-out is dropped, never nudged into place.
6. **Light budget.** A floor's fixed lights (sconces, arrow slits, braziers, the stairs pool)
   are capped at 24. Past the cap, lights are dropped deterministically in this order: arrow
   slits first, then braziers, then sconces. The stairs pool is never dropped. The delver's
   carried torch and transient lights are not fixed lights and do not count.
   **Coordinator revision (2026-10-10, slice 3 review):** in the tower theme, over baked art, the
   chest and the switch each stand in a faint amber **interactable pool** (§B.7's readability
   floor; amber = interactable). It is a fixed light inside the cap, dropped after the sconces and
   before the stairs pool.
7. **Reconnect and floor change.** The first broadcast's `floor` builds that floor's band
   directly, with no transition (FS-F6F88 req 32). A climb tears the band's ground, dressing,
   perimeter and fixed lights down at `leaveFloor` and builds the next floor's.

### §D. Baked tower sheets (lines: "Tower interior run look", "Per-floor variation of the run look")

1. All new sheets are baked into a new atlas group `tower` (`public/art/tower-N.png`). The
   group is a packing choice only (the client loads every atlas the manifest names,
   `src/render/art/phaser.ts:80`). Every pre-existing atlas's `sha256` and every pre-existing
   sheet entry is unchanged, so the manifest diff is additive and the exterior theme is
   byte-identical. The new sheets fit one 4096² page.
2. **Ground tiles** (`kind: "tile"`, 4 variants each, measured mean colour as today):
   `ground_flags` (worn cut-stone flags, mortar, grime), `ground_planks` (old timber planks),
   `ground_dressed` (dressed stone), and the transition `ground_flags_dirt` (8 edges, as
   `ground_grass_dirt`). Barrow earth reuses the existing `ground_dirt`.
3. **Partition wall pieces:** `tower_wall_back_{plain,pillar,sconce,banner,cobweb}_{x,y}`,
   `tower_wall_front_{plain,pillar}_{x,y}`, `tower_post_{back,front}`. Same heights, tile span
   and anchor as today's `wall_*`/`post_*` so `cutWall` geometry is unchanged. Sconce pieces
   declare a warm light.
4. **Perimeter wall pieces:** `tower_perimeter_back_{plain,slit}_{x,y}`,
   `tower_perimeter_front_plain_{x,y}`, `tower_perimeter_post_{back,front}`. Thicker and taller
   than a partition (it is the tower's outer wall). Slit pieces show a narrow cold-lit opening
   and declare a faint cold light.
5. **Dressing props:** `rubble`, `bone_pile`, `broken_crate`, `roots`, `chains`. Low,
   ground-hugging, no light. `brazier` is reused as it ships.
6. Fidelity bar: the shipped baked look (design guideline Part I, Ultima Online fidelity), in the
   same palette ramp, light direction and contact shadow as the existing world sheets.
7. `npm run bake` writes `tools/bake/review/contact-sheet.png` covering every new sheet. The
   coordinator reviews it against the reference (the shipped baked look, design guideline
   Part I). There is no owner HITL gate.

### §E. Pre-rendered stairs (line: "Pre-rendered stairs")

1. A baked sheet `stairs_spiral` (group `tower`) replaces the code-drawn placeholder
   `stairs_up` (`createStairsTexture`, `BarrowspireScene.ts:1916-1936`) as the stairs art in
   both themes. It is a spiral stone stair winding up around a newel, its upper turns fading
   into darkness so it reads as climbing the tower.
2. **Interactable cue.** The stair carries an amber cue at its foot (amber trim on the lowest
   treads, from the `amber` token), per the canvas accent rule (design guideline "Gameplay
   accent": amber = interactable). The HUD interaction notice (`src/ui/floor.ts`) is unchanged.
3. **Its own pool.** `stairs_spiral` declares a dim warm light in the manifest, stamped at the
   stairs position once per floor build, so the stair never sits in ambient-only darkness. It
   counts toward the light budget and is never dropped (§C.6).
4. **Placement.** The sprite stands at the server's stairs position and sorts by its footprint
   like any prop (not only `standAt`). It is registered as an occluder, since it is tall.
5. **Logic unchanged.** `StairsSet` diffing, `nearby`, `INTERACT_RANGE` and the climb flow
   (`src/render/world/stairs.ts`) are untouched. Only the scene's `StairsStage.add`
   (`BarrowspireScene.ts:335-344`) changes. The placeholder `stairs_up` texture stays as the
   no-art fallback. The top floor has no stairs and draws none.

## User Stories

1. As a delver, I want a run to look like the inside of a tower, so that climbing floors makes
   sense.
2. As a delver, I want the play area enclosed by a thick outer wall, so that I feel I am inside
   the Barrowspire rather than in a field.
3. As a delver, I want darkness beyond the outer wall, so that the tower feels like the only
   thing in the world.
4. As a delver, I want arrow slits that let in faint cold light, so that the outer wall reads as
   a tower wall.
5. As a delver, I want the server's buildings to read as rooms divided by masonry, so that the
   floor feels like a dungeon crawl.
6. As a delver, I want no roofs or house blackouts indoors, so that I can see the whole floor
   I am already inside.
7. As a delver, I want warm sconce and brazier pools in a darker ambient, so that the interior
   feels lit by fire.
8. As a delver, I want the stairs drawn as a baked spiral stair rising into the dark, so that I
   know where the way up is and that it goes up.
9. As a delver, I want the stairs marked in amber and lit, so that I can find them at a glance
   even in a dark corner.
10. As a delver, I want each floor to look a little different (earth and bones low, dressed
    stone and banners high), so that I feel progress as I climb.
11. As a delver, I want rubble, bones, crates and chains on the floor, so that the tower feels
    old and used.
12. As a delver, I want dressing never to block a door, the stairs, a chest, the escape door or
    the switch, so that decoration never costs me a run.
13. As a delver, I want dressing never to be clickable, so that my clicks always go to
    something real.
14. As a delver, I want monsters, hostile markers, chests, doors, the escape door and the switch
    to stay readable in the dark interior, so that the mood never hides the game.
15. As a delver in a party, I want my companions to see the same floor I see, so that "by the
    bones near the stairs" means the same place to all of us.
16. As a delver who reconnects mid-run, I want the floor I am on drawn with its own look
    immediately, so that a reconnect does not show the wrong floor.
17. As a delver, I want the outer wall never to cover me or anything I can use at the map edge,
    so that the edge of the map stays playable.
18. As a delver without the art loaded, I want a plain stone fallback, so that the placeholder
    does not look like a spaceship.
19. As the owner, I want today's outdoor run look kept intact behind a theme constant, so that I
    can use it for a future exterior place.
20. As the owner, I want every new asset built in code in the existing bake, so that the art
    stays ours and matches the shipped look.
21. As the owner, I want no server change for this, so that the backend stays my hand-coded lane.
22. As a reviewer, I want a contact sheet of every new tower sheet, so that I can judge the art
    against the shipped baked look before it is wired.
23. As a developer, I want the theme decided in one module, so that adding a third theme later is
    one new entry, not a hunt through the scene.
24. As a developer, I want the keep-out computed from each floor's broadcast, so that dressing
    stays correct on random layouts without hand-maintained lists.
25. As a developer, I want the bake and every client plan deterministic, so that `bake --check`
    and unit tests catch drift.
26. As a player on a modest machine, I want the new atlas modest and no per-frame texture
    rebuilds, so that the interior costs no frame rate.

## Acceptance Criteria

- [ ] `git diff -- game-server/` is empty for this FS's changes, and no type in
      `src/types/gameState.ts` gains, loses or renames a field.
- [ ] `src/render/world/worldTheme.ts` names the world theme (`"exterior" | "tower"`) and the run
      scene's default is `"tower"`.
- [ ] With the theme constant set to `"exterior"`, the run scene's ground plan, wall sheets,
      roofs, indoor mask, HUD suffix and ambient equal today's (unit-tested on the planners;
      checked once by hand in the scene).
- [ ] The manifest carries every sheet named in §D.2–§D.5 and §E.1, in group `tower`, each
      with an `authored: tools/bake/page/…` source. Sconce, slit and `stairs_spiral` sheets
      declare a light. Every pre-existing atlas `sha256` and sheet entry is unchanged.
- [ ] `npm run bake -- --check` exits 0 after the committed bake, and the new sheets fit one
      4096² page.
- [ ] `tools/bake/review/contact-sheet.png` shows every new sheet. The coordinator has reviewed
      it against the shipped baked look.
- [ ] In the tower theme: no grass or tuft decals are planned; halls are flags (or the band's
      material) and room floors are planks.
- [ ] Partition walls keep the cut-away rule (north/west back, south/east front), and back and
      front pieces draw only the §B.2 variants.
- [ ] No roof is drawn or registered as an occluder in the tower theme; the indoor mask never
      shows; `underRoof` is false everywhere; the HUD line has no Indoor/Outdoor suffix; the
      floor label and card are unchanged.
- [ ] The perimeter plan's every piece lies outside `[0,1440]×[0,960]`; north and west runs are
      back height with slits, south and east runs are front height only (unit-tested).
- [ ] The tower ambient is darker than `AMBIENT.run` by relative luminance, and the marker
      contrast test covers it at 3:1 or better.
- [ ] `floorBand` maps (1,3)→lower, (2,3)→middle, (3,3)→upper, (1,1)→lower, and a 5-floor run
      maps to a monotone ramp (unit-tested).
- [ ] The ground, wall-variant and dressing plans for a given (floor, floor_count, broadcast)
      are equal across two calls and differ between floors (unit-tested); no `Math.random` on
      the baked path.
- [ ] Every planned dressing footprint passes each §C.5 rule against a fixture broadcast with
      walls, doors, stairs, chest, escape door and switch; a fixture with entities crowding a
      candidate rejects it; at most 16 props per floor (unit-tested).
- [ ] Dressing sprites are never interactive and never in a physics group or collider.
- [ ] A floor's fixed lights never exceed 24; the drop order is slits, braziers, sconces; the
      stairs pool survives a crowded fixture (unit-tested).
- [ ] The stairs draw `stairs_spiral` at the server position, sorted by footprint and
      registered as an occluder, with its light stamped; with no manifest they draw the
      `stairs_up` placeholder. `stairs.ts` is unchanged.
- [ ] A climb tears down and rebuilds perimeter, dressing, ground and fixed lights; a reconnect
      onto floor 2 or 3 builds that floor's band from the first broadcast.
- [ ] The no-manifest fallback ground is neutral dark stone from tokens; `metalFloor`, the
      viewport windows, stars and hull lights are gone.
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint` and `npm run lint:fence` pass in `game-client/`.

## Edge States

- **Empty floor parts.** A building can silently fail to place server-side
  (`session.go:2852-2867`), and the chest may fail to place. Fewer rooms or no chest simply means
  fewer partitions and fewer keep-out zones. Nothing assumes three rooms or one chest.
- **Top floor.** No stairs, so no stairs sprite or pool. The band still applies (`upper` on a
  three-floor run).
- **Single-floor run** (`floor_count = 1`): band `lower`.
- **Reconnect onto floor 2 or 3.** Built from the first broadcast's `floor` and `floor_count`,
  with no transition (FS-F6F88 req 32).
- **Concurrent viewers.** Every party member's client plans the same floor from the same
  broadcast and the same seed; there is no client-local randomness to diverge.
- **Late entities.** Drop piles from slain monsters may land on dressing. Dressing is not
  re-planned for them.
- **Edge spawns.** The escape door, switch and delvers may spawn near the map edge
  (`session.go:983-984`, `2520-2529`). The perimeter is wholly outside the play area and its
  south/east runs are low, so nothing at the edge is covered. Dressing keeps 30 px from the edge.
- **Missing manifest or missing tower atlas.** Partitions and perimeter fall back to placeholder
  walls (or the perimeter is skipped), dressing is skipped, the ground is the neutral stone
  fallback, the stairs are the `stairs_up` placeholder. The game stays playable and readable.
- **Light cap crowding.** A floor dense with sconces and slits drops lights by the §C.6 order;
  the stairs pool is never dropped.
- **Theme constant set to exterior.** Today's run look in full, plus the baked stairs of §E.
- **Floor change mid-effect.** Transient lights and effects are cleared as today
  (`LightMap.clearTransient`, FS-KYPQ9 §C); theme teardown does not touch them.

## Out of Scope

- Server floor generation of any kind: room types, corridors, sub-rooms, per-floor room size or
  shape, an outer wall as server walls, a map seed on the wire. Layouts today vary only by random
  position of three fixed-size boxes (`session.go:2502-2555`); real room variety is backend
  human-lane work, noted as a follow-up and not designed around.
- New room types, exterior zones, a theme picker UI, and any hub change.
- Enemy art, chest/container restyle, door restyle, and an escape-door restyle (a cellar hatch
  or postern is a possible later fiction; it keeps its art here).
- Changes to `StairsSet`, interaction range, climb flow, the floor card copy, or any HUD panel
  beyond dropping the Indoor/Outdoor suffix in the tower theme.
- Fog of war or room-reveal masking.
- New `BARROW` tokens.
