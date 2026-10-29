# FS-3QHQZ: Forlorn Forest and branching-trail generation

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Field worlds" → "Forlorn Forest look and creatures"; `game-server/game-service/SPECIFICATION.md` "### Field worlds" → "Branching-trail level generation", "Forlorn Forest" → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (fields are per-replica channels built at boot), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked isometric art), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (characters authored in code), [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection) · Builds on: [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) (the field world kind, enter/leave, costless death and respawn, kill credit, killer-first loot, monster respawn, level bands, field stat and drop factors; **every field-wide rule lives there and is not restated here**) · Related: [FS-0XMCP](0XMCP-hub-destination-gates.md) (the hub's west gate), [FS-F6F88](F6F88-multi-floor-delves.md) (the floor build step and the tower's fixed-square floors this contrasts with), [FS-77AB6](77AB6-monsters-and-combat.md) (monster sheets, elites), [FS-BDA7X](BDA7X-character-leveling.md) (kill XP rows), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (chest roll), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) (Spire roster; the wraith a ghost must not be mistaken for), [FS-8RBQY](8RBQY-tower-interior-run-look.md) (world themes, exterior ground family, dressing keep-out) · Art SSOT: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) Part I, "Enemy design language" · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) ("World theme", "Dressing", "Wall piece", "Occluder"; new terms listed under Out of Scope → Vocabulary)

> Promoted `--from-thread` on 2026-10-29 from the draft's scoping notes and ADR-0030. The user
> approved every decision under a charter; no interview was held. **[user]** marks the user's own
> call, **[charter default]** a default the user approved wholesale, **[write-a-spec]** a gap this
> promotion filled at acceptance-criteria level (starting values and edge rules; see the Decision
> log). Code citations are against `51bb641` (feat/hub-gates-and-fields). The user's direction for
> this FS is "no hand coded here, all agents now": every slice, server included, is agent lane.
>
> **Amended 2026-10-30** after code review of I-3QHQZ-1 to -8: Requirements 13, 22 and 24 and
> their acceptance criteria are corrected to what was built (struck text kept beside each
> correction), and slice I-3QHQZ-8 is noted. See "Amendment 2026-10-30" at the end of
> Requirements and Decision log rows 22–25. **[implementation]** marks a call made while
> building, recorded after the fact.

## Summary

West of the hub lies the **Forlorn Forest**: one big, a-little-gloomy forest field world where a
trail winds from the entrance and branches at random, each branch ending in a clearing that holds
an elite or a chest. Zombies shamble along the trails and, now and then, a ghost drifts among
them. The forest's shape comes from a new **branching-trail generator**: a reusable, seeded,
pure module that turns a seed and a few parameters into a level layout, built so that future
places can be generated from it too. Each game-service pod generates its own forest once at boot
and keeps it for the pod's life (ADR-0030).

## Requirements

### §A. The branching-trail generator (game-service, reusable)

1. **A pure module.** The generator is a new package, `game-service/internal/levelgen`, with
   one entry point: given **parameters** and a **seed**, return a **layout** or an error. It
   imports nothing from `ecs`, `components`, `systems`, `game` or `gameserver`, reads no clock,
   no global random source, no environment and no files, and has no side effects. It knows
   nothing of forests, monsters, chests or loot. **[user]** baseline for future level shapes;
   **[charter default]** reusable module, not forest code.
2. **Deterministic per seed.** The same parameters and seed always return an identical layout,
   field for field and in the same order (walls, trails, dead ends, open cells). All randomness
   comes from one source seeded from the seed (`math/rand/v2` PCG or equivalent) and no output
   depends on map iteration order. Different seeds generally return different layouts.
3. **Shape: a seeded branching random walk** **[charter default]** on a grid of square cells:
   - **Entrance.** The trail begins at a mouth on the parameterised entrance side of the map, at
     a seeded position along that side, away from the corners.
   - **Main trail.** A forward-biased random walk from the mouth, away from the entrance side,
     turning with a parameterised probability, never crossing or touching itself, until it has
     covered at least a parameterised share of the map's span. Its end is a dead end.
   - **Branches.** A seeded number of side branches (parameterised range) sprout from main-trail
     cells away from the mouth and from each other's roots, walk with the same rules, and may
     fork again up to a parameterised depth. Each branch end is a dead end. Trails never join
     another trail except at the cell they sprouted from: the trail network is a tree, no loops.
   - **Clearings.** Every dead end opens into a clearing of parameterised radius. **[charter
     default]**
   - **Gap and border.** Two trail segments that are not joined keep at least a parameterised
     number of cells of forest between them, and the map keeps a solid border of forest on every
     side except across the mouth.
