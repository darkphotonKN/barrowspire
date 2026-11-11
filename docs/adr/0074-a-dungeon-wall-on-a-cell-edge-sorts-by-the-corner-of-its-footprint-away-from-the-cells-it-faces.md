# ADR-0074 — A dungeon wall on a cell edge sorts by the corner of its footprint away from the cells it faces

Status: accepted
Date: 2026-11-11
Scope: `game-client` in-game canvas, a dungeon floor's wall pieces only. Not buildings, the village, field worlds, the perimeter wall, or `game-server`.
Builds on: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) Decision 7 (world objects sort by `x + y` of their ground footprint), which stands unchanged. It names no point of the footprint; this ADR names one for one kind of object, where the code's habit (the back corner) stops working.
Specified by [FS-XK2B6](../specs/XK2B6-walls-on-the-cell-boundary.md) §C R12, ruling E3 (owner, 2026-11-11).

## Context

ADR-0020 Decision 7 sorts every world object by `x + y` of its ground footprint. A footprint is an
area and the sort wants one point, so each kind of object picks one. A body sorts by its centre. A
wall piece has always sorted by the **back corner** of its footprint, the corner farthest from the
camera (`WallPiece.depthAt`): the smallest key the piece could have, so anything standing on or
past the wall's line draws over it.

That habit was safe while a wall stood in the middle of something a body could not enter. A
building's wall is a 20 px rect and a body is a circle of radius 20, so a body's centre never
comes within 20 px of the wall's own line. On a dungeon floor the wall stood on its cell's
centreline, 40 px from the cell's edge and 60 px from the nearest body.

FS-XK2B6 moves a dungeon floor's wall to the **wall edge**: its face stands on the side its wall
cell shares with the walkable cell it faces, and its 9.6 px of masonry lie behind that face. A
body can now stand with its centre 20 px from the wall, which is within the 40 px length of one
piece. Then the back corner gives the wrong order on half of every piece that bounds a region on
its south or east side. Take a piece on a region's south edge at `y = Y`, centred at `x = px`:

- its back corner is `(px − 20, Y)`, key `px + Y − 20`;
- a body pressed against it stands at `(bx, Y − 20)`, key `bx + Y − 20`;
- so the body draws over the wall as soon as `bx > px`, though the wall stands between the body
  and the camera.

Before the move the comparison was the same, but wall and body were 60 px apart and never
overlapped on screen. The owner was shown this as FS-XK2B6 "Open to the owner" E3 and ruled, on
the coordinator's recommendation ("照你建議"): an edge piece sorts by its footprint's corner
nearest the camera, so a body pressed against a front wall is drawn behind that wall.

Written down as a rule for every edge piece, that ruling would break the other half of the floor.
A piece on a region's north edge at `y = Y` has its front corner at `(px + 20, Y)`, key
`px + Y + 20`; a body pressed against it from the south stands at `(bx, Y + 20)`, key
`bx + Y + 20`, and would be drawn behind a wall it stands in front of whenever `bx < px`. Those
pieces need the back corner they have today. The ruling's own reason names the wall it is about (a
front wall, one a body stands behind), so it is recorded as the rule that covers both.

Recorded without adversarial review: the owner's answer to an open decision, cheap to reverse (one
sort point on the client, no wire change, no art).

## Decision

1. **A dungeon wall piece on a wall edge sorts by the corner of its footprint farthest from the
   walkable cell its edge faces.** Whatever stands in that cell, however close to the wall, is
   then on the right side of the piece along the whole of its length and at least 29.6 px past either end (a body's
   radius and the masonry's thickness).
2. **For a wall whose wall cell lies south or east of its edge** (it bounds the region it faces on
   that region's south or east side) **that is the footprint's front corner**, the one nearest the
   camera: the largest `x + y` of the footprint. A body pressed against it is drawn behind it.
   This is the owner's ruling E3.
3. **For a wall whose wall cell lies north or west of its edge, it is the back corner**, as every
   wall piece sorts today. A body pressed against it is drawn over it. This holds whatever height
   the wall is drawn at: a wall on a region's north or west edge that FS-XK2B6 R8 draws low still
   has the body on its camera side.
4. **Which corner is decided by the side of the edge the wall cell lies on, never by the wall's
   height.** Height is a drawing choice that a later ruling may change; the side a body can stand
   on is geometry.
5. **Nothing else changes its sort point.** A corner post sorts by its own place, one layer over a
   piece. A building's wall, a partition, the perimeter wall, a door and a roof sort as they do.
   Bodies, drops and dressing sort by their own points as before.

## Consequences

- A body, a drop pile or a monster standing against a region's south or east wall is drawn behind
  that wall, and what the low wall covers stays covered: about 19 px of a body's feet and the floor
  up to about 44 px in from the edge (FS-XK2B6 ruling E2, accepted for v1; the owner looks in the
  browser check).
- "A wall piece sorts by its back corner" is no longer true of every wall piece. `WallPiece.depthAt`
  is still the one field a piece sorts by; what it holds for an edge piece depends on the edge's
  side. Code that reads a piece's footprint from `depthAt` is wrong for a dungeon floor; the
  footprint is `at`, `axis`, `keep` and the material's thickness.
- One point per piece is still an approximation of a 40 px footprint. It is right for anything on
  the faced side, which is the only side a body can reach: the wall cell behind the wall is 80 px
  of collision. If a later change lets something stand within a body's radius on both sides of one
  wall (a wall thinner than a cell, a wall with no cell behind it), one point cannot serve both and
  this ADR must be revisited.
- A piece and a post at the same corner still order by layer, as today.
- The rule lives with the edge cut (`planEdgeWalls`, `game-client/src/render/world/walls.ts`), so
  the baked pieces and the placeholder blocks drawn without art sort the same way.
- ADR-0020 is not amended: Decision 7's text still describes every object. This ADR is where the
  sort point of a dungeon wall piece is stated.
