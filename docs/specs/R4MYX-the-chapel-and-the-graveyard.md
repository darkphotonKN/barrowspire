# FS-R4MYX: The chapel and the graveyard

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Hub world" → "The chapel and its graveyard"; `game-client/SPECIFICATION.md` "### Hub" → "The chapel and its graveyard" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection: the chapel adds no world), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) / [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art baked from code), [ADR-0036](../adr/0036-buildings-have-an-exterior-and-an-interior.md) / [ADR-0042](../adr/0042-a-building-entrance-shows-a-door-not-a-dark-opening.md) (a building's two looks; a doorway shows a door under a head), [ADR-0070](../adr/0070-the-inn-becomes-a-two-hall-great-hall-and-the-forest-gate-moves-south.md) Decision 5 (the hall hearth is the only wall-backed furnishing: honoured, the pews stand free), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) / [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas tokens only) · Builds on: [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md) (enterable town buildings, furnishings, fixed residents, the town mirror and golden, talk lines; its R-numbers are cited below as B0H2D Rn), [FS-MMA2H](MMA2H-wider-doors.md) (the 80 px door gap), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) §A (hub dressing and the keep-out rule K1–K8), [FS-P0HSP](P0HSP-town-and-field-minimap.md) (the town minimap), [FS-9PN7X](9PN7X-building-exteriors-and-indoor-blackout.md) (building exteriors, door heads, the indoor blackout), [FS-2325V](2325V-pre-rendered-isometric-art.md) §G (baked hub folk), [FS-MRZH7](MRZH7-function-npc-markers.md) (function NPC clearance), [FS-BDRTJ](BDRTJ-dev-test-room.md) R4 (the dev test room's hub gate at (120, 900)) · Supersedes in part (each carries a stub `## Change: The chapel and the graveyard → FS-R4MYX`; their text is not edited): FS-B0H2D R1 ("exactly three" buildings), R9 (the door gap "in the south wall"), R15 (indoor dressing "off every furnishing": a flat piece may lie under one), R16–R17 ("five fixed residents", all indoors) and R24 (door spurs "from its west jamb and its sill") with the matching criteria; FS-MMA2H R9 and its criterion (every town building's south wall cut around the gap); [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R3 and its criterion (the hub is 2000×1000); [FS-0XMCP](0XMCP-hub-destination-gates.md) R11 ("No map widening"); FS-KYPQ9 §A.3 K7 ("inside the 2000×1000 hub"); FS-P0HSP's facts and §B.5 (the town is 2000 × 1000, drawn at 0.0833); FS-2325V §G.2 (every villager's appearance is a build with palette variants) · Out of scope, later: the talent reset the Confessor will offer (a function NPC with a marker then; nothing here) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "NPCs" (*Confessor*, *worshipper*, *mourner*, *fixed resident* widened), "Town buildings" (*door face*, *the chapel*, *pew*, *altar*); [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*chapel*, *graveyard*, *belfry*, *dais*, *door face*), all added for this FS

> **Decision provenance.** The thread is Nick's request of 2026-11-24 (quoted in Summary) and the
> charter's locked decisions D1–D14, which the owner approved wholesale. Each is marked
> **[charter default Dn]** with its reason. Where neither the charter nor the code settled a point,
> the smaller v1 was taken and marked **[v1 pick]** with its reason. Not challenged; low cost if
> wrong (map data and art, no wire, no DB). Agent lane for game-service too, **within the
> charter's bounds only**: hub map data, a building's door face, the map size constants and their
> tests. Checked `docs/adr/`: ADR-0070 Decision 5 allows no wall-backed furnishing but the hall
> hearth, so the pews keep R12's clearance on every side (R12 here); nothing else constrains this.
> Coordinates were checked by hand against every rule below at spec time (2026-11-24, `b464ec55`);
> the implementing issues may move them where a test needs.
>
> **Owner feedback, I-R4MYX-10 (Nick's browser look, 2026-11-24).** "墓地太靠近教堂 在往後一點或是左一點移動
> 不要被蓋在教堂後面 不然就在擴大一倍好了 有點小 / npc不要被擋在房子下 / 教堂外觀希望有更多教堂風格 外面有十字架
> 然後牆壁顏色改成比較白的那種 / 歐洲的教堂風格 / 裡面的空間太小有點擠 在稍微大一些 / 神父放在講台前面". The
> charter session settled it as seven decisions, approved under the charter as owner feedback; each
> is marked **[owner feedback Fn]** with its reason. Nothing of this FS has shipped, so the values
> they replace are amended in place, not in a `## Change:` section; requirement numbers are kept,
> and the new rules follow the last (R39–R42, §I).
> - **F1** the chapel grows to about 620 × 440, pews 20 × 100 (the room was cramped);
> - **F2** the Confessor stands in front of the dais (asked; it also puts him in reach for the
>   later talent reset);
> - **F3** the graveyard moves screen-left of the chapel, clear of its drawn bulk, and doubles
>   (it sat behind the chapel and read small);
> - **F4** no outdoor NPC and no graveyard piece is drawn hidden behind a town building (R39);
> - **F5** the town grows further south if the chapel and graveyard need it;
> - **F6** a European church exterior: whitewashed, aged limestone, gothic lancets, buttresses, a
>   slate roof with crossed gables, and a wayside cross outside; dark fantasy kept by age, not grey;
> - **F7** still out: the talent reset, sitting, bells and sound, grave collision.
>
> Layout figures marked **indicative** were checked at spec time by a throwaway script against
> R4, R5, R12, R13, R19, R20 and R39's model (with a 60 px allowance over the ridge row for the
> ridge piece and the gable crosses), **not** against K1–K8: the tests decide, and the
> implementing issue moves them where a test needs, noting the final numbers.
> *Amended 2026-11-24 (I-R4MYX-11 review):* the tests now hold every indicative figure to K1–K8
> and to R39's model with the allowances the baked art needs, derived per roof set from its
> manifest frames (`hubCover.ts`: the town's ridge row 24 px over the ridge's lift, 62 with its
> chimney; the chapel's 73, for the cross on its gable apex). All held but two, which moved and
> are marked **as built**: the gap path starts at x 500 (R31) and the wayside cross stands at
> (1635, 1480) (R41). The rest stay marked indicative: what holds them is the tests, not the
> numbers.

## Summary

Nick: "我想在村莊左下方多做一個教堂 門口朝右下 … 左右長椅各3排 … 3 4個村民站在椅子前面 … 一個牧師打扮的人在台上
… 教堂左邊要有一片裝飾用的墓碑大概10-20個 … 也安排2 3個人在裡面站著 … 外觀不用太新 … 黑暗奇幻風格 … 做一條路通到教堂".

The town grows south by about 700 px, and an old European chapel stands in the new ground, below
and left of the square on screen: whitewashed limestone gone grey-green with age, gothic lancet
windows of dark leaded glass, stepped buttresses, a slate roof whose gable ends carry a round
window and a stone cross, a ruined belfry by its door and a tall wayside cross by the path. Its
door is on its east wall, facing down-right toward the camera, and a trodden path leads to it from
the square. Inside, a roomier nave: three long pews stand either side of a centre aisle facing a
dais at the west end, where the altar stands between two candelabra and a hooded Confessor stands
in front of the dais, at the head of the aisle, facing the door. Four townsfolk stand at the pews.
Well to the screen-left of the chapel, where its roof hides none of it, behind a low broken wall,
lies a graveyard twice the old one's size: headstones whole, cracked and broken, three fresh
mounds, two stone crosses and three dead trees, with three mourners at the graves. No outdoor
person and no grave is ever drawn hidden behind a building. Everyone can be talked to, and nothing
is offered: the Confessor's later role is not hinted at. (Nick's later look: see the provenance
note above.)

## Requirements

### A. The town grows south (game-service, map data and constants)

1. **The hub grows south [charter default D1; owner feedback F5].** `HubMapWidth` stays 2000;
   `HubMapHeight` (`common/constants/game.go`) grows from 1000 to **the smallest multiple of 100
   that holds** every building, outdoor resident, quarter, graveyard piece, path and outdoor
   dressing spot of this FS inside the map: **1700** under the indicative layout below (its
   graveyard spur ends at y 1605). Reason: the south-west is full: the Forest lane (spawn
   (1000, 800) to the gate at (40, 580), 240 wide, B0H2D R4) and the Inn leave about 200 px south
   of the lane, and F1/F3's larger chapel and graveyard, with the graveyard kept out from behind
   the chapel (R39), need more ground than the first 500 px. The client's `HUB_SIZE` follows
   (R22). **No existing coordinate north of the chapel moves**: the spawn, the gates and their
   arrivals, the three buildings, their furnishings, the five fixed residents, the function NPCs
   and the Cottar's and Herbwife's quarters keep their numbers; the Woodcutter's and the
   Bellringer's quarters move, because R39 says so (R5). The movement clamp follows the constant
   (`HubBounds`).
2. **Four town buildings.** `hubBuildings` holds the Quartermaster's store, the Inn, the smithy
   and **the chapel**, every one enterable. B0H2D R1's "exactly three" becomes four.
3. **The chapel's size [charter default D4; owner feedback F1].** About **620 × 440** (was
   480 × 340), the long axis east–west. Reason: the owner found the room cramped; 440 deep is the
   least that fits 100-long pews under R12 (20 + 50 + 100 + 100 + 100 + 50 + 20).
