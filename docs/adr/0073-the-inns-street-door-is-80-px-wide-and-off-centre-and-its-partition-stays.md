# ADR-0073 — The Inn's street door is 80 px wide and off centre, and its partition stays

Status: accepted
Date: 2026-11-11
Scope: `game-service` (hub map data) and `game-client` (the town's mirror of it)
Specified by [FS-MMA2H](../specs/MMA2H-wider-doors.md) §C, Decision D1 (owner, 2026-11-11).
Amends: [ADR-0070](0070-the-inn-becomes-a-two-hall-great-hall-and-the-forest-gate-moves-south.md) —
Decision 2's "cut around a centred 50 px gap". The partition's place (x 505 to 525, 20 thick, north
edge to south edge), the two halls, the one `house_id` and every other decision there stand.
Supersedes in part: [FS-B0H2D](../specs/B0H2D-enterable-town-buildings-and-the-inn.md)
§Requirements 9, for the Inn's street door only ("centred"). That FS is shipped and stays unedited.

## Context

FS-MMA2H widens every 50 px door to 80 px, two bodies wide, because players miss a 50 px door and
walk into the wall beside it. It asks three things of a town door: that it is 80 px (R1), that it
stays centred with nothing moved (R3), and that no wall stands in its gap (R10).

The Inn cannot have all three. ADR-0070 Decision 2 put the partition at x 505 to 525, flush against
the west jamb of the 50 px street gap (x 525 to 575). A centred 80 px gap in the Inn's 640 px south
wall is x 510 to 590, so the partition's south end would stand 15 px inside the doorway: a door
narrower in play than it is drawn, the defect FS-MMA2H exists to remove.

The ways out were laid before the owner as FS-MMA2H §C's table:

- **(a) Move the partition west to x 490 to 510.** The great hall loses 15 px. The hearth is then
  46 px from the partition (it needs 50) and the Drover and the Gravedigger 72 px (they need more
  than 80), so the hearth and two patrons move too, and the long table may. A wider door would
  relay the room.
- **(b) Keep the partition; put the street gap at x 525 to 605**, 15 px east of centre. One door is
  off centre. Nothing indoors moves.
- **(c) Keep the Inn's street door at 50 px.** The door players use most would be the one door left
  narrow.
- **(d) Stop the partition short of the south wall.** The client tells a partition by its reaching
  both edges end on (ADR-0070 Decision 6), so this changes a drawing rule to move a door.

Recorded without adversarial review: the owner's answer to an open decision ("旅店街門 照建議"),
cheap to reverse (map data and its client mirror, no wire change).

## Decision

1. **The Inn's partition does not move.** It stays at x 505 to 525, as ADR-0070 Decision 2 placed
   it. Nothing indoors moves: no furnishing, no resident.
2. **The Inn's street gap is 80 px wide at x 525 to 605**, 15 px east of the south wall's centre,
   its west jamb flush against the partition's east face as it was at 50 px. It still opens wholly
   into the taproom.
3. **The partition's own gap is 80 px, centred on the Inn's depth** (y 230 to 310). This replaces
   ADR-0070 Decision 2's "centred 50 px gap"; only the width changes.
4. **Every other town building's gap is centred and 80 px.** The Inn's street door is the one
   exception to FS-MMA2H R3, and it is an exception by data: the Inn's own entry in the hub map says
   where its gap stands.

## Consequences

- ADR-0070 Decision 2 reads wrong on the gap's width on purpose; this ADR is where the Inn's two
  gaps are stated. FS-B0H2D R9's "centred" no longer holds for the Inn.
- The Inn's street door is not on the building's centre line. Anything that assumed a town door at
  the middle of its south wall must read the gap instead: the server's layout tests, and on the
  client the Inn's test fixtures and its door spur (`HUB_DOOR_SPURS`), which are kept by hand. The
  town golden records partitions and furnishings but not the south wall, so the golden alone does
  not carry the Inn's street gap to the client.
- A later change to the door width or to the Inn's width must restate where the Inn's gap stands;
  it does not follow from "centred".
- (a), (c) and (d) are closed for this width. Moving the partition is still open to a later
  decision that relays the great hall on purpose.
