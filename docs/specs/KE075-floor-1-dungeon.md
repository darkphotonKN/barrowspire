# FS-KE075: Floor 1 as a room-and-corridor dungeon

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" → "Room-and-corridor dungeon on floor 1", "Floor map sent once per floor", "Per-player interest in run snapshots"; "### Enemies" → "Monsters path around walls"; `game-client/SPECIFICATION.md` "### Escape run" → "Floor layout from the floor map"; "### Presentation" → "Room-and-corridor floor look"; `game-server/game-service/SPECIFICATION.md` "### Transport" → "Other players sent without their bag or worn gear" (§I); `game-server/game-service/SPECIFICATION.md` "### Delve layout" → "Guarded chests on floor 1" (§J); `game-client/SPECIFICATION.md` "### Escape run" → "Told when a guarded chest will not open" (§J) → this FS · Related ADRs: [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (floor map on the wire, interest), [ADR-0064](../adr/0064-other-players-state-never-carries-their-bag-or-worn-gear.md) (other players' bag and worn gear, §I), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) (layout conventions), [ADR-0062](../adr/0062-monsters-path-on-the-floor-cell-grid-with-a-star.md) (navigation), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (a floor change is not a world switch), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art only), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) · Supersedes: [FS-F6F88](F6F88-multi-floor-delves.md) §Requirements 5 **for floor 1 only** (FS-F6F88 is shipped and stays as written; its §5 still governs floors 2–3) · Amends the scope of: [FS-77AB6](77AB6-monsters-and-combat.md) §Out of Scope "Pathfinding" (brought in here, floor 1 only) · Look: [FS-8RBQY](8RBQY-tower-interior-run-look.md) governs the tower look; this FS adds only the dungeon-floor rules (§H) · Known defects nearby: [FS-QG1HR](QG1HR-simulation-and-lifecycle-defects.md) D2 race B, D4 · Followed by: [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (fog, minimap), [FS-48CTQ](48CTQ-monster-target-frame.md) (target frame) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Dungeon floors and the floor map"; [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Floor map**, **Region**, **Void**, **Room**

## Summary

Floor 1 of the Spire stops being a 1440×960 yard with three random buildings and becomes a
dungeon sixteen times its area: 18–28 rooms joined by corridors on a grid of 80 px cells, with
loops, a start room for the party, the switch, escape door and stairs each in their own far room,
and three or four guarded treasure rooms. About 45–70 monsters live in its rooms and corridors,
and they now walk around walls to reach the party instead of pressing against them.

To make a floor that large affordable on the wire, the floor's static layout (size, regions,
walls) is sent once as a `floor_map` message, walls leave the per-tick snapshot, and on floor 1
each player is sent only the monsters, drop piles and containers within 1600 px. The client
builds the floor from the map, draws its ground in chunks and its walls only near the camera.

Floors 2 and 3 do not change. They keep today's generator, size and gameplay, and they look and
play exactly as today. The only difference is that their walls arrive in the `floor_map` message
rather than in every snapshot.

Charter run, 2026-11-06. Nick approved the locked decisions A1–A13 as charter defaults
("核准"), then added "floor 1 only" (owner constraint) through the coordinator. Every requirement
carries the decision it comes from. Where this spec settles something the charter left open, it
says **derived here** and gives the reason. Recorded without adversarial review: no
`challenge-me` pass. Nick agreed that agents write the game-service half on this branch.

**Amended 2026-11-06 (§I, ADR-0064).** Other players' entries in every state stop carrying their
bag and worn gear, in every world, run, field and hub. On the bench, a party of four's bags and worn gear
were about 12 KB of each recipient's floor-1 frame, a large share of the 16 KB target, and anyone
could read a matched stranger's bag from the WebSocket. Nick approved the change in game-service
directly ("那就不用看到隊友的背包了") and set the rule for any later loot of a teammate's finds:
fetch at the moment of looting, never stream ("就算之後要改應該也是撿的當下再撈就好了").
Recorded without adversarial review.

**Amended 2026-11-06 (review fix round 1).** The slice review found room sizes and the room count
skewed small by redraws on rejection, a fixture fallback that skipped R14's checks, and a
request window that refused every other client retry. R3, R14, R17, R18 and R33 now say what the
code does, each settled point marked **derived here**. No requirement's intent changed; the
16 KB per-tick AC waits on Nick and is not touched here.

**Amended 2026-11-06 (review fix round 1, client).** The client review found floor 1's dressing
planned from a snapshot interest had already cut, so far chests were missing from its keep-out and
members strewed differently; a map arriving after the first snapshot leaving the containers' light
pools outside the chunk cap and the fog; a reconnect mid-climb building floor 2 through the store's
floor-1 dungeon; half the ground's render textures over void; the ground painted three times for
one; and the store taking any session's map. R40, R41, R43, R44 and R47 now say what the code
does, each settled point marked **derived here**. The 16 KB per-tick AC is settled too: Nick,
"這是網頁遊戲 符合標準就行了" (it is a web game, meeting the standard is enough), so it is measured on
the real-population bench, where it holds, and compression is a follow-up (Verification). The
client fixture is refreshed from the levelgen golden (rooms placed largest first). No
requirement's intent changed.

**Amended 2026-11-06 (§J, guarded chests).** Playtesting floor 1, Nick asked whether a hall's
chest could open only once its monsters were killed ("大廳的寶箱有辦法打完怪才能開啟嗎"), then set
the presentation: an open just says it cannot open, and the monsters around it make the reason
plain ("就開的時候顯示無法開啟 周圍有怪物都會知道要先清除怪物吧"). A chest in a treasure room or a
hall now stays shut while any monster its room spawned as guards stands; the server refuses the
open and the client says "It will not open." No lock is drawn and nothing new is sent. The
defaults below are marked **owner, playtest 2026-11-06**; where this section settles what they
left open, it says **derived here**. Recorded without adversarial review.

## Facts this spec rests on

Verified 2026-11-06 on local main 48ece46c. Paths under `game-server/game-service/` unless they
start with `game-client/`.

**The run today**

- The floor is 1440×960 (`common/constants/game.go:362-363`). `buildFloor`
  (`internal/game/session.go:3164-3226`) places one container (`CreateContainer`, sack 33%), three
  buildings (S/M/L, `CreateBuilding :3520-3538`), one escape door and one switch, then stairs
  below the top floor (`CreateStairs :3486`), then the party (`gatherParty`, `party_spawn.go:45`)
  and the monsters (`populateMonsters`, `monster_population.go:41`).
- The escape door and switch are not placed through the occupied-area check
  (`session.go:3204-3210`).
- 3 floors (`RunFloorCount`, `game.go:358-360`), no timer.
- Monsters: 8–14 standard per floor (`monster_tuning.go:19-20`), 25% troll on floor 1
  (`TrollShareBase`), level = party + 2 × (floor − 1) ± 1, 3% elite, 1% demon on floor 1. Spawns
  keep ≥ 350 px from delvers (`MonsterDelverExclusion`) and ≥ 60 px apart (`MonsterSpacing`).
