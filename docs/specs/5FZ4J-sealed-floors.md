# FS-5FZ4J: Sealed floors

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" (sealed stairs · floor traps · hidden rooms behind secret doors · healing fountains and the hallowed altar); `game-client/SPECIFICATION.md` "### Escape run" (floor seals · traps shown and sprung · secret doors and hidden rooms · healing fountains and the hallowed altar) → this FS · Also the change FS for: [FS-F6F88](F6F88-multi-floor-delves.md) (no escape door or switch on floor 1), [FS-KE075](KE075-floor-1-dungeon.md) (stairs placement and branching), [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) (fewer monsters, ambushes), [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (hidden rooms off the minimap); each carries `## Change: Sealed floors → FS-5FZ4J` · Siblings (same scoping session, 2026-11-25): [FS-4EC7Z](4EC7Z-dungeon-encounters.md) (encounters), [FS-9JV5K](9JV5K-wandering-merchant.md) (the merchant, the third respite), [FS-X2CMM](X2CMM-class-books.md) (class books, whose pages are the shortcuts through these floors) · Related: [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (height 3–10, server-only), [FS-MQYEX](MQYEX-timed-container-opening.md) (timed interacts), [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) (the altar model reused), [FS-9K8EZ](9K8EZ-die-by-choice.md) (the way off floor 1) · Related ADRs: [ADR-0092](../adr/0092-a-floors-way-up-never-needs-a-class-a-book-page-or-a-second-delver.md) (recorded with this FS), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (the floor map, the per-recipient cut), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) (dungeon population by room and role), [ADR-0062](../adr/0062-monsters-path-on-the-floor-cell-grid-with-a-star.md) (monster paths), [ADR-0035](../adr/0035-a-party-is-the-universal-instance-roster-ephemeral-and-locked-inside.md) (a run's roster is its party), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from tokens only)

> Promoted `--from-thread` on 2026-11-25 from the scope-it session's raw notes. Owner decisions
> are marked **(owner)**; defaults the owner approved under the 2026-11-25 charter are marked
> **(charter default)** with their reason; anything the notes left open and this promotion settled
> is marked **(promotion default)** with its reason, chosen as the smaller v1.

## Summary

Every Spire floor's stairs are **sealed**. The stairs stand in a dead-end room at the far end of
the floor behind a shut **gate**, and the floor rolls a **seal**, a puzzle worked across the rest
of the floor (levers pulled in an order, plates held down with stone blocks, a key behind a secret
door, a chasm crossed by a spike-lined ledge, braziers lit against a clock), that opens it. Floors
get fewer monsters but more trouble: **traps** that show only up close, **poison**, **ambushes**
woken by working the floor, and **hidden rooms** behind cracked walls that a delver **searches**
open. Two **respites** ease the climb: a **healing fountain** with a shared, finite pool, and a
rare **hallowed altar** whose prayer **blesses** the party for the rest of the delve. Floor 1 loses
its escape door and switch, so it cannot be farmed. Every seal can be broken by one living delver
of any class with no book page (ADR-0092).

## Requirements

Numbers are tunables named in one place (`internal/game` tuning beside the other spawn rates),
so a local build can force a seal kind, a fountain or the altar for testing, as FS-3103M R5 lets a
developer force a tome.

### §A. The way up on a sealed floor (game-service, `internal/levelgen` and the floor build)

1. **Every Spire dungeon floor is sealed** (owner): every floor with stairs (every floor but the
   top, FS-M8CSE) has a seal, and its stairs cannot be climbed until the seal is broken. The top
   floor has no stairs and no seal; it keeps its boss and its escape door. A floor that falls back
   to a floor of buildings (FS-KE075 R17) has no seal, no traps, no hidden rooms and no respites,
   with a warning in the log (promotion default: the fallback is already rare and has no rooms).
   **Amended 2026-11-25 (code review):** such a fallback floor keeps today's escape door and switch
   even on floor 1 (an exception to R6): with no seal and no rooms it must never strand a party.
2. **The stairs room is a dead end** (owner-approved proposal): it is entered through exactly one
   corridor, its **gate corridor**, and with that corridor's **gate** shut no walkable path from
   the start room reaches it. Of the rooms that satisfy this, the stairs room is the one at the
   greatest walk distance from the start room.
3. **No loop touches the stairs room or a hidden room** (owner-approved proposal: fewer loops near
   the stairs): the generator's extra connections never join either. The extra-connection share
   drops from 0.2 to **0.1** of the rooms (promotion default: more dead-end side branches for traps
   and secret doors, as the owner asked).
4. **The gate** is a shut barrier one cell thick across the gate corridor's full width, on the
   corridor cells next to the stairs room's doorway. While shut it blocks every body (delvers,
   allies, monsters) and is unwalkable to monster paths (ADR-0062). It opens when the floor's last
   gate-holding seal breaks (R13) and stays open. A floor whose only seal is a Chasm has no gate
   (the chasm is its barrier, §E).
