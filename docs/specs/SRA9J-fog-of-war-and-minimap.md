# FS-SRA9J: Fog of war and minimap on dungeon floors

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Escape run" → "Fog of war", "Minimap" → this FS · Related ADRs: [ADR-0063](../adr/0063-fog-of-war-is-client-presentation-shared-by-the-party.md) (fog is client presentation, region-based, party-shared), [ADR-0068](../adr/0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md) (unexplored veiled, not black; edges feathered; changes faded), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (floor map, interest), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) Decision 12 (per-floor opt-ins), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only) · Builds on: [FS-KE075](KE075-floor-1-dungeon.md) (regions on the floor map, the dungeon-floor look, chunk grid, interest), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (the indoor blackout, which a dungeon floor does without), [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) (fullscreen button, resizable view) · Surface: game-client only · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) **Fog of war**, **Minimap**, **Region**, **Light source**

## Summary

On floor 1, the dungeon is no longer laid bare. A room or corridor the party has never entered lies
under a dense fog, its floor and walls only faintly seen. One the party has walked through stays
drawn, dim, with no monsters shown. Fog edges are soft and a change eases in. The regions where a party member stands now are drawn in full, along with any monster within 400 px of a
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

**Amended 2026-11-06 (owner, playtest 2026-11-06).** Nick playtested floor 1: "看不到的區塊會像斷橋一樣感覺
還是要可以看到 只是用迷霧擋住" (an unexplored region feels like a broken bridge; it should still be
seen, only covered by fog), and "看不到的區塊有一種撕裂感 然後才突然出現" (it looks torn, then
suddenly appears). So an unexplored region's ground and walls are now drawn under a dense veil
(§C.8), the fog's edges are feathered (§C.26), and a change of state is faded (§C.27). This amends
B1's "black" ([ADR-0068](../adr/0068-unexplored-regions-are-veiled-not-blacked-out-and-fog-edges-are-feathered-and-faded.md)
amends ADR-0063 Decision 2). §C.13 and §C.18 are restated for it. The minimap (§E), the monster
rule (§D, B3 still owner-pending with C current) and what is hidden in an unexplored region are
unchanged.

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

8. **Unexplored**: its ground and walls drawn under a dense veil of `palette.inkDeep`, darker than
   the explored one but not opaque (`FOG.unexplored`, 0.8 of the ink over its ground; its walls
   tinted by the same share), so the layout reads faintly. Everything else in it is not seen:
   containers, the switch, escape door, stairs, drop piles, run dressing, monsters (by §D),
   effects and its lights (§C.12). The void and off the floor stay opaque (`FOG.void`). (B1,
   **amended: owner, playtest 2026-11-06**)
9. **Explored**: its ground and walls drawn under a lighter veil (`FOG.explored`, 0.55 of the
   ink; its walls tinted by the same share); containers and the switch, escape door and stairs
   drawn dim; no monster and no drop pile shown (§D). Both veils are named constants in one place
   (`render/world/fog.ts` `FOG`), so they can be tuned. (B1)
10. **Visible**: drawn in full, as FS-KE075 draws it. (B1)
11. **A wall shows the brightest state of the regions it borders** (visible over explored over
    unexplored), so a visible room's walls are whole even where the far side is unexplored.
    **(derived here)**
12. **Light sources** in a region that is not visible are off; the player's own torch pool is
    unchanged. Lighting stays presentation-only. (B5)
13. **One fog layer** at the blackout's depth (over the world, light-map and world effects, under
    dust, vignette, markers and the HUD), worked out from region footprints projected to iso and
    painted, chunk by ground chunk, into canvas textures under both renderers (§C.26). It is worked
    out again only when a region's state changes, never per frame. **(derived here: 18–28 rooms
    plus their corridor segments change state a few dozen times a floor; no mask is needed)**
    Since the layer is over the world, it leaves clear only what stands in front of the floor
    behind it, cut to its shape: a drawn wall's slab (the wall on its cell's centreline, edge to
    edge, raised to its height and a few px for its top) and its corner posts where a wall run
    ends, every wall bordering a region being drawn; and a visible region's floor only where a
    member's head could be, 100 px over and 12 px either side of anywhere their feet can be (the
    server's `PlayerRadius`, 20 px, off every cell no one can walk on). Every screen px still has
    one veil, so no veil compounds. **(derived here, review round 1: a wall's whole diamond raised,
    or a floor raised 100 px everywhere, left the floor behind it in sight; kept in the 2026-11-06
    amendment: a translucent veil over a member's head or a wall in front of the fog would still
    darken it, and two veils over one px would compound)**