- AI: wander 150 px around home (`MonsterHomeRadius`, `game.go:354`), aggro 220–260 px, leash
  480–520 px (demon 320 / 700, `monster_tuning.go:198-202`), chase in a straight line with no
  pathfinding (`internal/systems/monster_ai.go:200-206`), then a melee wind-up. Delvers move at
  200 px/s.
- Loot: a chest holds 2–4 items, a sack is 80% empty, drops run 8/15/50% (elite). No gold in a
  run.

**The wire**

- No map message. `ClientGameState` (`internal/types/messages.go:72-103`) carries walls, doors,
  escape doors, switches, stairs, containers, monsters, floor and floor count. `WallState` is
  `{house_id, entity_id, position, width, height}` (`internal/types/game.go:299-305`), mirrored in
  `game-client/src/types/gameState.ts`.
- Everything is re-sent in full every tick at 30 Hz as JSON (`gameserver/handler.go:439`
  `WriteJSON`), estimated ~6–12 KB per player per tick.
- `broadcastFullState` (`session.go:1655-1687`) serializes once, formats per recipient
  (`internal/serializer/state_serializer.go:484-556`), then returns the backend state to the pool
  before the sends; the per-recipient state aliases the pooled slices, which
  `RestBackendStatePool` (`:559`) truncates in place: FS-QG1HR D2 race B, open.
- **Every outbound message can be dropped.** `PushMessageToChannelQueue`
  (`gameserver/server.go:1400-1424`) is a non-blocking send that fails when the connection's queue
  is full; `world_entered` goes the same way (`gameserver/hub.go:1037`, `:1216`). States are
  pushed from one goroutine per recipient (`session.go:1680-1684`), so their order relative to
  another message on the same queue is not fixed.
- The client destroys anything missing from a snapshot (`updateWalls` and the like).

**Other players' state (verified 2026-11-06 on `floor1/teammate-kit` at aa000a67, for §I)**

- `OtherPlayerState` (`internal/types/messages.go`) embeds the shared per-tick `PlayerState`
  (`internal/types/game.go:28-41`), `inventory` and `equipment` included, and
  `FormatStateToClientState` (`internal/serializer/state_serializer.go:494-555`) builds one for
  every other player for every recipient. Run, field and hub all broadcast through it
  (`internal/game/session.go:1707`). One `PlayerState` is made per player per tick
  (`state_serializer.go:179`); the pool keeps only the maps and lists that point to it.
- The client reads bag and worn gear only from `current_player`: the equipment HUD and gear
  overlay (`BarrowspireScene.ts:3468-3470`, `FieldScene.ts:599-603`, `HubScene.ts:1912`), the
  potion count (`ui/potions.ts:47`, `ui/potionDrink.ts` fed `current_player`,
  `BarrowspireScene.ts:4759`). Its other-player readers (`HubScene`/`FieldScene` `placePlayer`,
  `BarrowspireScene` `updateOtherPlayers` and the target frame, `fieldCombat.ts:109`, `ui/party.ts`,
  `ui/partyFramesLayout.ts`, `utils/gameStateLogger.ts`) read id, name, class, position,
  direction, escape, health, level and resource only. `game/MockBackend.ts` builds its own
  `inventory` for other players but is a legacy mock with its own types, not on the wire.

**Collision and bounds**

- Walls and doors are axis-aligned rects with swept AABB (`internal/systems/movement.go:118-246`,
  `SweptX :306`, `SweptY :347`, depenetrate `:386`). Every mover scans every wall three times per
  tick, with no index; "Spatial index for walls and doors" is parked in FS-QG1HR (§ deferred
  table).
- The mover spatial hash key `cellX<<8|cellY` (`movement.go:84,196`) on 40 px cells is safe to a
  world 10,200 px tall (FS-QG1HR D4). Floor 1's 3840 px is 96 cells.
- World bounds are a clamp to the map size. `CreateContainer` (`session.go:3455-3456`),
  `NewMovementSystem`'s defaults (`movement.go:30-35, 432-440`) and `RunBounds`
  (`session.go:240-242`) read the constants rather than the session's size.

**Generation prior art**

- `internal/levelgen` holds the Forest's branching-trail generator: 80 px cells, 39×25
  (`forest.go`), seeded and deterministic with derived retry seeds (`trail.go:18-38`), wall-run
  merging into rects (`merge.go:13`), BFS reachability and flood fill (`validate.go:133-180`). It
  feeds Forlorn Forest (`internal/game/forest_map.go:27`). There is no pathfinding code in the repo.
- Monster and party spawns use a negative "not in any keep-out rect" test
  (`monster_population.go:231-363`, `party_spawn.go:45-142`), which breaks in a dungeon, where
  almost every point is inside rock.

**Client**

- Iso is 40 px per tile (`game-client/src/render/iso/projection.ts:45`).
- `BarrowspireScene` hard-codes `mapWidth = 1440; mapHeight = 960` (`:616-617`), feeding the camera
  (`:2925-2928`), ground, perimeter (`:3893-3900`), dressing (`:3932`) and blackout
  (`:2554-2563`).
- The escape door and switch are read as `[0]` (`:4861-4865`).
- Rooms are walls grouped by `house_id` (`render/world/houses.ts:18-44`); a wall's front/back height
  comes from its side of the house's bbox (`render/world/walls.ts` `sideOf :61-73`, `heightOf :76`);
  a wall with no house has no side today.
- The ground is one RenderTexture over the projected bounds (`render/world/scene.ts:136-145`),
  about 7680×3840 at floor 1's size.
- **Phaser 4.2.1 does not cull display-list objects.** `GameObject.willRender`
  (`node_modules/phaser/src/gameobjects/GameObject.js:707-712`) tests only the render flags and the
  camera filter, never the view; the camera's `cull` (`cameras/2d/BaseCamera.js:796`) is called
  only by tilemap layers (`tilemaps/TilemapLayerWebGLRenderer.js:53`) and input. A hidden object
  (`setVisible(false)`) is skipped.
- **A drawing context larger than the GPU's limit is silently clamped**:
  `DrawingContextPool` (`renderer/webgl/DrawingContextPool.js:143-145`) cuts width and height to
  `MAX_TEXTURE_SIZE`, which `WebGLRenderer` reads from the GL (`WebGLRenderer.js:755-757`). 4096 is
  a common floor; 2048 is safe everywhere WebGL is.
- No sprite culling today, only lights. The indoor blackout (`render/world/blackout.ts`,
  `indoors.ts`) hides everything but the player's building.

**Navigation references (looked up, not in the repo)**

- Octile distance for an 8-direction grid, `D·(dx+dy) + (D2−2D)·min(dx,dy)` with D = 1, D2 = √2;
  admissible when D is the lowest step cost (Amit Patel, "Heuristics",
  theory.stanford.edu/~amitp/GameProgramming/Heuristics.html).
- No corner cutting: a diagonal step is allowed only when both orthogonal cells it passes are
  walkable (PathFinding.js `DiagonalMovement.OnlyWhenNoObstacles`, `src/core/Grid.js`
  `getNeighbors`: `d0 = s3 && s0` …).

## Requirements

### §A. The dungeon generator (`internal/levelgen`)

