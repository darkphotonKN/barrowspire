# FS-5FZ4J: Sealed floors

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Delve layout" (sealed stairs · floor traps · hidden rooms behind secret doors · healing fountains and the hallowed altar); `game-client/SPECIFICATION.md` "### Escape run" (floor seals · traps shown and sprung · secret doors and hidden rooms · healing fountains and the hallowed altar) → this FS · Also the change FS for: [FS-F6F88](F6F88-multi-floor-delves.md) (no escape door or switch on floor 1), [FS-KE075](KE075-floor-1-dungeon.md) (stairs placement and branching), [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) (fewer monsters, ambushes), [FS-SRA9J](SRA9J-fog-of-war-and-minimap.md) (hidden rooms off the minimap); each carries `## Change: Sealed floors → FS-5FZ4J` · Siblings (same scoping session, 2026-11-25): [FS-4EC7Z](4EC7Z-dungeon-encounters.md) (encounters), [FS-9JV5K](9JV5K-wandering-merchant.md) (the merchant, the third respite), [FS-X2CMM](X2CMM-class-books.md) (class books, whose pages are the shortcuts through these floors) · Related: [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (height 3–10, server-only), [FS-MQYEX](MQYEX-timed-container-opening.md) (timed interacts), [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) (the altar model reused) · ADRs to record: "a floor's way up never needs a class, a book page or a second delver"

## Scoping notes (raw)

Residue from the 2026-11-25 scoping session (Kranti), plus the charter defaults Kranti approved
the same day ("make sensible judgement and run the full chain"). Owner items are marked
**[owner]**; charter defaults are marked **[charter default]** with their reason.

### Why

The Spire should play like a slow party dungeon crawl (Baldur's Gate / Divinity feel, but
real-time, a slow Diablo): fewer monsters, more traps, hidden switches, hidden rooms and puzzles
to get out, and tension from fighting while solving. Every floor stays randomised, and the
**number and kind** of traps, hidden switches and puzzles is randomised drastically. **[owner]**
Floors still climb to 10 at the end game (FS-M8CSE). Target pace: a floor takes about 6–10
minutes, so a 10-floor climb is about an hour. **[charter default — reason: the cooldowns in
FS-X2CMM are sized against it]**

### The seal (the way up)

- **Every floor's stairs are sealed.** The floor rolls one **seal** from a pool; the seal must be
  broken before the stairs can be climbed. The top floor has no stairs and so no seal; it keeps
  its boss and its escape door. **[owner-approved proposal]**
- Seal kinds, v1 (all five ship): **[owner-approved proposal]**
  | Seal | The puzzle | Book-page shortcuts | The way without them |
  |---|---|---|---|
  | **Lever Order** | 3–4 levers in different rooms; a mural or lore line in one room hints the order. A wrong order fires a dart volley or gas and resets all levers | Far Hand pulls distant levers | walk to each lever, read the mural |
  | **Weighted Plates** | 2–3 plates in one hall, all held at once | Heave shoves stone blocks onto them; a hired NPC or the hound can stand on one | anyone pushes a block, slowly |
  | **The Hidden Key** | the stair key lies in a hidden room behind a secret door | Witchlight, Tracker's Eye, the hound | search the faint cracks: hold interact 2 s on the wall |
  | **The Chasm** | the stairs room lies across a pit | Levitate an ally over to drop the bridge lever on the far side | a long detour through a spike gauntlet (Hardened lets the warrior lead) |
  | **Braziers** | light 3 braziers within 60 s of the first; each lit brazier wakes an ambush | Recall regroups the party | split up and run |