14. **Objects in an unexplored region are hidden, not only covered** (`setVisible(false)`), since
    markers draw above the fog and nothing hidden may be hovered or clicked; a translucent veil
    would not hide them. **(derived here)**
26. **Soft edges** (owner, playtest 2026-11-06): the fog's edges are feathered, never cut hard. The
    partition is laid on a lattice of 8 px texels and each chunk's field is
    `min(sharp, blur(erode(equiv)))`, a drawn wall standing as its tint's share. So the fog eases
    in over 32 px (`FEATHER.reach` texels) from every edge with something lighter, and only on
    the fog's side: it never lays fog on a px the sharp fog leaves clear (a member's head, a drawn
    wall in front of them), and never makes a px darker than the sharp veil. A wall tinted as dark
    as the fog behind it feathers nothing. **(derived here: Phaser 4.2.1's Blur filter is WebGL
    only, runs per object every frame, and spills over the clear edges; the CPU field costs
    nothing per frame)**
27. **Fades** (owner, playtest 2026-11-06): a region's change of state eases over `FOG.fade`
    (320 ms) on the scene's clock, its walls' tints with it; a second change mid-fade starts from
    what is on screen. Fog that comes eases in over the world; fog that lifts eases out at
    `FOG.floorDepth` (1), under every standing thing, so a member stepping into a veiled region is
    never veiled. Only layer alphas and tints change while it runs; nothing is worked out or
    painted again. The fade stops with its floor (`Fog.destroy`). **(derived here)**

### §D. Monsters and drop piles

15. **A monster is shown** when it stands in a visible region, or within 400 px of any living,
    in-play party member's position, whatever its region's state. Otherwise it and its markers
    (plate, bar, elite marker, eyes) are hidden. (B3)
16. **A drop pile follows the monster rule.** **(derived here: it appears where a monster died and
    is the kind of thing fog should not give away)**
17. **A hidden monster cannot be targeted**: no strike-mark cursor on hover, no click-to-attack, no
    target frame (FS-48CTQ). **(derived here)**
