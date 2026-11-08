# ADR-0070 — The Inn becomes a two-hall great hall, and the Forest gate moves south

Status: accepted
Date: 2026-11-08
Scope: `game-service` (hub map data) and `game-client` (hub house drawing)
Supersedes in part: [FS-B0H2D](../specs/B0H2D-enterable-town-buildings-and-the-inn.md) §Requirements
2, 3, 4, 12 (the clauses named below); [FS-0XMCP](../specs/0XMCP-hub-destination-gates.md)
§Requirements 2 (the Forest gate's row). Both FSs are shipped and stay unedited; this ADR is the
record of what changed.
Builds on: [ADR-0036](0036-buildings-have-an-exterior-and-an-interior.md) (exterior and interior
looks), [ADR-0042](0042-a-building-entrance-shows-a-door-not-a-dark-opening.md) (an entrance shows a
door)

## Context

The owner wants the hub's Inn to read as a proper inn: a great hall with a long table and a hearth,
and a taproom with the innkeeper. FS-B0H2D capped the Inn at 400×300, which holds a taproom and no
hall. The owner judged the change to be the same capability, not a new feature: "the inn's an inn,
the old FS thin line SPECIFICATIONS still checks out". So no new FS is written and the thin lines
stand. Shipped FSs are write-once, so the requirements this breaks are recorded here instead.

The binding constraint was the Forest gate. With it at (40, 400), no Inn of about 640×440 north of
the lanes clears FS-B0H2D R4's 240 px lane, for any map height: the Inn's south-west corner lands
about 190 px from the gate, inside the corridor. The only layout that kept the gate was a
south-facing Inn, which needs a map about 1300 tall. Moving the gate south is the smaller change.

Recorded without adversarial review: settled with the owner in conversation, cheap to reverse
(map data and client drawing rules, no wire change).

## Decision

1. **The Inn is 640×440 at (230, 50)** (supersedes FS-B0H2D R2's "about 360×260, at most 400×300"
   and the Inn row of R3's table). It stays the largest building.
2. **An interior north–south partition splits it into two halls**: the **great hall** (west) and the
   **taproom** (east, where the street door opens). The partition runs x 505 to 525 (20 thick), from
   the north edge to the south edge, cut around a centred 50 px gap. One building, one `house_id`,
   one roof; the halves are halls, not rooms.
3. **The smithy moves from (110, 50) to (1480, 50)** (supersedes the smithy row of R3's table). The
   store, `HubMapHeight` (1000) and the spawn are unchanged.
4. **The Forest gate moves from (40, 400) to (40, 580); its arrival from (180, 400) to (180, 580)**
   (supersedes the Forest row of FS-0XMCP R2's table and the Forest gate position in FS-B0H2D R4).
   R4's 240 px lane rule itself stands and is still tested.
5. **The great hall's hearth (`hall_hearth`) is exempt from R12's 50 px wall clearance against the
   north wall it is built into**, and only that wall. It keeps the clearance on every other side.
   The exemption is by kind in the furnishings test (`wallBacked` in `hub_map_test.go`); no other
   furnishing gets it.
6. **The partition is a new wall role, told apart by geometry on the client, with no wire change.**
   It reaches the house's edges end on, so it is neither on the outline (a building wall) nor clear
   of every edge (a furnishing): `onOutline` / `isPartition` in
   `game-client/src/render/world/houses.ts`. It is drawn only in the interior look (ADR-0036), as low
   interior masonry with an open doorway. FS-B0H2D R13 (reachability) and R14 (no talking through
   walls) apply to it as to any wall.

## Consequences

- The shipped FSs now read wrong on these numbers on purpose. A reader of FS-B0H2D or FS-0XMCP
  must check this ADR for the Inn's size, the smithy's place and the Forest gate's position.
- The Forest trail leaves town further south, past the Inn's front, instead of beside it.
  Anything the client draws at the gate (trail mouth, signpost) must follow the new position.
- The wall-role test on the client now has three outcomes (outline, partition, furnishing) where it
  had two. A future wall that reaches a footprint's edges end on will be drawn as a partition; only
  the Inn has one today.
- The `hall_hearth` exemption is keyed on a kind string. A second wall-backed furnishing needs the
  test widened, deliberately.
- Supersedes no ADR. ADR-0036 and ADR-0042 stand unchanged: the partition is interior-only and adds
  no entrance.
