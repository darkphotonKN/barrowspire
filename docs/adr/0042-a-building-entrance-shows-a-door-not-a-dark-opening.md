# ADR-0042 — A building entrance shows a door, not a dark opening

Status: accepted
Date: 2026-11-03
Scope: `game-client` (canvas presentation)
Amends: [ADR-0036](0036-buildings-have-an-exterior-and-an-interior.md) — the clause "an entrance
shows a dark opening, not the room". The rest of ADR-0036 stands unchanged.
Realized by: [FS-9PN7X](../specs/9PN7X-building-exteriors-and-indoor-blackout.md) §B.5, §B.7,
§F.4 (owner amendment 2026-11-03), shipped in PR #19

## Context

ADR-0036 made every building a closed block from outside. To keep the inside unseen at the one
place a wall is open, it said an entrance shows a dark opening: a full-height frame with flat
`inkDeep` darkness inside, in place of a town door gap or an open Spire door.

The owner played it on main and rejected the look: "black just ain't good". A black slot in a
lit timber or stone wall reads as a hole in the art, not as a way in.

A door does the same job without the black. The concern a door raises is that a door shorter
than the wall leaves a strip between its lintel and the wall top, and through that strip the
floor and back wall showed from the street. That gap was seen in the first door pass and closed
before merge.

Recorded without adversarial review: an owner reaction to a shipped look, cheap to reverse
(baked sheets and draw rules).

## Decision

**From outside, every building entrance shows a door, and the wall above it is closed.**

- **A town door gap** (the hub's buildings have gaps, no server door) shows a plank door. It is
  shut while the player is outside that building and open once they stand in the gap or inside.
  It is purely visual: no collision, no interaction, no server state.
  - The shut frame carries **no lock**. Amber marks what the player can act on, and this door
    can't be acted on.
- **A Spire room door** (a server `DoorState`) shows its real state from outside: closed, locked
  or open.
- **A door head** closes every door gap from the lintel to the wall top in the building type's
  outward surface. It is part of the exterior look, so it is gone in the interior look.
- **The dark opening is retired**: its baked sheets, its draw path and its term.

## Consequences

- Each building type gains a baked door head piece; the door model gains a lockless `shut`
  frame.
- An open Spire door seen from a hall shows a sliver of the room through the doorway. Anything
  that stands in the room is still hidden by ADR-0036's closed exterior and FS-9PN7X's hide rule,
  so you see the way in and a wall, never who or what is there.
- A hub door opens only for the player who walks in. Another player entering doesn't open it on
  your screen, because the door has no shared state. Giving it state would be a server change
  and a new decision.
- A new building type is still not finished until it has both looks; its exterior now also
  needs a door head.