4. **Trail width.** Trails are carved a parameterised number of cells wide, never narrower than
   two monster bodies side by side plus margin (≥ 4 × `PlayerRadius`), so a fight fits on a
   trail and nothing wedges.
5. **Output: the layout.** Pure data in world px, top-left origin, the same rect convention as
   `game.WallConfig` and `game.PlaceArea` (`X, Y` top-left, `W, H`), so it maps onto existing
   world construction one to one:
   - `Bounds`: the map's width and height.
   - `Walls []Rect`: every cell that is not carved becomes wall, and the wall cells are merged
     into axis-aligned rects (merge rows into runs, then stack equal runs), so a large mass is a
     few rects, never one rect per cell.
   - `Entrance`: the mouth's centre point and side.
   - `Trails`: each trail's cells in walk order as centre points, with the index of the trail it
     sprouted from (the main trail has none), so a consumer can tell main from branch and depth.
   - `DeadEnds`: each clearing's centre, radius, the trail it ends and whether that is the main
     trail.
   - `Open []Point`: the centre of every carved cell, the ground a consumer may place things on.
   - `Seed` and `Attempt`: what produced it (see 6).
6. **Never a broken layout.** A layout is valid when: every open cell is reachable from the
   mouth through open cells; every dead end has its clearing; no wall rect overlaps an open cell
   or another wall rect; every rect lies inside the bounds; the wall rects tile exactly the
   uncarved cells; and the rect count is within the parameterised **wall budget**. The generator
   checks its own output. If a walk boxes itself in or the result breaks a rule, it retries
   deterministically from seeds derived from the original (attempt 1, 2, …, up to a
   parameterised limit), so the same seed still always yields the same layout. Only invalid
   parameters, or exhausting every attempt, return an error.
7. **Validated parameters.** Parameters out of range (non-positive sizes, a trail wider than the
   map, a branch range with min > max, a wall budget of zero, a span share outside (0, 1], …)
   return an error before any walking.
8. **Testable without the game.** The package's tests run with nothing but the standard
   library: table-driven parameter validation; determinism (same seed twice → `reflect.DeepEqual`);
   a property test over at least 1 000 seeds with the Forest's parameters asserting every rule
   in 6; and a golden ASCII rendering of one fixed seed checked into `testdata/`, so a change to
   the algorithm shows up as a readable diff. A test helper renders any layout as ASCII (`#`
   wall, `.` open, `E` mouth, `o` clearing centre) for eyeballing.

### §B. The Forest world (game-service)

9. **A field world.** The Forest is one of the two field worlds of FS-X2F2H: it uses FS-X2F2H's
   field world kind, enter and leave through its entrance gate, costless death and respawn at
   the entrance, kill credit, killer-first loot, monster respawn at the spawn point, the Forest
   level band (4–9), the field stat factor and the Forest drop factor (0.5). This FS adds only
   the Forest's layout, population and chests. Wherever FS-X2F2H defines how a field's layout,
   spawn points or roster are supplied, the Forest supplies them through that path and adds no
   second one.
10. **Built once at pod boot.** Each pod builds its Forest when it creates its field worlds,
    from the generator with a fresh random seed (drawn once at boot from a cryptographic or
    time-seeded source outside `levelgen`), and keeps it for the pod's life. It is never
    regenerated under players. The seed and attempt are logged at boot (`slog.Info`, with the
    session id), so a reported layout can be rebuilt in a test. **[charter default]** Each pod's
    channel has its own layout (ADR-0030).
11. **Size: about twice a tower floor.** **[charter default]** Larger than both the hub and a
    tower floor. Starting values: cell 80 px, map 26 × 17 cells = **2 080 × 1 360 px** (2.05 × a
    1 440 × 960 floor; the hub is 2 000 × 1 000). The Forest's bounds are new constants beside
    `MapWidth` / `HubMapWidth` in `common/constants/game.go`, and the world's `WorldBounds` uses
    them, so the MovementSystem clamps at the forest's edge.