5. **Seal pieces stand off the stairs' branch** (owner-approved proposal): no seal piece, mural or
   ambush is placed in the stairs room (a Chasm's bridge lever is the one exception, §E) or the
   start room, and a seal's pieces stand in different rooms from one another where the kind says
   so, so a party crosses the floor at least twice.
6. **No escape door and no switch on floor 1** (owner): floor 1's build places neither, and its
   room roles have none. On floor 1 a delver climbs or dies by choice (FS-9K8EZ). Floors 2+ keep
   their escape door and switch as today.
7. **The escape door sits far from the stairs on floors 2+** (owner-approved proposal): the escape
   door's room is drawn from the rooms at or past the median walk distance from the start, as
   today, choosing the one farthest by walk from the stairs room. The switch keeps today's rule
   among the remaining far rooms. **A seal never blocks the escape door or the switch** (owner):
   neither stands in the stairs room or a hidden room.
8. **The generator proves the shape.** A layout that cannot meet R2–R7 for the floor's seal and
   hidden-room counts fails validation and the generator retries, as it does today; the 1 000-seed
   property test is extended to assert R2–R7 and §F R33 on every seed.

### §B. Seals (game-service)

9. **One seal a floor, two chained high up** (charter default: complexity rises with the floor):
   - floors 1–3: one seal drawn from {Lever Order, Weighted Plates, Hidden Key};
   - floors 4–7: one seal drawn from all five;
   - floors 8–10: two **chained** seals of different kinds. The first is drawn from {Lever Order,
     Weighted Plates, Hidden Key, Braziers}, the second from all five but the first's kind. The
     second's pieces appear on the floor (are created, and so sent) only on the tick the first
     breaks.

   Kinds are drawn uniformly from the allowed set, from the session's spawn source, so a seeded
   run builds the same seals.
10. **Solvable by one** (owner, ADR-0092): every seal kind has a way one living delver of any class
    can take with no book page, as each kind below states. A kind that would need two bodies at
    once does not roll when one delver is alive at the floor's build. (No v1 kind needs two
    bodies, so in v1 this rule removes nothing; it is held by a test so a later kind cannot
    break it.)
11. **A seal is broken once, for the whole party, and stays broken.** Breaking it is announced by
    the state (§I R48), not a reply.
12. **Sealed stairs refuse.** An interact on the stairs while any seal of the floor is unbroken is
    refused with reason `stairs_sealed`, and nothing else happens. (With a gate, a delver cannot
    reach them; the refusal covers a Chasm floor and any path a later page opens.)
13. **The gate opens with the last gate-holding seal.** Every seal but a Chasm holds the gate:
    the gate opens on the tick the last such seal of the floor breaks. An interact on a shut gate
    is refused with reason `gate_sealed`, except R22 (the key).
14. **Ambushes** (charter default): working a seal piece the first time wakes an **ambush**: a
    pack of 2–4 monsters (at most one brute, the rest fodder, of the floor's pool, FS-C8VM7, at
    the floor's monster level) spawned in the nearest room by walk to the piece that is not the
    piece's own room, the start room, the stairs room, a respite's room or a hidden room, at
    spots at least `MonsterDelverExclusion` from every delver, and aggroed on the delver who woke
    it. Which works wake one is per kind below. Each piece wakes at most one ambush in a floor's
    life. Ambush monsters are extra to the floor's count (§D R31) and give experience and drops as
    the floor's other monsters do. A floor with no room that qualifies spawns the pack in the
    piece's own room, at the farthest qualifying spot.

### §C. Lever Order, Weighted Plates and stone blocks (game-service)

15. **Lever Order** (owner-approved proposal): 3 levers on floors 1–3, 3 or 4 on floors 4+, each
    in its own room, plus one **mural** in another room. Each lever bears a **glyph**, drawn
    without repeats from {crow, key, flame, eye, serpent, moon}; the order is a random permutation
    of the floor's levers. An interact on the mural is answered with reason `mural` and the glyphs
    in order (promotion default: the hint is the order itself, written as a lore line by the
    client). The mural is a lore piece, not a seal piece: it wakes nothing.
16. **Pulling a lever** (interact, in range, any in-play delver) pulls it down. A lever pulled in
    its turn stays down. A lever pulled out of turn fires a **dart volley** at the puller (one
    dart wall hit, §D R26) and every lever of the seal springs back up: the order starts again.
    The last lever pulled in its turn breaks the seal. A lever already down refuses quietly
    (reason `lever_down`). Each lever wakes an ambush the first time it is pulled down in its turn
    (charter default: a wrong order hurts already). One delver can walk the floor and pull each
    in turn: solvable by one.
17. **Weighted Plates** (owner-approved proposal): 2 plates on floors 1–3, 2 or 3 on floors 4+,
    all in one room of at least 6×5 cells that is not the start, stairs or a respite's room, and
    holds nothing else that stands on the ground (no container, fixture or monster placed at the
    build). Each plate covers one cell. The room holds **as many stone blocks as plates**
    (owner, solo rule). The seal breaks on the first tick every plate is **held** at once.
18. **A plate is held** while a delver's body centre, a hired ally's (FS-4EC7Z) or a stone block
    stands on its cell. Monsters never hold a plate. The first tick any plate of the seal is
    first held wakes the seal's one ambush.
19. **Stone blocks** (charter default: the smallest new movement): a block fills one cell and
    blocks every body as a wall does. A delver walking against one face of a block along an axis
    for the time it takes them to walk half a cell (half walk speed, so 80 px at their speed / 2)
    **pushes** it one cell that way; it slides over that time. A push is refused (the block does
    not move, the delver is blocked) when the cell beyond is rock, a shell wall, a shut gate or
    door, a secret door, a pit, another block, a body, or a plate a block already covers. Monsters
    never push them. **Amended 2026-11-25 (code review, ADR-0092):** the original "blocks never
    move on their own" let a solo player brick the seal by pushing blocks against a wall (a block
    on the border row can never be pushed off it again), so two rules are added (promotion
    default, recorded as a changed default): a push that would take a block **out of the plates
    room's cells** is refused, and a block that is not on a plate, has not moved for **20 s** and
    has no delver within 2 cells of it **slides back to its start cell** (at the push speed) when
    that cell is free.
