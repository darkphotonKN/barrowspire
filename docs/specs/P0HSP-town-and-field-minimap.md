# FS-P0HSP: Minimap in the town and the fields

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Hub" → "Town minimap", "### Field worlds" → "Field minimap" → this FS · Related ADRs: [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (run fog: party-shared, not stored, no fog in other worlds; see "Charted ground and ADR-0063" below), [ADR-0068](../adr/0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md) (the world fog's look; untouched), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md), [ADR-0057](../adr/0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md) (pixel grid); **an ADR for charted ground is escalated to the coordinator, not written here** · Supersedes in part (each carries a stub `## Change: Minimap in the town and the fields → FS-P0HSP`; their text is not edited): [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) §A.1 ("the hub and the field worlds have no fog and no minimap"; the hub and fields now have a minimap, still no world fog), its criterion "Floors 2–3 and the fields show no fog and no minimap" (the fields now show a minimap) and its Out of Scope's "a minimap on … the hub or the field worlds"; [FS-56CKV](56CKV-minimap-look-and-run-hud-layout.md) Out of Scope "the hub's and fields' HUD" (their top-right corner gains the minimap; nothing else of their HUD moves) and the guideline bullet's "the run's" minimap; [FS-1SEF0](1SEF0-minimap-modes-enlarged-and-overlay.md) Out of Scope "an overlay … in the hub or the field worlds" · Builds on: FS-56CKV §A (the look), FS-1SEF0 §A–§C (the modes), [FS-MRZH7](MRZH7-function-npc-markers.md) (function NPCs), [FS-VPD8Y](VPD8Y-town-stash.md) (the stash chest), [FS-0XMCP](0XMCP-hub-destination-gates.md) (the town's gates), [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md) (town buildings), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md), [FS-3QHQZ](3QHQZ-forlorn-forest-and-branching-trails.md) (fields) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Minimap**, **Map overlay**, **Map mark**, **Charted ground**, **Town**, **Field world**, **Gate**

## Summary

The town and every field world get the run's minimap, in the run's look and with the run's three
modes on M. The town's map shows whole from the first moment: its ground, its edge drawn as a line
and open where each road leaves, its buildings as solid footprints with their doors cut open, and
small amber marks for what a player walks to: a tower for the Spire's door, a teleport mark for each
gate to another area, a chest for the stash and a bag for the Quartermaster; the Elder, who only
tells a story, is not marked. A field's map starts empty and fills in round the player as they walk: **charted ground**,
kept per character in this browser, so a field once walked stays mapped on the next visit. The
screen itself is never fogged. The party's dots show as in a run; no monsters, no other players, no
labels.

