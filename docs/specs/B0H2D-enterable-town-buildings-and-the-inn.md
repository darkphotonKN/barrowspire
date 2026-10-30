# FS-B0H2D: Enterable town buildings and the Inn

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Hub world" → "Enterable town buildings", "The Inn and its innkeeper"; `game-client/SPECIFICATION.md` "### Hub" → "Town building interiors" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection: an interior adds no world), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked props), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) / [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (canvas tokens only) · Builds on: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) (the hub and its closed buildings), [FS-MRZH7](MRZH7-function-npc-markers.md) (function NPC markers, the residents' talk-range clearance test), [FS-0XMCP](0XMCP-hub-destination-gates.md) (gates: Spire north, Forest west, Meadows east), [FS-2325V](2325V-pre-rendered-isometric-art.md) §C.3 / [FS-8RBQY](8RBQY-tower-interior-run-look.md) (a run house's door gap and roof lift), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) §A (hub dressing and its keep-out rule) · Related, out of scope: [FS-VPD8Y](VPD8Y-town-stash.md) (town stash), [FS-KSD6K](KSD6K-roomier-forest-and-flat-field-edges.md) (the Forest) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Hub" (*town*), "NPCs" (*fixed resident*, *innkeeper*, *patron*, *smith*), "Town buildings" (*town building*, *door gap*, *interior*, *furnishing*, *lane*), all added for this FS; [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*town*, *town building*, *interior*, *furnishing*, *indoor dressing*, *Inn's hearth*)

> **Decision provenance.** The thread is the 2026-10-30 `/scope-it` notes (Kranti; not
> challenged, low cost if wrong) plus the charter defaults the owner approved wholesale. Each
> charter default is marked **[charter default]** with its reason. Where neither settled a point,
> the smaller v1 was taken and marked **[v1 pick]** with its reason. Agent lane for server and
> client both ("no hand coded here, all agents now"). Checked `docs/adr/`: no recorded decision
> constrains this; nothing here is architectural (no new world type, message or service).

## Summary

Walking out of town toward the Forlorn Forest (west gate) and Gentle Meadows (east gate) runs
into houses. The town keeps three buildings and loses the rest: the Quartermaster's store, the
Inn and a smithy. All three can be walked into the way a run's house can, in the same world: a
gap in the south wall, and the roof lifts while the player is inside so the furnished room shows.
The Quartermaster moves into his store. The Inn has an innkeeper behind a counter, patrons at
tables and a hearth, and the smithy has a smith at a forge. Everyone there can be talked to, and
nothing is bought or sold. Tests guarantee clear lanes from the spawn to every gate.

## Requirements

### A. The town's layout (game-service, map data)

1. **Three buildings, all enterable.** `hubBuildings` holds exactly three town buildings: the
   Quartermaster's store, the Inn and the smithy. The five closed buildings of FS-29KSH are
   removed. No closed (doorless) building remains in the hub.
