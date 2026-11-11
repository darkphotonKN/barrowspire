# FS-XK2B6: Walls on the cell boundary

> Status: draft · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Walls on the cell boundary → FS-XK2B6`: [FS-KE075](KE075-floor-1-dungeon.md) (§H.44 ground, §H.46 wall runs and heights, §H.47 wall lights and dressing), [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (§C.13 the fog's wall slabs and posts)

## Scoping notes (raw)

Charter run "牆畫在格子交界", 2026-11-11. The locked decisions below are the owner's answers
("好 核准"); the lock preview was approved under the charter. Recorded without adversarial review:
no `challenge-me` pass. Client drawing only, cheap to reverse, so the pre-lock gate does not ask
for one.

**Why (owner, playtest 2026-11-11).** On a dungeon floor a wall cell is a whole 80 px cell of
collision (FS-KE075 R7), but the wall art is about 7 px thick and drawn on the cell's centreline.
A body is stopped about 36 px short of the wall it sees ("感覺還離牆面有一些距離就碰撞了"), a doorway
80 px to walk through looks about 160 px wide, and players miss it and hit what looks like floor.
The owner first asked for thinner collision, cancelled that as too large a server change, then
proposed this: "那如果把牆壁繪製在靠近邊緣的地方是不是就不會那麼遠". Collision does not change, only
where the client draws.

**Locked decisions (owner, 2026-11-11).**

1. Each wall is drawn on the edge its wall cell shares with the walkable cell it faces: a room's
   north wall on the room's north edge, south on south, west on west, east on east. Every wall
   moves towards the region it bounds; nothing moves away from one.
2. The drawn wall's face towards the region stands on that edge, so where a body is stopped and
   the wall it sees agree. The art is about 7 px thick: the thickness goes on the wall cell's side.
3. Corners meet at cell corners, as the outline of the walkable area turns. A doorway is exactly
   as wide as it is to walk through (80 px); a corridor looks as wide as it is.
4. A wall cell with walkable cells on two opposite sides (7 of 650 facing wall cells on the sample
   floor) gets a wall on each of those edges. The cell's middle is void in v1: no new art, no
   baked wall top. The owner will look at it.
5. Heights keep today's rule, edge by edge: an edge that bounds its region on the region's south
   or east side is front (cut away, low); otherwise back (full height). A full wall still fades
   over the player by the occluder rule.
6. The fog follows the walls (today a slab on the cell's centreline, `wallLayout` / `halfOf`,
   `render/world/fog.ts`).
7. Wall light sources, the dressing's keep-outs and anything else placed from a wall's position
   follow the wall.
8. Ground is no longer painted under a shell cell beyond the wall: outside the wall is void ink.
9. All dungeon floors (FS-M8CSE: every Spire floor). The village, a fallback floor of buildings
   and field worlds are unchanged, to the pixel.
10. No new art and no re-bake in v1. Collision, the floor map on the wire, monster pathing and
    everything else in `game-server/` are unchanged.
11. The corner fix on this branch's base (`betweenPosts` / `withinPosts`) is superseded where this
    makes it moot.

**Bounds.** game-client only: wall, fog, ground, light and dressing drawing on a dungeon floor, and
their tests. Not `game-server/`, proto, gateway, the bake models or atlases, or the existing text
of a shipped FS.

**Shape (five-bin sort).** No new capability and no line change: "Room-and-corridor floor look"
(FS-KE075) and "Fog of war" (FS-SRA9J) both survive untouched. It is a behavior change, and it
changes requirements of two owners: FS-KE075 §H.44, §H.46, §H.47 and FS-SRA9J §C.13, which says in
words "the wall on its cell's centreline" and "corner posts where a wall run ends". A change
spanning several capabilities gets its own change FS with a stub on each owner, so: this file, and
two stubs. A `## Change:` on FS-KE075 alone would leave the fog's requirement contradicting the
drawn walls. FS-8RBQY gets no stub: its dressing keep-out (24 px off a wall's rect) does not
change. FS-V8FT3 (wall shadows) lives on another branch and will be rebuilt on this.

**Rejected.** Thinner collision (owner cancelled: too large a server change). A re-bake with a
thick wall or a wall top filling the cell (v1 is no new art).

**Read from the code (2026-11-11, at `a427b0c3`).**

- Sample floor (`dungeon.fixture.json`, 72 × 48 cells): 745 wall cells, 650 with a walkable cell
  directly beside them, 766 wall edges (195 north, 195 south, 188 west, 188 east of their wall
  cell); 113 cells carry more than one edge; 7 have walkable cells on opposite sides (all north
  and south); 58 carry both an edge that is front and one that is back by decision 5. No walkable
  cell faces anything but a wall cell, none is on the edge ring, none touches another only by a
  corner.
- The baked wall is 0.18 tile thick (7.2 px, `architecture.js` `THICK`); a piece is one 40 px tile
  long with its origin at the centre of its footprint. Front is 1.1 tiles tall, back 3.6 (`BAKE`,
  about 43 and 141 screen px).
- Today every piece decides its height, its light and its fog tint by the cell its own position
  lies in (`wallRule`, `Fog.gate`). With two walls of different height in one cell that cannot
  stand: the height belongs to the edge.
- The fog's partition is per cell half in a screen strip, each half's top a line of one of the
  floor's two slopes. A cell edge is exactly one side of one half, and a cell corner lies on a
  strip's side as a cell centre does. So an edge slab and a corner post fit without a redesign.
- Dressing keeps 24 px off the server's wall rects (`KEEP_OUT.wall`), which are the cells. That is
  already measured from the edge the wall will now stand on.
- A wall light takes the region of the walkable cell nearest it (`regionAt`).

**Raised, not settled (for the owner).**

- Decision 5 edge by edge drops FS-KE075 §H.46's "front wins, so nothing in play is hidden": on
  the 58 cells above, a full-height wall now stands one cell in front of a region.
- A cut-away wall on a region's south or east edge covers the 47 px of floor behind it (today 10).
- Draw order of a body pressed against a cut-away wall: the piece sorts by its footprint's back
  corner, the body by its centre.
