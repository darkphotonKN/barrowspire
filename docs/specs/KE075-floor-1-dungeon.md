# FS-KE075: Floor 1 as a room-and-corridor dungeon

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout", "### Enemies"; `game-client/SPECIFICATION.md` "### Escape run", "### Presentation" → this FS

## Scoping notes (raw)

Charter run, 2026-11-06. Nick approved the charter ("核准"), which pre-answers this scoping
session; its locked block is the residue and is kept here as given. Recorded without adversarial
review: no `challenge-me` pass. Nick agreed that agents write game-service code on the branch
for this feature, and asked that settings later floors should follow be recorded as ADRs
("一些可能會是後面樓層可以依循的設定可以寫adr").

### Locked decisions (charter)

- A1. Floor 1 is 5760×3840 (4× the side). Floors 2–3 keep today's generator and size.
- A2. 80 px cells: 72×48.
- A3. Generator in internal/levelgen: rooms + corridors. 18–28 rooms, from 4×4-cell crypts to
  10×8-cell halls. Corridors 2–3 cells wide. About 20% extra connections, for loops. BFS confirms
  everything is reachable. Seeded random per floor.
- A4. Room roles: a start room for the party spawn; the switch, escape door and stairs each in a
  different room, far from the start; 3–4 treasure rooms, guarded by an elite or a pack.
- A5. No doors in v1: open doorways.
- A6. Monsters per room: none in the start room, 0–3 in normal rooms; a hall pack is 1 troll +
  2–4 ghouls; a few in corridors; about 45–70 in total. Mix, levels and elite chance unchanged,
  except treasure-room guards are always elite.
- A7. Containers about 1 per 2 rooms, 10–14 on floor 1. Loot tables unchanged.
- A8. A* on the cell grid, no diagonal corner cutting. Repath per chasing monster at most every
  0.5 s. Wander picks reachable points only.
- A9. New `floor_map` message on run entry, floor change and reconnect: size, cell size, regions
  (rooms and corridor segments with ids) and wall rects. Walls leave the per-tick snapshot on every
  floor (one wire path; floors 2–3 send their layout this way too). Room roles are not sent.
- A10. Interest: monsters, drop piles and containers only within 1600 px of the recipient. Party
  members, doors, switch, escape door and stairs always sent.
- A11. A static wall grid index for collision.
- A12. Client: map size from floor_map; ground chunked (each chunk ≤ 2048 px); walls and dressing
  drawn only near the camera; front/back wall height follows today's look, with a corridor rule.
- A13. ADR for the map wire and interest, plus an ADR for the layout conventions later floors
  follow.
- Out: run gold, new monster types, locked rooms and keys, traps and ambushes, line of sight,
  floors 2–3 as dungeons, anti-cheat and server-side fog, DB/migrations/other services/HTTP
  contract, new art.

### Owner constraint (coordinator relay, same day): floor 1 only

Floors 2–3 keep today's generator, size and gameplay. They still use the `floor_map` wire path
(one transport) and must look and play exactly as today: pixel- and behaviour-identical apart
from how walls arrive. Consequence drawn here: A10's interest filtering and A8's pathing apply to
floor 1 only, since filtering a 1440×960 floor (diagonal 1731 px) by 1600 px would drop a corner
monster and change behaviour.

### Facts (verified 2026-11-06 on 48ece46c; see the work order for citations)

Floor 1440×960 (`common/constants/game.go:362-363`); `buildFloor` (`session.go:3164-3233`);
`ClientGameState` (`types/messages.go:72-103`); full state every tick at 30 Hz; per-recipient
format aliases pooled slices (FS-QG1HR D2 race B); every send is non-blocking and drops on a full
queue (`gameserver/server.go:1418-1424`), `world_entered` included; client hard-codes 1440×960
(`BarrowspireScene.ts:616-617`); Phaser 4.2.1 does not cull display-list objects and clamps a
drawing context to `MAX_TEXTURE_SIZE`.

### Derived while scoping (to settle in the work order)

- Walls on floor 1 are the shell: non-walkable cells 8-adjacent to a walkable one. Deeper rock is
  void, never reached, not sent, drawn as the canvas's darkest ink.
- Every walkable cell belongs to exactly one region; regions are lists of cell rects.
- `floor_map` can be dropped like any message, so the client must be able to ask again
  (`request_floor_map`), and old-floor snapshots may arrive after the new map.
- Hub and field worlds keep walls in their snapshot; out of scope.
- Spectating resolved members have no body: their interest centre is every living member.
- Treasure-room guards: one elite or a pack of elites.
- Two ADRs for layout and navigation reads cleaner than one.

### Open questions (settled in the work order)

- Exact corridor-segment cut rule; wall height rule where a wall borders two regions.
- Who counts as "far from the start".
- What the client does with a snapshot whose floor has no map yet.