12. **The Forest's generator parameters** (starting values, tunable in one place, gated by the
    §A.8 property test): entrance side **east** (the Forest is west of the hub, so its way home
    faces the hub); trail width 2 cells (160 px); main trail covers ≥ 60 % of the map's width;
    3–5 branches, fork depth ≤ 2; clearing radius 2 cells; segment gap ≥ 1 cell; border 1 cell;
    wall budget **120 rects**; retry limit 32.
13. **The layout becomes the world through today's construction.** Every layout wall rect is one
    wall entity made by `CreateWallEntity` with its own house id, so walls broadcast in
    `walls[]` exactly as a run's or the hub's do and collide in the MovementSystem with no new
    code. ~~Every placed object (entrance gate, chests, spawn points) is recorded as an occupied
    area~~ The entrance gate, every wall and every chest are recorded as occupied areas the way
    the floor build step records what it places (`objectOccupiedPlaceAreas`), and nothing is
    placed on a wall. Spawn points are deliberately **not** recorded: they are points a monster
    stands on, not objects, recording them would change the Meadows' occupied set, and nothing
    is placed in a field after its build today (corrected by the 2026-10-30 amendment). No
    run-only object is built: no buildings, doors, escape door, switch or stairs (as
    `InitialHubMapObjects` builds none of them).
14. **The entrance.** FS-X2F2H's field entrance gate stands at the layout's `Entrance`, inside
    the mouth, and the field's respawn point is beside it on open ground.
15. **Clearings: an elite or a chest.** **[charter default]** The main trail's dead end always
    holds an elite: the deepest clearing is the reward for walking furthest. Every other dead
    end holds an elite or a chest, seeded 50/50, with at least one chest when the forest has two
    or more dead ends. Assignment uses a random source derived from the same boot seed, so the
    whole forest is reproducible from that one seed.