1. **A new generator in `internal/levelgen`** produces a dungeon layout from parameters and a seed.
   It is pure: it knows nothing of entities, monsters, loot or the wire. (A3)
2. **Grid.** 72 × 48 cells of 80 px: 5760 × 3840 px. (A1, A2)
3. **Rooms.** 18–28 rooms, the count drawn uniformly. Each room is a rectangle of cells from 4×4
   (crypt) to 10×8 (hall), width drawn in [4, 10] and height in [4, 8]. Rooms are placed by
   rejection sampling. Two rooms are at least 2 cells apart, and every room is at least 2 cells
   from the grid's edge, so each room has its own shell and no walkable cell lies on the edge
   ring. **(derived here: a 2-cell gap keeps a shell wall on each side, so rooms meet only through
   corridors)** (A3)
   - The count is drawn once per seed and kept across the seed's retries (§A.9); each room's size
     is drawn once per attempt and only its position is retried. **(derived here: a count or size
     redrawn on every rejection is turned away more often the larger it is, so the survivors skew
     small; measured before the fix, width 4 came out twice as often as width 10)**
   - An attempt places its rooms largest first, by area. **(derived here: with each size fixed, a
     large room left to the end often finds no gap among the small ones; largest first, no seed in
     5,000 exhausted its retries. The order moves rooms, never which sizes are drawn)**
4. **Corridors.** Rooms are joined along a connection graph: a minimum spanning tree over room
   centres by straight distance, plus `round(0.2 × rooms)` extra edges, taken from the shortest
   non-tree pairs. Each edge is carved as an L-shaped corridor, 2 or 3 cells wide (drawn per
   corridor), its bend leg order drawn. A corridor may cross another room or corridor; cells it
   carves inside a room belong to that room. **(derived here: MST + shortest extra edges is the
   textbook way to get "everything connected plus ~20% loops")** (A3)
5. **Regions.** Every walkable cell belongs to exactly one region. A room's cells are its region.
   Walkable cells outside every room are cut into **corridor segments**: each is 4-connected and
   its bounding box is at most 16 cells on its longer side. Regions have integer ids from 1,
   unique on the floor. Each region is described as a list of cell rects. **(derived here: the cut
   keeps a long corridor from being one fog region in FS-SRA9J)** (A9)
6. **Doorways.** A doorway is a room cell 4-adjacent to a corridor cell. Every room has at least
   one. There are no doors. (A5)
7. **Walls are the shell.** A wall cell is a non-walkable cell 8-adjacent to a walkable cell. Wall
   cells are merged into axis-aligned rects (by the wall-run merging of `merge.go`, or an
   equivalent). Non-walkable cells beyond the shell are **void**: no wall, no entity. **(derived
   here: the shell is closed on diagonals, so void is unreachable and needs no collision; sending
   only the shell keeps the map small and the client draws void as ink)** (A3, A9)
8. **Validation.** A layout is valid when every walkable cell is reachable from the start room by
   4-neighbour BFS (as `validate.go:133` does for the Forest), every room has a doorway, the regions
   partition the walkable cells, and the room roles of §B can be assigned. (A3)
9. **Seeded and deterministic.** The same parameters and seed always give the same layout,
   regions and room roles. An invalid attempt retries with a seed derived from the original, as
   `Generate` does (`trail.go:18-38`), up to a retry limit; exhausting it is an error the floor
   build handles (§B.17). Each floor's seed is drawn by the session when it builds the floor and is
   logged with `slog` at debug, so a floor can be reproduced. (A3)

### §B. Building floor 1

10. **Floor 1 is built from the dungeon generator; floors 2 and 3 are built exactly as today**
    (FS-F6F88 §5). This FS supersedes FS-F6F88 §5 for floor 1 only. The floor build step stays one
    seam (FS-F6F88 §8) that chooses the generator by floor. **(charter default, owner: floor 1
    only)** (A1)
11. **Per-floor size.** The session's map size is the current floor's: 5760×3840 on floor 1,
    1440×960 on floors 2–3. Every reader of the map size reads the session's, not the constants:
    `CreateContainer`, `NewMovementSystem`'s defaults, `RunBounds`, the bounds clamp, spawn
    sampling. (A1, A12)
12. **Room roles.** The floor build assigns, from the layout: (A4)
    - one **start** room, at least 5×5 cells, where the party spawns;
    - one **switch** room, one **escape door** room and one **stairs** room, three different
      rooms, each drawn from the rooms at least as far from the start as the median room, by BFS
      path length in cells between room centres; the top floor has no stairs, but floor 1 is never
      the top; **(derived here: "far" as the farther half by walking distance, so the trek is real
      and a 4×4 crypt next door never qualifies)**
    - three or four **treasure** rooms, drawn from the remaining rooms, the farther half first.
    Roles are server-only. They are never sent. (A9)
13. **The party spawns in the start room.** Every arrival slot (`gatherParty`, including the slots
    kept for expected members, FS-K2HKP R18) is on a walkable cell of the start room, at least
    `PlayerRadius` clear of any wall. (A4)
14. **Fixed interactables.** The switch, escape door and stairs each stand on a walkable,
    non-doorway cell of their room, clear of walls, and are placed through the occupied-area
    check, so nothing later overlaps them. **On floor 1 the escape door and switch do go through
    the check** (today they skip it). The stairs are always placed (FS-F6F88 §7). (A4) A room whose
    random draws all miss is searched whole, on a lattice finer than any fixture's slack in a
    cell. A room with no such spot at all fails its layout: the floor build tries a fresh seed,
    then today's floor (§B.17). A fixture is never forced onto a doorway or over another.
    **(derived here: forcing it onto the room's centre broke R14; the spots are found before
    anything is laid, so a failed layout leaves nothing behind)**
15. **Containers.** Floor 1 has `clamp(round(rooms / 2), 10, 14)` containers. Each treasure room
    holds one **chest**. The rest go one per room into rooms drawn from those that are not the
    start or a treasure room, each a chest or, at today's sack share (33%), a sack. Loot tables,
    item counts and the sack's empty chance do not change. (A7)
16. **Positive spawn sampling.** On floor 1 every spawn position (party slot, container,
    interactable, monster) is drawn from walkable cells of the target region, inset from the cell
    edges that touch a wall by the body's radius, never by testing "outside every keep-out rect".
    Floors 2–3 keep today's sampling. (A6)
17. **A failed generation never strands a run.** If the generator exhausts its retries, or its
    layout leaves a fixture no spot (§B.14), the floor build logs an error and falls back to a
    fresh seed; if that fails too, floor 1 is built by
    today's generator at 1440×960 so the run still starts. **(derived here: a run that cannot
    start is worse than a small floor; a test pins that the fallback is reachable only through the
    error path)**

### §C. Monsters on floor 1