4. **Placement [charter default D2: the agent places it under testable rules; owner feedback
   F3, F5].** In the new south ground, south of the spawn and left of it on screen, far enough
   east that the graveyard fits screen-left of it (R27). The rules: R4–R5 and R39 hold; the
   chapel's centre lies screen-left of the spawn (`x − y` smaller than the spawn's 200). An
   **indicative** layout:
   | What | Where |
   |---|---|
   | Chapel footprint | (960, 1100), 620 × 440 (x 960–1580, y 1100–1540) |
   | Door gap (east wall) | x 1560–1580, y 1280–1360 |
   | Ground in front of the door | x 1580–1660, y 1280–1360 |
   On screen the chapel's centre (1270, 1320) lies about 200 px left of the spawn and 315 px
   below it (worldToScreen at 2:1, before the camera's scale): below and a little left of the
   square, where the first layout had it 510 px left. The shift right is the price of keeping
   the graveyard screen-left of it and visible inside a 2000-wide map.
5. **The B0H2D layout rules hold for the chapel too**, as tests over every building, not just
   the chapel:
   - R4 lanes: the 240 px corridor from the spawn to every gate is crossed by no wall (the chapel
     lies far south of all three);
   - R5 door onto ground: the gap-wide, 80 px deep rect **outside the door face** (east of an east
     door, south of a south door) lies inside the map and touches no wall;
   - R6 spawn and arrivals outdoors (and the dev test room's arrival (260, 900), FS-BDRTJ R4);
   - R7 every wandering resident's quarter lies outside every footprint, and (R39) no point of
     it is hidden behind a building: the Woodcutter's old 700–1000 × 820–960 and the Bellringer's
     old 1180–1460 × 820–960 both lie behind the bigger chapel's roof, so they move into the open
     east field, in front of it (**indicative**: the Woodcutter's 1780–1960 × 1000–1160, the
     Bellringer's 1780–1960 × 1240–1400, by the belfry), each keeping a function NPC's talk range
     plus 40 clear (FS-MRZH7 R9) and off the chapel lane;
   - FS-MMA2H R10: no wall, partition or furnishing stands in any door gap.

### B. The door face (game-service + game-client)

6. **A town building's street door has a face: south or east [charter default D3].** Reason: the
   owner wants the chapel's door facing down-right; until now every town building's door was a
   centred gap in its south wall (`addHubBuilding`). The Inn's `DoorOnEastFace` is a different
   thing (where along the south wall its door stands, against its partition) and is unchanged.
   - **South** (the default, and the three existing buildings): as today, unchanged.
   - **East** (the chapel): the **east** wall is cut into two segments around a centred gap a run
     door wide (`hubDoorWidth`, 80), 20 thick; the south wall is whole. Five walls, as a south
     door gives. No door entity, as B0H2D R9.
   - An east-door building has no partition [v1 pick: the only east door is the chapel's, and a
     partition's door rule (ADR-0073) was written for a south door; a test refuses the pair].
7. **The golden records the face.** `hubTown.golden.json` gains each building's `doorFace`
   (`"south"` or `"east"`) beside its `doorGap`, the gap's rect as cut (for an east door, the
   east wall's own rect between its two segments). Rewritten by its Go test (`-update`), never by
   hand (FS-MMA2H R12).
8. **The server's layout tests find a door on either face.** The helper that finds a building's
   door gap (`doorGapOf`) reads the gap on the building's door face; the "every building has a
   door gap a run door wide" test, the reachable-room flood fill (R13, started from the gap's
   centre, on its grid for the chapel at (1570, 1320) under the indicative layout) and the golden's built-hub check all work
   for an east door.
9. **The client draws an east door as it draws a south one.** `doorGaps` already finds gaps on
   any side; tests prove, for a gap in an east wall: the door (`door_y`, shut outside, open from
   inside), the door head over it in the building type's sheets (`tower_door_head_y` for
   masonry; the chapel's own `chapel_door_head_y`, R23), a jamb post at each wall end and no wall piece or post in the gap, in both
   looks (ADR-0036, FS-MMA2H R8); the indoor blackout's floor stops at the threshold's middle
   (FS-9PN7X); the roof lifts over a player standing in the gap.
10. **Thresholds by face.** Everywhere the client keeps ground clear in front of or inside a door,
    the strip follows the face:
    - outdoors (the keep-out tests, B0H2D R24): gap-wide, 80 px deep, beyond the sill (east of an
      east door's outer face);
    - indoors (indoor dressing, B0H2D R15): gap-wide, 80 px deep, inward from the sill (for the
      chapel, indicative, x 1500–1580, y 1280–1360);
    - the door spur (B0H2D R24): from the sill, outward, as wide as the gap along the wall (for
      an east door: its north jamb to its south jamb).
    The test fixtures (`hubTown.fixture.ts` `townDoorGap`, `townOutline`) wall and measure a
    building by its golden `doorFace`.
11. **The town minimap cuts the notch on the door's face.** The chapel's footprint is filled solid
    with its door notched into its east side (FS-P0HSP §B.9; `footprint` already takes east
    doors); a test proves it.

### C. The chapel's room (game-service furnishings, game-client dressing)

12. **Pews and the altar are furnishings [charter default D6, D7: as B0H2D R12].** Wall entities
    with the chapel's `house_id`, touching none of its outer edges, each **at least 50 px clear of
    every wall and every other furnishing on every side**: no pew is wall-backed (ADR-0070
    Decision 5 keeps that exemption to the hall hearth). Still three pews a side, each
    **20 × 100** (was 20 × 70) [owner feedback F1]; the centre aisle is **at least 100** wide.
    **Indicative** layout:
    | Kind | Rects (x, y, w × h) |
    |---|---|
    | `pew` ×3, north of the aisle | (1310, 1170), (1380, 1170), (1450, 1170), each 20 × 100 |
    | `pew` ×3, south of the aisle | (1310, 1370), (1380, 1370), (1450, 1370), each 20 × 100 |
    | `altar` | (1120, 1280), 30 × 80 |
    The aisle runs east–west between the pew rows, y 1270–1370 (100 wide), in line with the door;
    side aisles 50 wide run along the north and south walls; 50 px bays part the pews front to
    back. Each pew's back is to the east, its seat facing the altar. The pews stand west of the
    inner threshold (x ≤ 1470 < 1500). Between the dais and the first pews lies open floor at the
    aisle's head, where the Confessor stands (R17).
    - Why 100 long [owner feedback F1]: in a 440-deep room, 50 px to each wall, two pews and a
      100 px aisle leave 100 per pew. A wall-backed pew would give more; ADR-0070 refuses it.
13. **The room is reachable and nobody is talked to through a wall** (B0H2D R13, R14): from the
    east door a player reaches within talk range of everyone inside; everyone inside stands more
    than `NPCInteractRange` from each of the chapel's outer wall rects (furnishings do not count),
    and each is within `NPCInteractRange` of ground the flood fill reaches from the door (the
    Confessor, in front of the dais, from the aisle's head).
14. **Indoor dressing [charter default D7; v1 pick for the dais's form; owner feedback F1 for the
    scale].** Client data, no collision, under the R15 rules (inside the inner area, off the inner
    threshold, off every furnishing). The pieces scale and move with the bigger room; the dais
    keeps 130 × 200 (the altar and the two candelabra on it; the Confessor stands off it).
    **Indicative**:
    | Piece | Sheet | Where |
    |---|---|---|
    | dais | `dais` (existing, **flat**) | 130 × 200 centred (1105, 1320): x 1040–1170, y 1220–1420 |
    | lectern | `lectern` (existing) | (1190, 1250), 20 × 20, by the dais's north-east corner |
    | candelabra ×2 | `candelabra` (existing) | (1135, 1250) and (1135, 1390), 30 × 30, either side of the altar |
    - **A flat piece may lie under a furnishing** (this amends B0H2D R15): the dais is floor,
      drawn on the floor decal layer like the Inn's rug, and the altar stands on it. Standing
      dressing keeps off every furnishing as before. [v1 pick: a raised dais would be new
      geometry; a flat stone platform reads as one at this camera.]
    - The chapel has no other indoor dressing [v1 pick: the charter names these; the owner adds
      more after his look].
15. **Dim light [charter default D7].** The two candelabra are the room's only lights: their
    manifest light, lit only while the chapel's roof is lifted (the existing under-roof gate the
    Inn's candelabra use). The walls carry no light (R23). No per-spot intensity knob [v1 pick:
    two candles in a large unlit stone room read dim; a dimmer is tuning if the owner asks].

### D. The people (game-service)

16. **Eight more fixed residents [charter default D8, D9, D12].** Function `""`, no wander region,
    no velocity, `NPCInteractRange`, as B0H2D R16. With B0H2D's five, the hub keeps **thirteen
    fixed residents** (plus two function NPCs and four wandering residents). The owner approved
    the count under the charter; B0H2D's cap of five (per-tick NPC cost) is lifted to this. Each
    costs a per-player format per tick and nothing in `WanderSystem` or `MovementSystem`.
17. **Who and where [names: v1 pick, the town's role-names; looks: charter default; the
    Confessor's place: owner feedback F2].** Points **indicative** (rules: R13, R19, R20, R27, R39):
    | Name | Where | Appearance | Faces |
    |---|---|---|---|
    | Confessor | (1205, 1320), **in front of the dais** (35 px east of its edge), at the head of the aisle | `confessor` (R18) | east, to the door |
    | Penitent (worshipper) | (1355, 1255), at the second north pew | `rust_trousers` | west |
    | Chandler (worshipper) | (1425, 1255), at the third north pew | `flax_skirt` | west |
    | Goodwife (worshipper) | (1285, 1385), at the first south pew | `green_skirt` | west |
    | Ploughman (worshipper) | (1355, 1385), at the second south pew | `slate_trousers` | west |
    | Keener (mourner) | (520, 1320), at a fresh mound in the newest row | `flax_skirt` | west |
    | Widower (mourner) | (500, 1200), at a fresh-flowered grave in the newest row | `slate_trousers` | west |
    | Veteran (mourner) | (300, 1380), at a withered-flowered grave in an old row | `rust_trousers` | west |
    The Confessor no longer stands behind the altar: he stands on the floor east of the dais's
    edge, between it and the first pews, facing the door [owner feedback F2: asked, and it puts
    him in a player's reach from the aisle for the talent reset a later FS gives him]. A
    worshipper stands in the bay in front of (west of) their pew, near the aisle, facing the
    altar. Names are exact: the client keys lines and facing by them.
18. **The Confessor's look [charter default D8].** His `appearance` is `confessor`, a value naming a
    bespoke folk sheet rather than a `<palette>_<build>` (this amends FS-2325V §G.2): on the
    client, `folk_confessor`. The server test that holds every fixed resident to a look the client
    draws (`hubAppearances`) gains `confessor`. No wire field changes: `appearance` is already a
    free string on `NPCState`.
19. **Indoors: the Confessor and the worshippers** satisfy R13 and R14 (each > 80 px from every
    chapel wall rect; under the indicative layout the nearest are the worshippers' 135 px to the
    north and south walls, and the Confessor's 225 px to the west wall).
20. **Outdoors: the mourners, the only fixed residents standing outside [v1 pick for the
    rules].** B0H2D's "every fixed resident stands indoors" test becomes: every fixed resident
    stands either inside a building (and passes R14) or outdoors, and exactly the three mourners
    stand outdoors. An outdoor fixed resident:
    - stands outside every building footprint and inside the map;
    - stands more than `NPCInteractRange` from every wall of every building, so nobody indoors
      talks to them through a wall (the mourners now stand 440 px or more from the chapel's west
      wall);
    - stands at least `NPCInteractRange` + 40 from every function NPC (FS-MRZH7's margin);
    - stands outside every lane (more than 120 px from each spawn→gate segment).
    The server knows nothing of the graveyard: where the mourners stand among the graves is the
    client's test (R27), and so is whether a building hides them (R39: the draw heights are the
    client's).

### E. Drawing the chapel (game-client)

21. **Client mirror.** The town mirror follows the golden, as B0H2D R23: the chapel's footprint,
    door face and gap; `HUB_FURNISHINGS` gains the six pews and the altar; `HUB_FIXED_RESIDENTS`
    gains the eight with their facings (R17); the chapel's indoor dressing (R14); and the
    wandering residents' quarters (`HUB_KEEP_OUT.wander`, R40). The vitests hold each to
    `hubTown.golden.json`.
22. **One size [charter default D1; owner feedback F5].** The client's `HUB_SIZE` is
    2000 × `HubMapHeight` (2000 × 1700 under the indicative layout), defined once
    (`hubKeepOut.ts`) and read by `HubScene` [v1 pick: one source, so the two cannot drift], and
    held to the server's by the golden: `hubTown.golden.json` carries `mapSize` (`HubMapWidth` ×
    `HubMapHeight`, written by its Go test) and a vitest holds `HUB_SIZE` to it (*amended
    2026-11-24, I-R4MYX-11 review: the two were literals nothing tied together*). What
    follows the size follows it: the ground's fill and edge line, the camera's reach
    (`projectedBounds`, the Spire's facade check unchanged at the north edge), the blackout's
    reach, the keep-out rule K7, and the town minimap's world: the town's diamond fits the panel
    at FS-P0HSP §B.5's 0.0833 × 3000 / (2000 + height) of the world's projection, about 0.0676 at
    1700, so the map shrinks a little (charter D1).
23. **The chapel's look [charter default D5; owner feedback F6; v1 picks for the parts].**
    `townHouseLook` knows the chapel by its footprint (held to the golden, as `HUB_INN`). A
    European church, its dark fantasy carried by age, not by grey:
    - walls in **their own material**, `CHAPEL_WALLS` (prefix `chapel_`, R42): whitewashed
      limestone, aged in the bake (grime streaks, moss at the foot, patches where the lime fell
      away to the stone), as thick as the masonry (`BAKE.WALL_FOOT.masonry`). Inside, back and
      cut-away pieces are `plain` or `pillar`; the outward face (south and east, FS-9PN7X §B.2)
      is `plain`, `lancet` (a tall gothic pointed window of dark leaded glass, unlit) or
      `buttress` (a stepped buttress), the share of each a variant table like every material's.
      **No lit kind and no stone cap** [v1 pick, as before: the candelabra are the only light,
      R15, and a cap under a roof would double the top];
    - the door head is `chapel_door_head_{x|y}`: a pointed-arch portal with a carved cross above,
      found by the material's prefix (`doorHead`), so the east door shows `chapel_door_head_y`;
    - a **slate roof** of its own set, laid by the town's roof plan (`planRoof`, `planGables`:
      ridge east–west, lifting while the player is inside, as every town building's) but in the
      `chapel_roof_` sheets (R42): `chapel_roof_slope`, `chapel_roof_ridge` and
      `chapel_roof_gable_{x|y}`, the gable ends whitewashed, each with a round rose window and a
      stone cross on its apex. The roof plan takes the set's prefix from the house's look; the
      other houses keep the town's `roof_` set;
    - **no chimney** on the chapel's roof [v1 pick: a church has no hearth to vent, and the
      town's chimney smoke over it would read as a house];
    - **age is baked, not tinted** [owner feedback F6: the multiply tint greyed the white walls
      the owner asked for]: the walls, door head and gables draw as baked. `palette.chapelWeathering`
      and `CHAPEL_WEATHERING` either go, or tint the slate roof's slope and ridge pieces only
      [developer's call; a test pins which parts carry a tint, and no wall, post, door head or
      gable piece does];
    - the ruined belfry by the door (R30) and the wayside cross by the path (R41) stand outside;
    - the town's flagstone floor [v1 pick: a stone chapel on stone flags; no new floor sheet].
    Without the `chapel_` wall sheets the chapel draws placeholder walls (the material's baked
    check, `chapel_wall_back_plain_x`); without its roof set, the placeholder roof, as a client
    without roof art.
24. **Furnishings drawn as furniture** (B0H2D R19): the pews as `pew` (20 × 100, long along y,
    back to the east), the altar as `chapel_altar` (its furnishing kind stays `altar`; the sheet name
    `altar` is the run's Altar of Consecration, [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md));
    without a sheet, the placeholder block.
25. **The interior hides under the roof** (B0H2D R20): pews, altar, dais, lectern, candelabra and
    the five people inside are hidden while the roof is on; the mourners are outdoors and always
    shown. Fixed residents carry the ambient name plate and no sigil (B0H2D R21): the Confessor
    has **no marker** [charter default D8].
26. **Facing** (B0H2D R25): the client's facing table gains the eight (R17): the Confessor `e`,
    everyone else `w`. What a fixed resident faces may be a headstone, not only a furnishing.

### F. The graveyard, the belfry and the path (game-client dressing)

27. **The graveyard is dressing [charter default D10, D11; owner feedback F3].** **Screen-left
    of the chapel** (world west and south-west of it: smaller `x − y`), up-left of it on screen,
    all client data with no collision, placed by the layout below or any that passes these tests:
    - **no piece, wall tile included, is hidden behind any town building** (R39), the chapel
      above all: the owner found the old graveyard drawn behind the chapel's roof;
    - every piece clears the keep-out rule K1–K8 (FS-KYPQ9 §A.3) against the town as the golden
      lays it out, the chapel included, and the dev test room gate's range (80 px about
      (120, 900)) and arrival;
    - every piece but the wall lies inside the enclosure (the rect the wall runs bound);
    - no piece's footprint comes within 12 px of a mourner's point, and each mourner stands
      inside the enclosure, 40–80 px east of their grave's stone (or its mound's head), so they
      face it (R17, R26).
28. **The graveyard's layout [charter default D10 for the kinds; owner feedback F3 for the size
    and counts; v1 pick for the plan].** The enclosure is about **twice the old area**, about
    540 × 500 (was 390 × 350): **indicative** x 40–580, y 1020–1520. Graves lie in **four**
    north–south rows, each stone at the west end of its grave and facing east (the old way: the
    dead face the sunrise, and the inscriptions face the camera), the rows reading oldest to
    newest from west to east: indicative stone lines x 140 (row A, the oldest), 240 (B), 340 (C)
    and 440 (D, the newest, by the gap), seven grave slots a row at y 1080, 1140, 1200, 1260,
    1320, 1380 and 1440 (one slot left empty). Counts, held by a test:
    - **24 headstones**: 10 intact (at least two shapes), 9 weathered (cracked, leaning or
      chipped), 5 broken stumps, the stumps in the old rows;
    - **3 fresh mounds**, no stone yet (centred 25 px east of their row's stone line, 50 × 28),
      in the newest rows;
    - **flowers at 6 graves**: 4 fresh, 2 withered, laid 18 px east of their stone (or on a
      mound's head, sorting over its earth);
    - **2 stone crosses** (`stone_cross`, tall) and **3 dead trees** (`tree_dead` /
      `tree_dead_snag`, tall) along the old west side and the north wall: indicative crosses
      (85, 1170) and (85, 1380), trees (80, 1060), (80, 1480) and (290, 1050).
    The mourners' graves (R17): the Keener's a fresh mound in row D, the Widower's a
    fresh-flowered grave in row D, the Veteran's a withered-flowered grave in row B.
29. **The low broken wall [charter default D10; owner feedback F3].** `graveyard_wall` pieces
    cut one tile at a time along runs, like a fence (`fenceSegments`), with a crumbled variant
    among the whole ones (hashed per tile, so every client sees the same wall), bounding the
    enclosure, collapsed in a stretch on the north and on the west side, and **open in one gap
    facing the path spur** (R31). **Indicative** runs:
    | Run | From | Along | Length |
    |---|---|---|---|
    | north, west part | (40, 1020) | x | 240 |
    | north, east part (collapsed between) | (330, 1020) | x | 250 |
    | west, north part | (40, 1020) | y | 230 |
    | west, south part (collapsed between) | (40, 1300) | y | 220 |
    | south | (40, 1520) | x | 450 |
    | east | (580, 1020) | y | 500 |
    The south-east corner stands open (x 490–580 on the south side): **the gap, facing the path**.
30. **The belfry [charter default D5; owner feedback F6: kept, moved].** One tall `belfry` prop
    by the chapel's door: north of the door spur, between the east wall's eave and the chapel
    lane (**indicative** (1635, 1220), r 20). It keeps its bent iron cross, joins the occluders
    and fades over a player behind it, as the town's tall dressing does.
31. **The path [charter default D14; owner feedback F3, F5 for the routing].** `HUB_PATHS`
    gains, as the existing paths are (ground paint, dirt where a tile's centre lies in a rect),
    a way from the square to the chapel's door and on to the graveyard's gap. The rules: the
    chapel lane joins the existing paths; the door spur runs from the sill to the lane
    (`HUB_DOOR_SPURS`, R10); the graveyard spur runs from the lane to the graveyard's gap; no
    path crosses a room's floor (B0H2D R24); every outdoor spot still clears K1–K8. The first
    layout's chapel lane ([1200, 700, 70, 775]) would cross the bigger chapel and goes.
    **Indicative**:
    | Rect [x, y, w, h] | What |
    |---|---|
    | [1380, 660, 390, 70] | the hearth's east arm ([1000, 660, 380, 70]) carried on east to the chapel lane |
    | [1700, 730, 70, 875] | the chapel lane, east of the chapel, south to the graveyard spur |
    | [1580, 1280, 120, 80] | the chapel's door spur, from its sill to the lane |
    | [490, 1555, 1280, 50] | the graveyard spur, along the chapel's south side from the lane |
    | [500, 1520, 70, 35] | into the graveyard's gap (**as built**, I-R4MYX-11: x 500, inside the gap's x 490–580) |
32. **The old south edge [charter default D1, as found].** The code holds no fence or beyond-edge
    dressing along the south edge: the fence at y 950 closes the south-west yard and stays, as do
    the stall at (630, 950) and the crates south of the spawn. What marked the edge follows
    `HUB_SIZE` by itself (R22). Nothing is drawn beyond the new south edge [v1 pick: the charter
    asked for nothing new there]. If a later layout adds south-edge fences or beyond-edge
    dressing, they follow the edge as it grows (F5).
33. **No graveyard light, no sound** [charter default: Out]. The graveyard is lit by the town's
    ambient alone.

### G. Talking (game-client)

34. **Lines [charter default D13].** Each of the eight talks in passages the Warden's way (B0H2D
    R27: *Go on* turns, *Farewell* ends, every telling starts at the first), from `TOWN_LINES`
    keyed by exact name; nothing goes to the server. **Listed for the owner to tweak.** Grim,
    terse, rumour over exposition; nothing hints at what the Confessor will later do.
    - **Confessor**, role *Keeper of the chapel* (4):
      1. "Shut the door behind you. The dead hear better\nthan the living, and they talk more."
      2. "The bell hasn't rung since the tower rose.\nThe Bellringer climbs up each morning to look at it."
      3. "Half the town comes in here to ask after someone\nwho went up the Spire. I tell them what I know. Nothing."
      4. "Kneel if you like. I can't promise you'll be heard.\nI can promise you won't be the first."
    - **Penitent** (2):
      1. "Forty days on my knees. The Spire's still standing."
      2. "So. Forty more."
    - **Chandler** (2):
      1. "I make the candles. He burns two.\nThe rest go out to the graves."
      2. "Wax doesn't last a night out there. Something eats it."
    - **Goodwife** (2):
      1. "My son was among the first to climb it.\nI pray for him every morning."
      2. "I don't say which way."
    - **Ploughman** (1):
      1. "Field's gone to thistle. Nobody turns earth\nwith the barrow open under it."
    - **Keener** (2):
      1. "Fresh earth, and no stone yet.\nThe Gravedigger swore he was done with digging."
      2. "Some nights the ground here is turned over,\nand nobody holds a spade."
    - **Widower** (2):
      1. "Fresh flowers every morning. I don't bring them."
      2. "She was buried a week before the Spire rose.\nI come to make sure she's still here."
    - **Veteran** (1):
      1. "My sergeant. These went brown a month back.\nHe won't mind. He's seen worse."
    The Alewife keeps the longest telling (four passages; the Confessor's four tie it, never pass
    it).
35. **The nearest answers** (B0H2D R28): in the pews or between the mourners, the nearest NPC by
    world distance is spoken to.

### H. Art (game-client bake)

36. **New prop sheets, authored in `tools/bake` [charter default D5, D10; ADR-0020, ADR-0021].**
    Dark fantasy, weathered, from `BARROW` colours:
    - `pew` (a plain dark-oak bench with a back, **20 × 100** (rebaked from 20 × 70, owner
      feedback F1), long along y, back to the east),
      `chapel_altar` (a stone altar block with a dark cloth, 30 × 80, long along y; not `altar`,
      which names the run's Altar of Consecration, FS-3103M), `lectern` (an iron
      or oak reading stand with a closed book), `dais` (flat: a low stone platform's top and its
      front edge, 130 × 200);
    - `belfry` (a weathered timber-and-stone bell frame, a dark bell under a little roof, topped by
      an iron cross bent a little off true; tall);
    - `headstone` with variant frames for **intact** (at least two shapes), **weathered**
      (cracked, leaning, chipped) and **broken stump**, each facing east; `grave_flowers`
      (**fresh**: a small posy, the one warm note in the yard; **withered**: brown stems);
      `grave_mound` (raw dark earth, a little rounded); `stone_cross` (a tall lichened stone
      cross; tall); `graveyard_wall` (low dry-stone, along x and along y, **whole** and
      **crumbled** variants, one tile long).
    Existing sheets reused: `candelabra`, `tree_dead`, `tree_dead_snag`, `door_y`. The chapel no
    longer reuses `tower_door_head_y`, the `tower_` masonry wall pieces or the town roof pieces:
    it has its own (R42).
37. **The Confessor's look `folk_confessor` [charter default D8].** Bespoke, like
    `folk_quartermaster` (`tools/bake/page/characters/folk.js`): a tall gaunt figure in a dark
    hooded robe to the ground, a **white stole** hanging from the neck (the one pale mark that
    reads at a distance), hands clasped, no weapon, no marker. Idle and walk, like every folk
    sheet (`FOLK_ANIMATIONS`), in the `folk` group. The client draws it for `appearance`
    `confessor` (`folkLook`); a client without the sheet draws the default villager (FS-2325V
    §G.2's fallback).
38. **No contact-sheet gate [charter: Out].** The owner eyeballs the art in the browser; the
    scene draws placeholders (furnishings) or nothing (dressing) until a sheet exists, so code
    and art land independently.

### I. Nothing outdoors hides behind a building; the church's own look (owner feedback, I-R4MYX-10)

39. **No outdoor NPC and no graveyard piece is drawn behind a town building [owner feedback F4:
    "npc不要被擋在房子下"].**
    - **What it covers:** every outdoor fixed resident (the mourners), every function NPC who
      stands outdoors (the Elder; the Quartermaster is indoors), **every point** of every wandering
      resident's quarter (a walk may end anywhere in it; tested on a grid no coarser than 20 px,
      corners included), and every graveyard piece and wall tile by its footprint (its point and
      the corners of its `r` square). Not covered: players (their silhouette shows them,
      FS-9PN7X §E.3), indoor residents (under the roof by design), and the town's other dressing.
    - **A building's bulk:** its footprint grown by the eave (`ROOF_EAVE`), raised at each point
      to the height drawn there: the back wall's top (`BAKE.WALL_BACK · VPX`) at the eaves, the
      roof climbing one `ROOF_RISE · VPX` a row to the ridge as `planRoof` lays it, and over the
      ridge row the ridge piece's, the gable apex's (the chapel's carries its cross) and a
      chimney's drawn height above it, where the roof wears one (from their manifest frames, or a
      named allowance per roof set where the test runs without art). A box swept up to the ridge
      is not the rule: it would hide half the square.
    - **Hidden:** a point P is hidden behind a building when some bulk point F on P's screen
      column (F.x − F.y = P.x − P.y) sorts in front of P (F.x + F.y > P.x + P.y) and its drawn top
      reaches P's screen height: `worldToScreen(F).y − h(F) ≤ worldToScreen(P).y`. An NPC is
      tested at its point and at its body's half-width either side along screen x
      (`NPC_BODY_HALF`, a named constant, at least a quarter of a tile's width: 16 screen px).
    - **What follows:** ground east or south of a building's eaves is in front of it and never
      hidden. The hidden ground lies north and west of it, in its columns: for the 620 × 440
      chapel, up to about 300 px north of its north wall and 320 px west of its west wall,
      reaching furthest out along the north-west diagonal from its north-west corner (about
      300 px in x and in y at once). *Amended 2026-11-24 (I-R4MYX-11 review): the spec-time 260
      and 460 were the script's, under a 60 px allowance; these are the tested model's.*
      Hence the moves in R5 (two quarters) and R27 (the graveyard).
    - **Tested client-side** (a pure module, no Phaser: the draw heights are the client's),
      against the golden's buildings and quarters (R40), the outdoor function NPCs' points and
      the graveyard data. The server keeps no copy of the rule.
40. **The golden records the quarters [owner feedback F4].** `hubTown.golden.json` gains
    `wanderRegions`: each wandering resident's name and quarter rect (`x`, `y`, `w`, `h`) from
    `hubResidents`, written by its Go test with `-update`, never by hand (FS-MMA2H R12). The
    client's `HUB_KEEP_OUT.wander` is held to it by a vitest, so R39 and K6 read the server's
    quarters, and a server move the mirror missed fails at review.
41. **A wayside cross outside [owner feedback F6: "外面有十字架"].** One tall `wayside_cross` prop:
    a tall stone calvary cross on a stepped base, weathered, by the chapel's door and path:
    south of the door spur, between the east wall's eave and the chapel lane, and far enough
    south that on screen it stands clear of the doorway, its door, head and jambs (**as built**,
    I-R4MYX-11: (1635, 1480), r 20; at the indicative (1635, 1410) its arms hid the left half of
    the opening). Outdoor dressing: it clears K1–K8, stands on no path and no threshold,
    joins the occluders and fades over a player behind it. No light. Without its sheet, nothing
    is drawn (FS-KYPQ9 §A.9).
42. **The chapel's own sheets, baked in code [owner feedback F6; ADR-0020, ADR-0021].** In
    `tools/bake`, colours from `BARROW` (the whites mixed toward its palest, `vellum`, never pure
    white), every piece aged in the bake as R23 says, in a resident atlas group the hub
    draws without a scene change, no light on any:
    - walls, cut and sized as the `tower_` masonry pieces they stand in for (the masonry foot,
      `WALL_BACK` and `WALL_FRONT` heights, the same anchors): `chapel_wall_back_{plain,pillar}_{x,y}`,
      `chapel_wall_front_{plain,pillar}_{x,y}`, `chapel_wall_exterior_{plain,lancet,buttress}_{x,y}`
      (the lancet a gothic pointed window of dark leaded glass, unlit; the buttress stepped),
      `chapel_post_back`, `chapel_post_front`, and `chapel_door_head_{x,y}` (a pointed-arch portal
      with a carved cross above);
    - the slate roof, cut and sized as the town's `roof_` pieces (one tile, `ROOF_RISE` a row,
      the same animations), so `planRoof` and `planGables` lay it unchanged:
      `chapel_roof_slope` (n/e/s/w), `chapel_roof_ridge` (x/y), `chapel_roof_gable_{x,y}`
      (whitewashed gable ends, each with a round rose window, an oculus, and a stone cross finial
      on its apex);
      - *note (I-R4MYX-12, as baked): the gable alone is not framed as its counterpart.*
        `chapel_roof_gable_x` frames **53 × 257** with its anchor at (0.4906, 0.9377) (`_y` the
        mirror, x 0.5094), where the town's `roof_gable_{x,y}` frame 50 × 202 at (0.5, 0.9208):
        the masonry thickness (`WALL_FOOT.masonry`, the timber gable's is thinner) widens it and
        the cross finial lifts its top, about 55 px over its foot past the town gable's, covered by
        R39's chapel ridge allowance (73 px, derived from this frame). The slope and ridge frame exactly as `roof_slope` and `roof_ridge`.
        **The apex-frame contract:** each gable animation has two frames. Frame 0 is the plain
        piece (the town gable's one frame); frame 1 is the apex piece, the one `planGables` lays
        against the ridge (its first, k = 0), carrying its half of the rose window and its half of
        the cross, so the two halves at an end meet in one window and one cross over the ridge.
        The client lays frame 1 at k = 0 and frame 0 everywhere else;
    - `wayside_cross` (R41);
    - `pew` rebaked at 20 × 100 (R36).

## User Stories

1. As a player in the square, I want to see a chapel lower-left of me, so that the town has a
   place I have not walked into yet.
2. As a player, I want a trodden path from the square to the chapel's door, so that I find the
   way without hunting.
3. As a player at the chapel, I want its door on the side facing me, so that I see where to go in.
4. As a player stepping in, I want the roof to lift and the chapel's room to show, as in every
   town building.
5. As a player inside, I want the pews in rows either side of an aisle that leads straight from
   the door to the altar, so that the room reads as a chapel at a glance.
6. As a player, I want to bump into the pews and the altar, so that the furniture is solid.
7. As a player, I want to walk down the aisle and the side aisles freely, so that pews never trap
   me.
8. As a player, I want a hooded Confessor standing in front of the dais at the head of the aisle,
   facing me as I come in, so that I know who keeps the place and can walk straight up to him.
9. As a player, I want to talk to the Confessor and hear something grim about the town and the
   Spire, so that the chapel has a voice.
10. As a player, I want townsfolk standing at the pews facing the altar, each with something to
    say, so that the chapel feels used.
11. As a player outside the chapel, I want not to talk to anyone inside through its walls, so
    that a conversation means I went in.
12. As a player outside, I want not to see who is inside until I enter, so that the roof means
    something.
13. As a player inside, I want the room dim, lit by two candelabra on the dais, so that it feels
    like a dark-fantasy chapel and not a bright hall.
14. As a player walking past, I want the chapel to read at a glance as an old European church:
    whitewashed walls gone grimy, pointed lancet windows, buttresses, a slate roof with a cross on
    each gable, a wayside cross by the path and its bell frame topped by a bent iron cross, so
    that it is plainly a church and still fits a town under the Spire.
15. As a player, I want a graveyard beside the chapel behind a low broken wall, off to its left
    where the chapel hides none of it, so that the chapel has its dead and I can see them.
16. As a player in the graveyard, I want headstones whole, cracked, leaning and broken, so that
    it reads as old ground.
17. As a player, I want a few graves with flowers, some gone brown, and three fresh mounds, so
    that the place tells a story of who is still mourned.
18. As a player, I want mourners standing at graves, facing the stones, so that the graveyard is
    not empty.
19. As a player, I want to talk to each mourner and get a line of rumour, so that the dead have
    something to say through the living.
20. As a player, I want to walk through the graveyard without catching on a stone, so that
    dressing never blocks me.
21. As a player, I want a path to the graveyard's gap, so that I find the way in.
22. As a player, I want the town's existing roads and buildings exactly where they were, so that
    what I know of the town still holds.
23. As a player, I want the minimap to show the chapel with its door notched on the east side, so
    that the map matches the town.
24. As a player in a crowd at the pews, I want the nearest person to answer, so that I get who I
    meant.
25. As the owner, I want every new line listed in one place, so that I can tweak the words.
26. As the owner, I want nothing in the chapel to promise the talent reset yet, so that the later
    feature lands without a broken hint.
27. As a developer, I want a building's door face to be map data the tests read, so that a later
    building can open east without another special case.
28. As a developer, I want the client's copy of the chapel, its people and its door face held to
    the golden, so that a server move the mirror missed fails at review.
29. As a developer, I want the outdoor mourners held to rules the server tests (off every wall's
    talk range, out of the lanes, clear of function NPCs), so that outdoor fixed residents stay
    safe to add.
30. As a developer, I want the client's hub size to come from one constant, so that the scene and
    the keep-out rule cannot disagree.
31. As a player inside, I want the nave roomy, long pews and a wide aisle, so that it does not
    feel crammed.
32. As a player anywhere in town, I want never to find a townsperson outdoors drawn hidden under
    a building's roof, so that I can see who is there to talk to.
33. As a player, I want a graveyard large enough to wander, so that it reads as the town's old
    burial ground and not a garden plot.
34. As the owner, I want the chapel white and European without losing the dark fantasy, so that
    age, not a grey wash, makes it grim.
35. As a developer, I want the hidden-behind-a-building rule a test the client runs on the
    golden's buildings and quarters, so that a later building or quarter that hides someone fails
    at review.

## Acceptance Criteria

- [ ] `HubMapHeight` is the smallest multiple of 100 that holds the layout (1700 under the
      indicative one), `HubMapWidth` 2000; no hub coordinate north of the chapel changed but the
      Woodcutter's and the Bellringer's quarters.
- [ ] The hub has four buildings; the chapel is about 620 × 440, south of the spawn, its centre
      screen-left of the spawn.
- [ ] Go test: the chapel's east wall is two segments around a centred 80 px gap, its south wall
      whole; the other three keep their south gaps; no door entity in the hub; no east-door
      building has a partition.
- [ ] Go test: the 240 px lane to each gate crosses no wall; a gap-wide, 80 px deep rect outside
      each door face lies in the map and touches no wall; the spawn, both field arrivals and the
      dev test room's arrival lie outside every building; every quarter lies outside every
      footprint; no wall stands in a door gap.
- [ ] The chapel holds six pews (20 × 100), three a side of an aisle at least 100 wide, and an altar, each a wall with its `house_id`, touching
      no outer edge, at least 50 px clear of every wall and furnishing on every side.
- [ ] Go test: from the chapel's east door a player-sized walker reaches talk range of the
      Confessor and all four worshippers; each is more than `NPCInteractRange` from every chapel
      wall rect; the Confessor stands east of the dais's edge, at the aisle's head, not behind
      the altar.
- [ ] Thirteen fixed residents: the B0H2D five and the eight of R17, function `""`, no quarter,
      no velocity, never moving; the Confessor's appearance is `confessor`.
- [ ] Go test: every fixed resident is indoors (R14) or outdoors; exactly the three mourners are
      outdoors, each outside every footprint, inside the map, more than `NPCInteractRange` from
      every wall, at least `NPCInteractRange` + 40 from every function NPC, outside every lane.
- [ ] `hubTown.golden.json` carries the map's size (`mapSize`), `doorFace` per building, the
      chapel, its furnishings, the thirteen fixed residents and the four `wanderRegions`,
      rewritten by `-update`; the client's quarters mirror and `HUB_SIZE` match it.
- [ ] No proto, WS message, `NPCState` field, DB or gateway change.
- [ ] Client `HUB_SIZE` is 2000 × `HubMapHeight` and `HubScene` reads it; the ground, camera
      reach and minimap follow.
- [ ] Vitest (R39): no outdoor fixed resident, outdoor function NPC, point of any quarter, or
      graveyard piece or wall tile is hidden behind any town building's bulk; a fixture point
      placed just north of the chapel is reported hidden.
- [ ] Vitest: an east door gap gets its door, its door head in the building type's sheets, jamb
      posts and no piece in the gap, in both looks; the minimap notches the chapel's east side.
- [ ] Vitest: the client mirror (furnishings, fixed residents with facings, the chapel footprint)
      matches the golden; indoor dressing keeps R15 with thresholds by face, the dais alone lying
      under a furnishing.
- [ ] Walking into the chapel lifts its roof and shows the pews, altar, dais, lectern, lit
      candelabra and the five inside; walking out hides them.
- [ ] The chapel's walls are its own `chapel_` material (inside plain/pillar; outside plain,
      lancet, buttress), unlit, no stone cap, under its `chapel_roof_` slate roof with crossed
      gables, its door under `chapel_door_head_y`, no chimney; no tint on any wall, post, door
      head or gable piece; the wayside cross and the belfry stand by the door, the cross clear of
      the doorway on screen (its door, head and jambs).
- [ ] Vitest: every graveyard piece, the belfry, the wayside cross and the new paths clear K1–K8
      and the dev gate; the graveyard lies screen-left of the chapel; the counts of R28 hold
      (24 stones: 10 / 9 / 5; 3 mounds; flowers 4 fresh, 2 withered; 2 crosses; 3 dead trees); every piece but the wall lies in the enclosure; no piece within
      12 px of a mourner; each mourner 40–80 px east of their grave's head.
- [ ] Talking to each of the eight shows their passages as R34 lists them; the Alewife's telling
      is still the longest or tied.
- [ ] `pew`, `chapel_altar`, `lectern`, `dais`, `belfry`, `headstone`, `grave_flowers`, `grave_mound`,
      `stone_cross`, `graveyard_wall` and `folk_confessor` are baked from code and in the
      manifest; `pew` at 20 × 100; the `chapel_` walls, posts, door heads, `chapel_roof_` set and
      `wayside_cross` (R42) likewise.
- [ ] `go test ./...` and `make lint` (game-service); `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` (game-client) pass.
- [ ] Nick's browser look passes, or each finding is written back as an amendment or an issue.

## Edge States

- **A player standing in the chapel's door gap.** The gap is inside the footprint, so the roof
  lifts there. Under the indicative layout the Confessor is 365 px away and the nearest
  worshipper about 160 px: they must step in to talk.
- **A player between the graveyard and the chapel.** The mourners stand 440 px or more from the
  chapel's west wall, so nobody inside the chapel talks to them through the wall, nor they to
  anyone inside.
- **A player walking behind the chapel** (north or west of it, in its columns). The chapel's roof
  covers them as every building's does, and their silhouette shows through (FS-9PN7X §E.3). R39
  keeps NPCs and graves out of that ground, not players.
- **Other dressing behind the chapel.** R39 covers people and the graveyard only, as the owner
  asked. The crates and signpost south of the spawn, and the south-west yard's stall and woodpile,
  may be partly behind the bigger chapel's roof; widening R39 to them is the owner's call after
  his look (I-R4MYX-10).
- **A player standing on a grave.** Nothing stops them (dressing has no collision, D11); the
  mourner keeps standing where they are.
- **A crowd in the aisle.** Player collision is off in the hub (FS-X2F2H), so nobody blocks the
  door or the aisle.
- **The player walks past the old south edges (y 1000, y 1500).** Nothing marks them any more;
  the clamp is at `HubMapHeight`.
- **A client older than the server's map.** It draws ground only to its own `HUB_SIZE` while the
  server lets the player walk to `HubMapHeight`: it draws the chapel's walls (they arrive) in the
  look its footprint check finds, timber when the footprint moved, and the graveyard where it
  used to be. The vitest mirror catches the drift before merge; a
  deployed client and server ship together.
- **Client without art.** Pews and the altar draw as placeholder blocks; the dais, lectern,
  graveyard pieces, belfry and wayside cross draw nothing; the Confessor draws as the default
  villager; the chapel's walls fall back to the placeholder walls with their roof, as every town
  building's.
- **A manifest without the `chapel_` sheets** (older art, newer code). The chapel's walls draw as
  placeholder walls and its roof as the placeholder roof (R23); nothing falls back to the
  `tower_` masonry.
- **An unknown NPC name.** Falls back to `RESIDENT_LINES` and the default facing (B0H2D R25,
  R27).
- **Disconnect while inside.** Reconnecting returns the player to the spawn, outdoors (R5).
- **The dev test room's gate** (dev builds, (120, 900)) stands north of the graveyard, 120 px
  from its north wall under the indicative layout (40 px clear of its 80 px range); it opens no
  gap on the minimap's south edge (it is 800 px from it now, not 100).
- **Hub tick cost.** Eight more NPCs are formatted per player per tick; fixed residents carry no
  velocity, so no system moves them.

## Out of Scope

- The talent reset, the Confessor as a function NPC, his marker or any hint of either (a later
  FS; he becomes a function NPC then).
- Sitting or kneeling poses; the worshippers stand.
- Bells, chants or any sound; a bell that rings.
- Collision for any graveyard piece, the belfry or the wall; digging, grave interaction.
- New looks for the worshippers and mourners (existing four only).
- New outdoor lights, fog or weather for the graveyard.
- Any change to the spawn, gates, other buildings, furnishings or existing dressing positions;
  the only quarters that move are the two R39 forces (R5).
- Hiding rules for players, indoor residents or the town's other dressing (R39 covers outdoor
  NPCs and the graveyard).
- A lit chapel exterior: the lancets are dark glass, unlit (R23); the interior stays lit by the
  two candelabra alone (R15).
- Any proto, WS message, `NPCState` field, DB or gateway change. If one proves unavoidable, stop
  and escalate.
- A contact-sheet approval step (the owner looks in the browser).
- Anything in `internal/matchmaker`, `internal/match_queue`, stats.

## Change: The chapel's windows match inside and out, and its west wall carries the crucifix
Status: shipped
Date: 2026-11-24

> **Owner request (Nick, 2026-11-24), after the chapel shipped (f9b572d3):** "教堂再幫我在室內神父後面的牆壁
> 放一些十字架或是壁畫 教堂室內室外窗戶要對的上". In English: put crosses or murals on the interior wall
> behind the priest, and make the chapel's windows line up inside and out. Written `--from-thread`
> with no interview: the charter's decisions B1–B4 are owner-approved defaults, each marked
> **[charter default Bn]** with its reason. Where the charter left a point open, the smaller
> reading was taken and marked **[v1 pick]** with its reason. Client only (game-client and its bake),
> so the agent lane holds. Checked `docs/adr/`: nothing constrains wall-hung dressing on a back
> wall (ADR-0036 asks only that it hang on a full-height wall, which the west wall is). ADR-0070
> Decision 5 covers furnishings, and none is added.
>
> **What was wrong, as built.** `CHAPEL_WALLS` picks each piece's kind by a position hash
> (`tileHash` in `walls.ts` `pieceAt`): the outward face (south and east, seen from outside) is
> plain 40 / lancet 32 / buttress 28, and the inner faces are plain or pillar. Indoors, with the
> roof lifted, the camera sees the north and west walls' inner faces at full height (back pieces)
> and the south and east walls cut low (front pieces). So the lancets on the south exterior fall
> wherever the hash puts them, and the north wall, the long wall seen inside, shows no window at all.
>
> **What this changes in the work order above:**
> - R23: its hashed share of outward kinds no longer applies to the chapel (W1–W7).
> - R14: its "the chapel has no other indoor dressing" no longer holds (W12).
> - R42: its sheet list gains three (W8–W10).
>
> **Unchanged:** every other requirement, the layout, the furnishings, the people, the lights
> (R15) and the server.

### Summary

The chapel's windows stop being scattered by a hash. Along its long south wall, outside, lancet and
buttress now alternate in a fixed, symmetric rhythm. Inside, the north wall carries a lancet at the
same x as each one on the south wall, so the nave reads as a row of bays with windows facing each
other across it. The east wall keeps a lancet on each side of its door. Behind the Confessor, the
west wall carries no window: a large, old wooden crucifix hangs there on the aisle's line, with a
faded fresco on each side of it. No new light: the two candelabra still light the room alone.

### Requirements

Numbered 1–15 below and cited as **W1–W15**, separate from the work order's R1–R42.

#### §W-A. Fixed window bays (game-client `walls.ts`, `buildingLooks.ts`)

1. **The chapel's bays are fixed, not hashed [charter default B1].** A fixed bay rule, keyed on
   where a piece stands along its wall, decides every outward piece's kind (plain, lancet,
   buttress), where the inner lancets stand, and which inner pieces must be plain (W6). It does
   not use `tileHash`. A church's windows are symmetric, and a hash cannot promise that the inside
   matches the outside.
   - What the rule leaves open is hashed as today: the plain-or-pillar choice on the other inner
     pieces (W4, W6, W7) and every piece's variant frame (`index`), so the two baked variants of
     a kind still vary.
   - The rule may live on the material (`CHAPEL_WALLS`) or be a per-house bay rule that the
     chapel's look names [developer's call, as the charter leaves it]. Either way, the interior
     look and the building exterior (`planBuildings`'s `shared`, `interior` and `exterior`) read
     the same rule.
   - The **piece grid** is the one `cut` lays today: one tile (40 px) a piece from the wall
     rect's start, the last piece trimmed where the length is not a whole number of tiles.
2. **What no lancet stands on.** On every chapel wall, inner face or outward face, no lancet
   stands on a trimmed piece (`keep < 1`, already plain), or on a piece whose span along its wall
   holds a post (a corner post, or a jamb post at a door gap). So no lancet stands over a corner or
   beside a door gap. Under the server's walls, these pieces are:
   - on the north and south walls, the pieces at x 980 (holds the corner post at 970) and the
     trimmed piece at x 1580;
   - on the east wall, the pieces at y 1120 and 1380 (posts at 1110 and 1370) and the trimmed
     pieces at y 1280 and 1540.
3. **The south wall's outward face: lancet and buttress alternate, symmetric [charter default
   B1].**
   - No two lancets adjoin. Exactly one piece stands between two neighbouring lancets, and it is a
     buttress.
   - Next to the first and the last lancet, on their outer sides, stands a buttress. Every other
     piece is plain.
   - The pattern mirrors about the wall's middle (x 1270) to within half a tile: for every lancet
     at x, a lancet stands within 20 px of 2 × 1270 − x. Exact mirroring cannot be done on this
     grid, because piece centres sit at 980 + 40k.
   - **Indicative** (it passes the rules; the developer may pick another that passes): lancets at
     x 1060, 1140, 1220, 1300, 1380 and 1460; buttresses at x 1020, 1100, 1180, 1260, 1340, 1420
     and 1500; plain at x 980, 1540 and 1580 (the last one trimmed). That is six bays.
4. **The north wall's inner face: a lancet wherever the south wall has one [charter default B1,
   B2].**
   - Each south outward lancet has a north inner lancet (`chapel_wall_back_lancet_x`, W8) at the
     same x, and every north inner lancet has a south outward lancet at its x.
   - The north wall's other pieces keep the back table, plain or pillar, hashed as today (W1)
     [v1 pick: the charter asks only that the windows match; pilasters
     standing where the buttresses stand outside would be a further rule nobody asked for].
   - The north and south walls share their x span (x 960–1580), so their piece grids line up.
     This holds for the chapel as the golden lays it out, and a test pins it.
5. **The east wall's outward face: a lancet on each side of the door [charter default B1].**
   - Each of its two segments carries at least one lancet, under W2.
   - No two lancets adjoin.
   - The lancets mirror about the door gap's centre (y 1320) to within half a tile (20 px), as in
     W3.
   - The segments' other pieces are plain or buttress [developer's call].
   - **Indicative:** one lancet at y 1200 and one at y 1460, everything else plain.
6. **The west wall has no window [charter default B3].** Its inner face (back pieces, y-axis)
   carries no lancet. The pieces whose span along the wall overlaps the crucifix's or a mural's
   footprint (W12) are plain [v1 pick: a pilaster behind a hung piece would show through it]. The
   rest keep the back table, as today.
7. **Indoors, the south and east walls stay cut away, with no window [charter default B2].** Their
   front pieces stay what they are today, plain or pillar, and carry no lancet: the cut
   (`WALL_FRONT`, 1.1) falls at the outward lancet's sill (1.05, `LANCET` in
   `chapelBuilding.js`), so a window there would show only a sliver a couple of screen pixels
   high. See Edge States.
   - Every other building's pieces are unchanged: the Inn, the store and the smithy, the Spire's
     rooms and the dungeon floors draw the same sheet and index for every piece as before
     (`TIMBER_WALLS` and `MASONRY_WALLS` keep their hashed tables).

#### §W-B. The new sheets (game-client `tools/bake`)

8. **`chapel_wall_back_lancet_{x,y}`: the lancet seen from inside [charter default B2].**
   - What it shows: the inner face of a chapel wall, whitewashed and aged like
     `chapel_wall_back_plain_*`, pierced by a pointed window with a splayed reveal (the jambs and
     sill widening into the room) and dark leaded glass. It is unlit and declares no light.
   - Its opening's sill, springing and half-width are the outward lancet's (`LANCET`), so the
     window stands at the same height in both looks.
   - Its frame size and anchor are exactly `chapel_wall_back_plain_*`'s, with two variants by
     seed, as the other back pieces have. Shadow handling is that of the other chapel wall pieces
     (`PAINTED_SHADOW`).
   - `_y` is baked so the material stays whole along both axes. This Change lays it nowhere (W6)
     [v1 pick: the charter names `{x,y}`, and a y-axis lancet is cheap to have ready].
9. **`chapel_crucifix` [charter default B3].**
   - What it shows: one large crucifix of dark wood, with a carved figure, aged: worn and cracked,
     the figure's paint mostly gone.
   - It hangs on a west wall's inner face, facing east (one animation, `e`). Its centre is at the
     height the paintings hang (`hall.js` `painting`, at its scale), and its top is below the back
     wall's top (`WALL_BACK`).
   - **Indicative** size: about 1.0 tile edges across the arms and 1.7 tall, larger than a
     painting.
   - Shadow false, no light.
10. **`chapel_mural`, two variants [charter default B3].**
    - What it shows: faded fresco panels painted on the plaster, in the dark-fantasy register.
      Variant 0 is a robed saint with a halo. Variant 1 is the dead rising from their graves. Both
      have cracked plaster edges and flaked, muted colour from `BARROW`, never bright.
    - They are faced `e` for a west wall's inner face, centred at the paintings' hang height, with
      their top below `WALL_BACK`.
    - **Indicative** size: about 1.6 tile edges across and 1.3 tall.
    - Shadow false, no light.
11. **The atlas [charter default B4].** The three new sheets go in the resident `chapel` group
    (`chapelSheets` / `chapelBuildingSheets` in `catalogue.js`). They are authored in code
    (ADR-0020, ADR-0021), with colours from `BARROW` and the whites mixed toward `vellum`.
    - Every non-chapel atlas keeps its bytes. The `chapel` atlas reflows.
    - `npm run bake -- --check` is clean after the commit.

#### §W-C. The west wall's dressing (game-client `hubInteriors.ts`)

12. **The crucifix and the murals hang behind the Confessor [charter default B3].** They are
    `HUB_INDOOR_DRESSING` entries on the west wall's inner face (x 980), placed the way the Inn's
    west-wall paintings are (2 px off the face).
    - **Indicative:**
      - the crucifix at (982, 1320), footprint 4 × 40 along y, on the dais's line and the aisle's;
      - mural 0 at (982, 1210) and mural 1 at (982, 1430), each 4 × 64, about 110 px either side.
    - The rules, as tests:
      - the crucifix's y lies within 10 px of the dais's centre (y 1320);
      - one mural stands north of the crucifix and one south, their centres 90–130 px from its
        centre along the wall;
      - all three lie inside the west wall's inner span (y 1120–1520), and none overlaps another
        along the wall;
      - each keeps R15 (inside the inner area, off the inner threshold, off every furnishing);
      - on screen, no frame rect of the three (its manifest frame at its point, as drawn) overlaps
        a candelabra's or the lectern's frame rect.
    - Spec-time check by hand (2026-11-24, `worldToScreen`; the candelabra's and lectern's frames
      from the manifest at f9b572d3; the new pieces by their indicative sizes, hung at the
      painting's height): at the indicative spots, the nearest pair is mural 0 over the south candelabra
      (1135, 1390). They share screen columns but are about 80 screen px apart vertically by
      geometry, and the frames' padding uses up some of that, so the test decides. The crucifix
      clears that candelabra's frame by a few screen px across and by about 35 px vertically.
      The altar and the Confessor are clear too, though no rule asks it.
    - R14 is amended: the chapel's indoor dressing is the dais, the lectern, the two candelabra,
      the crucifix and the two murals.
13. **They hide under the roof (R25).** Like all indoor dressing, they are hidden while the
    chapel's roof is on and shown while it is lifted. No new rule: a test proves it for the new
    sheets.

#### §W-D. Bounds

14. **No new light [charter default B4].** None of the three new sheets declares a light. The
    lancets are dark glass, inside and out, and cast no light shaft. The two candelabra stay the
    room's only lights (R15).
15. **Client only [charter default B4].** No server, map, door, furnishing, NPC, golden or wire
    change. `hubTown.golden.json` is untouched.

### User Stories

1. As a player outside the chapel, I want its long south wall to show windows and buttresses in a
   steady rhythm, so that it reads as a church and not a house with scattered windows.
2. As a player stepping inside, I want the long wall I see to show tall pointed windows, so that
   the nave feels like a church.
3. As a player who has walked round it, I want the windows inside to stand where the windows are
   outside, so that the building makes sense.
4. As a player, I want the east wall's windows on both sides of the door, so that the front of the
   chapel is balanced.
5. As a player walking up the aisle, I want a large crucifix on the wall behind the Confessor, so
   that the head of the room reads as an altar end.
6. As a player, I want faded frescoes on either side of the crucifix, so that the chapel feels old
   and grim.
7. As a player, I want the room still dim, lit only by the candelabra, so that the chapel keeps its
   mood.
8. As a player outside, I want none of this showing while the roof is on, so that the roof still
   means something.
9. As the owner, I want the windows' rhythm held by a test, so that a later change to the walls
   can't scatter them again.
10. As a developer, I want the bay rule to touch only the chapel, so that every other building
    draws exactly as before.

### Acceptance Criteria

- [ ] Vitest (W1): planning the chapel with two different seeds gives the same outward kinds on
      every piece, the same inner lancets and the same plain pieces behind the hung dressing; only
      the frame indexes and the open plain-or-pillar choices may change.
- [ ] Vitest (W2): no chapel lancet, inner or outward, on a trimmed piece or on a piece whose span
      holds a post.
- [ ] Vitest (W3): along the south outward face, no two lancets adjoin; each pair of neighbouring
      lancets has exactly one buttress between them; a buttress stands beside the first and the
      last lancet; the rest are plain; each lancet's mirror about x 1270 has a lancet within
      20 px.
- [ ] Vitest (W4): the north inner face's lancets stand at exactly the south outward lancets' x
      values, the same set.
- [ ] Vitest (W5): each east segment carries at least one lancet; no two adjoin; they mirror about
      y 1320 within 20 px.
- [ ] Vitest (W6, W7): no lancet on the west inner face, or on any front (cut-away) piece; the
      west pieces behind the crucifix and the murals are plain.
- [ ] Vitest (W7): the Inn's, the store's and the smithy's planned pieces (sheet and index) are
      the same as before the change, for a fixed seed.
- [ ] The manifest carries `chapel_wall_back_lancet_{x,y}`, framed as
      `chapel_wall_back_plain_{x,y}`; `chapel_crucifix` (`e`); and `chapel_mural` (two variants,
      `e`). All are in the `chapel` group, with no light and with shadow false for the hung pieces.
      Every non-chapel atlas is byte-identical. `npm run bake -- --check` is clean.
- [ ] Vitest (W12): the crucifix and the two murals are in `HUB_INDOOR_DRESSING` on the west
      wall's inner face, under W12's rules; R15 holds; on screen none overlaps a candelabra or the
      lectern.
- [ ] Vitest (W13): they are hidden while the chapel's roof is on and shown while it is lifted.
- [ ] No new light source in the chapel; no file under `game-server/` changes; the golden is
      unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.
- [ ] Nick's browser look passes, or each finding is written back as an amendment or an issue.

### Edge States

- **The cut-away walls show no window from inside.** The south and east walls are cut at
  `WALL_FRONT` (1.1), at the outward lancet's sill (1.05). Seen from inside they are plain, so
  the south exterior's lancets have no inner counterpart drawn on the south wall itself. That is
  correct for a cut-away: the north wall's lancets are the visible half of each bay.
- **The belfry and the wayside cross stand in front of the east wall** ((1635, 1220) and (1635,
  1480)). On screen they may cover part of an east lancet. No rule forbids it. The developer
  prefers bays they leave clear, within W5, and the owner judges at the browser check.
- **The trimmed pieces** (the south and north walls' last half tile, and each east segment's
  last) are always plain, as today.
- **A manifest without the new sheets** (an older checkout of the art against this code). The
  dressing draws nothing (FS-KYPQ9 §A.9), and the north wall's lancet pieces draw the art
  library's placeholder. Accepted, with no fallback code [v1 pick]: the art lands first (the
  drawing slice is blocked by the bake) and ships with the client.
- **No art at all.** The chapel's walls fall back to placeholder walls as before (R23). The bay
  rule still runs, but the placeholders do not show kinds.
- **A player standing at the west wall.** The crucifix and murals have no collision, as with all
  dressing. The player is drawn in front of them, as in front of the Inn's paintings.
- **The roof on.** None of the new pieces shows from outside (W13). The outward lancets are the
  only windows seen from the street.

### Out of Scope

- Stained glass that glows, coloured light, light shafts, or any new light (W14).
- Windows on the cut-away south and east walls indoors, or on the west wall.
- Outward faces of the north and west walls (the camera never sees them, FS-9PN7X §B.2).
- Pilasters matched to the buttresses inside (W4's v1 pick), or any other change to the inner
  faces beyond the lancets and the plain pieces behind the hung dressing.
- Any change to the layout, the dais, the altar, the candelabra, the lectern, the people or their
  lines.
- Any server, map, golden or wire change.
- The talent reset and anything that hints at it (still a later FS).

## Change: The chapel moves to the far left and gains a bell tower
Status: shipped
Date: 2026-11-25
Related ADRs: [ADR-0093](../adr/0093-a-solid-town-structure-with-no-door-is-not-a-building.md) (the bell tower is not a building)

> **Owner request (Nick, 2026-11-25), after the chapel shipped:** the chapel gains a bell tower
> and moves to the ground its graveyard holds; the graveyard moves to a strip along the chapel's
> south wall. Written `--from-thread` with no interview: the charter's decisions M1–M8 (the move)
> and K1–K9 (the tower) are owner-approved, each marked **(charter default Mn / Kn)**. Where the
> charter left a point open the smaller v1 was taken and marked **(v1 pick)** with its reason.
> Agent lane for game-service too, **within the charter's bounds only**: hub map data (the
> buildings' and people's places, one new solid), the map height constant, the golden and their
> tests. Checked `docs/adr/`: ADR-0036 (a building's two looks) and ADR-0070 Decision 5 (free
> pews) are honoured unchanged; ADR-0020 / ADR-0021 govern the new sheet; nothing else constrains
> this.
>
> **The charter's priority when rules compete:** the dev gate and the outdoor people not hidden
> > the chapel at the screen's far left > the graveyard along the south wall.
>
> **Coordinates.** The town is isometric (`render/iso/projection.ts`): world +x runs down-right
> on screen and +y down-left, so `x − y` is screen x and `x + y` screen depth; the map's
> south-west is the screen's far left, and a tall thing hides what stands up-screen of it, toward
> (−x, −y), on its own screen column. Every figure marked **indicative** was checked at spec time
> (2026-11-25, `d500fecb`) by a throwaway script that re-types `hubCover.ts`'s model (`planRoof`,
> `bulkOf`, `hiddenBehind`, the chapel's 73 px ridge allowance) and the keep-out rules K1, K2 and
> K7: all passed. The tests decide; the implementing issue moves a figure where a test needs and
> notes the final numbers.
>
> **What this changes in the work order above:**
> - R1, R22: the map's height (1700) becomes 2000 under the indicative layout (T4).
>   *(Amended 2026-11-25, A5: 2200 as built.)*
> - R4, R12, R14, R17 and W3–W5, W12 of the windows Change: every **indicative** chapel figure
>   moves by one offset; the rules themselves stand (T1).
> - R27 ("screen-left of the chapel"), R28 (the enclosure "about twice the old area", four rows
>   of seven) and R29 (the runs, the gap in the south-east corner): replaced by the strip (T19–T21).
> - R30 (the belfry prop) and R36's `belfry` sheet: removed (T17).
> - R31 (the paths' routing) and R41's as-built point: redrawn (T22, T18).
> - R39: its model gains the tower's bulk, and a new thing it protects, the dev gate (T3, T23).
> - R42: the chapel's sheet list gains `chapel_tower`; the west gable loses its apex (T16, T24).
>
> **Supersedes in part** (each carries a stub
> `## Change: The chapel moves to the far left and gains a bell tower → FS-R4MYX`; their text is
> not edited): FS-29KSH R3, FS-0XMCP R11 and FS-KYPQ9 §A.3 K7 (the hub's size, again);
> FS-P0HSP's facts and §B.5 (the town is 2000 × 2000, drawn at 0.0625); FS-9PN7X §A.1 (a group
> of walls sharing a `house_id` is a building: the tower's one wall is not) and FS-B0H2D R10
> (every hub wall carries a building's `house_id`). FS-BDRTJ is **not** touched: its hub gate
> and arrival stay at (120, 900) and (260, 900).
>
> **Unchanged:** every rule not named above, the chapel's size and relative layout, the eight
> people's names, looks, facings and lines, the lights (R15), every hub coordinate that does not
> belong to the chapel, its people, its graveyard, its paths or its outdoor crosses.
>
> **Vocabulary** (added to both `CONTEXT.md` files with this Change): **bell tower**; *belfry*
> is redefined as the tower's open bell stage and stops naming a prop.
>
> **Amended 2026-11-25** after code review of I-R4MYX-17/18/19, before the branch was merged
> (reason: code review). The review found no code defect; in three places this section and the
> code disagreed and the code is right, so the section now records what is built:
> - **A1 (T5 against T22).** T22's lane runs down the west 70 px of the chapel's old footprint,
>   which T5 forbade. T22 stands as built; T5, its acceptance criterion and an edge state now
>   except that lane.
> - **A2 (T11).** The spec-time arithmetic was wrong: the footprint centre's key draws the tower
>   over the west gable's ridge piece. T11 records the key that is built and the second rule as
>   the test holds it.
> - **A3 (T24, user story 13).** Two bells, not one, and the heights as built. Wherever this
>   section says "the bell" in the tower, read the two. Built; the owner judges at the browser
>   check (I-R4MYX-20).
>
> Each corrected item says *(Amended 2026-11-25, An; was: …)*.
>
> **Amended 2026-11-25** after the owner saw the branch in the browser (reason: owner feedback):
> - **A4 (T24).** "鐘塔是不是要再高一點 被屋頂切到了": the chapel's ridge crossed the bottom of
>   the east belfry opening. The tower is raised 1.7 edges, all of it in the lower shaft, so the
>   whole belfry stage, its string course included, stands above the roof. The belfry stage, the
>   spire and the cross keep their own measures. The footprint, the tower's place and every
>   coordinate are unchanged; no rule of T3, T11 or T23 needed a move.
> - **A5 (T4, T19–T21, T26).** "墓地可以再寬一些 有點窄", then "再寬一倍": the graveyard strip is
>   twice as deep (190 → 380, y 1790–2170), the same 24 stones and pieces spread more loosely
>   over it, and the map grows south to hold it: `HubMapHeight` 2000 → 2200. This supersedes
>   T4's "never more than 2000" (the charter's limit) for this Change, by the owner's word.
>   No existing coordinate outside the strip moves; the mourners move with their graves.

### Summary

The chapel leaves the ground below the square and stands at the screen's far left, in the map's
south-west, where its graveyard lay. Against its west end, on the ridge's line, rises a square
bell tower of the same aged whitewashed limestone: a solid lower stage with one slit window, an
open belfry above it where a dark bell hangs behind pointed openings, and a slate pyramid spire
under a cross, well above the roof's ridge. It is solid: players walk round it, and nobody goes
in. The graveyard is now a walled strip along the outside of the chapel's south wall, a small
walkway between them, with every stone, mound, flower, cross and dead tree it had, and its three
mourners. The trodden path runs from the square down to the east door and on to the graveyard's
gap. The old site is plain ground. The ruined bell frame by the door is gone: the bell hangs in
the tower. The town grows south to make room, and the dev test room's gate stays in plain sight.

### Requirements

Numbered 1–26 below and cited as **T1–T26**, separate from the work order's R1–R42 and the
windows Change's W1–W15.

#### §T-A. Where the chapel stands (game-service map data and constants)

1. **The chapel moves whole (charter default M1).** Its footprint (620 × 440), its east door,
   pews, altar, the Confessor and the four worshippers, and on the client its dais, lectern,
   candelabra, crucifix, murals and window bays all move by **one offset**: every one keeps its
   place relative to the chapel's north-west corner. Nothing inside is rearranged, resized or
   re-faced. The rules that placed them (R3, R5, R12–R15, R17–R19, R23–R26, W1–W13) hold as
   written; their indicative figures follow the offset.
   - **Placement rules**, replacing R4's: the chapel stands in the map's south-west, on the
     ground the graveyard held (x 40–580, y 1020–1520) or south of it under T3; its west wall is
     no more than 240 px from the map's west edge (the tower and a walk round it lie between);
     its centre is screen-left of every other building's (`x − y` the smallest); T3 holds.
   - **Indicative** (offset (−740, +200) from the shipped layout):
     | What | Where |
     |---|---|
     | Chapel footprint | (220, 1300), 620 × 440 (x 220–840, y 1300–1740) |
     | Door gap (east wall) | x 820–840, y 1480–1560 |
     | Ground in front of the door | x 840–920, y 1480–1560 |
     | Pews, north of the aisle | (570, 1370), (640, 1370), (710, 1370), each 20 × 100 |
     | Pews, south of the aisle | (570, 1570), (640, 1570), (710, 1570), each 20 × 100 |
     | Altar | (380, 1480), 30 × 80 |
     | Confessor | (465, 1520) |
     | Penitent, Chandler | (615, 1455), (685, 1455) |
     | Goodwife, Ploughman | (545, 1585), (615, 1585) |
     | Dais (client) | centred (365, 1520): x 300–430, y 1420–1620 |
     | Lectern, candelabra (client) | (450, 1450); (395, 1450) and (395, 1590) |
     | Crucifix, murals (client) | (242, 1520); (242, 1410) and (242, 1630) |
     | Nave lancets (client, W3–W4) | x 320, 400, 480, 560, 640, 720, mirrored about x 530 |
     | East lancets (client, W5) | y 1400 and 1660, mirrored about y 1520 |
     On screen the chapel's centre (530, 1520) lies at screen x −792, where the old graveyard's
     centre lay (−768); the map's leftmost point is −1600 and the spawn 160.
2. **Nothing else in town moves (charter default M6).** The spawn, the gates and their arrivals,
   the dev test room's gate and arrival, the three other buildings with their furnishings and
   people, the function NPCs and all four wandering residents' quarters keep their numbers. The
   Woodcutter's and the Bellringer's quarters stay in the east field (1780–1960 × 1000–1160 and
   1780–1960 × 1240–1400): no rule forces a move (T23 shows R39 holds for them), and moving them
   back toward the square is not asked **(v1 pick: the charter moves a quarter only where a rule
   forces it)**.
3. **The dev test room's gate stays in sight (charter default M8).** No part of the chapel
   (walls, roof, gable crosses) or of the tower is drawn over the dev gate's ground.
   - **The gate's ground:** the gate's point (120, 900), where its label is drawn; every point
     within the gate's range (`GateRange`, 80) of it; its arrival (260, 900); and the straight
     walk between the two, a player wide (`PlayerRadius`, 20, either side). Tested on a grid no
     coarser than 10 px, each point as a body (`NPC_BODY_HALF` either side), by R39's model:
     `hiddenBehind` against the chapel's bulk and the tower's (T23).
   - **Why the chapel stands at y 1300 and not 1020 (indicative arithmetic).** The chapel's roof
     has 6 rows a side, so its ridge is lifted 141.1 + 6 × 27.4 = 305.7 screen px
     (`BAKE.WALL_BACK`, `ROOF_RISE`, × `VPX` 39.19). With the chapel's ridge allowance (73) and
     `ROOF_OVERDRAW` (10) its ridge row is drawn up to 388.7 px, and a screen column falls
     0.8 px per world px, so the row hides ground up to 388.7 / 0.8 = **486 world px** up-screen
     of its north edge (chapel y + 180). The gate ground's southmost point is (120, 980); its
     column meets the ridge row at x = chapel y − 680, inside the roof's span. It is clear only
     when chapel y + 180 − 980 > 486: **chapel y > 1286**. The script, with body halves on the
     10 px grid: y 1290 leaves one point hidden, **y 1300 clears all**. (The north eave is the
     weaker bound: (141.1 + 10) / 0.8 = 189, so chapel y > 1189.)
   - **The tower never meets the gate's columns:** the tower's footprint spans screen columns
     `x − y` −1510 to −1230, the gate's ground −893 to −610. They are 337 world px apart, so no
     height of tower can cover it.
   - **If a test finds the gate's ground covered,** in this order: move the chapel, with its
     tower, graveyard, people, paths and crosses, **south only** until it is clear, inside T4's
     limit; if it is still covered, move the tower to a corner of the chapel where it is clear
     (T6); if it is still covered, stop and escalate. The gate itself never moves.
   - A fixture proves the test can fail: the chapel's bulk 100 px further north reports the
     gate's ground hidden.
4. **The town grows south again (charter default M7).** `HubMapWidth` stays 2000; `HubMapHeight`
   becomes the smallest multiple of 100 that holds the chapel, the tower, the strip and the
   paths: **2000** under the indicative layout (the strip's south wall stands at y 1980), up from
   1700, and **never more than 2000**. A layout that needs more is an escalation, not a bigger
   constant. *(Amended 2026-11-25, A5: **2200** as built. The owner had the strip made twice as
   deep, its south wall at y 2170, and approved growing the map for it: the smallest multiple of
   100 that leaves the 20 px below the strip it had. 2200 is the limit now; more is still an
   escalation.)*
   - No existing coordinate moves for it. The movement clamp follows the constant (`HubBounds`).
   - As R32 found, the code holds no fence and no beyond-edge dressing along the south edge, so
     nothing moves with the edge; a later one follows it.
   - The indicative layout uses the whole 300 px: the chapel cannot stand north of y 1300 (T3)
     and the strip needs the 240 px below its south wall. If a test needs the chapel a little
     further south, the strip tightens (its walkway and its slots' spacing, T20) before the map
     grows; past 2000, escalate.
5. **The old site is plain ground (charter default M4).** Nothing of this FS is left on the
   chapel's old footprint (960–1580 × 1100–1540), in front of its old door (1580–1660 ×
   1280–1360) or along its old paths: no wall, furnishing, person, dressing, graveyard piece or
   path, **but for T22's chapel lane**. The lane continues south from the square's path along
   the old site's west edge: it starts on the footprint's west line (x 960), is its own 70 px
   wide (x 960–1030), and runs from north of the footprint to south of it, on its way to the
   chapel's door and the graveyard. It is the only path that crosses the old footprint; no path
   reaches the old door's front, and R31's four rects and the old door's spur are gone. The
   ground plan lays the town's ground there by itself. Nothing new is placed. The existing
   dressing around it (the crates and the signpost south of the spawn) keeps its places.
   *(Amended 2026-11-25, A1; was: "Nothing of this FS is left on the chapel's old footprint
   (960–1580 × 1100–1540), in front of its old door or along its old paths: no wall, furnishing,
   person, dressing or path." T22's lane `[960, 820, 70, 1100]` contradicted it; T22 is what is
   built, and `hubKeepOut.test.ts` holds the exception.)*

#### §T-B. The bell tower as map data (game-service)

6. **A solid tower against the chapel's west end (charter default K1, K2, K4).** One wall
   entity, square, **about 140 × 140** (130–150 a side), standing **outside** the chapel's
   footprint: its east face on the west wall's outer face (tower x + w = chapel x) and its
   centre on the ridge's line (tower centre y = chapel y + h / 2). **Indicative:** (80, 1450),
   140 × 140 (x 80–220, y 1450–1590). No door gap, no interior, no furnishing, nobody in it.
   - **It is not a town building.** It is not in `hubBuildings`; R2's four buildings stay four,
     and the building tests (door gaps, front-of-door ground, flood fills, the golden's
     buildings) do not see it.
   - **It carries a `house_id` of its own**, shared with no other wall **(v1 pick)**. With the
     chapel's id the client's `housesFrom` would grow the chapel's footprint to take the tower
     in; `uuid.Nil` reaches the client as a non-empty string, which it would read as a house
     too. A fresh id is what a field obstacle already carries (`field_place.go`), and the client
     tells the tower by its rect (T10).
   - Players collide with it as with any wall. It never moves, opens or syncs.
   - Under T3 only, it may stand at a chapel corner instead: still outside the footprint, its
     east face on the west wall's outer face or its south face on the north wall's (so T14's
     first rule holds), still solid.
7. **The server's layout tests hold the tower:**
   - its size, and that it abuts the west wall centred on the ridge's line (or, moved under T3,
     which corner and why, in the test's name);
   - it lies inside the map, with at least `2 × PlayerRadius + 20` (60) of ground between it and
     the map's west edge, and a player-sized walker from the spawn reaches ground on its north,
     west and south sides: nobody is sealed in, and nothing is sealed off;
   - no lane (R5, the 240 px corridors) crosses it; the spawn, every arrival and the dev test
     room's arrival lie outside it; every quarter lies outside it;
   - every outdoor fixed resident stands more than `NPCInteractRange` from it (R20 reads "every
     wall", the tower included).
8. **The golden records the tower.** `hubTown.golden.json` gains the tower's rect (indicative
   key `bellTower`: `x`, `y`, `w`, `h`), written by its Go test with `-update`, never by hand
   (FS-MMA2H R12). The built-hub check proves the hub holds exactly one wall on that rect, with
   a `house_id` no other wall carries.

#### §T-C. Drawing the tower and the moved chapel (game-client)

9. **The mirror follows the golden.** `HUB_SIZE`, `HUB_CHAPEL`, `HUB_FURNISHINGS`,
   `HUB_FIXED_RESIDENTS`, the chapel's indoor dressing, its window bays (`CHAPEL_NAVE_LANCETS`,
   `CHAPEL_EAST_LANCETS`), the chapel's door spur and a new mirror of the tower's rect
   (indicative `HUB_BELL_TOWER`) are each held to `hubTown.golden.json` by a vitest, as R21
   holds them today. The test fixture (`hubTown.fixture.ts`) walls the tower too, so the
   keep-out rule K1 keeps dressing off it and out from under it.
10. **The tower's wall is not a house.** The scene takes the wall standing on the tower's rect
    out before it builds houses: it gets no roof plan, floor, door, building exterior, interior,
    blackout hole or inside test, and it is not drawn as loose wall pieces either. It is drawn
    as one baked prop, `chapel_tower` (T24), on its rect's centre.
    - Without the sheet it draws a placeholder block on its rect, never nothing: it is solid,
      like a furnishing (R24).
    - A wall with a lone `house_id` on any other rect is a house as before: the tower is told by
      its rect, not by standing alone.
11. **Draw order.** The tower sorts so that:
    - a player or NPC standing north or west of it is drawn behind it, one standing south of it
      in front;
    - every chapel piece (wall, post, roof, gable) **that shows over the tower** sorts in front
      of it: every roof piece that meets it does, so the roof's west verge dies into the tower,
      never the other way round. A wall or gable piece that the roof in front covers wholly
      where it meets the tower may sort behind the tower: none of its pixels shows there.
      `bellTowerOrder.test.ts` holds this pixel by pixel from the baked atlas.
    **The key, as built:** the tower sorts 15 key behind its footprint's centre
    (`HUB_BELL_TOWER_SORT`: key 1655 under the indicative layout, the centre's being 1670). That
    is inside the only legal window. Above: a body pressed to the tower's north face at its east
    end, or its west face at its south end, reaches key 1650.9 with its layers and must be drawn
    behind the tower. Below: the west gable's piece against the ridge sorts at 1660 and must be
    drawn over it.
    *(Amended 2026-11-25, A2; was: "every chapel wall, post, roof and gable piece that overlaps
    it on screen is drawn in front of it" and "The key is the developer's (its footprint's
    centre passes both by the spec-time arithmetic); tests hold the two rules." The arithmetic
    was wrong: the centre's key, 1670, draws the tower over the gable piece at 1660; and no key
    puts every overlapping piece in front while keeping a body north of the tower behind it.)*
12. **It never fades (v1 pick).** The tower is a piece of the chapel's exterior for FS-9PN7X
    §E: it takes no occluder fade, and a player it covers shows as the silhouette, through the
    same cover list the roofs use. Reason: the roof beside it never fades, and a church tower
    gone 40% clear over a player would open the building. Other players and NPCs behind it are
    covered, as behind any building.
13. **The tower does not lift, and hides with the street (charter default K4; v1 pick for the
    indoor rule).** It is no part of the roof plan: nothing lifts, tweens or cuts it away, and
    from the street it always stands whole. While the player is inside **any** town building,
    the chapel included, it is hidden with everything else outside that building, by the one
    rule that ships (FS-9PN7X §C.1): it stands outside the chapel's footprint.
    - Reason: indoors, FS-9PN7X §D fills everything outside the building's raised floor rect
      with the canvas's darkest ink. A tower left drawn would show only as a 24 px sliver in the
      blackout's headroom over the west wall. Showing it whole would mean cutting the blackout's
      hole to the tower's outline, a change to the shared blackout the charter's bounds do not
      cover. The owner judges at the browser check; that would be a further Change.
14. **The tower never covers the chapel's interior view (charter default K4).** Two rules, each
    a test:
    - **It stands wholly behind the room.** The tower's footprint lies wholly west of the west
      wall's outer face (tower x + w ≤ chapel x) or wholly north of the north wall's (tower
      y + h ≤ chapel y). A thing covers a point only from further down its screen column, at a
      greater x **and** a greater y; nothing in the tower has both greater than a point of the
      room. So no height of tower can stand in front of the floor, a furnishing, a person, the
      west wall's inner face or what hangs on it.
    - **It is not drawn while the roof is lifted** (T13), so nothing of it shows over the west
      wall or in the blackout's headroom.
15. **No new light (charter default K9).** The tower's sheet declares no light; the bell stage
    is unlit. The candelabra stay the chapel's only lights (R15).
16. **The west gable end is plain where the tower stands (v1 pick).** The chapel's west gable
    lays its plain frame at the apex (frame 0), not the apex frame: no cross and no rose window
    at that end. The east gable keeps both.
    - Reason, by arithmetic: the west gable's centreline is 10 px east of the tower's east face,
      and its apex cross reaches 379 px, between the ridge (306) and the tower's masonry top
      (353). It would be drawn dead centre over the tower's east belfry opening and its bell.
      A church with a west tower carries its cross on the tower.
    - A per-end choice the chapel's look names; every other building's gables are unchanged
      (the town's timber gable has one frame). R39's chapel ridge allowance still derives from
      the east apex.
17. **The belfry prop is removed (charter default K5).** The bell hangs in the tower now.
    - `HUB_BELFRY`, its drawing and its tests go; nothing stands where it stood.
    - The `belfry` sheet leaves the bake catalogue and the manifest, and its model
      (`models/chapel.js#belfry`, with the helpers only it uses) is deleted: no live line claims
      it, so it is dead art, not kept "in case".
    - *Belfry* now names the tower's open bell stage (`CONTEXT.md`). No sheet, constant or file
      keeps the name for the old prop.
    - The Bellringer's and the Confessor's lines stay as written (charter default K6): "the
      tower" in them is the Spire, and there is a bell to climb to again.
18. **The wayside cross follows the door (charter default M6).** It keeps its place relative to
    the door, and so R41's as-built clearance of the doorway: **indicative** (895, 1680), r 20,
    south of the door spur, between the east wall's eave and the path. R41's rules hold.

#### §T-D. The graveyard strip and the paths (game-client dressing; the mourners' points on the server)

19. **The graveyard lies only along the outside of the chapel's south wall (charter default
    M2).** These replace R27's first rule and R28's size:
    - the enclosure's x span lies within the south wall's (chapel x to chapel x + w); every
      piece, wall tile included, stands south of the south wall. **Nothing of it stands west of
      the chapel's west wall, north of its south wall, or east of its east wall;**
    - **a small walkway** parts them: the low wall's north run stands 40–80 px south of the
      south wall's outer face (K1 keeps its tiles off the eave besides);
    - **everything is kept:** 24 headstones (10 intact in at least two shapes, 9 weathered,
      5 broken, the broken ones in the old rows), 3 fresh mounds in the newest rows, flowers at
      6 graves (4 fresh, 2 withered), 2 stone crosses, 3 dead trees, the low broken wall with a
      collapsed stretch on its north side and on its west side, and **one gap** (T22). R28's
      counts test stands;
    - the enclosure may be as small as holds them: R28's "about twice the old area" and its
      four rows of seven no longer apply. Stones still stand at their grave's west end and face
      east, rows oldest in the west;
    - R27's other rules stand: every piece clears K1–K8 (the tower's wall included, T9) and is
      hidden behind nothing (T23); every piece but the wall lies inside the enclosure; no
      piece's footprint comes within 12 px of a mourner; each mourner stands inside the
      enclosure, 40–80 px east of their grave's stone or their mound's head.
20. **The strip's layout (v1 pick for the plan).** **Indicative**, any plan that passes T19
    does:
    - enclosure x 220–840, y 1790–1980 (620 × 190), a 50 px walkway north of it;
    - seven stone lines, oldest west: x 290 (A), 365 (B), 440 (C), 515 (D), 590 (E), 665 (F),
      740 (G, the newest, by the gap); four slots a line at y 1825, 1865, 1905, 1945;
      | Line | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
      |---|---|---|---|---|
      | A | broken | weathered | intact | broken |
      | B | intact | broken | weathered, withered flowers (the Veteran's) | weathered |
      | C | broken | intact | weathered | broken |
      | D | empty: a dead tree | intact | weathered, withered flowers | weathered |
      | E | intact | weathered | intact, fresh flowers | weathered |
      | F | mound | intact, fresh flowers | mound | intact |
      | G | intact | mound, fresh flowers (the Keener's) | weathered | intact, fresh flowers (the Widower's) |
    - stone crosses at (250, 1850) and (250, 1930); dead trees at (250, 1890), (515, 1825) and
      (808, 1816);
    - *(Amended 2026-11-25, A5; the figures above and the runs' table below stand as first
      built.)* **As built, twice as deep:** enclosure x 220–840, y 1790–2170 (620 × 380), the
      50 px walkway kept; the seven lines' x unchanged; the four slots at y 1850, 1940, 2025,
      2115 (85–90 apart, was 40); the table of graves unchanged; stone crosses at (250, 1880)
      and (250, 2080); dead trees at (250, 1980), (515, 1850) and (808, 1816); the runs: north
      as below; west (220, 1790) y 170 and (220, 2000) y 170, collapsed between (y 1960–2000);
      south (220, 2170) x 620; east (840, 1790) y 50 and (840, 1920) y 250. The gap (y
      1840–1920) and the graveyard spur do not move.
    - the low wall's runs:
      | Run | From | Along | Length |
      |---|---|---|---|
      | north, west part | (220, 1790) | x | 240 |
      | north, east part (collapsed between, x 460–520) | (520, 1790) | x | 320 |
      | west, north part | (220, 1790) | y | 70 |
      | west, south part (collapsed between, y 1860–1900) | (220, 1900) | y | 80 |
      | south | (220, 1980) | x | 620 |
      | east, north part | (840, 1790) | y | 50 |
      | east, south part | (840, 1920) | y | 60 |
      The east side stands open between them (y 1840–1920): **the gap, facing the path**.
21. **The mourners follow the graveyard (charter default M6).** Server points, names, looks and
    facings (west) unchanged; R20's rules hold (each more than `NPCInteractRange` from every
    wall, the tower's included, `NPCInteractRange` + 40 from every function NPC, outside every
    lane). **Indicative:** the Keener (805, 1865), the Widower (800, 1945), the Veteran
    (411, 1905). Under the indicative layout each stands 125 px or more from the chapel's south
    wall, 15 px or more from the nearest piece, and 46–65 px east of their grave's head.
    *(Amended 2026-11-25, A5:* **as built** *the Keener (805, 1940), the Widower (800, 2115),
    the Veteran (411, 2025), each at the same grave, moved south with its slot. The Keener and
    the Widower now stand 175 px apart, so no point is in talk range of both.)*
22. **The paths are redrawn (charter default M5).** R31's rules stand (the lane joins the
    existing paths; the door spur runs from the sill to the lane; a spur runs from the lane to
    the graveyard's gap; no path crosses a room's floor; every outdoor spot still clears K1–K8).
    The four rects of R31's chapel way go, the east arm's extension among them: nothing leads to
    the old site. **Indicative:**
    | Rect [x, y, w, h] | What |
    |---|---|
    | [960, 820, 70, 1100] | the chapel lane, south from the foot of the square's own path (`[940, 500, 130, 320]`), past the spawn, to the graveyard spur |
    | [840, 1480, 120, 80] | the chapel's door spur, from its sill east to the lane |
    | [840, 1855, 120, 50] | the graveyard spur, from the lane west to the gap in the strip's east side |
    The lane's x 960–1030 clears the crates and the signpost south of the spawn (the nearest,
    the crate at (1050, 910), by 6 px).

#### §T-E. Nothing outdoors is hidden (R39, extended to the tower)

23. **R39 holds against the tower too (charter default K7).** Everything R39 covers (the Elder,
    the mourners, every point of every quarter, every graveyard piece and wall tile), and now
    the dev gate's ground (T3), is hidden behind neither the chapel's bulk nor the tower's.
    - **The tower's bulk:** its footprint raised to the top of what is drawn there. v1 is a box
      to the sheet's drawn top above its origin (a named constant, held to the manifest's frame
      by a test, as the roofs' allowances are); a model that follows the spire is the
      developer's call if a test ever needs the room, so long as a test holds the drawn pixels
      under it. Indicative top: about 530 screen px.
    - **Indicative arithmetic.** The chapel's bulk spans screen columns `x − y` −1550 to −430
      and the tower's −1510 to −1230. The Elder stands on column 460; the quarters span
      −200 to 180 (Cottar), 500 to 960 (Herbwife), 620 to 960 (Woodcutter) and 380 to 720
      (Bellringer). None shares a column with either, so neither can cover them at any height.
      The strip and the mourners stand south of the chapel's south eave (y ≥ 1782 against the
      roof's edge at 1760) and of the tower's south face (1590): in front of both, never behind.
    - **What the tower does hide:** a pocket of ground west and north-west of it, to the map's
      edge (x 0–210, y 1230–1580 under the box model). Nothing stands there, and no dressing may
      (the test covers the graveyard; a player there shows as the silhouette, T12).
    - Tested client-side in the pure module, with a fixture that fails: a point just north-west
      of the tower is reported hidden.

#### §T-F. Art (game-client bake)

24. **`chapel_tower`, baked from code (charter default K2, K3; ADR-0020, ADR-0021).** One prop
    sheet, one frame, in the resident `chapel` group, framed round a 140 × 140 footprint with
    its anchor on the footprint's centre; colours from `BARROW`, the whites mixed toward
    `vellum`, never pure white; no light.
    - **Material:** the chapel's aged whitewashed limestone, from the same material code as the
      `chapel_` walls (grime streaks, moss at the foot, patches where the lime fell away), so
      tower and nave read as one building.
    - **Lower stage:** a solid wall from the ground to the belfry's floor, with **one**
      slit lancet, on the south face **(v1 pick: one, and on the face that stands free; the east
      face's lower stage is behind the chapel's roof, and the north and west faces are never
      seen)**. A string course parts the stages.
    - **Upper stage, the belfry:** open, a pointed opening on each face the camera sees (south
      and east), and **two dark bronze bells, one hung behind each of the two openings**. The
      camera looks down the footprint's diagonal, so what shows in the middle of an opening
      stands as far to the side as it stands back: a single bell on the tower's axis shows
      through neither opening, only behind the corner between them. Built; the owner judges at
      the browser check. *(Amended 2026-11-25, A3; was: "a **dark bronze bell** seen hanging
      inside through them".)*
    - **Spire:** a slate pyramid, the chapel roof's slate, on a small eave, with a cross on its
      apex.
    - **Heights**, in tile edges (`BAKE.WALL_BACK` is 3.6; the chapel's ridge stands at 7.8 and
      its east gable's cross tops out at 9.7), each a test on the model or the frame:
      - the masonry's top, at the spire's eave, is **2.5 × `WALL_BACK` = 9.0**, give or take
        half an edge **(v1 pick for what "about 2.5× the wall height" measures: the stonework.
        The whole tower cannot be 9.0 and stand above a 9.7 cross)**;
      - each belfry opening's upper half, and the bell's, stand above the chapel's ridge (7.8):
        indicative sill 7.0, apex 8.7, the bell from 7.6 to 8.5;
      - the spire's cross tops out at least 2.5 edges above the east gable's cross: indicative
        apex 12.4, cross top 13.2 (about 517 screen px over the ground).
      - **As built** *(Amended 2026-11-25, A3; the indicative figures above stand as the
        spec-time estimate)*: the masonry's top 9.3 edges (inside 9.0 ± 0.5); the belfry's sill
        7.0; each bell from 7.46 to 8.22; the spire's apex 12.5; the cross's top about 13.4. The
        sheet's drawn top is 533 screen px above its origin, which is `BELL_TOWER_TOP` (T23),
        tied to the manifest's frame by a test. The owner judges the height at the browser
        check.
      - **Raised** *(Amended 2026-11-25, A4; was: the as-built figures above, and the first
        two rules)*: the owner found the roof cutting the belfry. The whole belfry stage now
        stands above the ridge (7.8): the string course from 8.14 to 8.32, the belfry's sill
        8.7, the openings' apex about 10.4, each bell from 9.16 to 9.92, the masonry's top
        **11.0** (about 3 × `WALL_BACK`, give or take half an edge; no longer 2.5 ×), the
        spire's apex 14.2, the cross's top about 15.1. The 1.7 edges are the lower shaft's; the
        slit lancet stands 0.85 higher (sill 3.85). The frame is 234 × 661 with its anchor at
        (0.5, 0.9077): its drawn top is **600** screen px above its origin, which is
        `BELL_TOWER_TOP`. The tests now ask that each opening's sill, the string course under
        it and each bell's lip stand at least 0.3 above the ridge.
    - **No baked ground shadow (v1 pick):** a tower this tall would paint its shadow across the
      chapel's roof and the ground north of it from inside one sprite.
    - Dark fantasy, weathered: the spire's slates slipped in places, the cross a little off
      true, as the old belfry's was.
25. **The atlas.** `chapel_tower` joins the `chapel` group and `belfry` leaves it (T17); the
    `chapel` atlas reflows. Every other atlas keeps its bytes. `npm run bake -- --check` is
    clean after the commit. No contact-sheet gate (R38): the owner looks in the browser.

#### §T-G. The minimap, and the bounds

26. **The minimap and the client's size follow (charter default K8, M7).**
    - `HUB_SIZE` is 2000 × `HubMapHeight`, held to the golden's `mapSize` (R22). The ground, the
      camera's reach, the blackout's reach and K7 follow it by themselves.
    - The town minimap's scale follows R22's formula, 0.0833 × 3000 / (2000 + height):
      **0.0625** at 2000 (it was 0.0676), so the map shrinks a little more. *(Amended
      2026-11-25, A5: **0.0595** at 2200, 0.0833 × 3000 / 4200.)*
    - The minimap shows the chapel at its new place, its door notched on its east side, and the
      **tower's block** solid in the walls' ink against its west side, with no notch. A test
      proves both.
    - **Bounds (charter).** game-client (bake, drawing, minimap) and game-service (hub map
      collision, the chapel's and people's places, the map height). The hub's state gains one
      wall, in the shape every wall already has: no proto, WS message, `WallState` or `NPCState`
      field, DB, gateway or other service changes. If one looks needed, stop and escalate.

### User Stories

1. As a player in the square, I want to see a church with a bell tower far to my left, so that
   the town has a landmark I can steer by.
2. As a player, I want a trodden path from the square to the chapel's door, so that I find it
   in its new place without hunting.
3. As a player, I want the chapel's room exactly as I knew it, so that only its place changed.
4. As a player, I want the tower to rise clearly over the chapel's roof, with a bell in its open
   top, so that it reads as a bell tower and not a chimney.
5. As a player, I want to walk round the tower and bump into it, so that it is a real thing in
   the town.
6. As a player inside the chapel, I want the same clear view of the nave as before, so that the
   tower costs me nothing indoors.
7. As a player, I want the graveyard beside the chapel's long wall, with a path to its gap, so
   that the dead lie by their church.
8. As a player, I want every grave, flower and mourner still there, so that nothing I knew of
   the graveyard was lost in the move.
9. As a player, I want never to find a mourner, the Elder or a wandering townsperson drawn
   hidden behind the chapel or its tower, so that I can see who is there.
10. As a player, I want the minimap to show the chapel and its tower where they stand, so that
    the map matches the town.
11. As a player, I want the ground where the chapel stood to be plain, so that nothing there
    looks half-removed.
12. As a developer in a dev build, I want the test room's gate and its label in plain sight, so
    that I can still find it and walk in.
13. As the owner, I want the bells in the tower and no bell frame by the door, so that the
    chapel's bells hang in one place. *(Amended 2026-11-25, A3; was: "I want the bell in the
    tower and no second bell frame by the door, so that the chapel has one bell." Two bells
    hang in the belfry, one behind each seen opening, T24; the owner judges at the browser
    check.)*
14. As a developer, I want the gate's and the people's visibility held by tests with fixtures
    that fail, so that a later move of the chapel cannot bury them unnoticed.
15. As a developer, I want the tower's rect in the golden, so that a server move the client
    missed fails at review.

### Acceptance Criteria

- [ ] `HubMapHeight` is the smallest multiple of 100 that holds the layout and at most 2000
      (2000 under the indicative one) *(Amended 2026-11-25, A5: at most 2200, and 2200 as
      built)*; `HubMapWidth` 2000; the client's `HUB_SIZE` equals the
      golden's `mapSize`.
- [ ] Go test: the chapel is 620 × 440 with its east door; its west wall is at most 240 px from
      the map's west edge; its centre's `x − y` is the smallest of the four buildings'; every
      furnishing and every indoor resident keeps its offset from the chapel's north-west corner
      (the shipped layout's); R5, R12, R13, R19 pass unchanged.
- [ ] Go test: no hub coordinate changed but the chapel's, its five indoor people's, the three
      mourners' and the map's height: the spawn, gates, arrivals, three other buildings, function
      NPCs and four quarters are as before.
- [ ] Go test (T6, T7): the tower is one wall, 130–150 a side, outside the chapel's footprint,
      its east face on the west wall's outer face, centred on the ridge's line; it is in no
      building's wall group and the hub still has four buildings; at least 60 px of ground lies
      between it and the map's west edge; a player-sized walker from the spawn reaches its
      north, west and south sides; no lane crosses it; the spawn, arrivals and quarters lie
      outside it.
- [ ] Go test (T21): exactly the three mourners stand outdoors, each passing R20 against every
      wall, the tower's included.
- [ ] `hubTown.golden.json` carries the tower's rect, the moved chapel, its furnishings, the
      thirteen fixed residents and the new `mapSize`, rewritten by `-update`; the built hub
      holds one wall on the tower's rect with a `house_id` no other wall carries.
- [ ] Vitest (T9): the client's mirrors (the chapel, furnishings, fixed residents with facings,
      indoor dressing, window bays, door spur, the tower's rect) match the golden; W2–W6 and
      W12 pass at the new place.
- [ ] Vitest (T3): no point of the dev gate's ground (its range, its arrival, the walk between;
      10 px grid, as bodies) is hidden behind the chapel's bulk or the tower's; with the chapel's
      bulk 100 px further north the same test reports it hidden.
- [ ] Vitest (T23): no outdoor fixed resident, outdoor function NPC, point of any quarter, or
      graveyard piece or wall tile is hidden behind the chapel or the tower; a point just
      north-west of the tower is reported hidden; the tower's drawn pixels lie under its bulk,
      and the bulk's top equals the manifest frame's.
- [ ] Vitest (T10): the wall on the tower's rect makes no house (no roof, floor, door, interior,
      inside test) and no loose wall pieces; it draws `chapel_tower` at its rect's centre, or a
      placeholder block without the sheet; a lone-id wall on another rect is still a house.
- [ ] Vitest (T11–T14): a body north or west of the tower sorts behind it and one south of it in
      front; it sorts by `HUB_BELL_TOWER_SORT`; every roof piece that meets it on screen sorts
      in front of it, and so does every chapel wall, post and gable piece that shows over it (a
      piece sorting behind it shows no pixel on it, by the baked atlas) *(Amended 2026-11-25,
      A2; was: "every chapel wall, roof and gable piece overlapping it on screen sorts in front
      of it")*; it is in the silhouette's cover and not in the occluders; it is hidden while the
      player stands in any building and shown on the street; its footprint lies wholly west of
      the chapel's west wall's outer face (or wholly north of its north wall's).
- [ ] Vitest (T16): the chapel's west gable lays frame 0 at its apex and its east gable the apex
      frame; the Inn's, the store's and the smithy's gable plans are unchanged.
- [ ] Vitest (T17, T18): no `belfry` spot, sheet name or draw call remains; the wayside cross
      passes R41 by the new door.
- [ ] Vitest (T19–T21): every graveyard piece and wall tile lies within the south wall's x span
      and south of the south wall; the low wall's north run stands 40–80 px south of it; R28's
      counts hold (24 stones: 10 / 9 / 5; 3 mounds; flowers 4 fresh, 2 withered; 2 crosses;
      3 dead trees); every piece clears K1–K8 against the four buildings and the tower; every
      piece but the wall lies in the enclosure; none within 12 px of a mourner; each mourner
      40–80 px east of their grave's head; the wall has one gap.
- [ ] Vitest (T22, T5): the lane joins the square's path; the door spur runs from the sill to
      the lane; the graveyard spur from the lane to the gap; no path crosses a room's floor;
      every outdoor spot clears K1–K8; R31's four rects and the old door's spur are gone; no
      path crosses the old door's front; the only path crossing the old footprint is the chapel
      lane, which starts on its west line and runs from north of it to south of it; no dressing
      spot, graveyard piece, wall tile or cross of this FS lies on the old footprint, the old
      door's front or the old paths. *(Amended 2026-11-25, A1; was: "no path rect, dressing
      spot or graveyard piece of this FS lies on the old site or its old paths".)*
- [ ] Vitest (T26): the town minimap is drawn at 0.0625 for a 2000 × 2000 town *(Amended
      2026-11-25, A5: 0.0595 for the 2000 × 2200 town)*; it shows the
      chapel with its east notch and the tower's block against its west side, without a notch.
- [ ] The manifest carries `chapel_tower` (one frame, the `chapel` group, no light, no baked
      shadow, framed round 140 × 140 with its anchor on the centre) and no `belfry`; the model's
      heights pass T24 (masonry top 9.0 ± 0.5 edges; the openings' and the bell's upper halves
      above 7.8, a bell behind each of the two openings *(Amended 2026-11-25, A3)*; the cross's top at least 2.5 edges over the east gable's) *(Amended 2026-11-25, A4: masonry top 11.0 ± 0.5; the openings, the string course under them and the bells wholly above 7.8)*; every non-chapel
      atlas is byte-identical; `npm run bake -- --check` is clean.
- [ ] No proto, WS message, `WallState` or `NPCState` field, DB or gateway change; no file
      outside `game-server/game-service` and `game-client` changes but these records.
- [ ] `go test ./...` and `make lint` (game-service); `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` (game-client) pass.
- [ ] Nick's browser look passes, or each finding is written back as an amendment or an issue.

### Edge States

- **A player behind the tower** (west or north-west of it, in its pocket). The tower covers
  them and their silhouette shows through, as behind any building (T12). The pocket is open at
  both ends: 80 px between the tower and the map's edge under the indicative layout.
- **A player inside the chapel.** The roof is lifted and the tower is hidden with the street
  (T13); the west wall, the crucifix and the murals show exactly as today.
- **A player in the chapel's door gap.** Inside, as today (edges inclusive): the roof and the
  tower are hidden from the first step.
- **A player on the walkway** between the south wall and the strip. In front of the chapel,
  never covered; the low wall's north run and a dead tree may stand in front of them, the tree
  fading as tall dressing does.
- **Tall graveyard pieces in front of the south wall.** The strip's crosses and dead trees
  stand in front of the south wall's lancets and may cover part of one. No rule forbids it; the
  indicative plan keeps them at the strip's ends and one mid-row. The owner judges.
- **The chapel's hashed details change.** The open plain-or-pillar choices and every piece's
  variant frame are hashed by position (`tileHash`), so the moved chapel's walls differ in small
  ways from the shipped one's. The fixed bays (W1–W6) do not.
- **The east wall's north lancet is clear now.** The belfry stood in front of it (the windows
  Change's edge state); only the wayside cross stands by the door.
- **The lane on the old site's west edge** *(Amended 2026-11-25, A1; new edge state)*. A player
  walking south from the spawn follows trodden ground down the west 70 px of where the chapel
  stood (T5, T22). The rest of the old site is plain ground with no path to it. The owner judges
  at the browser check whether the lane reads as passing by or as leading there.
- **The old south-west yard** (the stall at (630, 950), the fence at y 950, the hay cart, the
  woodpile). All stand clear of the chapel's bulk: the y 1300 the gate needs clears them too.
- **A client older than the server's map.** It draws the tower's wall as a small timber house
  with a roof, the chapel in timber at its new place (its footprint check misses) and the
  graveyard where it used to be, and its ground stops at y 1700. The vitest mirror catches the
  drift before merge; a deployed client and server ship together.
- **Client without the tower's art.** A placeholder block on the tower's rect (T10); the
  minimap still shows its block.
- **A manifest that still has `belfry`** (older art, newer code). Nothing draws it.
- **Production builds.** The dev gate does not exist there; T3 still holds the ground clear,
  and costs nothing.
- **Two players either side of the tower.** Player collision is off in the hub (FS-X2F2H); the
  tower blocks both alike.
- **Hub tick cost.** One more wall for the movement system to test; no new NPC.

### Out of Scope

- An enterable tower, stairs, a door in it, or anything inside it (charter).
- A bell that rings, swings or sounds; any sound (charter).
- Raising or restyling any other building (charter).
- A tower that stays in view while the player is indoors (T13): it needs the blackout's hole
  cut to the tower's outline, a change to FS-9PN7X §D's shared geometry.
- A lit belfry, a lantern, or any new light (T15).
- Moving the Woodcutter's or the Bellringer's quarter back toward the square, or toward the
  tower (T2); any new line for anyone (K6).
- New dressing on the old site, new south-edge fences or beyond-edge dressing (T4, T5).
- Collision for any graveyard piece or the low wall (R27 stands: dressing).
- Moving, restyling or re-labelling the dev test room's gate (FS-BDRTJ is untouched).
- A general "solid prop" system: the tower is one wall the client knows by its rect.
- Any proto, WS message, wire field, DB or gateway change, and any other service.