16. **Spawn points.** Standard spawn points are fixed at build: **18–24** (seeded; about twice a
    tower floor's 8–14), chosen from the layout's open cells on trails, at least 400 px from the
    entrance and at least `MonsterSpacing` apart, and never inside a clearing. Each elite
    clearing adds one elite spawn point at its centre. A spawn point that finds no valid cell is
    skipped and logged, never forced (as `populateMonsters` does today).
17. **Who spawns.** At each spawn and each respawn (FS-X2F2H's 45 s), a spawn point rolls its
    archetype: **ghost with probability 1/12, otherwise zombie**. **[user]** ghost rarer;
    **[charter default]** ≈ 1 in 12. Standard spawn points are never elite; elite spawn points
    always are, with the Spire's elite multipliers on top of the field factor (FS-X2F2H rule 16,
    **[user]** elites harder than normals) and an elite name prefix from `ElitePrefixes`. Level
    comes from FS-X2F2H's Forest band rule.
18. **Zombie and ghost archetypes.** Two new `MonsterArchetype` values, `"zombie"` and `"ghost"`,
    each with a level-1 sheet in `monster_tuning.go` and a kill-experience row (FS-BDA7X). They
    are Forest monsters; the Spire's population (`rollMonsters`, `trollShare`) does not roll
    them. **[user]** zombies by default, since the Spire has none (checked 2026-10-29: ghoul,
    troll, demon, plus FS-Q14EV's wraith, revenant, grave-hound). Starting sheets (level 1,
    before the field factor), tunable:

    | | HP | Damage | Attack interval | Wind-up | Range | Move speed | Defense | Magic res. | Aggro | Leash | Kill XP base |
    |---|---|---|---|---|---|---|---|---|---|---|---|
    | Zombie | 70 | 9 | 1.4 s | 0.5 s | 45 | 100 | 5 | 1 | 240 | 480 | 15 |
    | Ghost | 30 | 8 | 0.9 s | 0.3 s | 50 | 175 | 0 | 8 | 300 | 560 | 20 |

    The ghost is faster and frailer than the zombie **[charter default]**, and still slower than
    a player (200 px/s), as every archetype is.
19. **Chests.** A clearing chest is a container entity like the Spire's chest. It is rolled when
    first opened, through the same chest roll the Spire uses (FS-4R9M9), with the item level
    drawn uniformly from the Forest band (4–9) and the roll's chance scaled by the Forest drop
    factor, the same derived-rate rule FS-X2F2H applies to monster drops. Anyone may take what it
    holds; there is no killer-first window on a chest. **5 minutes** after it was first opened
    it restocks: whatever is still inside is removed, it closes, and the next opening rolls
    afresh. Items taken from it settle like any field pickup (FS-X2F2H rule 6).
20. **No wire change.** The Forest adds no message, field or endpoint. Walls, monsters, chests
    and the gate reach the client through the existing state broadcast; `archetype` gains two
    values. No HTTP endpoint, no RPC, no DB migration. Never touches `internal/matchmaker`,
    `internal/match_queue` or their wiring.
21. **Broadcast cost is bounded.** The wall budget (Requirement 12) caps what the Forest adds to every
    broadcast. A test asserts the built Forest never exceeds it.

### §C. The Forest look (game-client)

22. ~~**A world theme.** The Forest is drawn with a new world theme, `"forest"`, one more entry in
    `src/render/world/worldTheme.ts`, chosen when the server says the player is in the Forest
    field (by the field identity FS-X2F2H puts on the wire), never by a constant. It reuses the
    `WorldThemeLook` machinery: no roofs, no indoor mask, no perimeter wall (the forest's edge is
    its own border of trees), forest dressing on, and a forest ambient.~~
    **A field look** (corrected by the 2026-10-30 amendment). The Forest is drawn with a
    `forlorn_forest` entry in `FIELD_LOOKS` (`FieldLook`, `src/render/world/fieldLook.ts`), the
    field counterpart of the world theme, chosen by the field identity FS-X2F2H puts on the wire,
    never by a constant; `worldTheme.ts` is unchanged. A `FieldLook` either stands `dressing`
    on the server's walls (the Meadows' groves) or fills them with tree `stands` (the forest),
    and may add `verges` and `mist`. The intent holds: selected by field identity, no roofs, no
    indoor mask, no perimeter wall (the forest's edge is its own border of trees), and a forest
    ambient.
23. **Trees are the server's walls.** A forest wall is not cut into wall pieces. Each server wall
    rect is drawn as a **tree stand**: baked trees filling the rect's footprint, about one per 80
    px cell, jittered within the cell, so what the player sees blocking the trail is exactly what
    the server collides against, and every client plants the same stand (picks hashed from the
    rect and the world seed, as the hub's tree spots and `tileHash` are). Trees on a stand's
    trail-facing edge stand at its edge so the trail reads clearly; a stand's interior may be
    thinner. Trees are occluders (they fade over the player). A cap of **400 tree sprites** per
    forest holds; a stand past its share draws fewer, larger-spaced trees, never more.
24. **Dead and live trees.** **[charter default]** A stand mixes live trees (dark, low-saturation
    oak and pine variants) and dead ones (bare, gnarled, broken snags), about two live to one
    dead, by the stand's seeded picks. The picks follow one rule (2026-10-30 amendment): every
    tree on a stand's north- or west-facing edge is bare (a dead tree or a snag), because it
    stands in front of the trail on screen and its crown would hide the trail and the monsters
    on it; the stand's other trees are dead one in twelve, live otherwise. The overall ~2:1
    live to dead falls out of the stands' shape and is not tuned directly.
25. **Ground.** The exterior theme's ground family (FS-8RBQY, `OUTDOOR_GROUND`): worn barrow dirt
    on the trails and in the clearings, darker leaf litter under the stands.
26. **Dim, not dark.** **[user]** "a little gloomy but not so dark". The forest ambient sits
    between the hub's dusk and a run's barrow cold, mixed from `BARROW_HEX` like every ambient,
    defined beside `AMBIENT` / `TOWER_AMBIENT`. The player's own torch and the entrance gate's
    light still throw pools; nothing in the forest depends on a light to be found.
27. **Mist.** A slow, low-lying mist drifts over the ground: a camera-relative presentation
    overlay above the ground and below markers, never coupled to game state, reduced to a
    static haze under `prefers-reduced-motion`.
28. **Forest dressing.** Non-blocking props (ferns, stumps, fallen logs, toadstools, a few bone
    piles) strewn on open ground outside the forest's keep-out (walls, the gate, chests, map
    edge), computed from the broadcast as run dressing is (FS-8RBQY §C.5). Never interactable,
    never colliding, never in a clearing's middle.
29. **Zombie and ghost on the canvas.** Two new baked creatures, `creature_zombie_base` and
    `creature_ghost_base`, both fodder tier, on the shared rig with 8 directions and idle, walk,
    attack and death, added to `MONSTER_LOOKS` and to the client's `MonsterArchetype` union.
    Until their sheets exist, an unknown archetype keeps falling back to the troll look, so the
    server can ship first.
    - **Zombie:** a shambling, hunched corpse in a rotted burial shroud, one arm hanging longer
      and heavier, head lolling, earth and moss on grave-rot skin; slow, dragging walk; death: it
      folds and collapses.
    - **Ghost:** a pale, thin, translucent figure, legs fading to nothing below the knee, long
      arms reaching ahead; its body is partly transparent in the baked sheet (alpha ≈ 0.6) while
      its ember-red eyes stay opaque. It must not read as FS-Q14EV's wraith (rags, dark,
      opaque): the ghost is pale and see-through, the wraith dark and ragged. Death: it thins and
      dissolves.
    Both follow "Enemy design language": grave materials from the cold end of `BARROW`, ember-red
    eyes as the one emissive, silhouettes that break the human line, readable wind-ups, no gore.