18. **Fog never hides a party member.** A living member is always in a visible region by §B.3,
    and the fog leaves their head clear wherever they can stand (§C.13), and neither the feather
    (§C.26) nor a fade (§C.27) lays any over it. So at an open boundary (a doorway or a corridor's
    mouth) the floor of the region behind them on screen, up to a head's height over the boundary,
    stays clear while it is unexplored, the veil easing in above it (§C.26). **(derived here,
    review round 1: covering it would cover a member standing at the boundary)**

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
- [ ] Unexplored regions draw their ground and walls under the dense veil (`FOG.unexplored` 0.8), nothing else in them shown; explored regions under the lighter one (`FOG.explored` 0.55) with no monster or drop pile; visible regions draw in full; the void opaque.
- [x] An unexplored region's walls are drawn and tinted as dense as its veil, never hidden; run dressing in it stays hidden (`fog.test.ts`; the scene test over the walls near the view).
- [x] The feather never lays fog on a px the sharp fog leaves clear, never darkens a px past it, and eases from a member's head clearance to the full veil rather than cutting (`fogField.test.ts`; `fog.test.ts` over the fixture with regions visible and a member at a corridor's mouth).
- [x] A change of state fades over `FOG.fade` (320 ms): lifting fog under what stands (`FOG.floorDepth`), coming fog over the world, wall tints with them; only alphas and tints change on the way; a second change starts from what is on screen; the fade stops with its floor (`fog.test.ts`).
- [x] Headless captures at render scales 1, 1.5 and 2 (room 1, a corridor's mouth, the corridor, and a fade frozen half way), the veil values checked at each (I-SRA9J review, 2026-11-06).
- [x] Per frame the fog costs nothing measurable against no fog (1.3–1.7 ms mean step against 1.2–2.0 ms, fixture floor, scale 1); a change of state is worked out and painted in 9–17 ms against the opaque fog's 4–8 ms, the changed chunks in view at once, those in the camera's margin three a frame.
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
- **Canvas renderer fallback:** the fog's textures and fades are the same under both renderers;
  its field is worked out on the CPU.
- **A change mid-fade:** the next fade starts from what is on screen, with no jump (§C.27).
- **Arriving on the floor:** the first draw is all unexplored, then the party's regions lift
  their veil over one fade.
- **A chunk changed out of the camera's view:** painted three a frame while the fade's counter
  runs, before the camera can reach it; one changed while far off is painted when it comes near,
  at once; a fade a chunk leaves the camera's reach during ends at once.
- **Objects at a fade-in:** a container, the switch, escape door, stairs, dressing and lights
  appear at once when their region is uncovered, while the floor under them is still easing.
  Accepted for v1 (ADR-0068).
- **A wall in front of the veil it borders:** a wall bordering a visible region stands plain, so
  the veil just above its top eases in from it (§C.26) and shows a little more of the floor behind
  than the sharp cut did. Accepted: it is what a soft edge is.
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
- **Explored dressing standing tall:** the veil dims explored dressing with its floor, so where its
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

## Change: Walls on the cell boundary → FS-XK2B6

## Change: Minimap look and the run HUD's layout → FS-56CKV

## Change: Minimap modes: enlarged and overlay → FS-1SEF0

## Change: Minimap in the town and the fields → FS-P0HSP


## Change: Lighter fog and lit regions
Status: work-order
Date: 2026-11-23

> Charter, approved by the owner on 2026-11-23 ("核准"). Every decision below is a **charter
> default** the owner approved, with its reason; where this section settles something the charter
> left open it says **derived here** and why. His complaint, in his words: 「在塔裡有迷霧時 感覺有點過多
> 有時週在周圍都還是有迷霧 進到一個區塊時可以亮一點」 (in the tower the fog feels like too much; sometimes
> there is still fog right around you; entering a region could be brighter). Decision:
> [ADR-0090](../adr/0090-a-region-is-visible-from-two-walkable-steps-and-fog-floors-take-the-runs-lifted-ambient.md),
> amending ADR-0063 Decision 2's "visible". Recorded without adversarial review: no `challenge-me`
> pass.
>
> **Why it felt heavy** (the coordinator's reading, checked here against local main e9dc5f17): the
> veils (`FOG.unexplored` 0.8, `FOG.explored` 0.55, `render/world/fog.ts`) lie over
> `TOWER_AMBIENT` (`render/lighting/lighting.ts`), the run's slate already sunk a third of the way
> to pitch. And a region is visible only while a member stands in it (§B.3), so the region one cell
> past a doorway, or the next corridor segment (FS-KE075 §5: segments of at most 16 cells), stays
> under the 0.8 veil.
>
> **Charter wording corrected (fact, not a decision change).** D3 names the fog floors' ambient as
> "`AMBIENT.run` (`TOWER_AMBIENT` before its 0.33 sink toward pitch)". Those are two colours, not
> one: `AMBIENT.run` is `mix(slate, necrotic, 0.4)` (`#4c5c61`, relative luminance 0.100), while
> `TOWER_AMBIENT`'s unsunk base is `mix(slate, necrotic, 0.3)` (`#485459`, 0.084); `TOWER_AMBIENT`
> itself is `#363c3f` (0.044). This section takes the value D3 names, `AMBIENT.run`, under one
> named constant (F7), so the other is a one-word swap if the owner prefers it at his look (D4).
>
> **What this changes elsewhere in this FS:** §B.3's "visible" (a member in the region) widens to
> F3; §C.8's and §C.9's veil values (0.8, 0.55) and the Acceptance Criteria row naming them give way
> to F1. **Over [FS-8RBQY](8RBQY-tower-interior-run-look.md)** (shipped, not rewritten): on fog
> floors only, §B.6's tower ambient gives way to F7 and F8, and §B.7's "the tower ambient is never lifted
> to buy readability" holds on floors without fog only. The design guideline's "The world may stay
> dark" gains the same exception (F9). **Unchanged:** the three states and what each shows (§C.8–
> §C.14), the soft edges and fades (§C.26, §C.27; `FOG.fade` 320 ms), the monster rule's text (§D,
> B3 still owner-pending with rule C current), the minimap's drawing rules (§E), floors 2–3, the
> hub and the fields.
>
> **Lane:** game-client only, agent-authored. No server, wire, golden or art change.