20. **Plates and blocks are placed solvably.** Every plate and block stands on a cell at least one
    cell from the room's walls and doorways, no two on one cell, no block on a plate. The build
    checks, by a search over pushes, that every plate can be covered by some block; a placement
    that fails is redrawn, and a room that never passes is passed over for another. The property
    test asserts the check on every seed.

### §D. Monsters, traps and poison (game-service)

21. **Fewer monsters** (owner; numbers are the proposal): a sealed dungeon floor holds **15–25**
    monsters besides a boss (`DungeonMonstersMin`/`Max`, from 30–45), by today's top-up and trim,
    **extended** (promotion default, 2026-11-25: hall packs and treasure guards alone reach 8–40, so
    today's trim cannot hold 25): once ordinary rooms and corridors are trimmed, a floor still over
    the max trims hall-pack fodder (never a pack's brute), then treasure-guard packs down to one
    elite each, farthest from the start first. A guarded chest keeps at least one guard.
    A respite's room (the fountain's, §G; the merchant's, FS-9JV5K) holds none. Ambushes (R14) are
    on top. "The Spire stirs" (patrols down the stairs) is not v1.
22. **Monster paths respect barriers** (ADR-0062): a shut gate, a shut secret door, a pit and a
    stone block are unwalkable on the floor's monster navigation grid while they stand; opening
    one, lowering the bridge or pushing a block updates the grid on that tick.
23. **Trap count** (charter default: the owner-approved 3-to-8 range): `min(3 + floor(depth / 2),
    8)` traps a floor: 3 on floor 1, 8 from floor 10. Placed on walkable cells that are not in the
    start room, not a doorway, not a seal piece's or fixture's cell, not within 2 cells of the
    party's start spots, and at least 3 cells from each other; at least half of them in a room or
    corridor segment off the walk path from the start to the stairs room's gate, where the floor
    has such ground (owner-approved proposal: dead-end side branches hold the traps).
24. **Trap kinds** (charter default: the smaller v1): **spike plate**, **dart wall**, **fire jet**,
    **tripwire**, **gas vent**, each drawn uniformly per trap. The crushing-ceiling room is
    deferred (Heave's "hold it open" waits for it, FS-X2CMM).
25. **A trap fires when a body steps on it.** A delver's body centre (or a hired ally's, FS-4EC7Z)
    entering the trap's cell fires an armed spike plate, dart wall, fire jet or tripwire at that
    body. Monsters never fire a trap. A fired spike plate, dart wall or fire jet **re-arms 10 s**
    later; a tripwire fires once and is spent. A gas vent is §D R28.
26. **Trap damage scales with the floor** (charter default) as monster damage does: a trap's hit is
    the base hit of a standard fodder monster of the floor's monster level, times the kind's
    factor: spike plate 1.0, dart wall 0.8, fire jet 1.5. Armour and the delver's mitigation apply
    as to a monster's hit. It is a hit: it breaks a timed interact (FS-MQYEX R7) and can kill.
27. **A tripwire** deals no damage: it wakes an ambush (R14 placement, aggroed on the delver who
    tripped it).
28. **A gas vent** puffs on a 6 s cycle while any delver's body centre is within 2 cells (160 px)
    of the vent's centre: the first puff on the tick a delver first enters that cloud, then every
    6 s while anyone remains in it. Each puff **poisons** every delver in the cloud.
29. **Poison** (owner: long enough to hurt until the merchant, or to make them buy an antidote
    ahead): a poisoned delver loses 1% of their max health a second for 60 s, applied on the tick
    (a fraction a tick). A second poisoning refreshes the remaining time to 60 s; it never stacks.
    Poison is lethal: a delver brought to 0 by it dies as by any hit. It **carries across
    floors** (charter default: the merchant may be floors away) until it runs out, is cured, or the
    delver dies, escapes or leaves. Cured by an antidote (FS-9JV5K) or the archer's Brew (FS-X2CMM).
    Poison ticks are not hits: they do not break a timed interact.
30. **Detection** (charter default: otherwise the wire is a trap map): a trap is **undetected**
    until an in-play delver's body centre comes within 2 cells (160 px) of its cell's centre, or
    the trap fires. From that tick it is **detected** for the run and stays detected for the
    floor's life. **The server never sends an undetected trap** to any client. A detected trap is
    sent to every member of the run, which is one party (ADR-0035): "known to the party" is "known
    to the run". Witchlight and Tracker's Eye (FS-X2CMM) will mark a trap **revealed** as well;
    in v1 `revealed` is always false.
31. **Trap state is the floor's.** A floor's traps, their detection and their arming last the
    floor's life; a floor change builds new ones. A delver killed by a trap or by poison dies with
    no monster credited for the kill.

### §E. The Hidden Key, the Chasm and Braziers (game-service)

32. **The Hidden Key** (owner-approved proposal): the floor's **stair key** lies in a hidden room
    (§F), one more than the floor's rolled count (R33). An interact on the key takes it: the
    key entity leaves the world and the floor records that the party **carries the key** (floor
    state, as the tome is run state, FS-3103M R7; not a bag item; gone with the floor). Taking it
    wakes an ambush. An interact on the shut gate while the party carries the key breaks the
    Hidden Key seal (and opens the gate if it was the last gate-holding seal, R13). Searching the
    secret door is the way for anyone: solvable by one.
33. **The Chasm** (owner-approved proposal): the stairs room is at least 6 cells deep from its
    doorway wall and at least 5 cells wide (the generator only rolls a Chasm on such a floor,
    otherwise it draws again). A band of **pit** cells two cells thick crosses the room between the
    doorway side and the stairs side. Along one side wall a **ledge** one cell wide stays walkable,
    and every other ledge cell holds a **spike plate** (§D, with the trap rules; the ledge's traps
    are on top of R23's count and are detected as any trap is). The **bridge lever** stands on the
    stairs side. Pulling it (interact) **lowers the bridge**: the pit cells of a two-cell-wide lane
    through the band's middle become walkable for the floor's life, and the Chasm seal breaks.
    Pits block every body and monster paths as walls do; a body is never inside one. The ledge is
    the way for anyone (Hardened lets the warrior lead it, FS-X2CMM): solvable by one. Pulling the
    bridge lever wakes no ambush (promotion default: the gauntlet was the cost).
34. **Braziers** (owner-approved proposal): 3 braziers, each in its own room. An interact lights a
    cold brazier. Lighting the first starts the **window**: 60 s, or 90 s when one delver is in
    play at that moment (charter default, solo rule). All three lit within the window breaks the
    seal; when the window ends with any cold, every brazier goes out and the next lighting starts a
    new window. Each brazier wakes an ambush the first time it is lit (owner-approved proposal).
    Recall (FS-X2CMM) will regroup the party; without it, a party splits up and runs: solvable by
    one with the 90 s window.

### §F. Secret doors, hidden rooms and search (game-service)

35. **How many** (charter default): 0 hidden rooms on floor 1, 0–1 on floors 2–5, 0–2 on floors 6+
    (uniform), plus the Hidden Key's (R32) and the hallowed altar's when it is placed hidden (R44).
    Never the start, stairs, switch or escape door's room.
36. **A hidden room** is a dead-end room entered through one corridor, like the stairs room (R2):
    its **secret door** is a one-cell-thick barrier across that corridor's width at the room's
    doorway, and while it is shut no walkable path from the start reaches the room.
37. **The floor map leaves a hidden room out** (FS-SRA9J change): until its secret door opens, the
    floor map's regions omit the room's region **and the secret door's own cells** (cut from the
    corridor segment that holds them), so the door reads as wall to the client's fog, walls and
    minimap, and nothing on the wire names the room. When the door opens the server sends the
    floor map again to every member of the run (the existing re-send path), now with the room's
    region and the door's cells; the shell walls around it are rock either way and are sent as
    today. The gate's cells and the pit cells stay in their regions (a gate is seen through).
38. **Detection and search.** A secret door is undetected until an in-play delver's body centre is
    within 2 cells of it (its **faint cracks** show), then detected for the run, as a trap (R30),
    and never sent before. An interact on a detected, shut secret door starts a **search**: a
    timed interact of **2 s** (owner) on the FS-MQYEX rules (moving, a hit, leaving reach, out of
    play or a floor change cancel it; one per player; a reach for another target replaces it).
    The first search to complete opens the door for everyone, for the floor's life. An interact on
    an undetected secret door is impossible (the client has no id for it); on an open one it is
    refused quietly (reason `door_open`).
39. **What a hidden room holds** (charter default): the Hidden Key's key room holds the key; the
    altar's holds the hallowed altar (§G); any other holds a **better chest** (60%) or a **lore
    shrine** (40%) (promotion default: the owner named both, the chest the likelier). A better
    chest is a chest whose contents roll one rarity step up from a normal chest's roll, capped at
    the highest rarity a chest can roll; it has no guard and no timed open change. A lore shrine
    answers an interact with reason `shrine` and wakes nothing. Hidden rooms hold no monsters.

### §G. Respites: the healing fountain and the hallowed altar (game-service)

40. **The healing fountain** (owner; numbers are charter defaults): on about **50%** of floors 2+
    (never floor 1, never the top), at most one a floor, in a room that is not the start, stairs,
    a seal piece's, a hidden room or the merchant's (FS-9JV5K), and where no monster spawns (R21).
41. It heals each in-play delver whose body centre is within **2 cells** of its centre by **4% of
    their max health a second**, applied on the tick, never above max health, drawn from one
    shared **pool**. The pool is **150%** of the highest max health among the delvers in play at
    the floor's build. Healing a delver at full health draws nothing. When the pool reaches 0 the
    fountain is **dry** for the floor's life. Not a camp: nothing else about it is interactable.
42. **The hallowed altar** (owner): the Altar of Consecration's model recoloured holy (§K). Rolled
    once when the run is created (charter default): in **30%** of runs, on a floor drawn uniformly
    from 2 to height − 1, never the top; at most one a run; **50%** of the time inside a hidden room
    on that floor (R35), else in a random room that is not the start, stairs or a respite's room,
    placed as the tome's altar is (FS-3103M R8–R9). (Amended 2026-11-25, code review: the tome and
    the Altar of Consecration are kept out of respite rooms too, so a respite stays quiet.)
    Run-level state like the tome plan; never on
    the wire as a plan (FS-M8CSE R5: its presence says "not the top floor", the same accepted leak
    as the Altar of Consecration's).
43. **Praying** is a 2 s timed interact on the FS-MQYEX rules by any in-play delver. When it
    completes, every party member in play on the floor that tick gains the **Blessing**, and the
    altar is spent (`prayed`) for the run. An interact on a spent altar is refused quietly (reason
    `altar_prayed`).
44. **The Blessing** (owner; numbers are charter defaults): until the delve ends for that delver,
    **+10% item drop chance** on the kill drop rolls of monsters the blessed delver kills (the roll
    made for them; containers unchanged) and **+5% class-resource regen** (mana and stamina regen
    rates × 1.05). Lost on death; never stacks (a second prayer is impossible, R43); kept across
    floors; never carried out of the run.

### §H. The floor build order (game-service)

45. **Order on a sealed dungeon floor** (promotion default: the fixed fixtures first, as today):
    shell walls; the gate, the stairs, the escape door and switch (floors 2+); the seal's pieces,
    blocks and mural; the chasm's pits and ledge; secret doors; hidden room contents; the fountain;
    containers (never in a hidden room or the plates room); the tome and altars (FS-3103M); traps;
    then the party and the monsters, as on every floor. A seal or respite whose room has no free
    spot draws another room; a seal that cannot be placed at all fails the floor's layout and the
    next seed is tried (FS-KE075 R17), never a floor with stairs and no seal.

### §I. The wire (game-service → game-client)

46. **New run-only state keys**, absent in the hub, a field, the top floor where they do not apply,
    and on a floor of buildings. All are sent whole (no interest cut): each is a handful a floor
    (promotion default: they are landmarks, as the stairs are). Positions are world px; `cell` is
    `{x, y}` on the floor map's grid.
    - `seal`: `{ kind, stage, stages, broken, window_ends_in?, key_carried? }`. `kind` is the
      current (first unbroken) seal's kind, `lever_order | weighted_plates | hidden_key | chasm |
      braziers`, or the last one's once all are broken; `stage` is 1-based, `stages` 1 or 2;
      `broken` is true once every seal of the floor is broken. `window_ends_in` (seconds) is set
      while a Braziers window runs; `key_carried` is true while the party carries the stair key
      and its seal is unbroken (amended 2026-11-25: false once the key has turned the gate).
    - `seal_pieces`: `[{ entity_id, kind, position, cell, glyph?, active }]`, `kind` one of
      `lever | plate | block | brazier | stair_key | bridge_lever | mural | shrine`. `active` is a
      lever down, a plate held, a brazier lit, a bridge lowered; false for the others. `glyph` on a
      lever only. A stair key is listed while it lies **once its hidden room is open** (amended
      2026-11-25: R37 wins, a listed key would locate the room). A shrine is listed once its hidden
      room is open.
    - `barriers`: `[{ entity_id, kind, cells, open }]`, `kind` one of `gate | secret_door | pit`,
      `cells` the cells it covers. A gate and the pits are always listed; a secret door only once
      detected.
    - `traps`: `[{ entity_id, kind, cell, armed, revealed }]`, detected traps only (R30). `armed`
      is false while a fired trap waits to re-arm and for a spent tripwire. A gas vent is always
      armed.
    - `fountain`: `{ entity_id, position, dry }` on its floor.
    - `hallowed_altar`: `{ entity_id, position, prayed }` on its floor, once reachable (listed only
      once its hidden room, if it is in one, is open).
47. **Delver statuses on the public player state** (so teammates' bars can show them, FS-CH21F):
    `poisoned_for` (seconds left, absent when not poisoned) and `blessed` (true, absent when
    not). Never on an enemy or the hub.
48. **Events the client reads off the state**, as FS-3103M R26 reads `altar.burned`: a seal
    breaking is `seal.stage` rising or `seal.broken` turning true against the previous broadcast;
    a trap firing is its `armed` turning false (a gas vent's puff is `traps[].puffed_at`, the
    server time of its last puff, which the client compares); a first broadcast is the baseline.
49. **Replies** use the existing interact reply with these reasons: `stairs_sealed`,
    `gate_sealed`, `lever_down`, `lever_wrong`, `mural` (with `glyphs: [..]` in order), `shrine`,
    `door_open`, `altar_prayed`. A search's and a prayer's progress ride `current_player`'s timed
    interact (FS-MQYEX §C), with a `target_kind` of `search` or `pray` beside the timed open's.
50. **The floor map** omits unopened hidden rooms (R37) and gains no other field. Pit cells and
    the gate are not in the floor map: they are barriers on the state.

### §J. The client (game-client)

51. **Drawing.** Every listed seal piece, barrier, trap, the fountain and the hallowed altar is
    drawn from its baked sheet (§K) at its position or cells, depth-sorted as props are, in the
    frame its state names: a lever up or down, a plate up or pressed, a brazier cold or lit, the
    bridge lever up or down, the gate shut or open, a pit as a chasm cell and a lowered bridge as a
    bridge, a fountain full or dry, the altar dormant or prayed. A stone block slides between cells
    over the push time rather than snapping. A trap is drawn faint (its armed frame at reduced
    alpha) when listed, and plays its **spring** (spikes up, darts across, a fire jet, a gas puff)
    when R48's events fire. A detected secret door draws its cracks on the wall cell; open, it draws
    as an open doorway. (Amended 2026-11-25, code review:) a lit seal brazier is a `brazier` fixed
    light and the dormant hallowed altar's candles their own `hallowed_altar` light; when FS-8RBQY
    §C.6's light cap bites, the drop order is slits, braziers, sconces, the altar's candles, then
    interactable pools, and the stairs' light is never dropped.
52. **E targets.** A lever, brazier, bridge lever, stair key, mural, shrine, a detected shut secret
    door (**Search**), the gate (refused or opened with the key), and the hallowed altar (**Pray**)
    are E targets in reach, as containers are. A plate, a block, a trap, the fountain and a pit
    are not.
53. **Lines** (the existing HUD notice, in its tones, written by the client; promotion default:
    the client's lore voice, as FS-3103M R24):
    - floor arrival with a seal: *"The stairs are sealed: <Kind>."* (`waiting` tone);
    - `seal.stage` rises: *"The first seal breaks. Another holds."*; `seal.broken` turns true:
      *"The seal breaks."* (success tone);
    - `stairs_sealed` / `gate_sealed`: *"Sealed. <Kind> holds it."* (`refused`); with the key
      carried at the gate the interact succeeds and needs no line;
    - `lever_wrong`: *"Wrong. The levers spring back."* (`refused`);
    - `mural`: *"The mural shows: <Glyph>, <Glyph>, <Glyph>."* (`waiting`);
    - `shrine`: one of three short lore lines (`waiting`);
    - a Braziers window: a countdown on the existing countdown bar (FS-B3NDZ) while
      `window_ends_in` is set; *"The braziers gutter out."* when it ends unbroken (`refused`);
    - the key taken (`key_carried` turns true): *"The stair key. Now the gate."* (`waiting`);
    - Blessing gained (`blessed` turns true): *"Blessed."* (success);
    - first poisoned (`poisoned_for` appears): *"Poisoned."* (`refused`).
54. **Timed interacts.** Search and Pray show the existing timed-open bar with the labels
    *"Searching…"* and *"Praying…"*.
55. **Statuses.** A poisoned delver's own health bar, and a teammate's overhead bar, take the
    poison tint while `poisoned_for` is set; the Blessing shows as a small status mark beside the
    delver's own health bar with a hover line (*"Blessed: better finds, quicker resource"*).
56. **The minimap** (FS-SRA9J change) draws regions from the floor map as today, so an unopened
    hidden room is absent. **A second floor map for the floor already built is accepted** (today
    it is ignored): the scene rebuilds its region grid, wall faces and fog from it and keeps every
    region already explored; the opened room joins the minimap unexplored until seen. A secret door draws as wall on the minimap until open. The gate draws as a wall stroke
    while shut. Traps, pieces and the fountain are not on the minimap (promotion default: the
    minimap stays a map).

### §K. Art (game-client bake)

57. **One new art group, the sealed-floor props**, modelled in code in the bake tool (ADR-0020,
    ADR-0021), at Ultima Online fidelity, colours from `BARROW` tokens only (ADR-0013), packed into
    the run's interactables group (promotion default: small props, as FS-3103M's): lever (up,
    down), pressure plate (up, pressed), stone block, brazier (cold, lit), stair key, bridge lever
    (up, down), mural, lore shrine, gate (shut, open), pit cell, bridge cell, secret-door cracks
    overlay, the five traps (armed, sprung; the gas vent's puff as a short effect), healing
    fountain (full, dry), and the **hallowed altar** (dormant, prayed): the Altar of
    Consecration's model recoloured holy (warm gold, pale stone, candlelight). Multi-state props are
    framed together so a state swap never moves the sprite. A contact sheet of the group is made
    for the owner's gate.

## User Stories

1. As a delver, I want every floor's way up to be sealed, so that climbing means working the floor, not running to the stairs.
2. As a delver, I want the seal to be one of several puzzle kinds rolled per floor, so that floors stay surprising.
3. As a delver on a high floor, I want two seals chained, so that the climb grows harder as it goes up.
4. As a solo delver, I want every seal to be solvable by me alone, so that a solo delve or a party cut down by deaths can always climb.
5. As a delver without a mage or archer, I want a slower way past every seal, gap and hidden key, so that no class is required to climb.
6. As a delver, I want the stairs on a far dead-end branch behind a gate, so that finding the way up takes exploring.
7. As a delver, I want the seal's pieces on other branches than the stairs, so that the party crosses the floor at least twice.
8. As a delver, I want a mural that tells the lever order, so that Lever Order is a puzzle and not a guess.
9. As a delver, I want a wrong lever order to hurt and reset, so that guessing has a cost.
10. As a delver, I want to push stone blocks onto plates, so that one body can hold every plate.
11. As a delver, I want the Hidden Key behind a secret door I can find by searching cracks, so that the key is earned.
12. As a delver, I want a chasm I can cross by a spike-lined ledge, so that the stairs are reachable without Levitate.
13. As a delver, I want the Braziers window to widen when I am alone, so that a solo delver can light all three in time.
14. As a delver, I want working a floor to wake ambushes, so that solving is tense.
15. As a delver, I want fewer monsters on a floor, so that the pace is slow and deliberate.
16. As a delver, I want traps I see only once I am close, so that walking carelessly is dangerous.
17. As a delver, I want a trap one of us detected to show for the whole party, so that we warn each other.
18. As a delver, I want gas vents to poison me, so that poison is a real threat until I cure it.
19. As a delver, I want poison to carry across floors until it runs out, so that buying an antidote ahead matters.
20. As a delver, I want a tripwire to wake an ambush, so that traps and fights tie together.
21. As a delver, I want faint cracks on a secret door when I am near, so that a careful search finds hidden rooms.
22. As a delver, I want a hidden room to stay off the minimap until it opens, so that discovering it feels earned.
23. As a delver, I want hidden rooms to hold a better chest, a lore shrine or the hallowed altar, so that searching pays.
24. As a delver, I want a healing fountain on some floors, so that the party has a moment of respite.
25. As a party, I want the fountain's water shared and finite, so that it is a respite and not a camp.
26. As a delver, I want to pray at a hallowed altar and bless my whole party, so that finding it lifts the delve.
27. As a delver, I want the Blessing to last the delve and end with my death, so that it is worth protecting.
28. As a delver on floor 1, I want no escape door, so that floor 1 cannot be farmed by escaping and re-entering.
29. As a delver on floor 2 or higher, I want the escape door far from the stairs, so that escaping and climbing are a real choice.
30. As a delver, I want the seal never to block the escape door, so that escaping stays the greed choice.
31. As a delver, I want the screen to say what the seal is and when it breaks, so that I know what to work on.
32. As a delver, I want sealed stairs and a shut gate to refuse with a line, so that I know why I cannot climb.
33. As a delver, I want a pushed block to slide, so that I can see where it went.
34. As a delver, I want the Braziers clock on screen, so that I can pace the run between them.
35. As the owner, I want trap and secret door positions kept off the wire until detected, so that the wire is not a trap map.
36. As the owner, I want a many-seed property test over every seal, so that no floor is ever unsolvable.
37. As the owner, I want every value tunable in one place, so that a local build can force a seal, a fountain or the altar.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] Floor 1 has no escape door and no switch; floors 2+ have both, the escape door the far room farthest from the stairs room (§A R6–R7).
- [ ] The 1 000-seed property test asserts, for every seed: the stairs room is a dead end at the greatest walk distance; with its gate shut and every secret door shut, no path from the start reaches the stairs room or any hidden room; no extra connection joins either; the escape door and switch are reachable with every gate shut (§A R2–R8, §F R36).
- [ ] A sealed floor's stairs refuse `stairs_sealed`, its shut gate `gate_sealed`, and the gate opens on the tick the last gate-holding seal breaks (§B R12–R13).
- [ ] Seal kinds per floor band, chained on floors 8–10 with the second's pieces created only when the first breaks (§B R9).
- [ ] Lever Order: in-turn pulls stay down, an out-of-turn pull hits the puller with a dart volley and resets every lever, the last in-turn pull breaks the seal; the mural answers with the glyph order (§C R15–R16).
- [ ] Weighted Plates: a delver, an ally hook or a block holds a plate, a monster does not; the seal breaks when every plate is held on one tick; there are as many blocks as plates (§C R17–R18).
- [ ] Stone blocks: a sustained walk into a face pushes the block one cell over the half-speed time; every refusal case in R19 leaves the block where it was; the solvability search passes on every seed (§C R19–R20).
- [ ] Ambush: the first work of a waking piece spawns a 2–4 pack of the floor pool in the nearest qualifying room, aggroed on the waker; a second work wakes nothing (§B R14).
- [ ] A sealed dungeon floor holds 15–25 monsters besides a boss and none in a respite's room (§D R21).
- [ ] Trap count per floor, placement rules, the five kinds, firing by delvers only, re-arm at 10 s, tripwire once, floor-scaled damage that breaks a timed interact (§D R23–R27).
- [ ] Gas vent cycle and poison: 1%/s for 60 s, refreshed not stacked, lethal, carried across a floor change, not a hit (§D R28–R29).
- [ ] An undetected trap or secret door is in no client's state; it is in every run member's from the tick a delver comes within 2 cells or the trap fires (§D R30, §F R38).
- [ ] The Hidden Key: the key lies in a hidden room, taking it sets `key_carried` and wakes an ambush, the gate interact with the key breaks the seal (§E R32).
- [ ] The Chasm: only on a stairs room of at least 6×5; pits block bodies and monster paths; the ledge is walkable with spike plates; the bridge lever lowers a walkable lane and breaks the seal (§E R33).
- [ ] Braziers: the window is 60 s, 90 s with one delver in play; three lit in it break the seal; an expired window puts every brazier out (§E R34).
- [ ] Hidden room counts per floor band; a 2 s search on the FS-MQYEX rules opens the door for everyone; the floor map omits the room until then and is re-sent with it; contents are the key, the altar, a better chest or a shrine (§F R35–R39).
- [ ] The fountain: floor odds and room rules, 4%/s within 2 cells from a 150% pool, nothing drawn at full health, dry at 0 (§G R40–R41).
- [ ] The hallowed altar: rolled at run creation in 30% of runs, floor 2..height−1, half the time hidden; a 2 s prayer blesses every party member in play on the floor; spent after; the Blessing raises the blessed killer's drop chance by 10% and resource regen by 5%, is kept across floors and lost on death (§G R42–R44).
- [ ] The wire keys and statuses of §I serialize as specified and are absent where §I R46 says.

### Client (vitest)

- [ ] The state parser keeps `seal`, `seal_pieces`, `barriers`, `traps`, `fountain`, `hallowed_altar`, `poisoned_for` and `blessed` (§I R46–R47).
- [ ] Every piece, barrier, trap, fountain and altar draws in the frame its state names; a block slides; a trap plays its spring on its `armed` falling (§J R51).
- [ ] E targets and the Search / Pray bars (§J R52, R54).
- [ ] Every line of §J R53 fires on its event and not on a first broadcast.
- [ ] The poison tint and the Blessing mark (§J R55).
- [ ] The minimap omits an unopened hidden room and adds it on the floor map's re-send; a shut gate and a secret door draw as wall (§J R56).

### Art

- [ ] The sealed-floor props of §K R57 are baked from code with `BARROW` colours, and a contact sheet is made for the owner's gate.

## Edge States

- **A delver dies mid-seal.** The seal's progress stands (levers down stay down, a lit brazier stays
  lit until its window ends, the key stays carried): progress is the floor's, not a delver's.
- **The whole party dies or escapes before the seal breaks.** The run ends as today; nothing about
  the seal carries.
- **A delver reconnects.** Their first broadcast carries every detected trap and door, the seal and
  its pieces; the floor map they are sent omits unopened hidden rooms and includes opened ones. No
  line fires on that first broadcast.
- **A block is pushed onto a delver's path or a doorway.** Allowed: a push is refused only by R19's
  cases. A block in a corridor can be pushed out again from its other face. A block can never
  enter the gate corridor's gate cells or a pit.
- **Two delvers push one block on the same tick from opposite faces.** Neither push moves it
  (promotion default: equal and opposite).
- **A delver stands on a plate while the seal breaks.** Nothing more happens; plates stay held or
  not by bodies, but the seal is broken for good.
- **Braziers with the party split:** a delver who dies during the window does not change it (the
  window was sized at the first lighting).
- **A trap under a body at the moment it re-arms.** It fires only when a body centre enters its
  cell; a delver standing on a re-arming spike plate is not hit again until they step off and on.
- **Poison at climb.** It carries; the remaining time is kept to the tick.
- **Poison and the fountain together.** Both apply on one tick; the fountain never cures poison.
- **A gas vent's cloud covers the plates room or a lever.** Allowed; the placement keeps traps off
  piece cells only.
- **Search interrupted by a hit from an ambush.** Cancelled, per FS-MQYEX R7; the door stays shut.
- **Several delvers search one door.** Each on their own timer; the first to finish opens it.
- **The altar's floor falls back to buildings.** No altar that run (log warning), as FS-3103M R10.
- **The fountain's pool when the party grows or shrinks.** Fixed at the build; a teammate who dies
  leaves it as it was.
- **A floor whose generation cannot place its seal twice.** Falls back to a floor of buildings
  (FS-KE075 R17) with no seal and its stairs open, loudly logged: a run never strands a party.
- **Monsters and the gate:** monsters path around a shut gate, pits and blocks; a monster chasing a
  delver into the stairs room after the gate opens follows normally.
- **A hidden room's door opens while a teammate is mid-floor-map load.** The re-send is idempotent:
  the latest floor map wins.

## Out of Scope

- Class book pages (Witchlight, Far Hand, Levitate, Heave, Hardened, Tracker's Eye, Recall, Brew,
  the hound): FS-X2CMM. This FS leaves `revealed` false and the hooks named.
- Hired allies and the encounters (FS-4EC7Z) and the merchant (FS-9JV5K); this FS names where they
  plug in (a plate holder, a trap trigger, a respite's room).
- The crushing-ceiling trap and "the Spire stirs" patrols.
- A seal on the top floor, a seal on the escape door, a seal on a floor of buildings.
- Any change to the hub, the fields, or the HTTP contract.

## Change notes for the owning FSs

The stubs in FS-F6F88, FS-KE075, FS-C8VM7 and FS-SRA9J point here. This FS carries their change:
FS-F6F88 loses floor 1's escape door and switch (§A R6); FS-KE075's stairs placement, extra
connections and room roles change (§A R2–R7); FS-C8VM7's dungeon counts drop to 15–25 and gain
ambushes (§B R14, §D R21); FS-SRA9J's minimap omits unopened hidden rooms (§F R37, §J R56).