30. **Baked, not sourced.** Every new sheet (trees, dressing, both creatures) is authored in code
    in the bake tool and baked (ADR-0020, ADR-0021); nothing is sourced. Each bake ends at a
    contact sheet the owner approves.

### Amendment 2026-10-30: matching the record to the build

Code review of the built slices found three places where the implementation took a better or
narrower path than the text, and one slice the original slicing missed. Intent is unchanged in
every case; the requirements above are corrected in place, with the struck text kept.

- **R22 (field look, not world theme).** I-3QHQZ-7 (`863e7c2`) drew the Forest as a
  `forlorn_forest` entry in `FIELD_LOOKS` rather than a `"forest"` world theme. FS-X2F2H had
  already given fields their own look (`FieldLook`, keyed by field id), so a world theme would
  have been a second selection path for the same thing. `FieldLook` became a union: `dressing`
  for open country, `stands` for a forest, with optional `verges` and `mist`.
- **R24 (tree picks).** Edge trees facing north or west are always bare; the rest are dead one
  in twelve. Readability of the trail beats an even mix; ~2:1 overall is a result, not a knob.
- **R13 (occupied areas).** Gate, walls and chests are recorded; spawn points are not.
- **I-3QHQZ-8, field chests drawn and opened on the client** (§B, Requirements 19 and 20). The
  server's clearing chests (I-3QHQZ-4) reached the client in `containers[]`, but the field scene
  kept only drop piles, so a Forest chest was never drawn or openable. The slice draws chests in
  the field scene and opens them through the same satchel, sharing the run's chest drawing. No
  wire change. Added after the original slicing; it was found by I-3QHQZ-7.

## User Stories

1. As a player in the hub, I want a gate to the west that leads into a forest, so that there is somewhere new to go besides the Spire.
2. As a player, I want the forest to be bigger than the village and a tower floor, so that it feels like a place to roam, not a room.
3. As a player, I want a trail to follow from the entrance, so that I always know which way is deeper and which way is home.
4. As a player, I want the trail to branch, so that I choose where to go and exploring pays off.
5. As a player, I want every branch to end somewhere worth reaching, so that a dead end is a reward, not a waste.
6. As a player, I want the deepest clearing to hold an elite, so that walking furthest is the hardest and best fight.
7. As a player, I want some clearings to hold a chest, so that exploring finds loot as well as fights.
8. As a player, I want a looted chest to fill again after a while, so that a shared forest is not stripped bare by whoever came first.
9. As a player, I want zombies along the trails, so that the forest has its own dead, not the tower's.
10. As a player, I want a ghost to turn up now and then, so that the forest keeps a small surprise.
11. As a player, I want the ghost to be quick but fragile, so that it is a different fight from a zombie.
12. As a player, I want elites to be harder than ordinary monsters, so that a clearing's elite is a real challenge.
13. As a player, I want the forest gloomy but not pitch dark, so that it has a mood and I can still see where I am going.
14. As a player, I want mist and a mix of dead and living trees, so that the forest reads as forlorn at a glance.
15. As a player, I want the trees I see to be exactly where I cannot walk, so that the forest never blocks me with something invisible or lets me walk through a trunk.
16. As a player, I want the trees in front of me to fade when I walk behind them, so that I never lose my character in the canopy.
17. As a player, I want to tell a zombie and a ghost from each other, and from a player, in one glance, so that I know what I'm fighting.
18. As a player, I want the ghost to look nothing like the Spire's wraith, so that the two places keep their own creatures.
19. As a player, I want the forest to stay the same while I am in it, so that the trail I learned does not change under me.
20. As a player on another pod, I accept that my forest may be laid out differently, so that each channel is its own world (ADR-0030).
21. As a player, I want the way out to face the hub, so that leaving the forest puts me back where I expect.
22. As a player on a slow machine, I want the forest to stay smooth, so that the trees and mist never cost me frames I need in a fight.
23. As a player who prefers less motion, I want the mist to hold still, so that the forest does not swim.
24. As a level designer (future), I want one tested generator that turns a seed into a level shape, so that new places can be generated without writing a new algorithm.
25. As a developer, I want the generator to be pure and deterministic, so that a layout can be reproduced in a test from its seed.
26. As a developer, I want the boot seed in the log, so that a bug report about a forest can be rebuilt exactly.
27. As a developer, I want a golden ASCII picture of a fixed-seed layout, so that any change to the algorithm is visible in review.
28. As a developer, I want the forest built through the same wall entities and occupied areas as every other world, so that collision, broadcast and placement need no parallel path.
29. As a developer, I want the forest's walls capped by a budget, so that it cannot silently bloat every state broadcast.
30. As a developer, I want the client to fall back to a known look for an archetype it does not know, so that the server can ship the zombie before its art.
31. As the owner, I want to approve each new creature and tree on a contact sheet, so that nothing reaches the game that fails the art bar.