Charter run "村莊與野外小地圖", 2026-11-12. Nick approved the locked decisions on 2026-11-12 ("核准").
Each requirement says **owner** (his words), **charter default** (the coordinator's locked default,
approved under the charter) or **derived here** (this spec's, with why). Recorded without
adversarial review: no `challenge-me` pass.

**Why a new capability and not `## Change:` sections.** No line owns a minimap outside a run:
"Minimap → FS-SRA9J" sits under "### Escape run", and FS-SRA9J, FS-56CKV and FS-1SEF0 put the hub and
the fields out of scope by name. The run's minimap keeps every acceptance criterion it has; what is
new (a map built from the town's buildings, NPCs and gates, and a field's charted ground,
remembered per character) has no owner. So one FS, with a line in each bounded context it lives in
(### Hub, ### Field worlds). Because three owners' exclusions, and FS-SRA9J's criterion "the fields
show no minimap", stop being true, each owner carries a pointer stub, as FS-56CKV and FS-1SEF0 are
stubbed on FS-SRA9J.

## Facts this spec rests on

Verified 2026-11-12 on `feat/world-hub-field-minimap` at 321d2b23; client paths under
`game-client/src/`; server files read, never changed.

- **The town's layout reaches the client whole, in every hub state** (`scenes/HubScene.ts`
  `renderState`): `walls[]`, each town building's outer walls, partition and furnishings, all
  carrying the building's `house_id` (game-service `hub_map.go` `addHubBuilding`), from which
  `housesFrom` and `doorGaps` (`render/world/houses.ts`, `buildingLooks.ts`) already rebuild each
  footprint and its door gap; `npcs[]` with `function` (`"storyteller"`: the Elder at (1140, 680);
  `"storekeeper"`: the Quartermaster at (1280, 270), in his store; `""`: every ambient resident);
  `gates[]` (`spire` (1000, 50), `forest` (40, 580), `meadows` (1960, 360), each `range` 80; and
  `dev_test_room` (120, 900) on a dev server, which `gatesInThisBuild` drops in a production
  build). The stash chest is the client's `HUB_STASH_CHEST`, at (1180, 245) in the Quartermaster's
  store (`render/world/hubStash.ts`, FS-VPD8Y). The town is 2000 × 1000 world px (`HUB_WIDTH`,
  `HUB_HEIGHT`) with **no boundary walls**: its edge is the server's movement clamp.
- **Town buildings** (`render/world/hubTown.golden.json`): the Inn (230, 50, 640 × 440, its door 525–605
  on its south wall, a partition), the Quartermaster's store (1130, 150, 300 × 240, door 1240–1320),
  the Smithy (1480, 50, 300 × 240, door 1590–1670). Walls 20 thick; door gaps 80 wide.
- **A field's layout reaches the client in its state** (`scenes/FieldScene.ts` `renderState`):
  `walls[]` are its keep-out rects (the Forest's tree stands, the Meadows' tree clusters and rocks;
  each with a `house_id` of its own); `gates[]` its entrance, destination `hub`, the road home. Its
  size is the client's `FIELD_SIZE`: Gentle Meadows 2000 × 1000, the Forlorn Forest 3120 × 2000, the
  dev test room 900 × 600. **No field-to-field gate exists today** (game-service `GateDestination`:
  spire, forest, meadows, hub, dev_test_room). The scene knows its field id (`this.field`).
- **Party membership**: the party store's members' `player_id` match `other_players[].id`
  (`ui/partyFramesLayout.ts`); `other_players` carries every player in the hub or the field's
  channel, party or not. **The character**: `useGameStore().activeCharacterId`.
- **The corner**: nothing stands in the hub's or a field's top-right corner but the fullscreen
  button (DOM, above y 44); neither shows the dev position readout. The run's column anchor is
  `TOP_RIGHT_HUD` (`scenes/BarrowspireScene.ts`: x = width − 10, y 44).
- **What else is at the top** (logical px, at width 1080): the hub's queue line at y 20 and its
  notices centred on y 72 (a field's notices too, `NOTICE_Y` 72); the party panel x 280–580 from
  y 56; party invite prompts and the ready check 300 wide from y 92, centred, or, while the party
  panel is open, stepped right of it to x 592–892 (`ui/partyInvitePromptLayout.ts`,
  `partyReadyCheckLayout.ts`), at depth 1000; the arrival card's centre at y 144, its widest line
  x 360–720. The hub's XP bar (16, 16), a field's bars (10, 16).
- **Depths** in the hub and the fields: the indoor blackout 500 (the hub), the atmosphere's vignette
  about 905, the name plates and sigils `MARKER_DEPTH.name` 950, the arrival card 960, the HUD 1000.
- **M** is unbound in the hub and the fields.
- **The minimap today** (`ui/minimap.ts`, `minimapMode.ts`, `topRightColumn.ts`): the panel, vignette,
  the one fill and the walls' line, the 9 × 9 glyphs on their ring, the dots, the three modes and the
  overlay's hold, all drawn from a dungeon floor's `RegionGrid` and its exploration.
- **No data is missing.** Everything this spec draws is already on the client; nothing needs the
  server.

## Requirements

### §A. Where

1. **The town and every field world have a minimap**: the hub, Gentle Meadows, the Forlorn Forest,
   and the dev test room (a field world drawn by the field scene, dev builds only). Floors 2–3 keep
   none (FS-SRA9J §A.1). **(owner: "村莊也要顯示地圖", "野外也顯示地圖"; derived here: the dev test room
   is a field world in the code and costs nothing more)**
2. **No fog on the screen** in the town or any field: the world is drawn exactly as today. **(owner:
   "這些區域只有地圖有迷霧 畫面不需要迷霧", "村莊不用任何迷霧")**
3. **Built from what the client already has**: the town's and a field's state (`walls`, `npcs`,
   `gates`), the client's own constants (`HUB_WIDTH`/`HUB_HEIGHT`, `FIELD_SIZE`, `HUB_STASH_CHEST`),
   the party store and the active character. No server, proto, gateway or contract change.
   **(charter default)**
4. **One minimap, more plans.** The town's and a field's minimaps are the run's `Minimap` look
   (FS-56CKV §A), modes (FS-1SEF0) and marks, drawing a plan built from the world's data instead of
   a dungeon floor's region grid; the run's minimap behaves, draws and tests exactly as before.
   **(derived here: one look, one set of modes, one place to tune; the run's tests stay as written)**

### §B. What the map draws

5. **The world in its iso projection, fitted to the panel** as the run's floor is (FS-SRA9J §E.21:
   the world's diamond fitted inside the inset, centred): the town's 2000 × 1000 and the Meadows'
   fill the panel's height at 0.0833 of the world's projection; the Forest's 3120 × 2000 at 0.0488;
   the dev test room's at 0.1667. **(derived here: as the run)**
6. **The ground in the one fill**, `minimapExplored`: the town's whole diamond; a field's charted
   ground only (§D). **(charter default: the run's look)**
7. **The map's outline is the world's edge, a line with every way out a gap.** The edge is drawn as
   the walls' line (`minimapEdge`, `MINIMAP_EDGE.width`, scaled per mode as the run's), except
   across a **road gap** at each gate standing within its `range` of an edge: the edge left open for
   the gate's `range` either side of the gate's own coordinate along that edge (160 world px). In
   the town: the Spire's gap on the north edge, the Forest's on the west, the Meadows' on the east;
   the dev test room's gate stands 100 px from the south edge, beyond its 80 px range, so it opens
   no gap. A field's road home opens its gap the same way. Corners are joined, never left open.
   **(owner: "door and road gaps left open", "walls are lines, openings are gaps"; derived here:
   the gate's own range is the server's measure of where the way out is, and the world has no
   boundary walls, so the edge is the line)**
8. **Buildings as solid footprints**: each town building's footprint (`housesFrom`) filled solid in
   `minimapEdge`, the walls' own ink, its interior never drawn (no partition, no furnishing, no
   rooms). **(owner: "buildings as solid footprints"; derived here: the wall ink, so "what cannot be
   walked through" reads as one thing, a line where it is thin, a mass where it is a building)**
9. **Door gaps cut open**: each door gap (`doorGaps`) is cut out of its footprint as a notch the
   gap's width, reaching in from the footprint's edge the wall's thickness or `MINIMAP_WORLD.doorNotch`
   logical px, whichever is deeper on the panel (2 px, tunable; on the overlay, 2 px too), so the
   door reads as an opening at every size: the 20 px wall alone would be about 1 px deep on the
   normal map. **(owner: "door … gaps left open"; derived here: the depth)**
10. **Field keep-outs as solid footprints**: each of a field's `walls` (tree stands, rocks) filled in
    `minimapEdge` over charted ground only: the part of its footprint lying on charted cells.
    **(derived here: a keep-out is what cannot be walked through, the town building's kin; the
    Forest then reads as its trails between the stands)**
11. **Entering a building changes nothing on the map**: the whole map still shows, the player's dot
    over the footprint; no interior map. **(owner: "no interior maps in v1")**
12. **Not drawn**: roads and paths as such, dressing (fences, stalls, carts, the well, trees as
    props), containers, drop piles, monsters, other players, names or any text. **(owner: "no
    monsters, no other players, no text labels"; charter default: no containers, as the run;
    derived here: roads, not asked, are left to the owner's look)**
13. **Look**: the panel's backing and rim, the candle vignette, the layer order (backing, ground,
    footprints and edge line, vignette, marks, dots) and the tokens are the run minimap's, unchanged
    (FS-56CKV §A.1–§A.3, §A.8). No new colour token. **(owner: "the candle-lit look as the run's
    minimap")**

### §C. Map marks

14. **What is marked in the town, each with its own glyph** (the icon list for the owner):

    | Place or NPC | Read from | Glyph |
    |---|---|---|
    | The Spire gate (the tower's door, the delve entrance) | `gates[]` `spire` | **tower** |
    | The Forest gate, the Meadows gate | `gates[]` `forest`, `meadows` | **teleport** |
    | The dev test room's gate (dev builds) | `gates[]` `dev_test_room`, kept by `gatesInThisBuild` | **teleport** |
    | The stash chest | `HUB_STASH_CHEST` | **chest** |
    | The Quartermaster (storekeeper; his store is the town's item shop) | `npcs[]` `function: "storekeeper"` | **bag** |
    | The Elder (storyteller) | `npcs[]` `function: "storyteller"` | **none**: he only tells a story, and is no lozenge either |
    | Any other function the client has no glyph for | `npcs[]`, `function` not `""` nor `"storyteller"` | **lozenge** (FS-MRZH7's sigil shape) |

    **(owner: "倉庫顯示寶箱 道具店顯示袋子 塔顯示塔的圖案", "其他地區接口顯示傳送的icon"; owner, 2026-11-12:
    "只是講故事的 NPC 不需要在地圖上標", an NPC that only tells a story needs no map mark, which
    withdrew the scroll this spec first gave the storyteller; derived here: the lozenge so a function
    the client cannot name yet is still marked, as FS-MRZH7 req 1 marks it)**
15. **Not marked, read from the code**: the Elder (§C.14: he only tells a story); the Inn and the Smithy (buildings; the Alewife and the Smith
    are fixed residents with no function, FS-B0H2D); the wandering residents and the Inn's patrons
    (ambient); the mailbox (a HUD envelope with no place in the world, FS-1GZGD); the marketplace (a
    web page, FS-8EGFA; the town's market stalls are dressing with nothing to do); the well, the
    hearth, the carts. Each would be an amber thing the player cannot act on, which the guideline
    calls a defect ("Gameplay accent"). **(derived here; the owner's "every other useful NPC /
    place" read as: every one the player can act on)**
16. **In a field**: each gate in its state carries the teleport mark (today only the road home), once
    the cell it stands in is charted (§D). **(owner: "其他地區接口顯示傳送的icon"; charter default:
    "field exits appear only once revealed")**
17. **Drawn as the run's glyphs are** (FS-56CKV §A.6, FS-1SEF0 §B.9, §C.16): a 7 × 7 px ink shape in
    `palette.interactable` (amber) on a 1 px `markerStroke` ring, a 9 × 9 box seated on whole px,
    at least 7 px wide, ink ≥ 3:1 against its ring, at `marks` = 1 in every mode; drawn in code, no
    baked art. Their art, a starting draft the owner judges by eye (`#` ink, `o` the shape's own
    dark, `.` none):

    ```
    tower      teleport   chest      bag        lozenge
    #.#.#.#    ..###..    .......    ..#.#..    ...#...
    #######    .#ooo#.    .#####.    ...#...    ..###..
    .#####.    #oo#oo#    #######    ..###..    .#####.
    .##o##.    #o###o#    #ooooo#    .#####.    #######
    .##o##.    #oo#oo#    ###o###    #######    .#####.
    .#####.    .#ooo#.    #######    #######    ..###..
    #######    ..###..    #######    .#####.    ...#...
    ```

    **(owner: "drawn in code (Graphics), no baked art, at the minimap's existing marker size, in
    amber"; derived here: the art)**
18. **Where a mark stands**: on its gate's, NPC's or chest's world position, projected, seated and
    held inside the rim as the run's glyphs are. **(derived here)**
19. **Marks never overlap**: where two marks' boxes would overlap at the mode in force, they are set
    side by side on one row, in the table's order (left to right), 1 px apart, the row centred on
    the mean of their seats and held inside the rim; three or more the same. In the town today this
    is the stash chest and the Quartermaster (their seats 5 × 4 px apart on the normal map, 7.5 ×
    6.3 on the enlarged and the overlay). **(derived here: a 9 × 9 mark half under another reads as
    neither)**
20. **Marks redraw only when they change** (a gate or a function NPC appearing or going, which in
    practice is never during a visit), not when the player moves. **(derived here, as FS-56CKV §A.8)**

### §D. Charted ground (a field's minimap fog)

21. **A field's minimap starts uncharted and is charted round the player as they walk.** The field
    is a grid of `FIELD_CHART.cell` = 40 world px cells (one tile); a cell becomes **charted** when
    its centre lies within `FIELD_CHART.radius` = 480 world px of the local player's position, on
    each state while they are in the field, alive or fallen. A world circle, so on the map it is the
    iso ellipse the ground makes; 480 reaches about 540 logical px either side on screen, half the
    1080 view. **(charter default: "a circle around the player, radius about half a screen width,
    one named value"; derived here: the cell, and the circle in the world, not on screen: a screen
    circle of 540 px would reach past a 720 px view's top and bottom)**
22. **Uncharted ground shows nothing**: no fill, no edge line, no keep-out, no mark: only the
    panel's backing (the overlay: nothing at all). The edge between charted and uncharted ground
    carries no line, as a seen region's edge onto an unexplored one carries none in a run.
    **(charter default; derived here: the run's "openings are gaps")**
23. **Never on the screen**: charting changes only the minimap. **(owner)**
24. **The character's own, not the party's**: only the local player's position charts; party
    members' positions chart nothing for this client. **(charter default: "not shared with the
    party")**
25. **Kept per character, per field, in this browser**: in `localStorage` under
    `barrowspire_field_chart:<characterId>:<fieldId>` (the active character), as
    `{"v":1,"cell":40,"cols":…,"rows":…,"bits":"<base64 bitset, row by row>"}`. Read when the field
    scene starts; a value whose `v`, `cell`, `cols` or `rows` do not match the field now (a field
    resized) is dropped and charting starts empty. Written, unioned with what is stored at that
    moment (so two tabs never lose each other's ground), at most once per `FIELD_CHART.save` =
    2000 ms while new ground is charted, and once more as the scene ends. **(charter default:
    "remembered per character in browser storage, survives revisits on this machine, lost on
    another"; derived here: the key, the format, the union and the cadence)**
26. **Storage that fails keeps nothing and breaks nothing**: every read and write in a try/catch; no
    active character, storage blocked or full, or a value that does not parse: charting lives for
    this scene only, the minimap works, nothing throws. **(charter default)**
27. **Every field alike**: the Meadows, the Forest and the dev test room each keep their own charted
    ground per character. **(derived here)**
28. **The map redraws as the ground is charted**, at most once per `FIELD_CHART.redraw` = 250 ms,
    and not at all while nothing new is charted; charted cells are drawn as merged runs, not one
    shape a cell. **(derived here: at walking pace a few dozen cells are charted a second; the run's
    map redraws only on a change too)**

### §E. The party's dots

29. **The player's own dot and their party members' dots**, as the run draws them (FS-56CKV §A.7):
    `markerSelf` r 3 over the rest, `markerAlly` r 2, each in a 1 px `markerStroke` ring. An ally
    is an `other_players` entry whose `id` is a member of the player's party (the party store);
    every other player is not drawn. Allies show wherever they stand, over charted ground or not.
    **(owner: "self and party members as in the run; no other players"; derived here: an ally over
    uncharted ground still shows, since the party frames already say they are there and the dot
    says where)**
30. **No party**: the player's own dot only. **(derived here)**

### §F. Modes and M

31. **M cycles normal → enlarged → overlay → normal**, as in the run (FS-1SEF0 §A.2, §B, §C): the
    enlarged panel 324 × 162, its map at 1.5, its marks and dots at the normal size; the overlay the
    world's own projection at `MINIMAP_OVERLAY.scale` (1/8) about the player, moving with them and
    held against the screen within two backing px (FS-1SEF0 §C.19), see-through at 40% with the
    edge line 2 px, at depth 920, taking no input. In the town at 1/8 the map is 300 × 150 logical
    px, the Forest's 512 × 256. **(owner: "M cycles normal → enlarged 1.5x → full-screen overlay, as
    in the run"; derived here: the run's values in every world, for the owner to tune by eye)**
32. **One remembered mode for every world**: the run's `barrowspire_minimap_mode`, read when the
    town or a field scene starts and written on each M press, so the mode follows the player from
    the town to a field to a run and back. Storage that fails starts at normal (FS-1SEF0 §A.5).
    **(derived here: one choice should follow the player; one key, already guarded)**
33. **M's guards**: a keydown event, never a captured key; ignored on a held key's repeat, while chat
    is typing, and while a panel owns the keys (the town: its menu panel, a dialogue card, the
    mailbox's letter panel; a field: none beyond chat); and before the scene's minimap is built (the
    first state). **(derived here: the run's guards, mapped to each scene's own key owners)**
34. **The overlay over the town and a field** stands over the world, the indoor blackout and the
    vignette, under the name plates and sigils (950), the arrival card (960) and the HUD (1000).
    **(derived here: FS-1SEF0 §C.17's band in these scenes)**

### §G. Place and the column

35. **The top of the top-right column**: right-aligned on `TOP_RIGHT_HUD`'s x, its top at y 44,
    clear of the fullscreen button, as in the run; it moves with the scene's `relayoutHud` on
    resize. In overlay mode the corner is empty. **(owner: "the top-right column, as in the run")**
36. **Nothing moves down**: the town's and a field's corners hold nothing under the fullscreen button
    today, so the minimap stands alone; no HUD piece is moved. **(owner: "whatever the hub/field has
    there moves down under it": nothing is there)**
37. **Clearances at logical widths 1080 and 1280**, normal and enlarged: clear of the fullscreen
    button, the hub's queue line, the arrival card, the party panel, the XP bar and a field's bars;
    a notice clear up to 628 px wide at 1080 with the normal map (412 px with the enlarged), and
    828 / 612 px at 1280. **(derived here: the figures)**
38. **Invite prompts and the ready check over the map**: stepped right of the open party panel they
    stand at x 592–892 at width 1080, under the normal map's left edge (x 854) for y 92–152 and the
    enlarged's (x 746) for y 92–206. They draw over the map there, since each asks for an answer
    within its countdown. At 1280 they stay at x 592–892, clear of the normal map (x 1054) and the
    enlarged (x 946). **(derived here; accepted, the owner's browser check judges it)**

### §H. Docs and gallery

39. **The design guideline's "UI Chrome" gains a "Town and field minimap" bullet** after "Map
    overlay": the town's map whole, the edge a line with road gaps, buildings solid in the wall ink
    with their doors cut, the marks and their glyphs, a field's charted ground, all in the run
    minimap's look, marked "*(Added by FS-P0HSP, 2026-11-12.)*". **(derived here)**
40. **`game-client/CONTEXT.md`**: "Minimap" no longer says "of a dungeon floor" only, and names the
    town and the fields (its "Not on floors without regions" stays true of the run). "Map mark" and
    "Charted ground" are already added (this FS's lock). **(derived here)**
41. **No dev-gallery card**: HUD chrome is not a tracked family (FS-1819Q R3). **(derived here)**

## Charted ground and ADR-0063

ADR-0063 makes a run's fog the party's, unstored, and gives other worlds no fog (Decisions 3, 4,
7). Charted ground is a different thing in a different world: minimap only, the character's own,
kept in the browser. It does not contradict ADR-0063, which is scoped to dungeon floors, but it is
a constraint a later change would trip over (a server-side map, party-shared fields, or the run's
fog learning to persist). **An ADR is warranted** and is escalated to the coordinator with the draft
title "A field's minimap fog is the player's own, shown on the minimap only, and kept per character
in the browser". This FS does not wait on it: the requirements above stand on the owner's approval.

**Recorded 2026-11-12 as [ADR-0078](../adr/0078-a-fields-minimap-fog-is-the-players-own-shown-on-the-minimap-only-and-kept-per-character-in-the-browser.md)**
("A field's minimap fog is the player's own, shown on the minimap only, and kept per character in
the browser"), beside ADR-0063, which it leaves standing.

## User Stories

1. As a player in the town, I want a minimap in the corner, so that I know where I am among the buildings.
2. As a player in the town, I want the whole town shown at once, so that I never have to explore my own village.
3. As a player in the town, I want the Spire's door marked as a tower, so that I find the way into a delve.
4. As a player in the town, I want each road to a field marked, so that I can head for the Meadows or the Forest.
5. As a player in the town, I want the stash marked as a chest, so that I find my storage.
6. As a player in the town, I want the Quartermaster marked as a bag, so that I find the shop.
7. As a player in the town, I want no mark for the Elder, who only tells a story, so that the marks are the places I go to do something (owner, 2026-11-12).
8. As a player in the town, I want only the places I can use marked, so that the map is not cluttered with things I cannot do anything with.
9. As a player in the town, I want buildings drawn solid with their doors open, so that I see how to get in.
10. As a player in the town, I want the town's edge drawn with gaps where the roads leave, so that I see the ways out.
11. As a player inside a building, I want the minimap to keep showing the whole town, so that I do not lose my bearings indoors.
12. As a player in a field, I want the map to fill in as I walk, so that exploring the field means something.
13. As a player in a field, I want the ground I have walked kept when I come back, so that I do not chart it twice.
14. As a player with two characters, I want each to keep its own charted ground, so that one character's walk is not another's.
15. As a player in a field, I want the road home marked once I have seen it, so that I can find my way back.
16. As a player in the Forest, I want the tree stands drawn solid, so that I see the trails between them.
17. As a player in a field, I want the screen itself never fogged, so that the open country stays open.
18. As a player in a party, I want my party's dots on the map, in the town and in a field, so that we can find each other.
19. As a player, I want strangers left off the map, so that it shows my party, not the crowd.
20. As a player, I want no monsters on the map, so that it stays a map of the place.
21. As a player, I want M to step the town's and a field's map through normal, enlarged and the overlay, so that it works as it does in a run.
22. As a player, I want the mode I chose in a run kept in the town and the fields, so that I set it once.
23. As a player, I want the map in the same top-right corner as in a run, so that I always know where to look.
24. As a player who blocks browser storage, I want the map to work anyway, so that nothing breaks.
25. As a player with a party invite open, I want to read and answer it even where it lies over the map, so that I never miss it.
26. As a player resizing the window, I want the map to follow its corner, so that nothing is left behind.
27. As a player on the canvas renderer fallback, I want the same map, so that no device gets a broken one.
28. As a developer, I want the charting radius and cell, and the door notch, as named constants, so that a later tune is values-only.
29. As a developer, I want the run's minimap untouched, so that the run's tests still prove it.

## Acceptance Criteria

- [ ] The town's minimap: its whole diamond in `minimapExplored`; the edge stroked in `minimapEdge`, a gap 160 world px wide at the Spire, Forest and Meadows gates and none for the dev test room's gate, every corner joined; each building's footprint filled in `minimapEdge` with its door gap cut as a notch at least `MINIMAP_WORLD.doorNotch` (2) px deep; no partition or furnishing drawn; built from a hub state (walls, npcs, gates) and `HUB_WIDTH`/`HUB_HEIGHT` alone (unit tests over the plan from the golden's walls).
- [ ] The town's marks: a tower at the Spire gate, a teleport mark at each other gate in this build, a chest at `HUB_STASH_CHEST`, a bag at the storekeeper, a lozenge at an NPC with any other function; none for the storyteller (the Elder: no scroll, no lozenge), an NPC with function `""` or anything in §C.15; each 9 × 9 in `interactable` on a 1 px `markerStroke` ring, ink ≥ 3:1, every rect on whole px, held inside the rim; the stash chest and the Quartermaster set side by side, 1 px apart, in every mode; the five glyphs read apart (distinct art, tested).
- [ ] The map and marks are redrawn on a content change only: walking the town redraws neither (counted); the dots redraw only when one moves a whole px.
- [ ] Party dots: self r 3 and allies r 2, each ringed; an `other_players` entry not in the party store draws nothing; no party, self only.
- [ ] A field's minimap: nothing but the backing until charted; cells within 480 world px of the player's position charted on each state; charted ground in the one fill drawn as merged runs; the edge line only along charted edge cells, open at the road home's gap; keep-outs filled only over charted cells; the teleport mark at the road home only once its cell is charted; no line where charted meets uncharted; party members' positions chart nothing (unit tests over the chart and the plan).
- [ ] Charted ground is written to `barrowspire_field_chart:<characterId>:<fieldId>` in the stated format, unioned with the stored value, at most once per 2 s while charting and once at scene end; read when the field scene starts; a mismatched `v`, `cell`, `cols` or `rows`, an unparsable value, a throwing read or write, and no active character each leave charting for the scene only, nothing thrown (`fieldChart.test.ts` with a fake store).
- [ ] Two characters and two fields keep apart; a second visit shows the first visit's charted ground.
- [ ] Walking through uncharted Forest at full speed, the map redraws at most 4 times a second; a frame-time measurement with the field minimap up is reported against the field without it.
- [ ] M in the town and a field cycles normal → enlarged → overlay → normal under the guards of §F.33, reads and writes `barrowspire_minimap_mode`, and does nothing before the minimap is built; the enlarged panel 324 × 162 and the overlay at 1/8 about the player, held as FS-1SEF0 §C.19, at depth 920, under the name plates (950) and the HUD, taking no input.
- [ ] Placement at widths 1080 and 1280: the map's top at y 44, its right edge on `TOP_RIGHT_HUD`'s x, re-anchored on resize; the corner empty in overlay mode; the clearances of §G.37 hold (measured); an invite prompt and the ready check stepped right of the open party panel draw over the map.
- [ ] No fog, veil or change on the screen in the town or a field (the scenes' world layers unchanged; a test that the field scene adds nothing above the ground for charting).
- [ ] The run's minimap tests (`minimap.test.ts`, `minimapMode.test.ts`, `topRightColumn.test.ts`, `BarrowspireScene.test.ts`) pass as written.
- [ ] No raw colour literal added; no new token; the token fence passes.
- [ ] The design guideline has a "Town and field minimap" bullet marked "Added by FS-P0HSP"; `CONTEXT.md`'s "Minimap" names the town and fields; no gallery card.
- [ ] Headless captures of the town (normal, enlarged, overlay) and of the Forest part-charted, at 1080 × 720 and 1280 × 720, render scales 1 and 2, looked at by eye.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] Nick's browser check passes (the HITL issue).

## Edge States

- **Before the first state**: no minimap and M does nothing; the map is built with the first state that
  carries the world's layout (the town's walls; a field's state, its keep-outs drawn once they
  arrive, the Forest's with its first walls).
- **A town building's walls arriving late** (never in practice): the map redraws once when they do.
- **The dev test room's gate**: marked in a dev build only, as `gatesInThisBuild` keeps it; a
  production build neither marks it nor opens anything for it.
- **A gate inside a building or far from any edge**: marked, no road gap.
- **A gate whose range reaches two edges** (none today): a gap on each.
- **A field-to-field gate** (none today): marked with the teleport mark like any gate; it opens a road
  gap if it stands within its range of an edge.
- **A function NPC that moves** (none today): its mark follows on the next content change.
- **Inside a building**: the whole map shows; the player's dot over the solid footprint (§B.11). The
  indoor blackout on the screen is unchanged; the overlay draws over it.
- **Arriving in a field**: the arrival point is charted at once with the first state; from a field
  walked before, the stored ground shows at once.
- **A field resized by a server change**: the stored value no longer matches and is dropped; charting
  starts over. Accepted.
- **Leaving a field mid-save, or a tab closed** without the scene's end: up to 2 s of charting is lost.
  Accepted.
- **Two tabs in one field on one character**: each unions what it charted with what is stored, so
  neither loses the other's ground.
- **Another machine or a cleared browser**: the field starts uncharted. Accepted (charter default).
- **Switching character in the town** (FS-G4VMQ): the next field visit reads that character's ground.
- **Falling in a field** (FS-X2F2H §58): the body still charts round where it lies; standing again at
  the entrance charts there.
- **An ally in another channel of the same field**: not in this state, so no dot, as the party
  frames say they are elsewhere.
- **Storage full**: the write throws, is swallowed, and the ground lives for the scene.
- **A 600 px notice at 1080 with the enlarged map**: its right end lies over the map's left strip for
  the notice's 3.2 s, as in a run (FS-1SEF0 Edge States). Accepted.
- **The overlay in the town is small** (300 × 150 at 1/8): the run's scale, kept for v1; the owner
  tunes it by eye (§F.31).
- **Canvas renderer fallback**: fills and lines, the same under both; a faint seam between two
  charted runs at 40% on the overlay may show. Accepted, as FS-1SEF0's.
- **The same overlap of invite prompts with the run's minimap**: exists in a run today and is not
  changed here.

## Out of Scope

A fog, veil or any change on the screen in the town or the fields; a minimap on floors 2–3; interior
maps of town buildings; drawing roads or paths; containers, drop piles, monsters, other players or
labels on the map; charted ground shared with the party, kept on the server or carried to another
machine; a way to clear charted ground; marks for the Inn, the Smithy, the mailbox or the
marketplace; new colour tokens or baked art; zoom, pings or click-to-travel; a keybinding setting
for M; the run's minimap, its look and its modes (unchanged); the invite prompts' and ready check's
place; any server, proto, gateway, OpenAPI or database change.
