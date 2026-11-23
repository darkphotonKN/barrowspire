# ADR-0090 — A region is visible from two walkable steps away, and fog floors take the run's lifted ambient

Status: accepted
Date: 2026-11-23
Scope: `game-client` on dungeon floors (floor 1 today). The server is not involved.
Specified by [FS-SRA9J](../specs/SRA9J-fog-of-war-and-minimap.md) §Change: Lighter fog and lit regions.
Amends: [ADR-0063](0063-fog-of-war-is-client-presentation-shared-by-the-party.md) — Decision 2's
"visible (a living member is in it)". Its three states, the monster rule's text, party sharing,
the presentation-only stance and the per-floor opt-in stand, as do
[ADR-0068](0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md)'s
veil, feather and fade.
Related: [FS-8RBQY](../specs/8RBQY-tower-interior-run-look.md) §B.6–§B.7 (the tower ambient,
darker than the run's and "never lifted for readability"), `game-client/docs/design-guideline.md`
"The readability floor".

## Context

Decided in a charter the owner approved on 2026-11-23 ("核准"), decisions D1–D4 as charter
defaults. His complaint: "在塔裡有迷霧時 感覺有點過多 有時週在周圍都還是有迷霧 進到一個區塊時可以亮一點"
(in the tower the fog feels like too much; sometimes there is still fog right around you; entering
a region could be brighter). Recorded without adversarial review: no `challenge-me` pass.

Forces:

- **Fog is region-based** (FS-KE075 §5: rooms and corridor segments of at most 16 cells). Under
  ADR-0063 Decision 2 a region is visible only while a member stands in it, so the region one cell
  past a doorway, or the next corridor segment, stays under the dense veil while a member stands
  at its edge. The fog seems to hug the player.
- **The floor is dark twice.** The tower ambient (`TOWER_AMBIENT`) sinks the run's slate a third of
  the way toward pitch so the tower reads darker than outdoors (FS-8RBQY §B.6), and on a fog floor
  the veils then darken every region not visible. A visible region, lit only by the tower ambient
  and its pools, reads little brighter than the veiled ones around it.
- **The fog must never cross a wall.** A member must not see a room through solid rock, and the
  fog is drawn from regions, not line of sight (line of sight is out of scope, FS-SRA9J).
- **Nothing per frame.** The fog is worked out only when a region's state changes (FS-SRA9J §C.13).
- B3, the monster rule, stays as it is (rule C, owner-pending).

## Decision

1. **A region is visible while a living, in-play member's cell reaches one of its cells within two
   steps over 4-connected walkable cells**; the region the member stands in counts as before. A
   step is to the cell directly north, south, west or east, and only onto a walkable cell, so the
   reach never passes through a wall cell or cuts a corner. A member's cell is the one their
   position lies in, or, off every walkable cell, the nearest walkable one (FS-SRA9J §B.7). A region
   reached this way is visible in every sense the fog knows (drawn in full, its lights on, its
   monsters shown by the unchanged monster rule, brighter on the minimap) and stays explored after.
   The regions within reach of each walkable cell are fixed for a floor, so they are worked out once
   per floor, and the fog is still redrawn only when a region's state changes.
2. **On a floor with fog, the light-map's ambient is the run's own (`AMBIENT.run`)**, lifted from the
   tower's: there darkness is the fog's job. Floors without fog (floors 2–3) keep `TOWER_AMBIENT`,
   which is unchanged. The ambient is lifted when the floor's fog stands and returns to the theme's
   with its floor. This is a look, not a lift for readability: markers still carry readability
   above the light-map and keep at least 3:1 under it (design guideline "The readability floor").

## Consequences

- At a doorway, the room ahead (or the next corridor segment) is already clear; the dense veil
  starts at least two cells from any member along the floor.
- More of the floor is visible at once, so more regions' lights and monsters show at once. A monster
  in a region reached early is shown even past 400 px of every member, because its region is
  visible; the monster rule's text is unchanged.
- FS-8RBQY's "never lifted" now holds on floors without fog only. Its tower ambient is still darker
  than the run's, and floors 2–3 look exactly as before.
- The marker contrast test gains the lifted ambient over the darkest tower ground. If that ever
  falls under 3:1, the ambient yields, not the floor.
- A region within two steps through a 1–3 cell corridor segment lights with that segment's group,
  as tiny segments already do.
- The brightness values (the veils and the fog floor's ambient) remain one-place constants; the
  owner tunes them by eye.
