# FS-SRA9J: Fog of war and minimap on dungeon floors

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" → "Fog of war", "Minimap" → this FS · Related ADRs: [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (fog is client presentation, region-based, party-shared), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (floor map, interest), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) Decision 12 (per-floor opt-ins), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only) · Builds on: [FS-KE075](KE075-floor-1-dungeon.md) (regions on the floor map, the dungeon-floor look, chunk grid, interest), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (the indoor blackout, which a dungeon floor does without), [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) (fullscreen button, resizable view) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Fog of war**, **Minimap**, **Region**, **Light source**

## Summary

On floor 1, the dungeon is no longer laid bare. A room or corridor the party has never entered is
black. One the party has walked through stays drawn, dim, with no monsters shown. The regions
where a party member stands now are drawn in full, along with any monster within 400 px of a
party member. What one member uncovers, the whole party sees. A minimap at the top right shows
the explored floor, the party and, once found, the switch, escape door and stairs; M hides and
shows it.

This is presentation. The server still sends what it sends (FS-KE075's interest rule), and the
fog is no defence against a client that ignores it (ADR-0063).

Charter run, 2026-11-06, item B. Nick approved the locked decisions B1–B5 as charter defaults
("核准"), then limited the feature to floor 1 (owner constraint). Where this spec settles
something the charter left open, it says **derived here** and why. Recorded without adversarial
review: no `challenge-me` pass.

**Amended 2026-11-06 (review fix round 1).** The slice review found the fog leaving unexplored
floor clear at doorways and behind walls: a drawn wall's column claimed its whole diamond raised to
the wall's height, and a visible floor stood 100 px clear everywhere, so on the fixture 37 of 40
single-region-visible states left unexplored cells in sight. §C.13 now says what the fog leaves
clear, §C.18 what that costs at an open boundary, each marked **derived here**. The review's other
points are recorded, not changed: the B3 question below (Nick: "先按照目前做法我看看感覺再決定",
keep today's rule and decide after a look), the shared hide rule's small change on floors 2–3, and
explored dressing dimmed only by its floor's fog (Edge States). No requirement's intent changed.

## Facts this spec rests on

Verified 2026-11-06 on local main 48ece46c; client paths under `game-client/src/`.

- Regions arrive on the floor map (FS-KE075 §F.31): ids, kind (`room` / `corridor`), cell rects,
  and `cell_size`. Floors 2–3 carry none.
- Party members are always in the snapshot (FS-KE075 §G.36); monsters, drop piles and containers
  beyond 1600 px of the recipient are not.
- The indoor blackout (`render/world/blackout.ts`) is the existing "hide what is outside" layer:
  geometric under the canvas renderer, masked under WebGL, at depth 500 (`BLACKOUT.depth`), above
  the light-map (135) and world effects (≥ 140), below dust (902), vignette (905), markers (950,
  951) and the HUD (≥ 1000). **Markers draw above it**, so a hidden monster's plate and bar must be
  hidden explicitly. On a dungeon floor the blackout is off (FS-KE075 §H.47).
- Top-right HUD: the escaped count, then the floor indicator, right-aligned at `TOP_RIGHT_HUD`
  (`scenes/BarrowspireScene.ts:283-287`), stepped down by `FULLSCREEN_BUTTON_CLEARANCE` (inset 6 +
  height 20 + 8, `render/viewport/fullscreenButton.ts`); `relayoutHud` (`BarrowspireScene.ts:2996`)
  re-anchors it on resize. Notices draw at the top centre, y 100 (`showNotification`, `:4289`).
  The logical view is 1080–1280 × 720 (`render/viewport/viewport.ts:22-24`).
- M is not bound in the run scene (its keys: WASD, Tab, Esc, Enter, E, I, B, F, Q, H, the potion
  key; `BarrowspireScene.ts:1028-1045, 3063-3130`).
- A light source "has no effect on what anyone can see or hit" (`CONTEXT.md` "Light source").

## Requirements

### §A. Where fog applies

1. **Only on a floor whose floor map carries regions** (floor 1 today). Floors 2–3, the hub and the
   field worlds have no fog and no minimap; floors 2–3 keep the indoor blackout exactly as today.
   **(charter default, owner: floor 1 only)**

### §B. Exploration (party-shared)

2. **Three states per region**: unexplored, explored, visible. Every region starts unexplored.
   (B1)
3. **Visible** while at least one living, in-play party member's position lies in the region. The
   local player counts while alive. Dead and escaped members count for nothing. (B1)
4. **Explored** once a region has been visible; it stays explored for the rest of the floor. (B1)
5. **Party-shared**: every party member's position in the snapshot uncovers regions for this
   client, so all members see the same map. In a run every other delver is a party member. (B2)
6. **Resets**: a floor change (a new floor map) and a fresh run scene (reconnect, re-entry) start
   every region unexplored, then mark the regions the party stands in visible at once. Nothing is
   stored. (B2, v1)
7. **A position's region** is the region of the cell it lies in. A position on no walkable cell
   (a body pressed against a wall's edge) takes the region of the nearest walkable cell.
   **(derived here)**

### §C. What each state shows

8. **Unexplored**: drawn as `palette.inkDeep`, the void's ink. Its ground, its walls and
   everything in it (containers, the switch, escape door, stairs, drop piles, monsters, effects)
   are not seen. (B1)
9. **Explored**: its ground and walls drawn, dimmed by a fixed share of `palette.inkDeep` over
   them; containers and the switch, escape door and stairs drawn dim; no monster and no drop pile
   shown (§D). (B1)
10. **Visible**: drawn in full, as FS-KE075 draws it. (B1)
11. **A wall shows the brightest state of the regions it borders** (visible over explored over
    unexplored), so a visible room's walls are whole even where the far side is unexplored.
    **(derived here)**
12. **Light sources** in a region that is not visible are off; the player's own torch pool is
    unchanged. Lighting stays presentation-only. (B5)
13. **One fog layer** at the blackout's depth (over the world, light-map and world effects, under
    dust, vignette, markers and the HUD), drawn geometrically from region footprints projected to
    iso, the way the blackout's canvas fallback is, under both renderers. It is redrawn only when a
    region's state changes, never per frame. **(derived here: 18–28 rooms plus their corridor
    segments change state a few dozen times a floor; no mask is needed)** Since the layer is over
    the world, it leaves clear only what stands in front of the floor behind it, cut to its shape:
    a drawn wall's slab (the wall on its cell's centreline, edge to edge, raised to its height and
    a few px for its top) and its corner posts where a wall strip ends; and a visible region's
    floor only where a member's head could be, 100 px over and 12 px either side of anywhere their
    feet can be (the server's `PlayerRadius`, 20 px, off every cell no one can walk on). Every
    screen px still has one shade, so the explored dim never compounds. **(derived here, review
    round 1: a wall's whole diamond raised, or a floor raised 100 px everywhere, left the floor
    behind it in sight)**
14. **Objects in an unexplored region are hidden, not only covered** (`setVisible(false)`), since
    markers draw above the fog and nothing hidden may be hovered or clicked. **(derived here)**

### §D. Monsters and drop piles

15. **A monster is shown** when it stands in a visible region, or within 400 px of any living,
    in-play party member's position, whatever its region's state. Otherwise it and its markers
    (plate, bar, elite marker, eyes) are hidden. (B3)
16. **A drop pile follows the monster rule.** **(derived here: it appears where a monster died and
    is the kind of thing fog should not give away)**
17. **A hidden monster cannot be targeted**: no strike-mark cursor on hover, no click-to-attack, no
    target frame (FS-48CTQ). **(derived here)**
18. **Fog never hides a party member.** A living member is always in a visible region by §B.3,
    and the fog leaves their head clear wherever they can stand (§C.13). So at an open boundary
    (a doorway or a corridor's mouth) the floor of the region behind them on screen, up to a head's
    height over the boundary, stays in sight while it is unexplored. **(derived here, review round
    1: covering it would cover a member standing at the boundary)**

### §E. Minimap

19. **Shown on dungeon floors, on by default** each time a run scene starts; **M** toggles it for
    the rest of that run scene. M is ignored while the chat input has focus. (B4)
20. **Place**: the top-right HUD column, right-aligned at `TOP_RIGHT_HUD`'s x, its top 6 px under
    the floor indicator; it moves with `relayoutHud`. It never covers the fullscreen button
    (which the column already steps down from), the escaped count or the floor indicator. (B4)
21. **Size**: the floor drawn in the world's iso projection, scaled to fit 216 × 108 logical px
    (floor 1's 72 × 48 cells), on a `palette.hudPanel` backing with the HUD's rim. **(derived
    here: iso keeps the minimap's directions the screen's; at 216 px its left edge is at x ≥ 854
    at the 1080 minimum, clear of a top-centre notice up to 600 px wide and of FS-48CTQ's target
    frame)**
22. **Content**: explored and visible regions as filled cell footprints (visible brighter); nothing
    for unexplored regions; a dot per living party member, the local player distinct from the
    rest, in the ally channel; the switch, escape door and stairs as small marks in the amber
    interactable channel once their region is explored. No monsters, containers or drop piles.
    (B4)
23. **It updates** when a region changes state and when a party dot moves; it is rebuilt on a floor
    change. (B4)
24. **Spectating**: a resolved player watching a teammate keeps the minimap, with the same
    content. **(derived here)**
25. Colours from tokens only (ADR-0013); the panel follows `design-guideline.md` "UI Chrome". The
    explored wall tint mixes from `TINT_IDENTITY` (`utils/theme.ts`), Phaser's untinted multiply,
    and the token fence rejects a numeric `0xRRGGBB` anywhere in `src/render` outside tests.
    **(derived here, review round 1)**

## User Stories

1. As a delver, I want rooms I have not entered to be dark, so that exploring floor 1 means discovering it.
2. As a delver, I want rooms I have been through to stay drawn, so that I can find my way back.
3. As a delver, I want explored rooms to show no monsters, so that I have to look again before I trust a room.
4. As a delver, I want the room I stand in to be fully visible, so that I can fight what is in it.
5. As a delver, I want to see a monster just outside the room, near the doorway, so that I am not ambushed through an opening.
6. As a party, we want what one of us uncovers to be uncovered for all, so that splitting up to explore helps.
7. As a delver, I want to see where my party is on a minimap, so that I can regroup.
8. As a delver, I want the minimap to show the switch, the escape door and the stairs once found, so that I can head for them.
9. As a delver, I want the minimap drawn the way the floor is seen, so that up on the minimap is up on screen.
10. As a delver, I want to hide the minimap with M, so that I can clear the corner when I want.
11. As a delver, I want the minimap to keep clear of the fullscreen button and the floor indicator, so that the top-right corner stays readable.
12. As a delver, I want a hidden monster not to be clickable, so that the fog does not give it away.
13. As a delver on floors 2 and 3, I want the floor to look as it always did, so that the fog stays a floor-1 feature.
14. As a delver climbing to a new floor, I want the fog to start fresh, so that a new floor is new ground.
15. As a dead delver watching my party, I want the fog and minimap to follow what the living uncover, so that spectating still shows the floor.
16. As a delver whose connection dropped, I want the game to come back working, even if the explored map is lost, so that a reconnect never breaks the run.

## Acceptance Criteria

- [ ] On a fixture dungeon floor: every region starts unexplored; a member stepping in makes it visible; stepping out leaves it explored.
- [ ] Other members' positions uncover regions for this client (party-shared); dead and escaped members uncover nothing.
- [ ] Unexplored regions draw as `palette.inkDeep` with nothing in them shown; explored regions draw dim with no monster or drop pile; visible regions draw in full.
- [ ] A wall between a visible and an unexplored region draws in full.
- [x] With one region visible on the fixture floor, every other region's cell middle is fogged, behind a drawn wall's slab, or where a member's head could be (`fog.test.ts`, every region in turn; on the fixture refreshed from the levelgen golden in round 1, 0 left clear, against 190 before review round 1).
- [ ] A monster is shown in a visible region, or within 400 px of a living member in an explored or unexplored region, and hidden otherwise, markers included (unit tests over the rule; a scene test over the markers).
- [ ] A hidden monster gets no strike cursor, no click and no target frame.
- [ ] Lights in non-visible regions are off.
- [ ] The fog layer redraws only on a state change (counted in a test that walks a member across regions).
- [ ] A floor change and a fresh scene reset exploration.
- [ ] The minimap shows on floor 1 by default, toggles with M (not while typing in chat), sits under the floor indicator right-aligned, fits 216 × 108, and overlaps neither the fullscreen button, escaped count, floor indicator, a 600 px top-centre notice nor the target frame, at 1080 and 1280 logical widths.
- [ ] Minimap content: explored and visible regions, living member dots (self distinct), switch/door/stairs only once their region is explored; no monsters or containers.
- [ ] Floors 2–3 and the fields show no fog and no minimap; floors 2–3 screenshots still match FS-KE075's captures.
- [ ] Typecheck and the full vitest suite pass.
- [ ] Nick's browser check (I-SRA9J-4) passes.

## Edge States

- **Floor map not yet in:** no fog and no minimap until the floor is built (FS-KE075 §H.41).
- **Member standing in a doorway cell:** a doorway is a room cell, so the room is visible.
- **Member in a corridor next to a room:** the room keeps its state; a monster in it within 400 px shows.
- **Monster beyond 1600 px:** not sent (interest); fog has nothing to decide.
- **Last living member dies:** nothing is visible any more; explored regions stay dim until the run ends.
- **Local player dead, spectating:** they see what the living uncover (§B.3, §E.24).
- **Reconnect:** exploration starts over (v1); the regions the party stands in are visible at once.
- **Two members in different regions:** both regions visible.
- **Window resized:** the minimap re-anchors; the fog layer is in world space and needs no redraw.
- **Canvas renderer fallback:** the fog is geometric under both renderers.
- **Floor-1 demon (1%):** follows the monster rule like any monster.
- **A monster within 400 px in an unexplored region (owner-pending, review round 1, B3):** today
  it is shown (§D.15), so its plate and bar draw over the fog while its body is under it, and it
  can be hovered and struck. The options are A, show a monster only in an explored or visible
  region; B, draw it above the fog; C, keep today's rule. Nick: "先按照目前做法我看看感覺再決定"
  (keep C and decide after a look). C stands until he decides; I-SRA9J-4's browser check is that
  look.
- **Floors 2–3 under the shared hide rule:** the blackout's hide rule and the fog's are one rule
  (`hideWhere`), so on floors 2–3 too a monster hit while the blackout hides it does not flash when
  shown, and one that died hidden lies fallen when shown again, with no fall replayed on blackout
  re-entry. This is a small change from today's floors 2–3, accepted as consistent with FS-48CTQ
  §C.7 (a hidden monster is no candidate). **(derived here, review round 1)**
- **Explored dressing standing tall:** the fog dims explored dressing with its floor, so where its
  top rises over a drawn wall's slab or a member's head clearance it stays undimmed, and where it
  rises over an unexplored region's floor it is darkened. Accepted for v1: tinting the piece would
  dim its foot twice. **(derived here, review round 1)**
- **A post's cap at a strip's end:** the fog leaves 10 px either side of a post's centre clear;
  a wider cap would lose its edge to the fog. Accepted.

## Out of Scope

Fog or a minimap on floors 2–3, the hub or the field worlds; server-side fog or any cut of what
the server sends by what a player may see (ADR-0063, ADR-0060 Decision 7); anti-cheat; line of
sight inside a region; exploration that survives a reconnect; marking treasure rooms or monsters
on the minimap; a full-screen map; minimap zoom, rotation or click-to-ping; new art.