### Summary

On floor 1 the fog is lighter, and it no longer hugs the player. Unexplored rooms lie under a
thinner veil and walked ones under a thinner dim, so the floor's layout reads while the three
states stay apart. The room or corridor ahead lifts its veil as a member comes within two steps of
it, so standing at a doorway shows the room beyond. And on a floor with fog the light-map takes the
run's own ambient instead of the tower's darker one: the fog now carries the darkness, so the
region the party is in reads clearly brighter than the veiled ones around it.

### Requirements

Numbered F1–F11.

#### §F-A. The veils

1. **Lighter veils** *(charter default D1 — reason: two constants fix the density; the layout reads
   better and the three states stay distinct)*: `FOG.unexplored` is `veil(0.6)` and `FOG.explored`
   `veil(0.35)`, in `render/world/fog.ts` `FOG` as today, the walls' tints following their share as
   today (§C.8, §C.9). The order holds: void (1) > unexplored > explored > visible (0).
2. **The values are the owner's eyeball call** *(charter default D4)*: acceptance criteria test the
   order and that each is one named constant, and the owner's look (F11) settles the numbers. A
   retune he asks for is an edit to `FOG` (`Tunes FS-SRA9J`).

#### §F-B. Regions within reach are visible

3. **A region is visible while a living, in-play member's cell reaches one of its cells within two
   steps over 4-connected walkable cells**; the region a member stands in counts as before
   *(charter default D2 — reason: at a doorway the room or next corridor segment ahead is already
   clear, no fog hugging you; walkable-only, so never through a wall)*. A step goes to the cell
   directly north, south, west or east, and only onto a walkable cell (a cell in a region,
   `RegionGrid.walkable`). So a region two cells away straight through a wall cell is not reached,
   and a diagonal cell is two steps away only through a walkable cell beside both. Two steps is
   160 px on floor 1 (`cell_size` 80).
4. **A member's cell** is the one their position lies in, or, for a position on no walkable cell,
   the nearest walkable cell among the eight around it, as §B.7 already picks a region.
   **(derived here: one rule for "where a member is")**
5. **A region reached this way is visible in every sense** and becomes explored afterwards like any
   visible region (§B.4) *(D2)*: drawn in full (§C.10), its lights on (§C.12), its walls at their
   brightest bordering state (§C.11), the head clearance and soft edges as for any visible region
   (§C.13, §C.26), and shown as visible on the minimap (§E.22) by the minimap's unchanged rules. The
   monster rule's text is unchanged, so a monster standing in a region reached early is shown,
   whether or not it is within 400 px of a member (§D.15 "in a visible region"). A 1–3 cell
   corridor segment is still seen with its group (`TINY_SEGMENT`, `seenTogether`): reaching any
   region of a group makes the group visible. Dead and escaped members reach nothing (§B.3).
   **(derived here: a region drawn in full with its monsters hidden would break §C.10)**
