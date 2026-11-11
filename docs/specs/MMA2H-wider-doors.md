# FS-MMA2H: Wider doors

> Status: draft · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Wider doors → FS-MMA2H`: [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md), [FS-2325V](2325V-pre-rendered-isometric-art.md), [FS-F6F88](F6F88-multi-floor-delves.md)

## Scoping notes (raw)

Locked 2026-11-11 from the owner's approved charter "門加寬" (the decisions below are the owner's
answers; the lock preview was approved under the charter; nothing was asked).

**Why (owner, playtest 2026-11-11).** Players often miss the door and hit the wall beside it. A
body is 40 px wide (`PlayerRadius` 20) and these doors are 50 px: 5 px to spare each side.

**Locked decisions.**

- Every 50 px door becomes 80 px: run houses' doors, every hub town building's door gap, the Inn's
  partition gap. 80 px is two bodies wide, the owner's upper limit ("不要超過兩個人的寬度"), a
  whole number of 40 px wall tiles, and floor 1's doorway width.
- Floor 1's doorways are unchanged: one 80 px cell already. Field worlds have no doors.
- Run houses and the hub keep one shared width, as today.
- A door stays centred in its wall; building placement and sizes are unchanged.
- The door leaf, frame, lintel and door head art are re-baked at 80 px (baked art, ADR-0020;
  FS-9PN7X §F.4 sizes the frame and the head to "the run door width (50 world px)").
- Monster and NPC keep-outs computed from the door's rect follow the new width.
- Opening, closing, locking and the interact distance are unchanged: only the width.

**Bounds.** May change game-service door-width constants and building generation, game-client
door/wall drawing and its golden files, `game-client/tools/bake`. May not change proto, api-gateway,
OpenAPI or the generated client, touch a database or migration, touch other microservices, or edit
the existing text of a shipped FS.

**Sorting (five-bin, `docs/specs/README.md`).** No line owns "door width"; four shipped
capabilities each state the 50 px number:

- FS-B0H2D R9 and its acceptance criterion ("a centred 50 px gap"), R5, R15, R23, R24 (the town's
  gaps, the ground in front, the threshold strip, the client mirror, the door spurs);
- FS-9PN7X §F.4 (the door heads, "the gap's width (50 world px)") and §B.5 (the drawn gap door);
- FS-2325V §B.4 (the `door_{x,y}` sheet: leaf, frame, lintel);
- FS-F6F88 §5 (the floor of buildings `layBuildings` builds, whose houses `AddBuilding` cuts).

Acceptance criteria change (FS-B0H2D's 50 px gap; FS-9PN7X's sheet sizes), so it is not tuning. It
spans several capabilities, so it is one change FS with a pointer stub on each owner, and no thin
line. No line is made false: nothing is reworded.

**Facts found while scoping (working tree at `28a7a377`).**

- `hubDoorWidth = 50` (`internal/game/hub_map.go:156`) cuts each town building's south wall
  (`addHubBuilding`) and the Inn's partition (`partitionWalls`).
- Run houses: `CreateBuilding` passes the literal `50` to `AddBuilding`
  (`internal/game/session.go:3716`). Two places hold one number.
- Since FS-M8CSE §C, every Spire floor is a dungeon; `layBuildings` (and so a run house) is built
  only when dungeon generation fails twice. The charter's "run houses on floors 2-3" reads as "run
  houses wherever a floor of buildings is built".
- Narrowest walls an 80 px gap is cut in: run houses 300 / 400 / 500 wide, store and smithy 300,
  Inn 640, the Inn's partition 440 long. Each side stays at least 110 px. None is too narrow.
- `mapKeepOut` (`monster_population.go`) takes each door's own `Width`/`Height`: it follows.
- Door interact range (`DefaultInteractableRange` 60) is measured to the doorway's centre
  (`handleInteract`): a delver beside either jamb of an 80 px door (40 px off centre) is in reach.
- The client finds door gaps from the walls (`doorGaps`, `buildingLooks.ts`), never from a
  constant; wall pieces trim a remainder (`walls.ts`). The 50 lives in tests, `HUB_DOOR_SPURS`
  (`hubKeepOut.ts`), a comment in `projection.ts`, and the bake (`interactables.js` `DOOR_W`,
  `building.js` `GAP_W`).
- **The Inn's street door cannot widen in place.** The Inn's partition stands at x 505-525
  (ADR-0070 Decision 2), flush against today's gap (525-575). A centred 80 px gap is 510-590: the
  partition's south end stands 15 px inside it. Proven on a scratch copy with the three numbers
  changed: `TestHubLayout_Inn_IsSplitByOnePartition_WithACentredDoorGap` fails ("the partition
  stands in the Inn's street door"); every other hub test passes. Moving the partition 15 px west
  (x 490) then fails the hearth's 50 px clearance (46) and the Drover's and the Gravedigger's
  talk-through-a-wall rule (72, needs more than 80). Not decided here: escalated to the owner.

**Rejected / not asked.** A different width per world (owner: one shared width). Widening floor 1's
doorways (already at the limit). Moving or resizing buildings.

**Open.** The Inn's street door (above). One leaf or two at 80 px: the charter says "the door leaf".