2. **Sizes [charter default: Inn largest, store and smithy run-house sized].** The Inn is the
   largest, about **360×260 and at most 400×300**. The store and the smithy are the width of a
   small run house (300) and **240 deep** (a run's small house is 300×200).
   - Why 240, not 200: R14 needs an indoor NPC to stand more than 80 px from every outer wall.
     With 20 px walls, a 200-deep house has no such point (the zone needs > 2 × (80 + 20) = 200),
     so the run size cannot pass the test. 240 leaves a 40 px band. This is the one place the
     charter's "run-house sized" bends; see Edge States.
3. **Placement [charter default: the agent places the houses under testable rules].** Reason:
   it makes "doesn't block the way" a test rather than an eyeball. The houses go wherever R4–R7
   and R14 pass. A layout that passes (checked by hand at spec time; the implementing issue may
   move it):
   | Building | x, y | w × h |
   |---|---|---|
   | Inn | 470, 110 | 400 × 300 |
   | Quartermaster's store | 1130, 150 | 300 × 240 |
   | Smithy | 110, 50 | 300 × 240 |
   Every house stands north of the west and east lanes, so its south-wall door faces the town and
   the camera (R9).
4. **Lanes.** For each gate (the Spire's door at 1000, 50; the Forest gate at 40, 400; the
   Meadows gate at 1960, 360), the straight corridor from the hub spawn (`HubSpawnX`,
   `HubSpawnY`) to the gate, **240 px wide** (120 either side of the centre line), is crossed by
   no hub wall. Tested: every wall rect's distance to the spawn→gate segment is more than 120.
5. **Doors open onto ground.** In front of each door gap (south of it), a rect as wide as the
   gap and 80 px deep lies inside the map and touches no wall.
6. **Spawn and arrivals stay outdoors.** The spawn and each gate's arrival point lie outside
   every building footprint. (R4 implies it; tested anyway, since it is the failure a player
   would notice first.)
7. **Residents' quarters re-fit [charter default].** Each wandering resident's quarter lies
   wholly outside every building footprint, so no random walk crosses a door gap into a house (a
   quarter is a rect, a walk is a straight line between two points in it). Quarters stay inside
   the map, and FS-MRZH7's clearance test (`hub_map_test.go`: every quarter at least
   `NPCInteractRange` + 40 from every function NPC) still passes, for the Quartermaster in his
   new place too. Quarters may cross a lane: residents do not block a 240 px corridor.
8. **The Quartermaster stands in his store.** His `hubNPCs` entry moves inside the store. His
   name, function (`storekeeper`), line and marker are unchanged. The Spirewarden stays outdoors
   where he is.

### B. Door gaps and the roof (game-service + game-client)

9. **Door gap [charter default: open gap, no door entity].** Reason: shop style; nothing to
   open, lock or sync. Each town building's south wall is cut into two segments around a
   centred gap, the same cut `AddBuilding` makes for a run house, with the run's door width
   (50). No door entity is created: the hub still has no `Door` component anywhere. Walls are
   20 thick, as today.
10. **One house id per building.** Every wall of a building, its two south segments and its
    furnishings (R11) included, carries that building's `house_id`, so the client rebuilds the
    footprint from the walls as it does today (`housesFrom`).
11. **Roof [charter default: the hub's existing roof hides while the player is inside, the run
    houses' rule].** No new roof art: the baked roof pieces, or the placeholder roof without art,
    as drawn today. `HubScene` already hides the roof over the player (`hideRoofOverhead`); a
    door makes it reachable. The chimney and its smoke hide with the roof, as today.

### C. Furnishings and indoor dressing

12. **Furnishings are server keep-outs [charter default].** The Inn's counter and its three
    tables, and the smithy's forge, are **furnishings**: wall entities inside their building
    (R10's `house_id`), so players collide with them exactly as with a wall. Each furnishing:
    - touches none of its building's four outer edges (that is how the client tells it from a
      building wall, R19);
    - stands at least 50 px clear of every wall and every other furnishing, so the room stays
      walkable around it.
    The store has no furnishing [v1 pick: its shelves and crates are dressing; the store needs
    nothing to collide with to read as a store].
13. **The room is reachable.** From the door gap, a player (radius `PlayerRadius`) can walk to a
    spot within `NPCInteractRange` of every NPC inside the building without crossing a wall or a
    furnishing. Tested with a coarse grid flood fill (10 px cells or finer) over the building's
    walls and furnishings.
14. **No talking through walls [charter default: tested].** Every NPC standing inside a town
    building (the Quartermaster included) is more than `NPCInteractRange` from each of its
    building's outer wall rects. Furnishings do not count: the innkeeper is talked to across the
    counter. Reason: talk is gated client-side by distance alone, so placement is the only thing
    stopping a player outside from talking through the wall.
15. **Indoor dressing, client data [charter default: props built in code].** Pieces with no
    collision are client dressing placed inside a house: the Inn's stools (one or two per
    table, beside it) and its hearth; the store's shelves (against the back wall) and crates and
    barrels; the smithy's anvil (beside the forge) and a few tools or crates. Indoor dressing:
    - lies inside its house's inner area (inside the walls) and off every furnishing;
    - keeps clear of the door gap's threshold: a strip as wide as the gap and 80 px deep, inward;
    - is never interactable and never blocks movement (CONTEXT.md "Dressing").
    Checked by a vitest against the client's mirror of the town (R23).

