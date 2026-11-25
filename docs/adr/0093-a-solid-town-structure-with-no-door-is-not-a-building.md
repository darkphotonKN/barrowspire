# ADR-0093 — A solid town structure with no door is not a building

Status: accepted
Date: 2026-11-26
Scope: `game-server/game-service` (the hub map), `game-client` (the hub scene's drawing)
Realized by: [FS-R4MYX](../specs/R4MYX-the-chapel-and-the-graveyard.md) § Change: The chapel moves
to the far left and gains a bell tower, T6–T11
Builds on: [ADR-0036](0036-buildings-have-an-exterior-and-an-interior.md) (buildings have an
exterior and an interior), [ADR-0042](0042-a-building-entrance-shows-a-door-not-a-dark-opening.md)
(an entrance shows a door), [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md)
/ [ADR-0021](0021-characters-are-authored-in-code-not-sourced.md) (baked art built in code)

## Context

Until the bell tower, every solid structure in town was a building. On the server a town building
is an entry in `hubBuildings`: walls round it, a door gap in one face, ground in front of the door,
and a room reached from it. On the client a group of walls that share an id is a house. It gets
the rules of ADR-0036 and ADR-0042: a closed block from outside, a roof that lifts when the player
is inside, the indoor blackout, and a door drawn in its door face.

The chapel's bell tower (FS-R4MYX, owner request 2026-11-25) is solid: players walk round it and
nobody goes in. It has no door, no room and nobody inside. Drawn as a building, it would:

- fail the building rules on the server (no door gap, no ground in front of one);
- be cut away or blacked out like a room when the player stands inside the chapel next to it;
- sort as a whole house against the chapel's roof, so the roof would cut through the belfry.

## Decision

A solid town structure with no door is not a building. It is a wall of its own and a baked prop.

- **Server.** It is a `hubSolid`, not an entry in `hubBuildings`: one solid wall on its rect, added
  by `addHubSolid`, so none of the building rules apply. The town golden records its rect.
- **Client.** The scene tells its wall by that rect (`isBellTower`, tied to the golden by a test)
  and takes it out before it builds houses (`splitBellTower`). It gets none of the house rules: no
  roof lift, no cut-away, no door.
- **Drawing.** It is one baked prop, framed round its footprint, sorted by its own key
  (`HUB_BELL_TOWER_SORT`) chosen against its neighbours and held by a test. The tower is hidden
  while the player is inside the chapel, along with the rest of the outdoors.
- **It is told by its rect, not by standing alone.** A wall group with an id of its own on any
  other rect is still a house.

## Consequences

- **The pattern for later structures:** a well, a statue or a town-wall tower that is solid but
  cannot be entered follows this ADR (a `hubSolid` on the server, its own prop and sort key on the
  client) and does not become a building with no door.
- **Each such structure is named on the client.** Telling it by its rect means each new one needs
  its own constant tied to the golden and its own split before houses are built. With a second
  such structure, a list of solid props from the golden would be simpler than one check each.
- **Its sort key is set by hand** against what stands next to it, so moving the tower or the chapel
  means checking the order test again.
- **Buildings keep every rule of ADR-0036 and ADR-0042 unchanged;** this ADR only says what does
  not count as one.