- Scaling **[charter default — reason: owner asked complexity to rise with floor]**: floors 1–3
  roll one seal from {Lever Order, Hidden Key, Weighted Plates}; floors 4–7 one seal from all
  five; floors 8–10 two **chained** seals (the second's pieces appear only once the first breaks).
- **Book pages are shortcuts, never the only way.** Every seal, gap and hidden room has a slower,
  riskier way past it for any party mix or a solo delver. **[owner-approved; ADR to record]**
- **Solo rule [owner]: every seal is solvable by one living delver.** Covers solo delves and a
  party reduced mid-run by deaths. Weighted Plates always place enough stone blocks to cover every
  plate; the Braziers window scales with the living count at the first lighting (60 s for 2+,
  90 s for one) **[charter default]**; the Chasm always has its detour. Anything needing two bodies
  at once does not roll for a solo delve. Party-size scaling (waves, mark health) follows the
  existing monster-level-to-party rule.
- **Stone blocks** are pushed by walking into them (slow, half walk speed) **[charter default —
  reason: smallest new movement; Heave in FS-X2CMM shoves one a full cell at once]**. Blocks move
  on the 80 px cell grid, one cell per push, never into walls, other blocks, or plates already
  covered.

### Finding the next floor [owner]

The way up must be hard to find. Owner: "make sure the structure makes it hard to find the next
floor; we have that randomness now already, finding the next floor the minimap opens up slowly
too, but we need to consider these new changes into them."

- The stairs room sits on a **dead-end branch**, in the region farthest by path from the start,
  and its door is the seal's gate. The seal's pieces (levers, key, braziers, plates) sit on
  *other* branches, so a party crosses the floor at least twice. **[owner-approved proposal]**
- Fewer loops near the stairs; more dead-end side branches holding traps and secret-door
  entrances. **[owner-approved proposal]**
- The minimap still opens with exploration; stairs show only once their region is explored
  (FS-SRA9J). Secret doors draw as plain wall; a hidden room stays off the minimap until opened.
- On floors 2+, the escape door also sits on a far branch, away from the stairs.

### No escape door on floor 1 [owner]

Floor 1 has **no escape door and no switch** (the switch only opens the escape door), to stop
speed-running loops of floor 1. On floor 1 a delver climbs or dies by choice (FS-9K8EZ). Floors
2+ keep their escape door and switch as today. A seal never blocks the escape door.

### Monsters and tension

- Monster count drops to **15–25 per floor** (from FS-C8VM7's 30–45). **[owner: "we can lower the
  number of mobs"; numbers are the proposal]**
- **Ambushes**: working a floor (pulling a lever, lifting the key, lighting a brazier, a wrong
  lever order, a tripwire) wakes a pack of 2–4 monsters from a nearby shut room or alcove.
  Ambush monsters come from the floor's pool (FS-C8VM7). **[charter default]**
- Parked: "the Spire stirs" (a patrol down the stairs every few minutes a party lingers). Not v1.

### Traps

- Count: `3 + floor(floor / 2)`, capped at 8 (floor 1: 3, floor 10: 8). **[charter default —
  reason: the owner-approved 3-to-8 range]**
- Kinds v1 **[charter default — smaller v1]**: spike plate, dart wall, fire jet, tripwire (wakes a
  room: an ambush), gas vent (poisons). The **crushing-ceiling room** is deferred (Heave's
  "hold it open" use waits for it).
- **Poison** (new delver status) **[owner: lasts long enough to hurt until the merchant, or to
  make them buy an antidote ahead]**: 1% of max health per second for 60 s; a second poisoning
  refreshes the duration, never stacks. Lethal. Cured by an antidote (FS-9JV5K) or the archer's
  Brew (FS-X2CMM). It **carries across floors** until it runs out or is cured **[charter default — reason: the merchant may be floors away]**.
- Visibility: a trap shows faintly to a delver within 2 cells; Witchlight and Tracker's Eye
  reveal it fully. **The server never sends a trap's position to a client that has not detected
  it** (per-recipient, as interest already cuts snapshots, ADR-0060) **[charter default —
  reason: otherwise the wire is a trap map]**. Once detected by anyone, it is known to the party.
- A trap fires when a delver (or hired ally/hound) steps on it; a sprung spike/dart/fire trap
  re-arms after 10 s; gas vents puff on a 6 s cycle while anyone is in their 2-cell cloud; a
  tripwire fires once. Monsters never trigger traps. Far Hand springs one from range; Hardened
  ignores trap damage (FS-X2CMM). **[charter default]**
- Damage scales with floor like monster damage does. **[charter default]**

### Hidden rooms and secret doors

- 0 on floor 1, 0–1 on floors 2–5, 0–2 on floors 6+. **[charter default]** (Owner: 0–2 per floor.)
- Behind a **secret door**: a wall cell that shows faint cracks to a delver within 2 cells.
  **Search** = hold interact 2 s on it (a timed interact like FS-MQYEX, broken by moving or
  taking damage). Witchlight, Tracker's Eye and the hound reveal it outright.
- Contents: a better chest (one rarity step up), a shrine/lore line, or the hallowed altar; the
  Hidden Key seal's key room is a hidden room too.
- Secret doors are not sent until discovered (same rule as traps).

### Respites [owner: "two moments of respite"; the merchant is the third, FS-9JV5K]

- **Healing fountain** **[owner]**: stand near it to heal. **[charter default]**: on about half
  of floors 2+, never floor 1; in a room where no monster spawns; heals 4% max health per second
  to each delver within 2 cells; holds a pool of 150% of one delver's max health in total, then
  runs dry (drawn dry). Not a camp.
- **Hallowed altar** **[owner]**: the Vorsk altar's model (FS-3103M) recoloured holy and pleasant
  (warm gold, pale stone, candlelight). Named *hallowed* because FS-3103M's is the **Altar of
  Consecration**. One delver prays (2 s timed interact) and every living party member on the
  floor gains the **Blessing** until the delve ends: better item drops and a small class-resource
  regen boost **[owner]**. **[charter default]**: +10% item drop chance and +5% class-resource regen;
  at most once per delve; in ~30% of delves; on a floor 2+ that is not the top; often (50%) inside
  a hidden room; never stacks; lost on death.

### Rejected / changed during scoping

- Seal blocking the escape door too: rejected; the escape stays the greed choice. **[owner]**
- Gold costs on any book page: rejected (see FS-X2CMM, FS-9JV5K). **[owner]**

### Open questions (left for write-a-spec under the charter)

- Exact art for seals, traps, blocks, fountain; built in code (ADR-0020/0021), fidelity bar
  Ultima Online; gate on a contact sheet.
- Where the switch/escape door rooms move to on floors 2+ given the new branching.