### D. The people inside (game-service)

16. **Fixed residents [charter default: the existing resident NPC kind pinned in place, no new
    function].** Reason: the smallest v1 with no protocol change. The innkeeper, the patrons and
    the smith are ambient NPCs (function `""`) created with **no wander region and no velocity**,
    at a fixed point, with an appearance. The wire `NPCState` already carries `name`, `function`,
    `appearance` and `position`; nothing is added to it. `WanderSystem` already skips an NPC
    without a wander region. They get `NPCInteractRange` like every NPC.
17. **Who [v1 pick: names follow the town's role-names, like Cottar and Herbwife].** Five fixed
    residents, keeping the hub's per-tick NPC cost to that:
    | Name | Where | Appearance |
    |---|---|---|
    | Alewife (the innkeeper) | behind the Inn's counter | an existing appearance value |
    | Drover (patron) | at an Inn table | an existing appearance value |
    | Gravedigger (patron) | at an Inn table | an existing appearance value |
    | Pilgrim (patron) | at an Inn table | an existing appearance value |
    | Smith | by the smithy's forge | an existing appearance value |
    "Existing" means one the client already draws (`rust_trousers`, `green_skirt`,
    `slate_trousers`, `flax_skirt`); new looks for people are out of scope. One patron per table.
18. **Placement.** Each fixed resident satisfies R14 (talk-through-wall) and R13 (reachable). The
    innkeeper stands on the far side of the counter from the door, within `NPCInteractRange` of
    a spot a player can reach on the near side. Each patron stands beside their table's stool.
    One way that passes in the R3 Inn: the counter runs north–south near the east wall and the
    Alewife stands behind it; the three tables sit in the west half.

### E. Drawing the interiors (game-client)

19. **Furnishings are drawn as furniture.** `HubScene` splits the broadcast walls: a wall whose
    rect touches none of its house's four edges (the house as `housesFrom` builds it) is a
    furnishing and is **not** drawn as wall pieces. A pure, tested helper decides this. Each
    furnishing is drawn as its prop (counter, table, forge) from a client mirror that names the
    kind by the furnishing's rect (`HUB_FURNISHINGS`, R23). A furnishing with no mirror entry, or
    no baked sheet, is drawn as a low placeholder block on its footprint, never left invisible:
    an invisible wall is worse than no wall.
20. **The interior hides under the roof.** While a house's roof is on (the player is not inside
    it), what stands inside that house is hidden from the player: its furnishings, its indoor
    dressing, and the bodies and name plates of every NPC and other player whose world position
    is inside it. Lifting the roof shows them; leaving puts the roof back and hides them again.
    "Inside" is `insideHouse` on world positions, the test the roof already uses.
21. **Markers [charter default: only function NPCs get the FS-MRZH7 marker].** Fixed residents
    carry the ambient name plate (`palette.markerHub`) and no sigil. The Quartermaster's marker
    (amber plate and sigil) stays visible while his store's roof is on [v1 pick: it is how a
    player finds the store from the street, which is FS-MRZH7's point]; his body hides with the
    interior (R20).