6. **Worked out once per floor, never per frame** *(D2)*: the regions within reach of each walkable
   cell depend only on the floor's cells, so they are worked out once for the floor (when its
   exploration is made, or for a cell the first time a member stands on it), and each new set of
   party positions only looks them up. The fog is still redrawn only when a region's state changes
   (§C.13). **(derived here: floor 1's 72 × 48 cells reach at most 13 cells each)**

#### §F-C. The fog floors' ambient

7. **On a floor with fog, the light-map's ambient is `AMBIENT.run`** *(charter default D3 — reason:
   on fog floors darkness is now the fog's job, so a visible region reads clearly brighter)*, named
   once as `FOG_FLOOR_AMBIENT` in `render/lighting/lighting.ts` (equal to `AMBIENT.run`; see the
   wording note above). Floors without fog (floors 2–3) keep `TOWER_AMBIENT`, which is unchanged, as
   is the tower theme's own `ambient` in `WORLD_THEMES`. A fog floor is one whose floor map carries
   regions (§A.1).
8. **When it lifts and when it returns:** the light-map's ambient is lifted when the floor's fog is
   put up (`buildDungeonWalls`, through `LightMap.setAmbient`) and returned to the world theme's when
   the fog goes with its floor (`dropDungeon`). Before the fog stands the floor keeps the theme's
   ambient. The change is at once, not faded. **(derived here: tying it to the fog means a lifted
   floor is never shown without its veils, and a climb to floor 2 returns the tower's dark at once)**
9. **Readability is unchanged.** Markers stay above the light-map, and the marker contrast test
   (`render/markers/markers.test.ts`) also covers `FOG_FLOOR_AMBIENT` over the darkest tower ground
   mean at the canvas edge and must stay at least 3:1. If it fails, that is reported to the owner:
   neither the markers nor the test are changed to pass it. The design guideline's "The world may
   stay dark" (`game-client/docs/design-guideline.md`, "The readability floor") names the exception:
   on a fog floor the ambient is the run's, as a look, the fog carrying the dark (FS-8RBQY §B.7's
   "never lifted" holds on floors without fog). **(derived here: the guideline is the art SSOT and
   says "never lifted")**

#### §F-D. Bounds and the owner's look

10. **Bounds** *(charter)*: game-client only; fog floors only; no server or wire change; the monster
    rule (B3, rule C) untouched; the minimap's drawing rules untouched; no new art; `FOG.fade`
    (320 ms) and the feather (`FEATHER`) unchanged.
11. **A browser check for the owner** *(D4)*: he plays floor 1 and judges the veils and the ambient
    by eye; a retune is `Tunes FS-SRA9J`.

### User Stories

1. As a delver on floor 1, I want the fog lighter, so that the tower does not feel smothered.
2. As a delver, I want to still tell an unexplored room from a walked one, so that the fog keeps
   meaning something.
3. As a delver at a doorway, I want the room ahead already clear, so that I see what I am walking
   into.
4. As a delver in a corridor, I want the next stretch of corridor clear before I step into it, so
   that fog never sits right next to me.
5. As a delver, I want a room behind a wall to stay fogged, so that the fog never sees through
   stone.
6. As a delver, I want a room I glimpsed from its doorway to stay explored, so that the map
   remembers it.
7. As a delver, I want the room I am in to look clearly brighter than the veiled rooms around it,
   so that I can tell at a glance where I am.
8. As a delver, I want floors 2 and 3 to keep their dark look, so that the lifted light is floor 1's
   alone.
9. As a delver, I want monsters' plates and bars as readable as before, so that a lighter floor
   never hides a threat.
10. As a party, we want what any of us has within reach to be clear for all of us, so that the fog
    stays shared.
11. As a delver whose teammate died, I want their position to stop uncovering anything, so that
    only the living explore.
12. As a delver climbing to floor 2, I want the tower's dark back at once, so that each floor keeps
    its own look.
13. As the owner, I want the brightness in one place each, so that I can tune it by eye.

### Acceptance Criteria

Veils
- [ ] `FOG.unexplored` is `veil(0.6)` and `FOG.explored` `veil(0.35)`; void > unexplored > explored
      > 0 (test on `FOG`); the walls' tints follow their share (the existing wall-tint tests pass
      with the new values).

Reach (`exploration.test.ts`, over hand-made grids and the fixture floor)
- [ ] A member in a corridor two walkable steps from a room's cell makes the room visible; at three
      steps it is not.
- [ ] A region two cells away only through a wall cell is not reached; a diagonal cell counts at two
      steps only through a walkable cell beside both.