18. **Per-room population.** (A6)
    - The start room has no monsters, and no monster spawns within 350 px of a delver (today's
      rule).
    - A **hall** is a room of at least 8×6 cells: width W ≥ 8 and height H ≥ 6, so a 6×8 room
      (6 wide, 8 tall) is not a hall. Each hall that is not the start or a treasure room holds one
      **hall pack**: 1 troll and 2–4 ghouls, placed within 160 px of the troll. **(derived here:
      the size threshold, and that it is oriented: W ≥ 8 and H ≥ 6, never 6×8)**
    - Every other room (switch, escape door and stairs rooms included) holds 0–3 monsters, the
      count uniform, each rolled as today (75% ghoul / 25% troll on floor 1).
    - **Corridors** hold 4–8 monsters in all, at most one per corridor segment.
    - Each **treasure room** is guarded by one elite (50%) or a pack of 2–3 elites (50%), the
      archetype rolled; every guard is elite. **(derived here: "guarded by an elite or a pack" and
      "guards are always elite" together)**
    - The total of the above is held to 45–70: below 45, single monsters are added to random
      ordinary rooms, those that are not the start, a treasure room or a hall (at most 4 per
      room); above 70, monsters are removed from ordinary rooms, then corridors. **(derived here:
      the top-up skips halls, so every eligible hall holds exactly its one troll pack)**
19. **Unchanged rolls.** Levels (party ± 1 on floor 1), the 3% elite chance for every monster that
    is not a treasure guard, the troll share for rolled monsters and the 1% demon on floor 1 stay
    as today. A demon, when rolled, goes in a room among the farthest from the start, never the
    start. It is not counted in the 45–70. (A6)
20. **Spacing.** Monsters keep ≥ 60 px apart and clear of containers and interactables, and are
    never placed on a doorway cell. (A6)

### §D. Navigation on floor 1 (A*)

21. **The cell grid is the navigation graph.** Walkable cells are nodes; bodies are not obstacles.
    (A8)
22. **Steps.** 8-connected. A diagonal step is allowed only when both orthogonal cells it passes
    are walkable: no corner cutting (PathFinding.js `OnlyWhenNoObstacles`). Step cost 1 straight,
    √2 diagonal; heuristic octile distance (Patel), which is admissible, so paths are shortest. Ties
    are broken deterministically, so the same query gives the same path. (A8)
23. **Chase.** A monster with a target follows a path of cell centres from its cell to the
    target's. It steers straight at the target when they share a cell, or when the target is in an
    8-neighbouring cell that the step rule above allows. (A8)
24. **Repath at most every 0.5 s per monster.** A chasing monster searches again when the target
    has moved to another cell or its path is used up, and never more often than once per 0.5 s.
    Between searches it keeps following its path. (A8)
25. **Wander and return.** With no target, a monster picks its wander destination among walkable
    cells within its home radius (150 px) of its home point and walks there by path. A leashing
    monster walks home by path. A destination is always reachable, since §A.8 makes the floor
    connected. (A8)
26. **Unchanged rules.** Aggro and leash are still measured as straight distance, aggro has no
    line-of-sight test, the wind-up and strike are unchanged, and movement and collision stay the
    movement system's (FS-77AB6 §26). **This FS brings pathfinding into scope for floor 1, which
    FS-77AB6 §Out of Scope left out.** Floors 2–3 keep the straight chase. **(charter default,
    owner: floor 1 only)** (A8)
27. **A search that finds nothing** (which a valid layout never produces) falls back to today's
    straight steer for that monster until its next search, and is logged at debug.

### §E. Collision

28. **Static wall index.** Each run floor builds, at floor build time, a uniform grid index over
    its wall and door rects. Movers test only the rects in the buckets their swept box covers,
    not every wall. The index is rebuilt on every floor change and never changes during a floor.
    (A11)
29. **Same answers.** For any mover and tick, the index gives exactly the collision result of
    today's full scan: candidates are tested in today's order. Floors 2–3 therefore move exactly
    as today. (A11, owner: floor 1 only)
30. **Hash key bound.** A test pins that floor 1's height in spatial-hash cells stays under the
    key's 255-cell limit (FS-QG1HR D4). (A1)

### §F. The floor map on the wire (ADR-0060)

The game uses the WebSocket, not HTTP: this FS has no §API surface. The message shapes below are
the contract between the two halves.

31. **A new outbound message, `floor_map`**, describes the current run floor: (A9)

    ```
    { "action": "floor_map", "payload": {
        "session_id": "<uuid>",
        "floor": 1,
        "width": 5760, "height": 3840,
        "cell_size": 80,                                   // dungeon floors only
        "regions": [                                       // dungeon floors only
          { "id": 1, "kind": "room" | "corridor",
            "cells": [ { "x": 12, "y": 4, "w": 6, "h": 5 } ] }   // cell units
        ],
        "walls": [ WallState, … ]                          // today's shape, unchanged
    } }
    ```

    On floors 2–3 `cell_size` and `regions` are absent and `walls` carry their `house_id` as
    today. On floor 1 walls carry no `house_id`. Room roles are not sent.
32. **When it is sent.** To a member right after every `world_entered` for the run (entry,
    handoff to the host pod, reconnect at `hub.go:1216`), on the same queue; to every recipient of
    the run's broadcast on every floor change, after the floor is rebuilt and before the new
    floor's first broadcast, from the loop goroutine; and in answer to `request_floor_map`. (A9)
33. **A new inbound action, `request_floor_map`** (no payload), answered with the current
    floor's `floor_map`, at most once every 900 ms per connection; ignored outside a run.
    **(derived here: every outbound message can be dropped on a full queue, `server.go:1418-1424`,
    so a client must be able to ask again; the client asks every second (§H.41), and a window of a
    full second refused every other retry that arrived a little early, so the window is 100 ms
    short of the client's period)**
34. **Walls leave the run snapshot.** A run world's per-tick state carries no `walls` key, on every
    floor. Doors stay in the snapshot (they open and close). Hub and field worlds keep `walls` in
    their snapshot as today. **(derived here: hub and fields are outside this charter)** (A9)
35. **Floors 2–3 are unchanged apart from how walls arrive.** Their walls, buildings, doors,
    containers, interactables, monsters and every other snapshot field are exactly today's.
    **(charter default, owner: floor 1 only)**

### §G. Interest on floor 1 (ADR-0060)

36. **Distance cut.** On floor 1 each recipient's snapshot carries only the monsters (corpses
    included), drop piles and containers whose centre is within 1600 px of the recipient's
    **interest centres**. Players (party members), doors, the switch, the escape door, stairs,
    projectiles, trails, items and equipment are always sent. (A10)
37. **Interest centres.** A recipient with a living, in-play body: that body. A recipient without
    one (dead, escaped, left behind, spectating): every living, in-play party member's body, so a
    spectator sees what the watched teammate sees. With no living member at all, nothing is cut.
    **(derived here: the server does not know whom a spectator watches)**
38. **Fresh slices.** A recipient's cut lists are new slices, never aliases of the pooled backend
    state, so the cut adds no new instance of FS-QG1HR D2 race B. (A10)
