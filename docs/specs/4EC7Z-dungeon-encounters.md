# FS-4EC7Z: Dungeon encounters

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Encounters" (dungeon NPC encounters · hired NPC allies · contract marks); `game-client/SPECIFICATION.md` "### Escape run" (dungeon NPC encounters and hired allies · contract mark heading and result) → this FS · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (sealed floors), [FS-9JV5K](9JV5K-wandering-merchant.md) (the merchant), [FS-X2CMM](X2CMM-class-books.md) (Strike a Deal and Take a Contract, the Ledger pages that hire and that place a mark) · Related: [FS-MRZH7](MRZH7-function-npc-markers.md), [FS-B0H2D](B0H2D-enterable-town-buildings-and-the-inn.md), [FS-67QQY](67QQY-faces-on-the-human-cast.md) (the town cast whose models are reused), [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) (champion scaling the mark borrows)

## Scoping notes (raw)

Residue from the 2026-11-25 scoping session (Kranti), plus the charter defaults Kranti approved
the same day. **[owner]** = Kranti's words or approval; **[charter default]** = the charter's
pick, with its reason.

### What an encounter is

NPC groups met on Spire floors, reusing the town models with variations (tint, gear, faces).
**[owner]** "Sometimes there's an NPC group that asks for help and gives a chest, sometimes it's
turning on us after talking." The mercenary can hire them (FS-X2CMM, Strike a Deal).

- Frequency **[charter default]**: at most one encounter per floor, on ~40% of floors 2+, never
  floor 1, never the top floor. A Contract mark (below) is extra to this.
- Kinds v1 **[owner-approved proposal]**:
  - **Lost Pilgrims** (3): defend them through a wave of monsters from two doors; if at least one
    pilgrim lives, they open a chest one rarity step up. The wave scales with party size; solo OK.
  - **Captives** (2): caged. Open the cage with Pick the Lock (FS-X2CMM) or the cage key placed
    elsewhere on the floor (in a side room or on an elite). Freed, they fight beside the party for
    the rest of that floor.
  - **Cutthroats** (3): talk first (interact); 50% turn hostile 3 s later. If they stay peaceful
    they reveal the floor's hidden room on the minimap **[charter default — reason: the peaceful
    branch needs a payoff]**. Strike a Deal hires them before they turn.
- NPCs talk through the existing NPC interaction/dialogue presentation where one exists; a short
  line over the head otherwise. **[charter default]**

### Hired NPC allies

- Hired or freed NPCs follow the hirer (the party for freed captives), fight monsters, and can
  stand on a pressure plate (FS-5FZ4J). Monsters target them. They do not climb: they stay behind
  when the party takes the stairs. Max 3 allies at once per party. **[charter default]**
- Allies **do** trigger traps (they are bodies on the floor) **[charter default —
  reason: a plate-holder must be able to hold a plate; traps are the same check]**.
- Allies give no XP to the party when they kill; kills by allies count as the hirer's for loot
  allocation **[charter default]**.

### Contract marks [owner]

Owner: "Receiving a contract, which is once per delve. If they find an NPC that spawns in that
delve and kills them they get a buff for the rest of the delve. Make them painful and hard to
kill so it's a risk." Later: "reward is a buff" (no gold).

- Placed by the mercenary's **Take a Contract** page (FS-X2CMM), once per delve. The **mark**
  spawns on the current floor, in a room at least the median path distance from the mercenary, not
  shown on the minimap. The Ledger shows only a rough heading ("last seen to the east"), updated
  every 5 s **[charter default]**.
- The mark: a humanoid from the town models with a variant look (a hooded duelist, a debtor
  knight); champion-level health (FS-C8VM7's champion scaling) scaled to party size; hits hard;
  poison blades (FS-5FZ4J poison); at 50% health it calls 3 cutthroats once; at 25% it flees to a
  far room and heals 20% once. **[owner: painful and hard; the specifics are charter defaults]**
- Killed by the party → the mercenary who took it gains **Contract Settled**: +15% damage until
  the delve ends; lost on death **[owner: the mercenary only; charter default: +15% damage]**.
- The contract is **lost** if the party climbs with the mark alive, or if the mercenary dies.
- **No gold** on any page or contract. **[owner]**

### Rejected

- Turncoat (convert a humanoid monster for 20 s): replaced by Take a Contract. **[owner]**
- Gold debts for Strike a Deal and gold pay for contracts settled at run end: rejected; gold in a
  run is only the merchant's (FS-9JV5K). **[owner]**

### Open questions (left for write-a-spec under the charter)

- How the NPC variants are baked (tints vs new sheets); art is built in code (ADR-0020/0021),
  fidelity bar Ultima Online, gated on a contact sheet.
- Hired-ally and mark issues depend on the Ledger pages (FS-X2CMM): build the server-side hire and
  mark entry points here, wire the pages in FS-X2CMM.
