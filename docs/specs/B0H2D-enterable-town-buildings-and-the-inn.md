# FS-B0H2D: Enterable town buildings and the Inn

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Hub world" → "Enterable town buildings", "The Inn and its innkeeper"; `game-client/SPECIFICATION.md` "### Hub" → "Town building interiors" · Related: FS-29KSH (hub, its closed scenery buildings), FS-MRZH7 (function NPCs kept clear of residents), FS-0XMCP (hub gates: Spire north, Forest west, Meadows east), FS-2325V / FS-8RBQY (run houses: door gap, roof lift while inside), FS-VPD8Y (town stash, draft)

## Scoping notes (raw)

Session 2026-10-30 `/scope-it`, Kranti. Low cost if wrong (map data + presentation), so
**(not challenged)**. Everything below runs under the charter lane: agents build server and
client both ("no hand coded here, all agents now").

**Problem (user's words, condensed):** walking left or right out of town toward the new Forest
(west gate) and Meadows (east gate), houses block the way. Rearrange, or remove a couple. The
houses that remain matter: they should be enterable, "shop style" with nothing to buy. The
Quartermaster goes in one; we need an inn, "very important": an innkeeper with a cozy tavern,
"not too ridiculous".

**Decided:**
- **Three houses remain, all enterable** [user picked "Three"]: the Quartermaster's store, the
  Inn, and a smithy. The smithy was a default proposed at the lock preview and accepted
  ("lock it"): a smith who speaks a lore line, no trading.
- The rest of the five current `hubBuildings` (`game-service/internal/game/hub_map.go`) go. The
  west house (240,460 220×260) sits on the Forest trail from the west gate (40,400); the east
  house (1560,420 240×300) sits on the Meadows road to the east gate (1960,360). Both flank
  routes must be walkable without weaving: clear lanes from spawn (1000,800) to each gate.
- **Entering works the way a run's house does, in the same world** [user: "the same thing as
  inside the games of our spire, where we enter and we see the world ... generated nicely"]:
  a door gap in the wall, and the roof lifts while the player is inside so the furnished room
  shows. No separate interior scene, no instance, no load step. Client already has this in
  `BarrowspireScene` (roof hidden while underRoof, `addRoof`, house lights shown under roof);
  server already has `AddBuilding` (gap in south wall + door) vs the hub's `addHubBuilding`
  (four closed walls, deliberately scenery). Rejected: a separate interior world/scene per
  building (new world type, load step, more state for no gain at this size).
- **The Quartermaster moves inside his store.** His function (storekeeper) is unchanged; only
  where he stands. The Spirewarden stays outdoors (storyteller near the Spire door).
- **The Inn:** an innkeeper behind a tavern counter, some tables, and **2–3 seated patrons,
  each talkable with a short lore line** [user picked "Seated, talkable"]. The innkeeper has
  the longer talk: generic, lore-fitting (Barrowspire, the Spire, the Forest, the Meadows).
  Patrons sit (static), they do not wander. "Not too ridiculous": one cozy room, no upstairs,
  no rooms to rent, no food/drink buying.
- **"Shop style, no shop things to buy":** nothing new is traded anywhere. Buildings are places
  with people in them.
- Furniture (counter, tables, forge/anvil) is collision: server keep-outs, like the hub's walls.

**Edge cases raised:**
- Ambient residents' wander quarters (`hubResidents`) are placed in the gaps the old buildings
  left; re-check them against the new layout and FS-MRZH7's talk-range clearance test
  (`hub_map_test.go`). A resident must not wander through a door into a house.
- NPC cost: the hub formats every NPC per player per tick; adding ~5 NPCs (innkeeper, 2–3
  patrons, smith) is a real but small cost. Keep the count to that.
- Talk range through a wall: a player outside must not be able to talk to the innkeeper
  through the wall (or decide it's acceptable).
- Player collision is off in the hub (FS-X2F2H / earlier decision), so a crowd at a door
  doesn't block it.
- Door orientation: run houses cut the gap in the south wall; check that the iso view shows
  each door from the town side.
- The hub keep-out logic for scenery (`HubScene` avoids building footprints when placing
  dressing/fences) must follow the new footprints.

**Open (left for write-a-spec / charter defaults):**
- Exact placement of the three houses and their sizes.
- NPC names (innkeeper, patrons, smith) and their lines.
- Does the NPC marker (FS-MRZH7) show for patrons/innkeeper/smith, or only function NPCs?
- Whether the roof lift needs new baked roof art for the hub houses or the placeholder roof.
- Where the town stash (FS-VPD8Y, draft) will live: likely the Quartermaster's store; not in
  scope here.

**Out of scope:** buying/selling, renting rooms, upstairs, the town stash, any new NPC
function, enterable Spire/field structures ("later we'll add stuff to enter" is about the
Forest, see FS-KSD6K).