39. **Floors 2–3 are not cut.** Every entity is sent as today. **(charter default, owner: floor 1
    only: a 1440×960 floor's diagonal is 1731 px, so a 1600 px cut would drop a corner monster)**

### §H. Client

40. **Floor map intake.** The client accepts `floor_map` and keeps the latest one per session
    outside the scene (the game-session store), so a map that arrives before the run scene's
    `create` is not lost. A map for a lower floor than one already held is ignored, and so is a
    map for another session than the world entered. (A9; the session check **derived here,
    review round 1**)
41. **Waiting for the map.** A run snapshot whose `floor` has no map yet is applied for its
    dynamic entities, but the floor is not built until its map arrives. While a run snapshot's
    floor has had no map for 1 s, the client sends `request_floor_map`, then again every second.
    A snapshot for a floor lower than the held map's is dropped (a late frame from before the
    climb). On a floor change the transition's veil (FS-F6F88 §32) stays up until the new floor's
    map is built. **(derived here, from §F.33)** A fixed light queued from a snapshot that came
    before its floor's map (a container's pool) waits until the floor is built from the map, so
    it joins the floor's chunks, light cap and fog like every other. **(derived here, review round
    1)**
42. **Map size from the map.** The scene's map size comes from `width` and `height`; nothing in
    the run scene hard-codes 1440×960: camera bounds, ground, perimeter, dressing, blackout and
    the light-map read it. (A12)
43. **Walls from the map.** In a run, walls come only from the floor map, built once per floor;
    the per-floor rebuild (FS-F6F88 §33) runs when a new floor's map is built. (A9) A dungeon held for another floor (the run scene sized by
    an older map the store still held, as on a reconnect mid-climb) is dropped when a map that is
    not it comes, so a floor of buildings is never built through it. **(derived here, review round
    1)**
44. **Chunked ground.** The ground is drawn in render-texture chunks of at most 2048 px a side,
    because a larger drawing context is clamped to the GPU's limit (Facts). On a dungeon floor
    ground is painted only under walkable and shell cells; void is the canvas's darkest ink
    (`palette.inkDeep`). (A12) A chunk no walkable or shell cell falls in has no render
    texture (floor 1's fixture: 71 of 128 chunks, 64.8 MiB of RGBA against 116.8); the ground is
    painted once as the floor is built, and leaving a floor does not repaint it; without the
    ground's art the placeholder stone lies under ground cells only. **(derived here, review round
    1)**
45. **Drawn near the camera only.** On a dungeon floor, wall pieces, run dressing and wall light
    sources are grouped by ground chunk, and only the chunks that intersect the camera's view
    grown by one chunk are visible; the rest are hidden (`setVisible(false)`, which the renderer
    skips, since Phaser does not cull them itself). **(derived here: build once, toggle visibility
    when the camera crosses a chunk edge, rather than create and destroy)** (A12)
46. **Wall height on a dungeon floor.** A wall piece is **front** (cut away, low) when a walkable
    cell lies directly north or west of it, that is, it bounds a region on the region's south or
    east side; otherwise it is **back** (full height). Where a wall borders walkable cells on both
    sides, front wins, so nothing in play is hidden. This is also the corridor rule: an east–west
    corridor has a low south wall and a full north wall; a north–south corridor a low east wall
    and a full west wall. A full wall piece that covers the local player on screen fades by the
    existing occluder rule. This keeps today's look ("South and east sides face the camera and are
    cut away", `walls.ts:75-76`). (A12) The pieces are cut along wall runs drawn from the wall
    cells and the faces they show, never rect by rect from the map's walls, which the server
    merges row by row (§A: a wall along world y comes as rects that stop a cell short of each
    corner, a lone cell of it as a 1×1 rect, the rows of a thick one as rungs across it; cut rect
    by rect it stood as a row of slabs across itself with gaps, Nick's "holey" walls running top
    right to bottom left). A wall cell faces a region along x when a walkable cell lies directly
    north or south of it, along y when one lies directly west or east; a run is a line of cells
    facing the same way, reaching one cell on at each end into the wall it meets, so a corner's
    cell is in both its runs and its post stands at the corner. Runs of one cell are dropped; a
    wall cell no run reaches stands alone as a one-cell wall. (These run rules, and `dungeon.ts`
    `wallRuns` that held them, are gone on a dungeon floor: its walls are edge runs of FS-XK2B6,
    R3, R26.) **(derived here, floor1/y-walls diagnose 2026-11-06)** A run's pieces stand only between its two end
    posts: the half cell of each run past the post at a corner's centre is not drawn, so where a
    wall along x meets one along y nothing sticks out of the corner. This now holds by
    construction, not by a rule that drops pieces: a run ends at the cell corner where its post
    stands, so no piece lies past a post (FS-XK2B6 R25, R26).
    **(derived here, floor1/corner-stubs diagnose 2026-11-11)**