## Acceptance Criteria

### Generator (§A)

- [ ] `internal/levelgen` imports nothing from `ecs`, `components`, `systems`, `game` or `gameserver`, and nothing outside the standard library.
- [ ] Generating twice with the same parameters and seed returns `reflect.DeepEqual` layouts; at least two of ten consecutive seeds differ.
- [ ] Over ≥ 1 000 seeds with the Forest's parameters, every layout is valid: all open cells reachable from the mouth; one clearing per dead end; no rect overlaps an open cell or another rect; every rect inside bounds; rects tile exactly the uncarved cells; rect count ≤ wall budget; trails form a tree (no loops); unjoined segments keep the gap; the border is solid except at the mouth; the main trail covers ≥ the span share.
- [ ] Each invalid-parameter case in a table returns an error and walks nothing.
- [ ] A forced box-in (parameters that make the first attempt fail) is retried from derived seeds and the returned `Attempt` reflects it; the same seed still returns the same layout.
- [ ] A golden ASCII rendering of one fixed seed is checked in under `testdata/` and the test fails on any change to it.
- [ ] Trail width in px is ≥ 4 × `PlayerRadius` for the Forest's parameters.

### Forest world (§B)

- [ ] Each pod builds exactly one Forest at boot, of size 2 080 × 1 360 px, logging seed and attempt; it is not rebuilt while the pod runs.
- [ ] Every layout rect becomes one wall entity via `CreateWallEntity`; the Forest's `walls[]` count equals the layout's rect count and is ≤ 120.
- [ ] The Forest contains no building, door, escape door, switch or stairs.
- [ ] The entrance gate, every wall and every chest are recorded as occupied areas; spawn points are not, and the Meadows' occupied set is unchanged (2026-10-30 amendment).
- [ ] The field scene draws the Forest's clearing chests from `containers[]` and opens them through the run's satchel (I-3QHQZ-8, 2026-10-30 amendment).
- [ ] The entrance gate stands at the layout's entrance on the east side; respawn is beside it on open ground.
- [ ] The main trail's dead end holds an elite spawn point; other dead ends hold an elite or a chest, with at least one chest when there are two or more dead ends; the same seed gives the same assignment.
- [ ] 18–24 standard spawn points, all on open cells, ≥ 400 px from the entrance, ≥ `MonsterSpacing` apart, none in a clearing; an unplaceable one is skipped and logged.
- [ ] Over many seeded rolls, ghosts are 1/12 of spawns within tolerance; standard spawns are never elite; elite spawns always are and carry an elite prefix.
- [ ] `zombie` and `ghost` have sheets and kill-XP rows; the Spire's population never rolls them.
- [ ] A clearing chest rolls on first open with an item level in 4–9 and the Forest drop factor applied; 5 minutes after first opening it is closed and empty, and the next opening rolls again.
- [ ] No new message type, endpoint, RPC or migration; `internal/matchmaker`, `internal/match_queue` and their wiring are untouched.

### Forest look (§C)

