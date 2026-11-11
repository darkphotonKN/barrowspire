# FS-MMA2H: Wider doors

> Status: work-order · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Wider doors → FS-MMA2H`: [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md) (town door gaps, the Inn's partition gap, the town's client mirror), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (door heads, the drawn gap door), [FS-2325V](2325V-pre-rendered-isometric-art.md) (the `door_{x,y}` sheet), [FS-F6F88](F6F88-multi-floor-delves.md) (the floor of buildings and its run houses) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (baked art), [ADR-0036](../adr/0036-buildings-have-an-exterior-and-an-interior.md), [ADR-0042](../adr/0042-a-building-entrance-shows-a-door-not-a-dark-opening.md) (a doorway shows a door under a head), [ADR-0070](../adr/0070-the-inn-becomes-a-two-hall-great-hall-and-the-forest-gate-moves-south.md) (the Inn's partition at x 505-525 with "a centred 50 px gap": see §C, Open decision D1) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Town buildings" (*door gap*, *partition*); no new term

> Promoted `--from-thread` on 2026-11-11 from the locked scoping notes: the owner's approved
> charter "門加寬". Requirements marked **(charter default)** are that charter's, each with its
> reason. Those marked **(spec)** fill an acceptance-level gap the charter left, and are this spec's
> own. Code citations are against the working tree at `28a7a377`.

## Summary

Players often miss a door and walk into the wall beside it (owner, playtest 2026-11-11): a body is
40 px wide and a door is 50 px, so there are 5 px to spare on each side. Every 50 px door becomes
80 px, two bodies wide: the doors of run houses, the door gap of every town building, and the gap
in the Inn's partition. Nothing else about a door changes: where it stands, how it opens, closes
and locks, and how near a delver must be to use it.

## Bounds

Issues under this FS may change:

- game-service door-width constants and building generation (`internal/game/session.go`:
  `CreateBuilding`'s call to `AddBuilding` only; `internal/game/hub_map.go`), and their tests;
- game-client door and wall drawing, its tests and its golden files;
- `game-client/tools/bake`, and the baked output in `game-client/public/art`.

They may **not**: change proto, api-gateway, OpenAPI or the generated client; touch a database or a
migration; touch another microservice; edit the existing text of a shipped FS. A slice that finds
one of these unavoidable stops and escalates.

## Facts this spec rests on

- One number in two places. `hubDoorWidth = 50` (`hub_map.go:156`) cuts each town building's south
  wall (`addHubBuilding`) and the Inn's partition (`partitionWalls`). `CreateBuilding`
  (`session.go:3716`) passes the literal `50` as `AddBuilding`'s `doorWidth`, with wall thickness 20.
- A run house is built only on a floor of buildings (`layBuildings`). Since FS-M8CSE §C every
  Spire floor is a dungeon, and a floor of buildings is what a floor falls back to when dungeon
  generation fails twice (FS-KE075 §B R17). The charter's "run houses on floors 2-3" is read as
  "run houses wherever a floor of buildings is built".
- A dungeon floor's doorway is one 80 px cell and has no door entity. Field worlds have no doors.
- The walls an 80 px gap is cut in: run houses 300, 400 and 500 wide; the store and the smithy 300;
  the Inn 640; the Inn's partition 440 long. The shortest wall left beside a gap is 110 px.
- `mapKeepOut` (`monster_population.go`) keeps monsters off each door by the door's own `Width`
  and `Height`, and off each building's whole footprint.
- The interact range (`DefaultInteractableRange`, 60) is measured to the middle of the doorway
  (`handleInteract`). The middle of an 80 px door is 40 px from either jamb.
- The client finds door gaps from the walls (`doorGaps`, `buildingLooks.ts`), never from a
  constant, and places the door, its head and the jamb posts from the gap's rect. Wall pieces are
  one 40 px tile long and a remainder is trimmed (`walls.ts`).
- The baked door is 50 px wide by construction: `DOOR_W = 0.84` tile for the leaf, its frame and
  lintel round it (`tools/bake/page/models/interactables.js`), and `GAP_W = 50 / 40` for both door
  heads (`tools/bake/page/models/building.js`). One tile is 40 world px.
- The town is mirrored on the client: `hubTown.golden.json` is written by
  `go test ./internal/game -run TestHubTown_MatchesTheGolden -update` and never hand-edited; the
  client's fixtures and `HUB_DOOR_SPURS` (`hubKeepOut.ts`) hold the 50 by hand.
- The bake runs here: `node tools/bake/bake.mjs --check` in this worktree finished in 2 min 6 s
  with "no changes" (2026-11-11), on the installed Google Chrome, with `node_modules` linked.

## Requirements

### A. One door width (game-service)

1. **80 px (charter default).** The door of a run house, the door gap of a town building and the
   gap in the Inn's partition are each 80 px wide. Reason: two bodies wide, the owner's upper limit
   ("不要超過兩個人的寬度"); a whole number of 40 px wall tiles; floor 1's doorway width.
2. **One shared width (charter default).** Run houses and the hub keep one width, as today. **(spec)**
   The number is written once: the hub's gap is defined from the run door's width, and
   `CreateBuilding` passes that name, not a literal.
3. **Centred, nothing moved (charter default).** A door stays centred in its wall. No building,
   partition or furnishing is moved or resized by this FS, save what Open decision D1 settles.
4. **Only the width (charter default).** Opening, closing, locking, the interact range and what it
   is measured to are unchanged. Wall thickness stays 20. The hub still has no door entity.
5. **Floor 1's doorways and field worlds are untouched (charter default).** A dungeon doorway is
   one 80 px cell already, at the limit. No dungeon parameter changes.
6. **Keep-outs follow (charter default).** Whatever is computed from a door's rect uses the new
   width with no number of its own: the monster keep-out, the client's run-dressing threshold
   (FS-8RBQY: the door rect grown 40 px, 60 px south) and the entrance marker. **(spec)** No source
   file outside the one definition in R2 holds the door's width as a number.

### B. Run houses (game-service, game-client)

7. A run house of each size (300, 400, 500 wide) has two south wall segments either side of a
   centred 80 px door: 110, 160 and 210 px long.
8. The client draws such a house with the door centred in its gap, a jamb post at each wall end, a
   door head over the gap, and no wall piece or post standing in the gap, in both looks (ADR-0036).

### C. The town (game-service)

9. Each town building's south wall is cut around a centred 80 px gap; the Inn's partition is cut
   around an 80 px gap centred on the Inn's depth.
10. **No wall stands in a door gap (spec).** No wall, partition or furnishing of a building overlaps
    any of its door gaps. Reason: a gap narrower in play than it is drawn is the defect this FS
    exists to remove.
11. Every rule of FS-B0H2D that is stated in terms of the gap holds at the new width, as written
    there: the ground in front of a door (R5: gap-wide, 80 px deep), the reachable room (R13), no
    talking through walls (R14), the furnishings' 50 px clearance (R12, with ADR-0070's exemption
    for the hearth), the 240 px lanes (R4).
12. The town golden is rewritten by its Go test (`-update`), never by hand.

**Open decision D1 (owner): the Inn's street door.** R1, R3 and R10 cannot all hold for the Inn as
it is laid out. The partition stands at x 505-525 (ADR-0070 Decision 2), flush against today's gap
(x 525-575). A centred 80 px gap is x 510-590, so the partition's south end would stand 15 px inside
it. Shown on a scratch copy with only the width changed:
`TestHubLayout_Inn_IsSplitByOnePartition_WithACentredDoorGap` fails with "the partition stands in
the Inn's street door"; every other hub layout test passes. The ways out, none chosen here:

| | Change | What it costs |
|---|---|---|
| a | Move the partition west to x 490-510, flush against the new gap as today | The great hall is 15 px narrower. On the scratch copy the hearth is then 46 px from the partition (needs 50) and the Drover and the Gravedigger 72 px (need more than 80), so the hearth and the two patrons move too, and the long table may. Supersedes ADR-0070 Decision 2's "x 505 to 525". |
| b | Keep the partition; put the Inn's street gap at x 525-605, 15 px east of centre | Breaks "centred" (R3) for this one door. Nothing indoors moves. |
| c | Keep the Inn's street door at 50 px | Breaks "every door" (R1) for the door players use most. |
| d | Stop the partition short of the south wall | The client tells a partition by its reaching both edges end on (ADR-0070 Decision 6): a drawing-rule change. |

Whichever is chosen, ADR-0070 Decision 2's "centred 50 px gap" no longer reads true and wants a new
ADR. The town slices (I-MMA2H-3, I-MMA2H-4) wait on D1; §A, §B and §E do not.

### D. The town on the client (game-client)

13. The client's mirror of the town follows the golden: every fixture that walls a town building
    cuts an 80 px gap, and the suites that build walls from the golden pass.
14. Each door spur (`HUB_DOOR_SPURS`, FS-B0H2D R24) is as wide as its gap and starts at its sill.
15. Indoor dressing stays off each door's threshold, a gap-wide strip 80 px deep inward (FS-B0H2D
    R15), at the new width; a spot now on a threshold moves the least it can. Outdoor dressing,
    fences and paths still clear K1-K8 (`hubKeepOut.test.ts`).
16. A town door is drawn as R8 says of a run house's, with the gap door shut from outside and open
    from inside (FS-9PN7X §B.5 as amended); the Inn's partition shows an open 80 px doorway in the
    interior look.

### E. Door art (game-client bake)

17. **Re-baked at 80 px (charter default).** The door sheets `door_x` and `door_y` (leaf, frame,
    lintel, sill; states `locked`, `unlocked`, `open`, `shut`) and the door heads `door_head_{x,y}`
    and `tower_door_head_{x,y}` are baked for an 80 px gap. Art is authored in code and baked
    (ADR-0020, ADR-0021); nothing is scaled at draw time.
18. **Same margins (spec).** The frame keeps today's clearance to the jambs: the leaf and the frame
    are each 30 px (0.75 tile) wider than today, and a head is exactly the gap's width. Heights,
    the lintel's top (which the head starts from), materials, light and anchors' meaning are
    unchanged. Planks and iron bands keep about today's scale: more planks, not wider ones.
19. **One leaf (charter default).** The charter says "the door leaf": one leaf, hinged as today.
    A pair of leaves is not built under this FS.
20. The bake's review mock (`tools/bake/lib/building.mjs`) shows a two-tile doorway, so the review
    sheet shows the door, its head and the jamb posts as the game draws them.
21. **Additive to nothing else (spec).** Only the door sheets and the four heads change in
    `public/art`; every other sheet's entry in the manifest is unchanged, and
    `npm run bake -- --check` passes after the bake is committed. An atlas may be repacked where a
    changed sheet lives in it.
22. The comments that state the width (`projection.ts`'s calibration note, `building.js`,
    `hub_map.go`) say 80.

## User Stories

1. As a delver, I want a door wide enough that I walk through it without lining up, so that I stop
   hitting the wall beside it.
2. As a delver in a party, I want two of us to fit through a door side by side, so that we do not
   queue at it.
3. As a delver, I want the Inn's two halls joined by a doorway as wide as its street door, so that
   the Inn reads as one building.
4. As a delver, I want a door to stand where it always stood, so that I do not relearn the town.
5. As a delver, I want a door to open, close and lock exactly as before, so that only its width is
   new.
6. As a delver standing beside either jamb, I want the door to answer me, so that a wide door is
   not out of reach from its own doorway.
7. As a delver, I want the drawn door to fill its doorway, so that I see no hole beside it and no
   door painted over a wall.
8. As a delver outside a building, I want the wall carried over the whole doorway, so that nothing
   of the room shows above the door.
9. As a delver on a floor of buildings, I want no monster standing in a doorway, so that a door is
   never blocked when the floor is built.
10. As a delver in a dungeon or a field, I want nothing to change, so that this is only about doors.
11. As a player in town, I want the trodden path at each door to match the doorway, so that the
    ground still says where to walk in.
12. As the owner, I want one number for the door's width, so that the next change is one edit.
13. As the owner, I want the town's layout rules still tested at the new width, so that a wider
    door cannot quietly break a lane, a clearance or a way in.
14. As an art reviewer, I want the review sheet to show the new doorway on a mock building, so that
    I can judge the door before it ships.

## Acceptance Criteria

Server:

- [ ] A run house of each size has a door 80 px wide and 20 px thick, centred in its south wall,
      with wall segments of 110, 160 and 210 px either side.
- [ ] Each town building's south wall has a centred 80 px gap (the Inn's as D1 settles); the Inn's
      partition has an 80 px gap centred on the Inn's depth; the hub has no door entity.
- [ ] Go test: no wall of a building overlaps one of its door gaps.
- [ ] The hub layout tests of FS-B0H2D pass at the new width: lanes, ground in front of each door,
      reachability from each door, no talking through a wall, furnishing clearances.
- [ ] The door width is defined once in game-service; `CreateBuilding` and the hub read it; no
      other non-test source holds `50` or `80` as a door width.
- [ ] On a floor of buildings no monster overlaps a door or a building.
- [ ] A delver 40 px to either side of a run door's middle, in front of it, opens it; the interact
      range constant is unchanged.
- [ ] A dungeon floor's layout for a given seed is identical before and after.
- [ ] `go test ./...` in game-service passes, the town golden included.

Client:

- [ ] A run house walled with an 80 px gap draws a door at the gap's centre, a post at each jamb, a
      head over the gap and no piece in the gap, in the exterior and the interior look.
- [ ] `doorGaps` finds one 80 px gap per town building and one in the Inn's partition, from the
      golden's walls.
- [ ] Each `HUB_DOOR_SPURS` rect is 80 px wide and starts at its gap's west jamb and sill.
- [ ] No indoor dressing spot lies on a door's threshold strip; `hubKeepOut.test.ts` passes.
- [ ] No client source or test holds `50` as a door width.
- [ ] `npm test` in game-client passes.

Art:

- [ ] `door_x`, `door_y`, `door_head_{x,y}` and `tower_door_head_{x,y}` are baked 80 px wide; a
      shut door standing in an 80 px gap leaves the same clearance to each jamb as today's does in
      a 50 px gap.
- [ ] `npm run bake -- --check` passes; no other sheet's manifest entry changed.
- [ ] The review sheet shows the mock building with a two-tile doorway, in both looks.

By eye (owner, browser):

- [ ] In town, walking straight at each of the three doors and at the Inn's inner doorway from a
      body's width off centre goes through without touching a wall.
- [ ] Each door fills its doorway shut and open, with its head over it, in town and in a run house.

## Edge States

- **A floor of buildings is rare.** It is built only when dungeon generation fails twice, so a run
  house's door is checked by test (a forced generation failure), not by play.
- **Server at 80, art still at 50.** The drawn door stands centred with 15 px of open doorway each
  side: wrong to look at, right to walk through. The reverse (art at 80, server at 50) paints the
  door 15 px over each wall. Neither ships: the server and art slices merge together.
- **The golden between slices.** Rewriting the golden turns the client's town suites red until the
  mirror follows (that is what the golden is for). The two town slices merge as a pair.
- **An open leaf is longer.** An 80 px leaf swung open reaches further from its hinge than today's.
  It is drawn only: no collision, as today.
- **Two delvers in one doorway.** They fit side by side with no room to spare (two 40 px bodies in
  80 px); player-player push is unchanged.
- **A wall remainder.** The south segments are no longer near a whole number of tiles (110 px is
  2.75 tiles); the wall drawing trims the last piece as it does today.
- **A missing sheet.** Without the door or head sheet the placeholders are drawn from the gap's
  rect, so they are 80 px wide with no change.
- **A running hub.** The hub's map is built at start; a hub already running keeps 50 px gaps until
  it restarts. No state is carried over.

## Out of Scope

- Floor 1's and every dungeon floor's doorways and corridors; field worlds.
- Moving or resizing any building; a different width per world or per building (save D1).
- Opening, closing, locking, auto-open, the interact range, door collision.
- The Spire's gate in the hub, escape doors, switches, stairs.
- A double-leaf door, an opening animation, new materials or tokens.
- Any proto, WS message, api-gateway, OpenAPI, database or other-service change.
- A new ADR: this FS names where one is wanted (D1, ADR-0070 Decision 2) and leaves it to the owner.