22. **Indoor light.** The Inn's hearth and the smithy's forge are light sources (declared in the
    sprite manifest), lit only while their house's roof is lifted, through the light-map's
    existing under-roof gate (the one a house's wall flame uses).
23. **Client mirror of the town.** `hubKeepOut.ts` and its test fixture copy the new server
    facts, as FS-KYPQ9 / FS-MRZH7 set up: the three building footprints with their door gaps
    (the vitest fixture's `HUB_BUILDINGS` / `HUB_WALLS`, walled as the server does), the
    Quartermaster's new place (K4), the re-fitted quarters (K6). New, beside them:
    `HUB_FURNISHINGS` (kind and rect per furnishing) and the indoor dressing spots (R15). A
    server change to any of these needs the mirror updated; the vitest is where drift is caught.
24. **Outdoor dressing re-fit.** Every outdoor dressing spot, fence run and path still clears the
    keep-out rule K1–K8 against the new footprints (the existing `hubKeepOut.test.ts`). Spots the
    old buildings sheltered may move; spots now inside a new house, or on a lane, move out.
    `HUB_APPROACHES`' Forest trail no longer needs to turn south around the old west house.
    Each door gap gets a short trodden path (`HUB_PATHS`) joining it to the nearest existing path
    or approach [v1 pick: cheap ground paint that tells a player the house is meant to be
    entered].
25. **Facing.** A fixed resident never moves, so the client cannot derive their facing from
    movement. The client keeps a facing per fixed resident by name: the Alewife faces the
    counter's near side, each patron faces their table, the Smith faces the forge. Unknown
    names face the default.
26. **Patrons are drawn standing at their stool [v1 pick].** "Seated" in the scoping notes is
    honoured as *placed at a table and never moving*. The baked folk sheets have no sitting
    frames, and adding a sit pose is a bake beyond this FS (Out of Scope).

### F. Talking (game-client)

27. **Lines [charter default: authored to fit the lore, 2–4 lines each, the innkeeper's
    longest].** Each fixed resident's talk is a short sequence of passages told the Warden's way
    (*Go on* turns to the next, *Farewell* ends it, the last offers only *Farewell*; every
    telling starts at the first). Lines live in a client table keyed by NPC name; a name with no
    entry falls back to today's `RESIDENT_LINES`. The table below is the v1 text, **listed for
    the owner to tweak**; the voice is the design guideline's (grim, terse, rumour over
    exposition).
    - **Alewife**, role *Keeper of the Inn* (4):
      1. "Come in off the road. The fire's the one thing\nin this town that keeps its word."
      2. "Since the Spire rose I pour for two kinds:\nthose bound for its door, and the few who came back."
      3. "West, the Forest has turned. What lay buried there\nwalks the trail now, and some nights something paler."
      4. "East, the Meadows are kinder. Rest here first.\nThe barrow is patient. It will keep."
    - **Smith**, role *Keeper of the forge* (3):
      1. "Steel I can work. What comes down out of the Spire\nwon't take my hammer, so don't ask."
      2. "The forge stays lit. Someone always comes back\nwith a notched blade and a story."
      3. "Mind the Forest damp. Iron rusts there overnight."
    - **Gravedigger**, no role (3):
      1. "Forty years I dug on the barrow field.\nNot one of them stayed down once the tower came."
      2. "The dead in the Forest are mine.\nI buried them proper. Tell them that."
      3. "I drink here now. Nobody needs a grave dug twice."
    - **Drover**, no role (2):
      1. "Brought the herd up from the Meadows.\nLost two to the boars, none to anything worse."
      2. "That counts as a good season, now."
    - **Pilgrim**, no role (2):
      1. "Walked three weeks to see it. Thought it'd be taller."
      2. "They say the Lich Lord waits at the top.\nNo one who has seen him has said so."
28. **The nearest NPC answers.** When the player presses to talk and several NPCs are within
    talk range (the patrons, the innkeeper), the nearest one by world distance is spoken to.
    Today the first one found answers, which in a crowded room is arbitrary.
29. **Talk stays client-side.** No new message: talking to a fixed resident sends nothing to the
    server, as talking to a wandering resident sends nothing today.

### G. Art (game-client bake)

30. **Props built in code [charter default].** New baked prop sheets, authored in
    `tools/bake` like the town's existing props (ADR-0020, ADR-0021): `counter`, `stool`,
    `inn_hearth`, `shelf`, `forge`, `anvil`. The existing `table`, `crate` and `barrel` sheets
    are reused. The forge and the Inn's hearth declare a light source in the manifest. Gated
    on a contact sheet before it lands. The scene draws placeholders until the sheets exist
    (R19), so the drawing work does not wait on the bake.

## User Stories

1. As a player leaving town for the Forlorn Forest, I want the way west to be open ground, so
   that I walk to the gate without weaving around houses.
2. As a player heading to Gentle Meadows, I want the way east to be open, so that the road
   reads as a road.
3. As a player walking to the Spire's door, I want a wide clear approach, so that the town's
   main way out is never in doubt.
4. As a player, I want every house I see in town to be one I can walk into, so that no building
   is a painted box.
5. As a player at a house's south side, I want to see its doorway from the street, so that I
   know where to go in.
6. As a player stepping inside, I want the roof to lift and the furnished room to show, so that
   being inside feels like a place rather than a wall.
7. As a player stepping back out, I want the roof back on, so that the town looks whole again.
8. As a player, I want entering a building to have no loading step, so that town stays one
   continuous walk.
9. As a player who wants the Quartermaster, I want to find him in his store, with his sigil
   showing over it from the street, so that I can find him without hunting.
10. As a player, I want the Inn to be the warmest room in town, an innkeeper, patrons and a lit
    hearth, so that town has a heart.
11. As a player, I want to talk to the innkeeper and hear about the Spire, the Forest and the
    Meadows, so that the world has something to say between delves.
12. As a player, I want each patron to have a line of their own, so that the room feels lived
    in.
13. As a player, I want the smith to say something about steel and the Spire, so that the smithy
    is more than a prop.
14. As a player, I want to bump into the counter, the tables and the forge, so that the room's
    furniture is solid.
15. As a player, I want to walk around the stools and shelves freely, so that small dressing
    never traps me.
16. As a player outside a building, I want not to be able to talk to someone through its wall,
    so that a conversation means I went in.
17. As a player outside, I want not to see who is inside until I enter, so that a roof means
    something.
18. As a player in a crowded Inn, I want the person nearest me to answer when I talk, so that I
    get who I meant.
19. As a player, I want the Inn not to offer drinks, rooms or trades, so that I am never sent
    looking for a shop that does not exist.
20. As a player, I want the people indoors to stay where they are, so that the innkeeper is
    behind the counter every time I come back.
21. As a player, I want the wandering townsfolk never to walk into a house, so that interiors
    stay quiet and the residents keep their quarters.
22. As a player returning from a field, I want to arrive outside, on open ground, so that I am
    never set down inside a building.
23. As the owner, I want the NPC lines listed in one place, so that I can tweak the words
    without hunting through code.
24. As the owner, I want "doesn't block the way" to be a failing test when it stops being true,
    so that a later map change cannot quietly wall off a gate.
25. As a developer, I want furnishings told from walls by geometry, so that nothing new goes on
    the wire.
26. As a developer, I want the client's copy of the town checked by a test, so that a server move
    that the mirror missed fails at review.
27. As a developer, I want the five new NPCs to cost nothing per tick beyond being broadcast, so
    that the hub's per-player formatting stays cheap.
28. As the designer, I want the new props baked in code on a contact sheet, so that they match
    the town's art and the Ultima Online fidelity bar.

## Acceptance Criteria

- [ ] The hub has exactly three buildings (store, Inn, smithy); the Inn's footprint is the
      largest; store and smithy are 300×240; the Inn is no larger than 400×300.
- [ ] Each building's south wall has a centred 50 px gap; the hub has no door entity.
- [ ] Go test: the 240 px spawn→gate corridor to each of the three gates is crossed by no wall.
- [ ] Go test: a gap-wide, 80 px deep rect south of each door gap is inside the map and touches
      no wall.
- [ ] Go test: the spawn and both gate arrival points lie outside every building.
- [ ] Go test: every wandering resident's quarter lies outside every building footprint and
      inside the map; FS-MRZH7's quarter clearance test passes unchanged.
- [ ] The Quartermaster stands inside his store; his function, name and line are unchanged.
- [ ] The Inn holds a counter and three tables, the smithy a forge, each a wall entity with its
      building's `house_id`, touching none of its building's outer edges, at least 50 px clear
      of every wall and every other furnishing.
- [ ] Five fixed residents (Alewife, Drover, Gravedigger, Pilgrim, Smith) exist with function
      `""`, an existing appearance, no wander region and no velocity; they never move across
      ticks.
- [ ] Go test: every NPC inside a building is more than `NPCInteractRange` from each of its
      building's outer walls.
- [ ] Go test: from each door gap a player-sized walker reaches a spot within talk range of
      every NPC inside that building.
- [ ] No change to the WS protocol or any proto; `NPCState` is unchanged.
- [ ] Walking into any of the three buildings lifts its roof and shows the furnished room;
      walking out puts it back.
- [ ] Furnishings draw as their props (or a placeholder block without art), never as wall
      pieces, and never invisible.
- [ ] With a roof on, the interior (furnishings, indoor dressing, bodies and name plates inside)
      is hidden; the Quartermaster's sigil and plate still show.
- [ ] Fixed residents show the ambient name plate and no sigil.
- [ ] The Inn's hearth and the forge light the room only while their roof is lifted.
- [ ] Talking to each fixed resident shows their passages with Go on / Farewell as listed in
      R27; with several NPCs in range, the nearest answers.
- [ ] `hubKeepOut.test.ts` passes against the new town: K1–K8 for all outdoor dressing, and the
      indoor dressing rules of R15.
- [ ] `counter`, `stool`, `inn_hearth`, `shelf`, `forge`, `anvil` are baked from code, in the
      manifest, approved on a contact sheet.
- [ ] `go test ./...` (game-service) and the client's vitest, lint and token fence pass.

## Edge States

- **Two players, one inside, one outside.** The roof is per viewer: the one inside sees the
  room, the one outside sees the roof and not the player inside (R20). Nothing about it is
  synced.
- **A player standing in the door gap.** The gap is inside the house's footprint, so the roof
  lifts there. From the gap they are still more than talk range from every indoor NPC
  (R14 measures from the wall segments either side), so they must step in to talk.
- **A crowd at a door.** Player collision is off in the hub (FS-X2F2H), so players never block a
  doorway for each other.
- **A wandering resident by a door.** Its quarter lies outside every footprint, so it never
  walks in (R7), however close its quarter runs to the door.
- **Client without art.** No manifest, or a missing sheet: furnishings draw as placeholder
  blocks, indoor dressing with no sheet is skipped, roofs fall back to the placeholder roof
  (which lifts the same way). Collision is the server's either way.
- **Client older than the server's layout.** The scene draws whatever walls arrive; an unknown
  furnishing gets a placeholder (R19). Only the dressing mirror can be stale, and the vitest
  catches that before merge.
- **An NPC name the client has no lines for.** Falls back to `RESIDENT_LINES` (R27) and the
  default facing (R25): never a broken or empty talk.
- **Disconnect while inside.** Reconnecting returns the player to the hub spawn (outdoors,
  R6), as today.
- **Sizes vs the charter.** Store and smithy are 300×240, not a run's 300×200: R14 is
  unsatisfiable at 200 deep (R2). The Inn may grow from ~360×260 up to 400×300 if R13, R14 and
  R18 need the room; it stays the largest.
- **Hub occupancy and tick cost.** Five more NPCs are formatted per player per tick; fixed
  residents carry no velocity, so `WanderSystem` and `MovementSystem` do nothing for them.

## Out of Scope

- Buying, selling, repairs, food or drink, renting rooms, any upstairs.
- Any new NPC function or wire field, and any proto or WS message change. If an implementer
  finds one unavoidable, they stop and escalate rather than add it.
- The town stash (FS-VPD8Y), though the store is its likely home.
- A sitting pose for patrons (R26) and new character looks for the indoor people (R17).
- New roof art for the town's houses (R11).
- Doors that open or close, locks, or anything per-building on the server beyond walls.
- Enterable structures in the Spire or in field worlds (the Forest's are FS-KSD6K's concern).
- Anything in `internal/matchmaker` or `internal/match_queue`, and stats.