- [ ] ~~`WorldTheme` gains `"forest"`; the Forest field is drawn with it and no other world is.~~ `FIELD_LOOKS` gains a `forlorn_forest` entry (a `FieldLook` with tree `stands`, `verges` and `mist`), selected by field id; the Forest field is drawn with it and no other world is; `worldTheme.ts` is unchanged (2026-10-30 amendment).
- [ ] Every server wall rect in the Forest is drawn as a tree stand covering its footprint; no wall pieces and no perimeter wall are drawn there.
- [ ] Two clients given the same `walls[]` plant identical stands (pure, tested function of rect and seed).
- [ ] Total tree sprites never exceed 400 for any valid forest (tested against a ≤ 120-rect fixture filling the map).
- [ ] Stands mix live and dead trees about two to one; trees are occluders.
- [ ] Every tree on a stand's north- or west-facing edge is bare (dead tree or snag); the stand's other trees are dead one in twelve (2026-10-30 amendment).
- [ ] Ground is trail dirt on open ground and leaf litter under stands, from the exterior ground family.
- [ ] The forest ambient is lighter than a run's and darker than the hub's, from `BARROW_HEX` only (lint fence green).
- [ ] Mist drifts above the ground and below markers; under `prefers-reduced-motion` it is static.
- [ ] Forest dressing is placed only outside the keep-out computed from the broadcast, and never collides or takes a click.
- [ ] `MONSTER_LOOKS` has `zombie` and `ghost` at fodder tier; the client `MonsterArchetype` union includes them; before their sheets exist both fall back to the troll look without error.
- [ ] Owner-approved contact sheets exist for the new trees and dressing, and for zombie and ghost (8 directions × idle, walk, attack, death, at game scale).

## Edge States

- **Generator boxed in.** A walk that cannot continue ends early; if that leaves the main trail short of its span share or a rule broken, the attempt is discarded and the next derived seed tried. Exhausting the retry limit returns an error. With the Forest's parameters the property test shows this never happens; if it did at boot, building the pod's field worlds fails and the pod fails to start with the wrapped error and the seed logged, rather than serving a broken forest. (A fail-fast at boot, not a `panic`.)
- **Wall budget exceeded.** Treated as an invalid attempt and retried, never truncated: a dropped rect would be a hole in the forest.
- **No dead end but the main trail's.** Possible only if every branch failed; the attempt is then invalid when the parameters require at least 3 branches. The single-dead-end case, if parameters allow it, holds an elite and no chest.
- **Spawn point cannot be placed.** Skipped and logged; the forest runs with fewer monsters.
- **Empty forest.** It still exists and keeps its layout; monsters respawn on FS-X2F2H's rules whether or not anyone is there (whether an empty field sleeps is FS-X2F2H's open question).
- **Two players open a chest at once.** The first open the tick applies rolls it; the second finds it open with whatever is left. Contents are first come, first served.
- **A chest is mid-restock while someone stands at it.** At the 5-minute mark its remaining items vanish and it closes; an item already moved to a satchel is the player's.
- **Pod restart.** The forest is regenerated from a new seed; players were returned to the hub by the disconnect (FS-X2F2H rule 7), so nobody sees the change happen.
- **Players on different pods.** Different forests, by design (ADR-0030).
- **Client before the creature art.** `zombie` and `ghost` draw as the troll (the fallback), labelled by their server name; nothing crashes.
- **Client before the tree art.** A missing tree sheet falls back to the existing baked oak and pine sheets, so collision is still visible.
- **Huge rect.** A single stand larger than its share of the tree cap draws its edge trees first and thins its interior, never exceeding the cap.
- **Reduced motion.** Mist static; trees do not sway.

## Out of Scope

