# ADR-0061 — Dungeon floors are rooms and corridors on an 80 px cell grid, built by one pure generator under fixed conventions that later floors follow

Status: accepted
Date: 2026-11-06
Scope: `game-service` run floors (`internal/levelgen`, the floor build step) and how
`game-client` reads them. Applies to every run floor built as a dungeon; today that is floor 1.
Floors 2–3 keep the building generator until a later FS converts them under these conventions.
Specified by [FS-KE075](../specs/KE075-floor-1-dungeon.md) §A, §B, §C, §H.
Amends: none. [FS-F6F88](../specs/F6F88-multi-floor-delves.md) (shipped) keeps its floor-build
seam; FS-KE075 supersedes its §5 for floor 1 only.
Related: [ADR-0060](0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (how
the layout travels), [ADR-0062](0062-monsters-path-on-the-floor-cell-grid-with-a-star.md) (how
monsters move on it), [ADR-0063](0063-fog-of-war-is-client-presentation-shared-by-the-party.md)
(fog on its regions).

## Context

Decided in the charter Nick approved on 2026-11-06 ("核准"), decisions A1–A7, A9 and A12, with his
instruction that settings later floors could follow be recorded as ADRs
("一些可能會是後面樓層可以依循的設定可以寫adr"), and his later constraint "floor 1 only".
Recorded without adversarial review: no `challenge-me` pass.

Forces:

- **Floor 1 is the first generated dungeon; floors 2–3 may follow.** Whatever floor 1 settles
  becomes the default for them unless written down as a rule.
- **Today's run floor is random rects** with a negative "outside every keep-out" spawn test
  (`monster_population.go:231-363`, `party_spawn.go:45-142`), which fails when almost every point
  is rock.
- **`internal/levelgen` already holds a pure, seeded, validated generator** for the Forest: 80 px
  cells, wall-run merging, BFS reachability (`forest.go`, `merge.go:13`, `validate.go:133-180`).
- **Collision is axis-aligned rects** (swept AABB, `movement.go:118-246`); the client cuts walls
  into iso pieces and decides their height by side (`walls.ts:61-76`).
- **The client hard-coded the map size** (`BarrowspireScene.ts:616-617`), which a second size
  breaks everywhere.

## Decision

1. **Grid.** A dungeon floor is a grid of **80 px cells**. Its size in cells (72×48 for floor 1)
   is the floor's own, set by its parameters.
2. **One generator, pure and seeded**, in `internal/levelgen`: rooms plus corridors, deterministic
   for a seed, retried on derived seeds, knowing nothing of entities or the wire. A floor's
   parameters (grid size, room counts and sizes, corridor widths, extra-connection share) are data;
   a new dungeon floor is a new parameter set, not a new generator.
3. **Everything walkable is reachable**, confirmed by BFS before the layout is accepted.
4. **Walls are the shell, merged into axis-aligned rects**: the non-walkable cells next to a
   walkable one, diagonals included. Deeper rock is void, with no entity.
5. **Regions.** Every walkable cell belongs to exactly one region, a room or a corridor segment,
   with an id on the floor map. Regions are the unit later presentation builds on (fog, minimap).
6. **Room roles**: start, switch, escape door, stairs, treasure. The switch, escape door and stairs
   are in three different rooms, all far from the start (at least the median room's walking
   distance). Roles are server-only.
7. **Population is per room.** Monsters and containers are distributed by room and role (none in
   the start room; treasure rooms guarded), with floor-level totals as bounds. The archetype
   mix, level rule and loot tables stay the floor's own tuning.
8. **Spawns sample walkable cells** (positive sampling), inset from walls by the body's radius,
   never "outside every keep-out rect".
9. **Monsters path on the cell grid** (ADR-0062).
10. **Map size is per floor and carried on the wire** (the floor map, ADR-0060). The client never
    hard-codes a map size.
11. **A dungeon floor's look**: front/back wall height by the side a walkable cell lies on (south
    and east fronts low, front winning), no building exterior, roof, blackout or client perimeter,
    void as the darkest ink, ground in chunks of at most 2048 px, walls and dressing drawn only
    near the camera; the tower art and floor bands stay FS-8RBQY's.
12. **Per-floor presentation opt-ins.** Two client features are switched on per floor rather than
    everywhere: **fog of war and the minimap** (FS-SRA9J) are on for every floor whose floor map
    carries regions, and the **monster target frame** in place of overhead plates (FS-48CTQ) is on
    for the floors its per-floor switch names (floor 1 today). A later floor adopts them by
    becoming a dungeon floor, or by adding itself to the switch.
13. **A layout that cannot be generated never stops a run**: the floor build falls back rather than
    fail.

## Consequences

- Converting floor 2 or 3 into a dungeon is a parameter set, a role/population tuning and a
  switch entry, with no new wire, collision or client rules.
- The negative spawn test survives only on floors 2–3 and in fields; code-review can flag a new
  dungeon-floor spawn that uses it.
- A layout is reproducible from its logged seed and parameters; golden layouts in `testdata` pin
  the generator.
- Corridors can be cut into segments however the generator likes as long as each stays a region;
  FS-SRA9J's fog quality depends on that cut.
- Anything that needs a room's role on the client (a "treasure here" marker) needs a new decision,
  since roles never travel.
- Doors, keys, traps and line of sight are not part of the convention; adding any of them is a new
  FS and, if it changes a rule above, a new ADR.