47. **A dungeon floor has no buildings.** No building exterior, roof or stone cap, no silhouette,
    no indoor blackout and no client perimeter wall: the shell walls are the floor's edge. Run
    dressing stands inside rooms only, never in a corridor or within one cell of a doorway, at
    FS-8RBQY §C's density per room area, planned from the floor map and the fixtures every
    snapshot carries (stairs, switch, escape door), never the containers interest cuts, so every
    member strews the same; a piece a container turns out to stand by (FS-8RBQY §C.5's keep-out)
    gives way, flame and all, when that container is first seen, for the rest of the floor.
    **(derived here, review round 1: the server stands a container anywhere in its room, so no
    map-only plan can keep clear of it)** Wall light sources stand on back walls of rooms at
    today's spacing. The floor band (floor 1: lower) and the tower sheets are FS-8RBQY's; no new
    art. (A12, Out: new art)
48. **Entities come and go.** With interest, a monster, drop pile or container can leave a
    snapshot alive and come back. One that leaves is removed with no death clip, sound or notice;
    one that appears is created in its current state (a corpse on its last death frame, an opened
    container open, its health the baseline), with no death clip, open presentation or damage
    flash replayed. (A10)
49. **Floors 2–3 look exactly as today.** Same ground, buildings, walls, roofs, blackout,
    perimeter, dressing and lights, to the pixel. **(charter default, owner: floor 1 only)**
50. Visuals follow `game-client/docs/design-guideline.md`; colours from tokens only (ADR-0013).

### §I. Other players' bag and worn gear (ADR-0064, amendment 2026-11-06)

This section applies in every world (run on every floor, field, hub), unlike §F–§H. It changes
only what an `other_players` entry carries.

51. **Other players carry no bag or worn gear.** Every `other_players` entry of every state, in
    every world, has no `inventory` key and no `equipment` key. Everything else it carries today
    stays: `id`, `entity_id`, `username`, `class`, `position`, `direction`, `escape`,
    `current_health`, `max_health`, `level`, `experience`, `level_floor`, `next_level_at`, and, for
    the recipient's party members, the class resource and the parry fields (FS-CH21F R1–R4).
    (owner: "那就不用看到隊友的背包了")
52. **The recipient's own state is unchanged.** `current_player` carries the recipient's own
    `inventory` and `equipment` exactly as today, in every world, and so do a dead delver left
    behind and an escaped delver seeing themselves.
53. **No writes, no new aliasing.** The trimmed entry is built per recipient without writing the
    broadcast's shared player state (FS-CH21F R4) and without sharing any list with the pooled
    backend state, so a sent frame is unchanged by the next tick's pool reset under `-race`
    (§G R38, FS-QG1HR D2 race B).
54. **The client's type says so.** The client's type for an `other_players` entry has no
    `inventory` and no `equipment` field, so a read of either from another player fails the
    typecheck. **(derived here: nothing reads them today, Facts; the type keeps it that way)**
55. **Fetched on demand, never streamed.** No later feature puts another player's bag or worn gear
    back into the per-tick state. One that needs them (looting a dead teammate's finds, inspecting
    a player) fetches that one player's items at the moment of the action, by its own request, and
    the server checks the action then. (owner: "就算之後要改應該也是撿的當下再撈就好了"; ADR-0064
    Decision 3)
56. **Measured.** The bytes-per-recipient bench gains a hub case at the occupancy cap
    (`HubOccupancyCap`, 40 players, each with a bag and worn gear) and reports the other players'
    share; the slice records before and after for floor 1 (cut), floor 2 and the hub.

### §J. Guarded chests on floor 1 (amendment 2026-11-06)

This section applies on dungeon floors only (floor 1 today). It gates a chest's open and nothing
else: the chest's roll, its placement (R15) and the population (R18–R20) are unchanged.

57. **Which chests are guarded.** On a dungeon floor, each **chest** standing in a treasure room
    or in a hall that holds a hall pack is **guarded**. A sack is never guarded, nor is a
    container in any other room. Floors 2–3, and a floor 1 built of buildings after a failed
    generation (R17), have no guarded chest. **(owner, playtest 2026-11-06: chests in rooms that
    spawn with guards; floor 1 only)** **(derived here: a sack that a guarded hall draws, at the
    sack share, is not guarded, since the owner named chests)**
58. **A chest's guards.** A guarded chest's guards are the monsters its room was populated with
    as guards, fixed at the floor build by entity: a treasure room's elites, or a hall's troll and
    ghouls. They are never the demon, even standing in that room, never a corridor's monsters, and
    never a rolled single or a top-up. The top-up draws only from ordinary rooms, so it never
    places a monster in a hall or a treasure room (R18), and a hall's guards are exactly its pack.
    A member that found no spot is not a guard. A room with no guard placed has no guarded chest.
    **(owner, playtest 2026-11-06)**
59. **It opens once every guard is dead.** A guard **stands** while it is in the world with
    health above 0, wherever it has chased to. A guard that left the room still counts until it
    dies. Who killed it does not matter, any member's kill counts. The open asks this when a
    delver reaches for the chest, on the tick (client actions are applied by the tick,
    I-77AB6-11). No event, flag or count tracks the guards. **(owner, playtest 2026-11-06; derived
    here: the lazy check on the tick, so a kill and an open are never out of step and a reconnect
    has nothing to restore)**
60. **Refused by the server.** Reaching for a guarded chest while a guard stands is refused by the
    server before anything opens. The chest stays shut and nothing is rolled. It is not held, so
    the next reach is answered afresh. Range is checked first, so a chest out of reach is refused
    for the distance. The delver is sent an `interact` refusal with reason `container_guarded`. The
    client shows the refused notice **"It will not open."**, in the client's words, naming no
    reason, and no coffer: the E key on a shut container opens its coffer only on the state that
    shows the container open, so a refused reach never flashes a coffer open and shut; a container
    already open opens its coffer at once. **(owner, 2026-11-11: "應該直接顯示無法開啟"; replaces
    "closes the coffer the E key opened")** The server logs the refusal at debug, as play, not a
    fault. **(owner, playtest 2026-11-06: "就開的時候顯示無法開啟"; derived here: the copy, in the
    guideline's terse voice)**
61. **Nothing is drawn or sent.** A guarded chest looks like any chest. No lock is drawn, no flag
    is sent and no effect plays when the last guard falls. The refusal is the whole signal.
    **(owner, playtest 2026-11-06: no lock icon, no visual change; derived here: no wire flag, since
    the refusal alone suffices)**

## User Stories

1. As a delver, I want floor 1 to be a dungeon of rooms and corridors, so that the first floor feels like the Spire's depths rather than a yard.
2. As a delver, I want every floor 1 to be laid out differently, so that each delve is new ground.
3. As a delver, I want floor 1 to have loops, so that a corridor full of monsters is not the only way on.
4. As a delver, I want to start in a quiet room, so that the party can gather before the first fight.
5. As a delver, I want the switch, the escape door and the stairs to be far from the start and apart from each other, so that escaping or climbing means crossing the floor.
6. As a delver, I want treasure rooms with a chest and an elite guard, so that a detour is a risk worth taking.
7. As a delver, I want monsters spread through rooms and corridors, so that the floor is dangerous throughout and not in one cluster.
8. As a delver, I want a big hall to hold a pack led by a troll, so that halls feel like set pieces.
9. As a delver, I want monsters to come around walls after me, so that a wall is not a safe place to stand and shoot.
10. As a delver, I want a monster that loses me to walk home properly, so that it does not wedge on a corner.
11. As a delver, I want open doorways, so that moving between rooms is never blocked by a door.
12. As a delver, I want to be able to reach every part of the floor, so that no switch, door or chest is sealed off.
13. As a delver, I want floors 2 and 3 to stay as they are, so that the climb still changes pace after floor 1.
14. As a delver, I want the walls to be drawn the way the tower always looked, so that floor 1 still reads as the Barrowspire.
15. As a delver, I want the corridor walls nearest the camera to be low, so that I can always see myself and my party.
16. As a delver, I want the game to stay smooth on a floor sixteen times larger, so that a big floor does not cost frame rate.
17. As a delver on a slow connection, I want the floor's layout sent once, so that every tick is small.
18. As a delver reconnecting mid-run, I want to be sent the floor's layout again, so that I land on the right floor fully drawn.
19. As a delver whose floor map was lost on the way, I want the game to ask for it again, so that I never stand on an undrawn floor.
20. As a delver climbing the stairs, I want the new floor to appear only once its layout is in, so that I never see half a floor.
21. As a delver, I want monsters far away not to be sent to me, so that my traffic stays small.
22. As a delver, I want a monster coming back into range to appear as it is, so that I do not see a death or an opening replayed.
23. As a dead delver watching my party, I want to see what my teammates see, so that spectating still works on a large floor.
24. As a developer, I want the dungeon generator to be pure and seeded, so that a reported layout can be reproduced from its seed.
25. As a developer, I want collision on a large floor to test only nearby walls, so that the tick stays inside its budget.
26. As a developer, I want later floors to follow the same layout conventions, so that floors 2 and 3 can become dungeons without new rules (ADR-0061).
27. As a delver matched with strangers, I want my bag and worn gear kept off their wire, so that nobody can read what I carry from devtools.
28. As a delver in a full hub, I want each tick to carry only what the scene draws of the other players, so that the hub stays smooth on a slow connection.
29. As a delver, I want my own bag and worn gear in my state as before, so that my gear screen, potion count and equipment HUD keep working.
30. As a delver in a party, I want my teammates' health, level and class resource as before, so that the party frames do not change.
31. As a developer, I want the client's type for another player to lack bag and worn gear, so that a new read of them fails the typecheck instead of shipping as `undefined`.
32. As a developer adding a loot-a-teammate feature later, I want the rule written down, so that I fetch the body's items when it is looted rather than stream every bag.
33. As a delver, I want a treasure room's or a hall's chest to stay shut until its guards are dead, so that the loot is earned by the fight and not snatched past it.
34. As a delver, I want a guard that chased me out of the room still to count, so that luring guards away is not a way around them.
35. As a delver in a party, I want a teammate's kill to count, so that whoever lands the blow, the chest opens for all of us.
36. As a delver, I want a short "It will not open." when I try too early, so that I know the chest refused me without the screen spelling out what the monsters already show.
37. As a delver, I want the chest to open on my very next try once the last guard falls, so that I never wait on a hidden timer.
38. As a delver on floors 2 and 3, I want chests to open as they always have, so that only floor 1's guarded rooms change.

## Acceptance Criteria

**Generator (§A)**

- [ ] For 1,000 seeds the generator returns a valid layout: 72×48 cells of 80 px, 18–28 rooms within 4×4–10×8, corridors 2–3 wide, every walkable cell reachable from the start room, every room with a doorway, no walkable cell on the edge ring.
- [ ] The regions partition the walkable cells; each corridor segment is 4-connected and at most 16 cells on its longer side; region ids are unique from 1.
- [ ] Walls are exactly the shell cells (8-adjacent to walkable), merged into rects that cover them with no overlap; no void cell is a wall.
- [ ] The extra connections number `round(0.2 × rooms)`; at least one layout in the 1,000 has a loop through four or more rooms (the graph is not a tree).
- [ ] The same seed gives byte-identical layouts, regions and roles; a golden layout for one seed is pinned in `testdata`.

**Floor 1 build (§B, §C)**

- [ ] Floor 1 is 5760×3840 and built from the generator; floors 2 and 3 are 1440×960 and built by today's generator (their existing tests pass unchanged).
- [ ] Switch, escape door and stairs stand in three different rooms, each at least median distance from the start; 3–4 treasure rooms each hold a chest; every party slot is in the start room.
- [ ] Floor 1 has 10–14 containers, at most one per room outside the treasure rooms.
- [ ] Across 1,000 floor-1 builds: 45–70 monsters besides a demon; none in the start room or within 350 px of a delver; none on a doorway; ≥ 60 px apart; every treasure guard elite; every hall that is not start or treasure holds 1 troll and 2–4 ghouls.
- [ ] Every spawned body on floor 1 stands on a walkable cell, inset from walls by its radius.
- [ ] Every reader of the map size (`CreateContainer`, `NewMovementSystem`, `RunBounds`, the clamp) reads the floor's size; a test fails if one reads the constant on floor 1.
- [ ] A forced generator failure still starts the run (the fallback), and logs an error.

**Navigation (§D)**

- [ ] A* tests on hand-made grids: shortest paths, no diagonal through a blocked corner, deterministic ties, octile heuristic.
- [ ] A monster on the far side of a wall from its target reaches it by path in a system test on a fixture floor; on floor 2 the same setup chases straight (today's behaviour).
- [ ] A chasing monster searches at most once per 0.5 s (counted in a test with a moving target).
- [ ] Wander destinations are walkable cells within 150 px of home; a leashing monster walks home by path.
- [ ] The run tick bench on floor 1 (4 delvers, 70 monsters all chasing) runs a mean tick under 8 ms (a quarter of the 33 ms budget) on the bench machine; the figure is recorded in the slice's PR.

**Collision (§E)**

- [ ] For recorded mover traces on floors 1 and 2, the indexed collision gives identical positions to the full scan, tick by tick.
- [ ] `movement_bounds_test.go` and the existing movement tests pass unchanged; a test pins floor 1's height under the hash key's limit.

**Wire (§F, §G)**

- [ ] A member gets `floor_map` after every `world_entered` for the run (entry, handoff, reconnect), and every recipient gets it on a floor change before the new floor's first state.
- [ ] `request_floor_map` is answered with the current floor's map at most once every 900 ms; outside a run it is ignored.
- [ ] Run snapshots have no `walls` key on any floor; hub and field snapshots keep it.
- [ ] Floor 2–3 `floor_map` walls are exactly the walls today's snapshot carried, `house_id` included; no `regions`, no `cell_size`.
- [ ] On floor 1, a recipient's snapshot holds exactly the monsters, drop piles and containers within 1600 px of its interest centres, and always every player, door, switch, escape door and stairs; a spectator's centres are the living members.
- [ ] Floors 2–3 snapshots are not cut.
- [ ] A race test (`-race`) shows a recipient's cut lists are not touched by the next tick's pool reset.
- [x] The bench records bytes per recipient per tick on floor 1 and floor 2, and the floor-1 `floor_map` size; floor 1's per-tick size is at most 16 KiB on the real-population bench (`BenchmarkFloor1Snapshot_BytesPerRecipient`, floor 1's real population over 50 floors), and its map at most 128 KB. **(charter default (owner decision): Nick, "這是網頁遊戲 符合標準就行了"; the synthetic uniform-70 fixture, 18.0 KB mid-floor, is informational only)** Measured 2026-11-06 (I-KE075-4): start room mean 10.6 KB, max 14.9 KB; most crowded room mean 13.8 KB, max 16.1 KB (16,100 B); no floor over 16 KiB. Map: 200 builds, mean 18.2 KB, largest 22.9 KB.

**Other players (§I)**

- [ ] In a run (floor 1 cut, floor 2), a field and the hub, no `other_players` entry has an `inventory` or `equipment` key, and each still has every other key it had, party resource and parry fields included.
- [ ] `current_player` carries its own `inventory` and `equipment` unchanged in a run, a field and the hub, and when left behind or escaped.
- [ ] Building frames for several recipients leaves the shared player states unwritten, and a `-race` test shows a sent frame's other players untouched by the next tick's pool reset.
- [ ] The client's `other_players` entry type has no `inventory` or `equipment`; a type test that reads either fails the typecheck.
- [ ] The bench records bytes per recipient per tick before and after for floor 1 (cut), floor 2 and the hub at its cap, in the slice's issue.

**Guarded chests (§J)**

- [ ] Across floor-1 builds, every chest in a treasure room or a hall with guards placed waits on exactly the non-demon monsters standing in that room at the build; sacks, other rooms' containers and floors 2–3 wait on nobody.
- [ ] A guarded chest is refused (`container_guarded`) while a guard stands beside it, after it chased far out of the room, or while one of two guards still lives; it stays shut and rolls nothing.
- [ ] It opens and rolls as any chest once every guard lies dead or its corpse is gone; a chest that waits on nobody opens with a monster beside it.
- [ ] After a refusal, the next reach once the last guard falls opens it at once; out of reach, it is refused for the distance.
- [ ] The client shows "It will not open." on that refusal, and on no other reply, and no coffer opens for a refused reach.
- [ ] `go test -race` on the game package passes with the guarded open in place.

**Client (§H)**

- [x] A `floor_map` arriving before the scene's `create`, after it, or after the floor's first snapshot all end with the floor built once.
- [x] With the map withheld, the client sends `request_floor_map` after 1 s and every second after, and builds the floor when it arrives; a late old-floor snapshot after a climb is dropped.
- [x] No 1440 or 960 remains as a map size in the run scene; camera bounds, ground, dressing and the light-map follow the map's size.
- [x] Floor 1's ground is drawn in chunks no larger than 2048 px; void is `palette.inkDeep`; no perimeter wall, roof, stone cap or blackout on floor 1.
- [x] On floor 1 only chunks within one chunk of the camera's view have visible wall pieces, dressing and wall lights (counted in a test that pans the camera).
- [x] The wall-height rule picks front for walls with walkable cells north or west and back otherwise, front winning, in unit tests over corridor and room fixtures.
- [x] A wall along world y is cut as one run from corner to corner, as a wall along x is: on a hand-made room its sides along y are pieces from corner cell to corner cell with posts only at the corners, and on the levelgen golden every wall cell facing a region only west or east carries a piece along y (only north or south: along x), no piece runs along an axis on a cell with no wall beside it that way unless it stands alone, and no wall cell is bare (`dungeon.test.ts`). (2026-11-06, floor1/y-walls: rect by rect, 146 golden cells facing west or east had no piece along y and 18 lone cells were cut across; headless captures of the column-35 room and room 1 at render scale 1 and 2, fog on and off, show the sawtooth gone; floors 2–3 identical to the parent commit's capture, no pixel over 24/255.)
- [x] A monster leaving and re-entering interest, alive or dead, replays no death clip or flash; a container re-entering open shows open with no open presentation.
- [x] **Floors 2–3 are pixel-identical to today**: headless-browser screenshots of a floor-2 and a floor-3 fixture state match the pre-change captures (same seed and positions), and their run-scene snapshot tests (`scenes/__snapshots__`) are unchanged.
- [ ] Typecheck, the full vitest suite, `go test ./...` and `golangci-lint run` in game-service pass. (2026-11-06, review round 1: typecheck, vitest (5,858), `go test ./...` and `go vet ./...` pass; the module-wide `golangci-lint run` fails on 7 errcheck findings in untouched `cmd/server/main.go` and `auth/middleware.go`, as at 48ece46c, so this box stays open.)
- [ ] Nick's browser check (I-KE075-9) passes.

## Edge States

- **Generator exhausts its retries:** fresh seed, then today's floor (§B.17); logged.
- **Too few far rooms for three roles:** the attempt is invalid and retried (§A.8).
- **A role room with no spot off its doorways:** the layout is not laid; fresh seed, then today's floor (§B.14, §B.17); logged.
- **A pack does not fit in its hall** (spacing): members that cannot be placed are skipped, then the total floor rule tops up.
- **Party bigger than the start room's slots:** the start room is at least 5×5 cells (400 px a side), more than a party of four needs; a test pins that every expected slot fits.
- **Monster aggroes through rock** (no line of sight, FS-77AB6): it walks the long way round by path. Accepted for v1; line of sight is out of scope.
- **Monsters crowd in a 2-cell corridor:** bodies are not obstacles to the path, so a pack queues along a corridor. FS-QG1HR D4 (one entity per hash cell) makes crowded collisions less exact; not fixed here.
- **Target stands in a doorway:** doorways are walkable cells; the path ends there.
- **Floor map dropped:** the client asks again (§F.33, §H.41).
- **Floor map arrives for the next floor before the last old-floor snapshot:** the old snapshot is dropped (§H.41).
- **Reconnect mid-transition:** `world_entered` then `floor_map` for the current floor; the client builds it directly with no transition (FS-F6F88 §32).
- **Recipient alone and dead, no living member:** nothing is cut; the run is about to end anyway.
- **Entity flickering at 1600 px:** created and removed off screen; the view's reach is well inside 1600 px at the logical 1280×720 view. Accepted for v1; no hysteresis.
- **Spectator watching a member far from the others:** the union of centres includes that member, so what they see is sent.
- **Old client on the new server:** not supported; client and server ship together (one branch).
- **Canvas renderer fallback:** chunked ground and visibility toggles work the same; no mask is involved.
- **A teammate dies holding the run's best find (§I):** nobody else sees what they carried; their items go home or are lost by the existing settlement rules. Looting them is not a feature; if it becomes one, it fetches on demand (R55).
- **Spectating a teammate (§I):** the spectator sees the teammate's body, health and resource as before, never their bag; the spectate view draws no bag today.
- **A guard leashes away (§J):** it still stands, so the chest stays shut until it is killed wherever it went; walking home, it comes back to the room still counted (R59).
- **A guard dies while a delver reaches (§J):** the kill and the reach are both applied on the tick, in order. A reach applied before the killing blow is refused, the next one after it opens. There is no window where both hold (R59).
- **A reconnect or a handoff mid-floor (§J):** nothing to restore. The guards live in the world, and the open asks them when the reconnected delver next reaches (R59).
- **Two members reach at once (§J):** each reach is refused or opens on its own. The first to open after the last kill opens it for everyone, as any chest (R60).
- **A guard is dead but its corpse still lies (§J):** a guard at 0 health does not stand, and the chest opens (R59).
- **A treasure guard or pack member found no spot (§J):** it is not a guard. A room whose guards all failed has no guarded chest (R58).
- **The demon stands in a guarded room (§J):** it is never a guard, so the chest opens once the room's own guards are dead, the demon alive or not (R58).
- **A hall draws a sack (§J):** the sack opens freely; only chests are guarded (R57).
- **A player's own state when they have none in play (§I):** a dead delver left behind or an escaped one still gets their own `inventory` and `equipment` in `current_player` (R52).

## Verification

Each slice records its measured figures (tick time, bytes per tick, map size) in its PR or issue.
Floors 2–3 identity is checked by headless-browser screenshots against captures taken before the
first client slice, kept as test fixtures. The client's dungeon fixture
(`render/world/dungeon.fixture.json`) is the levelgen golden's floor map (size, cell size,
regions, walls; never roles), written by `node tools/fixtures/dungeon-fixture.mjs`;
`dungeon.test.ts` fails when the golden changes until it is run again.

**Follow-up (review M6, owner decision):** enable WebSocket permessage-deflate on the game
connection later, then re-measure bytes per recipient per tick on the real-population bench and
on the wire.

## Out of Scope

Run gold; new monster types; locked rooms and keys (§J guards a chest by its room's monsters, with no key or lock); a lock look, an unlock effect or a wire flag for a guarded chest; guarded sacks; traps and ambushes; line of sight; floors 2–3
as dungeons; anti-cheat and server-side fog; fog of war and the minimap (FS-SRA9J); the monster
target frame (FS-48CTQ); DB, migrations, other services and the HTTP contract; new art; walls in
the hub and field worlds' snapshots; interest filtering on floors 2–3 or outside runs (§I trims other players' bag and worn gear everywhere, but cuts nothing by distance outside a dungeon floor); an on-demand fetch of another player's items (none is built; R55 only sets the rule); a worn look on other players' sprites; a spatial
index for the hub and fields; hysteresis on the interest radius; FS-QG1HR D2 race B and D4
themselves (this FS only avoids adding to them).

## Change: Spire height and the climb → FS-M8CSE

## Change: Wall shadow layer → FS-V8FT3

## Change: Walls on the cell boundary → FS-XK2B6

## Change: Ranged monsters and the Bone Archer → FS-B4SG9

## Change: Arrival card → FS-PQ2TW