- **Every field-wide rule** (field world kind, entering and leaving, queued refusal, costless death and respawn, kill credit, killer-first loot window, monster respawn timing, level bands, stat and drop factors, settlement on leaving, empty-field sleep): FS-X2F2H.
- **The hub's west gate**: FS-0XMCP.
- **Chained zones** (outer / deep / heart). Rejected for now; the user: "we'll add chained zones into different places later".
- **A fixed-per-deploy or daily seed**; regenerating the forest on a schedule.
- **More enemy types** in the forest. The user: ghost too, "nothing more".
- **Using the generator for the Spire's floors or the Meadows.** It is built to be reused; switching any other world to it is a later FS.
- **Join a friend's channel** (parked with party formation).
- **Sending the layout once instead of in every broadcast.** The wall budget bounds the cost for now.
- **Vocabulary** (not written by this FS; route through `domain-model`): game-service `CONTEXT.md` — *Layout* (the generator's output), *Trail*, *Dead end*, *Clearing*, *Spawn point*, *Forlorn Forest*, archetypes *zombie* and *ghost*; game-client `CONTEXT.md` — ~~*Forest theme* (a world theme; "World theme" widens from "how the client draws a run" to "how the client draws a run or a field")~~ *Field look* (how the client draws a field, keyed by field id; the field counterpart of World theme, which stays "how the client draws a run"; 2026-10-30 amendment), *Tree stand* (a server wall as the forest look draws it).

## Decision log

| # | Decision | Provenance |
|---|---|---|
| 1 | West of the hub; a little gloomy, forest vibes; a trail that branches randomly, unlike the tower's fixed-square floors | [user] |
| 2 | One big zone, one theme, larger than the hub and a tower floor, not massive | [user] |
| 3 | About 2 × a tower floor's area (2 080 × 1 360 px at 80 px cells) | [charter default]; size [write-a-spec] |
| 4 | The branching generator is the baseline for future generated level shapes | [user] |
| 5 | Built as a reusable module, not forest code (`internal/levelgen`, pure) | [charter default]; package [write-a-spec] |
| 6 | Seeded branching random walk: main trail, side branches, clearing at each dead end holding an elite or a chest | [charter default] |
| 7 | Generated once per pod at boot from a random seed, kept for the pod's life, never regenerated under players | [charter default] |
| 8 | Zombie default enemy (the Spire has no zombies) | [user] |
| 9 | Ghost, rarer, nothing more; ≈ 1 in 12 spawns, faster and frailer | [user]; rate and shape [charter default] |
| 10 | Elites harder than normals (Spire elite multipliers on top of the field factor) | [user] |
| 11 | Dim ambient, mist, dead and live trees, on the exterior theme's ground family; art built in code and baked | [charter default] |
| 12 | Trees are the server's wall rects drawn as tree stands; extra flora is client dressing | [write-a-spec] (from CONTEXT.md "Dressing": anything that blocks must be a server wall) |
| 13 | The forest look is a world theme `"forest"` chosen by the field identity | [write-a-spec] (CONTEXT.md left it to this promotion) |
| 14 | Layout uses the `WallConfig` / `PlaceArea` rect convention and is built through `CreateWallEntity` and occupied areas, no parallel construction | [write-a-spec] |
| 15 | Deterministic retry from derived seeds; a fail-fast boot error if exhausted | [write-a-spec] |
| 16 | Wall budget 120 rects; tree-sprite cap 400 | [write-a-spec] |
| 17 | Main trail's dead end always an elite; others 50/50, at least one chest | [write-a-spec] |
| 18 | 18–24 standard spawn points; standard never elite, clearing spawns always elite | [write-a-spec] |
| 19 | Zombie and ghost starting sheets (table in R18) | [write-a-spec] |
| 20 | Chests roll on first open at a band item level with the Forest drop factor, restock 5 min after first open | [write-a-spec] |
| 21 | Entrance on the east side (faces the hub) | [write-a-spec] |
| 22 | The forest look is a `forlorn_forest` `FieldLook` in `FIELD_LOOKS`, selected by field id; `worldTheme.ts` unchanged; `FieldLook` is a union of `dressing` or `stands`, with optional `verges` and `mist` (supersedes row 13; R22) | [implementation] (I-3QHQZ-7, `863e7c2`; 2026-10-30 amendment) |
| 23 | Every north- or west-facing edge tree of a stand is bare so crowns never hide the trail or monsters on it; the rest are dead 1 in 12; ~2:1 overall falls out of the shape (R24) | [implementation] (I-3QHQZ-7; 2026-10-30 amendment) |
| 24 | Gate, walls and chests are occupied areas; spawn points are not, keeping the Meadows' occupied set unchanged, since nothing is placed in a field after its build today (R13) | [implementation] (2026-10-30 amendment) |
| 25 | Slice I-3QHQZ-8 added after the original slicing: field chests drawn and opened on the client (R19, R20) | [implementation] (found by I-3QHQZ-7; 2026-10-30 amendment) |
| R | Rejected: chained zones (later); fixed-per-deploy or daily seed | [user] |