- [ ] The member's own region is visible as before; a member on no walkable cell reaches from the
      nearest walkable cell (§B.7).
- [ ] A region reached and then left behind stays explored.
- [ ] Dead and escaped members reach nothing.
- [ ] Reaching one region of a tiny segment's group makes the group visible.
- [ ] The reach is not walked again for a cell already worked out (a test counting walks while a
      member crosses regions), and the fog still redraws only on a state change (the existing
      counted test, its expectations updated for reach).
- [ ] A monster in a region reached early, more than 400 px from every member, is shown; one in an
      explored region past 400 px is hidden (`shows`, rule text unchanged).

Ambient
- [ ] `FOG_FLOOR_AMBIENT` equals `AMBIENT.run`; `TOWER_AMBIENT` and `WORLD_THEMES.tower.ambient`
      are unchanged (`lighting.test.ts`, `worldTheme.test.ts`).
- [ ] On a fog floor the light-map's ambient is `FOG_FLOOR_AMBIENT` from when the fog stands;
      before it stands, on floors 2–3 and after a climb from floor 1 to floor 2, it is
      `TOWER_AMBIENT` (scene test).
- [ ] The marker contrast test covers `FOG_FLOOR_AMBIENT` over the darkest tower ground and stays at
      least 3:1.
- [ ] The design guideline's "The world may stay dark" names the fog-floor exception.

Untouched
- [ ] `FOG.fade` (320), `FEATHER` and `SHOWN_WITHIN` (400) are unchanged; the minimap's code and
      drawing rules are unchanged, and its tests unchanged save a walker position and expectation
      the reach moves; floors 2–3 and the fields draw no fog and keep their ambient.

Check
- [ ] The owner's browser check (HITL) passes.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

### Edge States

- **At a doorway:** a doorway is a room cell (§Edge States above), so a member in it already has
  the room; the corridor segment outside is one step away and visible too.
- **Two corridor segments meeting:** the next segment is visible once a member is within two cells
  of its first cell, so the veil ahead in a corridor starts at least two cells off.
- **Parallel corridors or rooms back to back across a wall:** not reached unless walkable cells link
  them within two steps; the wall's far side stays at its own state.
- **A member pressed against a wall's edge:** reaches from the nearest walkable cell (F4).
- **Back and forth across the two-step line:** the region turns visible and explored each time and
  fades each time (§C.27), as it does today at a region's edge. Accepted.
- **Several members:** every region any of them reaches is visible (§B.5).
- **A monster in a region reached early:** shown, its region being visible (F5). B3's options are
  unchanged; this widens where rule C's "visible region" holds.
- **Lights in a region reached early:** on, as in any visible region (§C.12).
- **Arriving on floor 1:** the first draw is all unexplored, then the party's regions and those in
  reach lift their veil over one fade (§Edge States "Arriving on the floor"); the ambient is lifted
  when the fog is put up, the same moment.
- **Floor map not yet in:** no fog and the theme's ambient (§Edge States above, F8).
- **A climb to floor 2:** the fog goes with floor 1 and the ambient returns to `TOWER_AMBIENT` at
  once (F8).
- **Reconnect or a fresh scene:** the light-map is made with the theme's ambient, lifted when the
  floor's fog stands; exploration starts over (§B.6).
- **Spectating:** the living's positions reach as anyone's (§E.24).
- **Canvas renderer:** the same; the light-map's ambient is a fill colour under both renderers.
- **The lifted ambient fails the marker contrast floor:** reported to the owner (F9); nothing is
  changed to pass it.

### Out of Scope

- Changing the monster rule (B3) or `SHOWN_WITHIN`; drawing monsters above the fog.
- Changing the minimap's drawing rules, `FOG.fade`, the feather, or the head clearance.
- A reach other than two walkable steps; line of sight; a reach measured in px through walls.
- A light or flash on entering a region; any per-region brightness other than the fog's states.
- Lifting the ambient on floors 2–3, in the hub or the fields; changing `TOWER_AMBIENT` or
  `AMBIENT.run`.
- Any server, wire, golden or art change.
