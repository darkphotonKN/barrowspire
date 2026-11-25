# FS-X2CMM: Class books

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" (class book abilities unlocked by level); `game-client/SPECIFICATION.md` "### Escape run" (class book), "### Presentation" (class book page icons) → this FS · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (the floors the pages answer: traps, poison, secret doors, levers and plates, stone blocks, chasms), [FS-4EC7Z](4EC7Z-dungeon-encounters.md) (cages, encounter groups, hired allies and contract marks the Ledger drives), [FS-9JV5K](9JV5K-wandering-merchant.md) · Builds on: [FS-04EEA](04EEA-class-tree-abilities.md) (tree ability, key 3, the resolve path, the stun), [FS-Q18Q3](Q18Q3-ability-bar.md) (cooldowns in the owner's state), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (class resources), [FS-BDA7X](BDA7X-character-leveling.md) (level cap 20), [FS-3EBCA](3EBCA-hud-corner-icons.md) (corner icons), [FS-MQYEX](MQYEX-timed-container-opening.md) (what "moves" and "takes damage" mean), [FS-JS7C8](JS7C8-class-run-attack-walk-pointer-facing.md) (the pin), [FS-TQZ5J](TQZ5J-ui-scene.md) (the UI scene) · Related ADRs: [ADR-0094](../adr/0094-class-book-page-icons-are-muted-pigment-glyphs-in-bronze-rimmed-roundels.md) (the page icons), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming is client presentation), [ADR-0080](../adr/0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md) (the knockouts the book icon stays), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)–[ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (the UI scene), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (snapshots cut per recipient), ADR-0013 (tokens only), ADR-0021 (art built in code) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Classes and abilities" (*class book*, *page*, *book ability*, *target kind*, *cast time*, *book cooldown*, *rune*, *witchlight*, *draught*, *hound*, *afloat*, *hardened*, *long night*); [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) (*class book*, *page roundel*, *armed page*, *cast bar*)

## Summary

Every class gets a **class book**: a panel of **pages** that unlock by character level from 1 to
20, each casting a slow, situational **book ability** on top of the left-click, right-click and
key-3 kit. The mage opens a **Spellbook**, the archer a **Hunter's Journal**, the mercenary
**The Ledger**, the warrior **Scars**. The player opens the book, clicks a page, aims a reticle
at what the page acts on and clicks it. Several pages take a moment to cast, counted by the
server and broken by moving or being hit. The core kit stays the strongest and most convenient
way to move and fight; pages are strong but answer particular moments of a Spire floor.

Pages that act on Spire entities (traps, secret doors, levers, stone blocks, chasms, cages,
poison, encounter groups, contract marks) need the Spire overhaul (FS-5FZ4J, FS-4EC7Z). This FS
specifies them in full, but they are built in a second wave once those entities exist (§K).

**Lane:** every slice is **agent lane**, server and client alike (charter of 2026-11-25: "make
sensible judgement and run the full chain, don't ask me for the backend work"). No `human` label.

## Decisions folded from the scoping notes

Owner decisions (Kranti, 2026-11-25) are marked **[owner]**; the charter's picks approved the same
day are **[charter default]** with their reason. Decisions made while writing this FS, where the
notes were silent, are **[derived]** with their reason. Every one is overridable.

- **Why [owner].** "One of the most important pieces of this game": class abilities in a slow
  dungeon-crawl style. "Takes time and is finicky, but is part of the wizard theme." The core
  keybinds stay the strongest; pages may be strong but are situational. Not every class is
  click-oriented, but each opens a class-specific thing, not called a spell book.
- **The four books [owner]:** Mage → Spellbook; Archer → Hunter's Journal (brewing, a summoned
  assist); Mercenary → The Ledger; Warrior → Scars (each page a scar learned in the past, with a
  line of where it was earned). Class display names stay Mage and Archer.
- **Casting [owner]:** "Shouldn't root you; the only downside is it needing to be clicked, with a
  cast/root where necessary for balance purposes."
- **The book's key is `K`, not `B` [derived — reason: `B` already opens the inventory beside `I`
  (FS-HRH2J §Change: Character and inventory apart; `keydown-B` in the UI scene), and taking it
  would break a shipped binding. `K` is free and sits under the hand. The charter's "B" is not
  honoured; the owner can swap it back by taking `B` from the inventory.]**
- **A corner icon opens it [charter default — reason: every panel has one (FS-3EBCA)].** It is a
  bronze knockout like the rest of the row (ADR-0080); only the pages inside are roundels
  (ADR-0094).
- **Runs only [charter default — reason: the pages answer Spire floors].** In the hub and the
  fields the corner icon is greyed and `K` does nothing; the server refuses a page cast there.
- **The game never pauses; walking stays free with the book open [charter default].**
- **Book abilities neither start the pin nor are shortened by attack speed [charter default —
  reason: they are utility, sized against run length].**
- **Unlocking [owner]:** automatic by character level, spread over 1–20, no tree points; locked
  pages show greyed with "Lv N"; the server checks the level on every cast.
- **Costs [owner]:** class resource or long cooldowns, sized to a run of about 6–10 minutes a
  floor and up to 10 floors. **No gold on any page.**
- **The roster and its numbers** (owner-approved pages; numbers are charter defaults) are §B's
  tables. Turncoat was replaced by Take a Contract **[owner]**. Heave's "hold a closing door or
  crushing ceiling" waits for the crushing-ceiling trap, deferred in FS-5FZ4J **[charter
  default]**.
- **Self pages cast on the click [derived — reason: a self page has nothing to choose, so a
  reticle that can only be clicked on oneself is a second click for nothing. The notes list
  `self` as a reticle kind; in the client it behaves as `none`, and on the wire it stays its own
  kind so the server can refuse it on any other target.]**
- **The server sends the book [derived — reason: FS-Q18Q3 R1's argument: the client never mirrors
  the server's cooldown, cost or level tables, so a retune never needs a client change].** The
  client keeps only what is presentation: names, lines, pictures, target kinds and reticle ranges.
- **The panel look [charter default]:** a grid of page roundels on a vellum panel, the page's name
  and one line on hover.
- **Hired-ally and mark mechanics live in FS-4EC7Z [owner]**; this FS wires the pages to them.

### Reconciled at review (2026-11-25, wave 1)

Where the build settled what this FS left loose. Each is [derived] and overridable.

- **Book effects, not "world effects".** Witchlights, runes, draughts and hounds go out as
  `book_effects` entries (`{id, kind, x, y, remaining}`), cut per recipient by distance like
  every run entity (ADR-0060; the interest radius is 20 cells, far past any page's reach). A
  draught is a `book_effects` entry of kind `draught` drunk through the ordinary `interact`
  action by its `id`, not an interactable; its `remaining` is 0 (it has no timer).
- **Extra wire fields:** a rune's `caught` count (for the flash); a hound's `owner_id`,
  `health`, `max_health` and `action` (`idle|run|bite|dead`); a `draught` delver state while a
  drink heals.
- **No delver's hit lands on a hound,** and monster area abilities strike delvers only; strikes
  and shots from monsters do hit it.
- **The draught's heal is drawn in the health colour, not green** (design guideline: "Healing is
  not green").
- **The ally `target_id`** is the teammate's player id (`other_players[].id`; self:
  `current_player.id`); entity ids are also accepted.
- **Afloat refuses the parry** as the mercenary's class ability (R23).
- **Each page entry also carries `cooldown_length`** (seconds; 0 for a limited page) **and
  `limit`** (`floor` or `delve`, absent for a timed page), so the tip's cooldown words come from
  the server and a retune needs no client change (the "server sends the book" decision).
- **A spent page is drawn dim with a "spent" caption** (R38), not greyed: ADR-0094 keeps the
  grey for locked pages only.
- **The book is drawn in the client's book order** whatever order the pages arrive in.
- **The hound's atlas is resident** (loaded at boot, ADR-0059's default for a group no scene table
  names): naming it in the run's row would change FS-C4JWH R4's table. A follow-up for FS-C4JWH.
- **A rune goes with its third catch**: the rune is not sent on the tick it is used up, so the
  client flashes it on the first two catches only; the third shows as the monster stunned and
  the rune gone (R24 over R47's flash).
- **Each page entry also carries `cast_time`** (seconds, 0 for an instant page) for the open
  tome's "cost · cast time · cooldown" line (§Change C5).

### Reconciled at wave 2 (2026-11-25, against FS-5FZ4J as built)

§J was written before the Spire's floors were built. Where the built floor differs, the page
follows the floor. Each is [derived] and overridable.

- **Reveal finds secret doors and traps; there are no hidden switches** (R49). A tripwire is a
  trap. What a page reveals is detected for the party (FS-5FZ4J R30, R38) and marked revealed
  (`DetectableComponent.Revealed`), so it goes out with `revealed: true`: on its trap entry, the
  hook FS-5FZ4J left, and on a secret door's barrier entry, which the minimap shows as the
  Cutthroats' tip does (FS-4EC7Z §D R14, §G R35).
- **An "ambush room" is an ambush still waiting** (R49): FS-5FZ4J's ambushes spawn when a seal
  piece is first worked or a tripwire trips, so no room holds one beforehand. The hound bays at a
  seal piece or tripwire within 6 cells whose ambush has not woken, as it bays at a shut secret
  door.
- **No fall rule exists** (R51): FS-5FZ4J's pits are rock and "a body is never inside one". An
  afloat delver whose state ends over a pit is set down, unhurt, on the nearest bank the pit reaches
  (the nearest walkable cell across the pit's own cells), or the straight nearest walkable cell when
  none is reached.
- **No jammed portcullis exists** (R52): the gate opens only by its seals (ADR-0092), so Heave
  shoves stone blocks only, and only within the block's plates room, as the Spire's push keeps it.
- **A plate takes no interact** (R50): it is held by weight, so Far Hand cannot work one; a hound
  standing on it holds it (R58): the plate is down to the hound's archer while they are in play, so an
  ambush it wakes hunts the archer (else the delver nearest the plate), never the hound.
- **Hardened stops a poisoning from taking hold** (R53): a gas vent's puff does not poison a
  hardened warrior, and a trap's hit (a wrong lever's darts too) deals them nothing; a poison
  already running runs on. This holds for every poisoning, the contract mark's blades too.
- **Pick the Lock opens the cage only** (R55): the sealed floors built no locked doors and no
  locked chests. It calls FS-4EC7Z's open-cage entry point (`OpenCage`); Strike a Deal calls
  `Hire` and Take a Contract calls `TakeContract`, and each page refuses as its entry point does.
- **A page the world refuses is told why** (§A R4 kept for the book's own gates): when a page's
  entry point refuses (Take a Contract, Pick the Lock, Strike a Deal, Far Hand), nothing is spent and
  the caster gets the ordinary refused reply on `cast_skill`, its `reason` one of `contract_taken`,
  `contract_no_stairs` (no contract on the top floor), `contract_no_room` (no room holds the mark),
  `cage_open` (the cage's key opened it during the cast), `not_willing`, `already_hired`,
  `too_many_allies`. A cast-time page is told at its cast's end. Far Hand's work answers on the
  interact's own reply (`lever_wrong`, `container_guarded`). The book's own refusals (locked, cooling,
  short, out of range) still send nothing.
- **Far Hand opens a chest through the mage's own timed open** (FS-MQYEX), its reach measured from
  beside the chest; moving, a hit or an attack cancels it, as at the chest. A sprung trap hits no one;
  a tripwire wakes its ambush on the mage. Far Hand needs no line of sight (R50 names none).
- **The hound's bay is on the wire** as a `bay: {x, y}` point on its `book_effects` entry while it
  bays (1.5 s, every 4 s while something is near). It points at an undetected door or tripwire on
  purpose: that is what baying is for. It reveals nothing.
- **The hound is a body that weighs** (holds a plate) and is hunted (chased, struck in melee); a
  monster's area ability still spares it, as recorded at wave 1.

## Requirements

### §A. The book and its pages (game-service)

1. **Each class config names its book's pages,** beside its class ability and tree ability
   (FS-04EEA R2): the page ids of §B, in book order. A page is data: id, class, unlock level,
   target kind, range, cast time, cost, cooldown or limit. One table, `classBooks`, is the source
   for both resolving and the wire. *[derived — reason: one place to tune.]*
2. **Page ids are skill ids.** Each of the 14 page ids is a `cast_skill` skill id of its own, mapped
   to nothing else. *[derived — reason: FS-04EEA R1, one id per ability.]*
3. **A page is unlocked when the character's level is at or above its unlock level.** No tree
   points, no other condition. *[owner]*
4. **A page cast is refused,** with no effect, no cost, no cooldown and no message back (FS-8AY7S
   R10), when any of these hold on the tick it is taken:
   - the caster's class does not have that page, or the page is locked (R3);
   - the world is not a run (the hub or a field) *[charter default]*;
   - the caster is not in play (dead, downed, escaped);
   - the page is on its cooldown, or its once-per-floor or once-per-delve use is spent;
   - the caster is short of its cost in their class resource;
   - the target does not fit the page's target kind or lies beyond its range (§C);
   - the caster is already casting a page (§D);
   - the caster is pinned (FS-JS7C8: every cast but the parry is refused while pinned).
   *[owner: "refused when locked, on cooldown, short of cost or out of range"; the rest derived —
   reason: the same gates every cast meets today.]*
5. **A page with no cast time resolves on the tick it is taken:** it pays its cost, starts its
   cooldown and has its effect. A page with a cast time starts casting instead (§D).
6. **Book abilities do not start the pin** and **are not shortened by worn attack speed**: their
   cooldowns are the table's. *[charter default]*
7. **A resolving book ability does not stop a warrior's charge in flight** *[derived — reason: it is
   not an attack; a charge is already in motion and a cast with a cast time is broken by the move
   anyway (§D)]*.
8. **Book cooldowns are per run.** A run starts with every page ready; cooldowns count down in
   simulation time across floors. A **once per floor** page is spent until the party climbs, and
   climbing makes it ready. A **once per delve** page is spent for the rest of the run.
   *[owner]*

### §B. The roster

9. **Mage, Spellbook** (mana):

   | Lv | Page (id) | Target | Range | Cast | Cost | Cooldown | Effect | Wave |
   |---|---|---|---|---|---|---|---|---|
   | 2 | Witchlight (`witchlight`) | ground | 8 cells | 1 s | 20 mana | 45 s | R21–R22 | 1 (light, fog); 2 (reveal) |
   | 5 | Far Hand (`far_hand`) | interactable | 6 cells | 1 s | 15 mana | 30 s | R50 | 2 |
   | 9 | Levitate (`levitate`) | ally or self | 6 cells | 1.5 s | 35 mana | 90 s | R23 | 1 (afloat); 2 (crossing) |
   | 13 | Binding Glyph (`binding_glyph`) | ground | 6 cells | 2.5 s | 40 mana | 60 s | R24 | 1 |
   | 17 | Recall (`recall`) | none | — | 3 s | 50 mana | once per floor | R25 | 1 |

10. **Archer, Hunter's Journal** (stamina):

    | Lv | Page (id) | Target | Range | Cast | Cost | Cooldown | Effect | Wave |
    |---|---|---|---|---|---|---|---|---|
    | 3 | Tracker's Eye (`trackers_eye`) | none | — | — | 20 stamina | 60 s | R26 | 1 (state); 2 (reveal) |
    | 9 | Brew (`brew`) | none | — | 3 s | 30 stamina | 120 s | R27 | 1 (draught, heal); 2 (cure) |
    | 15 | Call the Hound (`call_the_hound`) | ground | 4 cells | 2 s | 40 stamina | 180 s | R28–R29 | 1 (summon, fight); 2 (plate, baying) |

11. **Mercenary, The Ledger** (no resource cost):

    | Lv | Page (id) | Target | Range | Cast | Cost | Cooldown | Effect | Wave |
    |---|---|---|---|---|---|---|---|---|
    | 3 | Pick the Lock (`pick_the_lock`) | interactable (locked door, cage or chest) | adjacent | 4 s | — | 30 s | R55 | 2 |
    | 9 | Strike a Deal (`strike_a_deal`) | interactable (encounter group) | 4 cells | 2 s | — | 900 s | R56 | 2 |
    | 15 | Take a Contract (`take_a_contract`) | none | — | — | — | once per delve | R57 | 2 |

    A mercenary's pages cost nothing: parry charges are not spent by pages. *[owner: "no resource
    cost"]*

12. **Warrior, Scars** (stamina):

    | Lv | Page (id) | Target | Range | Cast | Cost | Cooldown | Effect | Wave |
    |---|---|---|---|---|---|---|---|---|
    | 3 | Scar of the Gate, Heave (`heave`) | interactable (stone block, jammed portcullis) | adjacent | 2 s | 25 stamina | 20 s | R52 | 2 |
    | 9 | Scar of the Pit, Hardened (`hardened`) | self | — | — | 30 stamina | 90 s | R30 | 1 (state); 2 (immunity) |
    | 15 | Scar of the Long Night, Last Stand (`long_night`) | self | — | — | 40 stamina | 120 s | R31 | 1 |

    The Long Night's id is `long_night`, never `last_stand`: *Last Stand* is already the
    Guardian's saving rule (FS-E1ZDG, `LastStandSpentComponent`). *[derived — reason: the
    glossary's collision]*

    "Adjacent" is within 1.5 cells of the caster's centre. A cell is the floor's cell size (80 px
    today). *[derived — reason: diagonal neighbours count]*

### §C. Targets (game-service)

13. **The cast carries its target as the target kind needs it.** `ground` uses the cast's target
    point. `ally` and `interactable` use the cast's target entity id. `self` and `none` ignore
    both. *[derived — reason: ADR-0030, the server judges the resolved cast; an entity target needs
    an id, a point would be ambiguous between two bodies]*
14. **Range is judged on the tick the cast is taken,** from the caster's centre to the point or to
    the target's centre, in cells of the floor. A `ground` point must also be a walkable cell
    (not a wall); a point beyond range is refused, never clamped. *[derived — reason: a light or
    rune inside a wall is lost; clamping would surprise the player who aimed]*
15. **An `ally` target** is a living, un-escaped delver of the caster's own run within range,
    or the caster where the page allows self (Levitate). *[owner: "ally or self"]*

### §D. Cast time (game-service)

16. **A page with a cast time starts casting** on the tick it is accepted (R4 passed). The server
    counts it in simulation time. While it runs the caster is **casting** that page.
17. **Completion.** When the cast time has run out the server re-checks the page's cost and target
    (the target still valid and still within range plus one cell; the caster still in play): if
    they hold, it pays the cost, starts the cooldown and has its effect; if not, the cast ends with
    nothing. *[derived — reason: an ally can walk out of reach or die during the cast; the extra
    cell keeps a target who shuffled a step from failing]*
18. **Breaking.** A cast in progress ends with no effect, no cost and no cooldown when the caster:
    - **moves** (their position differs from where it stood when the cast started, whatever moved
      them; FS-MQYEX D3);
    - **takes damage** (a hit lands and costs health; FS-MQYEX D4);
    - **casts anything else that resolves** (an attack, the class ability, the tree ability);
      *[derived — reason: one action at a time; the player chose to fight]*
    - is no longer in play (dead, downed, escaped), or the floor changes (FS-MQYEX D7).
    *[owner: "moving or taking damage breaks it with no effect, no cost and no cooldown"]*
19. **One cast at a time.** A page cast while casting is refused (R4). *[derived]*
20. **Casting does not root.** The player may walk at any time; walking breaks the cast. *[owner:
    "shouldn't root you"]*

### §E. Wave-1 effects (game-service)

Positions are in pixels on the wire and in cells in this FS; a cell is the floor's cell size.

21. **Witchlight — the light.** A completed Witchlight sets down a **witchlight** at the target
    point for **20 s**, then it goes. It does not move on the server (its drift is drawn, R47).
    Any number may exist, one per cast. It is in every recipient's state as a world effect
    (position, remaining time) so every client draws it. *[charter default — 20 s; derived: static
    on the server]*
22. **Witchlight — the fog.** The fog of war is the client's (ADR-0063, FS-SRA9J: region-based,
    party-shared, no server fog), so the server's part is only to send every witchlight in the run's
    state (R21) with its position; the lifting itself is the client's (R48). *[derived — reason:
    the existing fog's owner; see R60]*
23. **Levitate — afloat.** A completed Levitate makes its target **afloat** for **8 s**. While
    afloat a delver **cannot attack**: every attack row, the class ability and the tree ability are
    refused as if on cooldown; book abilities and the potion still work. Afloat shows in every
    recipient's state for that delver. A second Levitate on an afloat delver restarts the 8 s.
    *[owner: "cannot attack while afloat"; derived: the restart]* Crossing chasms and not firing
    traps are wave 2 (R51).
24. **Binding Glyph — the rune.** A completed Binding Glyph lays a **rune** of radius **0.75 cells**
    (1.5 cells across) at the target point for **30 s**. The first **3** distinct monsters whose
    centre enters the rune are each **stunned for 4 s** as FS-04EEA §C stuns (a boss 2 s, as
    Earthbreaker halves it). After the third, or when its time is up, the rune goes. A monster
    already inside when it is laid is caught on the first tick. A monster is caught once per rune.
    The rune shows in every recipient's state. *[charter default: 30 s, 3, 4 s; derived: the boss
    half, from FS-04EEA R10]*
25. **Recall.** A completed Recall moves every other living, un-escaped delver of the run on the
    mage's floor to a free walkable spot within 2 cells of the mage, nearest first, never inside a
    wall. A recalled delver's own cast and timed open break (they moved). A Recall with no one to
    pull is **refused at the cast** (R4 does not take it) so a solo mage never wastes the floor's
    use. *[owner: "pulls every living, un-escaped teammate on the floor"; derived: the refusal and
    the 2-cell landing]*
26. **Tracker's Eye — the state.** Tracker's Eye gives the archer **tracker's eye** for **15 s**,
    shown in the owner's state (and the party's frames may show it). Its reveal is wave 2 (R49).
    *[charter default]*
27. **Brew — the draught.** A completed Brew sets a **draught** at the archer's feet. Any delver of
    the run drinks it by interacting with it (the interact reach, 60 px), once; it is gone when
    drunk or when the floor ends. Drinking heals **30 % of the drinker's max health over 6 s**,
    in even parts each tick, never above max; a second draught drunk during a heal restarts it at
    the new full amount. The draught shows in every recipient's state as an interactable.
    *[charter default; derived: the restart]* Curing poison is wave 2 (R54).
28. **Call the Hound — the summon.** A completed Call the Hound sets a **hound** at the target point
    for **40 s**. It has **40 % of the archer's max health**, moves at the archer's base speed,
    and bites the nearest monster within **5 cells** of it for **8 + 0.5 × the archer's level**
    physical damage every **1.0 s** at a 1-cell reach; with no monster in reach it follows the
    archer to within 2 cells. Monsters may take it as a target like a delver (it is a body on the
    floor). It never counts as a delver: not for a floor's clear, the party, escape, loot,
    experience or the arrival of a fight. When its time is up or its health reaches 0 it is gone,
    leaving nothing. One hound per archer: a new one replaces the old. It shows in every
    recipient's state. *[charter default: 40 s, fights; derived: the numbers, to tune]* Holding a
    plate and baying at secret doors and ambush rooms are wave 2 (R49, R58).
29. **Hound kills.** A monster the hound kills is a kill by the archer for loot and experience,
    as the burning trail's kills are its owner's. *[derived — reason: FS-4R9M9 R36, a lasting
    effect's kills are its owner's]*
30. **Hardened — the state.** Hardened gives the warrior **hardened** for **10 s**, shown in every
    recipient's state for that warrior. Its trap and poison immunity is wave 2 (R53).
31. **The Long Night.** The Scar of the Long Night gives the warrior **long night** for **6 s**:
    every living monster within **5 cells** of the warrior when it starts, and any that comes within
    5 cells while it runs, takes the warrior as its target (as if the warrior were its nearest
    foe), and the warrior takes **30 % less damage** from every hit while it runs. A monster
    that is stunned stays stunned. When it ends, monsters choose their targets as they normally
    do. Shown in every recipient's state. *[charter default]*

### §F. The wire (game-service → game-client)

32. **`current_player.book`** carries the owner's book, in a run only, absent in the hub and
    fields: `{pages: [...], casting}`. Each page entry is `{id, unlock_level, cost, cooldown:
    {remaining, total}, spent}`: `cost` the whole cost in the class resource (0 for the
    mercenary's), `cooldown` as FS-Q18Q3 R1 (`{0, 0}` when ready), `spent` true while a
    once-per-floor or once-per-delve use is spent. Only pages the server can resolve are sent
    (§K). `casting` is `{page, remaining, total}` while casting, absent otherwise.
    *[derived — reason: FS-Q18Q3's shape and rule; the client draws only what the server sends,
    so wave 2 adds pages by sending them]*
33. **`other_players` never carry `book`.** *[derived — FS-Q18Q3 R6]*
34. **World effects** are added to the per-tick state for every recipient of the run: witchlights
    and runes (id, kind, position, remaining), the hound (id, owner id, position, health, max,
    action), draughts (as interactables, with an id and position). Afloat, hardened, long night
    and tracker's eye appear as named states on the delver they are on, in `current_player` and
    `other_players` alike. *[derived — reason: everyone must see the effects; only the book is the
    owner's]*
35. **Inbound:** `cast_skill` with the page id as the skill, the target point (for `ground`), and a
    target entity id (for `ally` and `interactable`). No new action. *[derived — ADR-0030]*

### §G. The book (game-client)

36. **`K` and the corner row's book icon open and close the class book,** in a run. The icon is a
    bronze knockout of a closed, clasped book with a ribbon (ADR-0080), distinct from the controls
    badge's open book, at the left end of the corner row (after Tree), naming itself "Book (K)"
    under the pointer; the XP bar's clearance moves with the row. In the hub and fields the icon is greyed and `K`
    does nothing. The book is a UI-scene window (ADR-0084–0086): it wears the windows' frame and
    ×, and steps aside when another window opens (FS-TQZ5J), Esc closes it as it closes the others.
37. **The panel** is titled with the class's book (Spellbook, Hunter's Journal, The Ledger,
    Scars) over a grid of the class's **page roundels** in book order on a vellum ground. Hovering a
    page shows its name, its one line, its cost and cooldown, and for a Scar the line of where it was
    earned. A page the server has not sent (wave 2, §K) is not drawn. *[charter default]*
38. **A page roundel shows its state** from `current_player.book`: **locked** (greyed, "Lv N"
    under it) while the character's level is below `unlock_level`; **recovering** under a cooldown
    sweep from `cooldown`, or greyed with "spent" while `spent`; **dim** while the player's class
    resource is below `cost`; otherwise **ready**. ADR-0094 owns the look.
39. **The game does not pause** and walking stays free with the book open. Left-clicks over the
    panel do not attack.

### §H. Casting (game-client)

40. **Clicking a ready page arms it** (a page of kind `none` or `self` is never armed: the click
    sends its cast). Locked, recovering, spent or dim pages do nothing on a click.
41. **While a page is armed** the cursor over the world is a **reticle** for its target kind:
    - `ground`: a ring of the page's effect size (Witchlight's 3-cell glow, the rune's 1.5 cells,
      the hound a paw mark) at the pointer, faint when beyond the page's range from the player;
    - `ally`: a ring under the teammate (or the player, where self is allowed) nearest the pointer
      within a body's reach of it; faint when none or beyond range;
    - `interactable`: as ally, for interactables (wave 2).
    A left-click on a valid target sends `cast_skill` with the page id and the target, then
    disarms. A left-click on no valid target does nothing and keeps the page armed. **Right-click
    or Esc disarms** without casting and does nothing else (no class ability, no menu). Closing the
    book, opening another window, death or leaving the run disarms. *[owner/charter: page →
    reticle → target; right-click or Esc disarms]*
42. **The cast is not predicted.** The client draws nothing of the effect until the server's state
    shows it (ADR-0030). A refused cast simply shows nothing.
43. **The cast bar.** While `current_player.book.casting` is present a small bar under the player's
    feet fills from 0 to `total`, with the page's roundel at its left at cast-bar size. It clears
    when `casting` goes. Only the owner sees it. *[owner: "a small bar shows it"]*
44. **The reticle and the armed state are presentation only;** the server never knows about them
    (ADR-0030).
44a. **The world casts, the book asks.** The book is a UI-scene piece; a cast is world play
    (ADR-0085 Decision 1) and a reticle is a world effect (ADR-0086). Clicking a page sends the
    world a request (a new `UiRequest` kind); the run arms the page, draws the reticle and sends
    `cast_skill`. Esc's disarm is the first step of the Esc order while a page is armed.
    *[derived — reason: the ADRs]*

### §I. How it looks (game-client)

45. **Page roundels** follow ADR-0094: a muted pigment glyph in a bronze-rimmed disc, built in code
    by one shared renderer, from `BARROW` tokens only (ADR-0013). Each page's pigment by what it
    does:

    | Page | Pigment | Picture |
    |---|---|---|
    | Witchlight | ochre | a small flame-globe with rays |
    | Far Hand | lapis | an open hand with a trailing line |
    | Levitate | lapis | a figure over a wave-line of air |
    | Binding Glyph | madder | a ringed rune, three strokes crossing |
    | Recall | lapis | three arrows turning in to a point |
    | Tracker's Eye | ochre | an eye over a paw print |
    | Brew | verdigris | a stoppered flask, bubbles |
    | Call the Hound | verdigris | a hound's head in profile |
    | Pick the Lock | ochre | a keyhole with a pick |
    | Strike a Deal | ochre | two hands clasped |
    | Take a Contract | madder | a sealed scroll |
    | Heave | madder | a block pressed by a shoulder |
    | Hardened | verdigris | a shield cracked and holding |
    | Long Night | madder | a crescent moon over crossed blades |

    *[derived — ADR-0094's pigment rule; the pictures are this FS's picks]*
46. **Art gate:** a contact sheet of all 14 roundels in their four states (ready, locked,
    recovering, hovered) at render scales 1, 1.5 and 2 is made before they are wired into the
    panel. *[owner/charter]*
47. **World effects are drawn** for every viewer: the witchlight a soft warm globe that bobs and
    drifts a little around its point, with a light pool; the rune a madder ring on the floor that
    pulses and flashes when it catches; the hound a lean grey hound built in code at the creature
    fidelity bar (ADR-0021: Ultima Online), with run, bite and fall; the draught a small stoppered
    flask on the floor; afloat a delver lifted a little with a soft shadow below; hardened a dull
    bronze sheen; long night a dark ring at the warrior's feet; tracker's eye a faint ochre ring
    on the archer. Colours from `BARROW` tokens. *[derived]*
48. **Fog.** While a witchlight burns, every viewer's fog treats the cells within **3 cells** of
    it as seen, as if a delver stood there: monsters and piles there show, and the cells stay
    explored once it goes. The exploration (`src/render/world/exploration.ts`) gains lit points
    with a radius beside the party's positions. *[owner/charter: "fog lifts"]*

### §J. Wave-2 effects (game-service and game-client; built after FS-5FZ4J and FS-4EC7Z)

These are part of this FS and specified here; they are built once the Spire entities exist.
Their numbers are charter defaults.

49. **Reveal (Witchlight, Tracker's Eye, the hound).** Hidden doors, switches and traps within
    3 cells of a witchlight are **detected** for the party while it burns; every trap, tripwire and
    secret door within 10 cells of the archer is detected while tracker's eye runs; a hound **bays**
    (a sound and a mark) at a secret door or an ambush room within 6 cells of it. Detected follows
    FS-5FZ4J's rule (once detected by anyone, known to the party; never sent before). Blocked by
    FS-5FZ4J (traps, secret doors) and FS-4EC7Z (ambush rooms).
50. **Far Hand.** Works a lever, plate, chest or door within 6 cells as if the mage had interacted
    with it from beside it; springs a detected trap. Blocked by FS-5FZ4J.
51. **Levitate's crossing.** An afloat delver crosses chasm cells as walkable and fires no trap.
    Landing on a chasm cell when it ends: falls as FS-5FZ4J's chasm rule says. Blocked by FS-5FZ4J.
52. **Heave.** Forces a jammed portcullis open; shoves an adjacent stone block one full cell away
    from the warrior, if that cell is free. Blocked by FS-5FZ4J.
53. **Hardened's immunity.** While hardened, trap damage and poisoning on the warrior are ignored.
    Blocked by FS-5FZ4J.
54. **Brew's cure.** Drinking a draught also cures poison. Blocked by FS-5FZ4J.
55. **Pick the Lock.** Opens an adjacent locked door, cage or chest without its key. Blocked by
    FS-5FZ4J (locked doors) and FS-4EC7Z (cages).
56. **Strike a Deal.** Hires a willing encounter group within 4 cells for the rest of the floor, as
    FS-4EC7Z's hire. Blocked by FS-4EC7Z.
57. **Take a Contract.** Places a contract mark on this floor, as FS-4EC7Z's mark; killing it grants
    the mercenary **Contract Settled** (+15 % damage until the delve ends, lost on death). Blocked
    by FS-4EC7Z.
58. **The hound holds a plate.** A hound standing on a pressure plate holds it as a body does.
    Blocked by FS-5FZ4J.

### §K. Waves

59. **Wave 1** builds §A–§I for the pages and parts marked wave 1 in §B. The server's `classBooks`
    table holds all 14 pages, but only pages with a wave-1 resolver are **offered**: sent in
    `current_player.book.pages` and castable. The others are refused as a locked page is and not
    drawn. No stand-in Spire entity is made. *[derived — reason: no page that does nothing is
    offered to a player]*
60. **Fog placement.** The fog of war is client-side (FS-SRA9J, ADR-0063, ADR-0090), so the
    witchlight's fog rule is a client rule (R48) fed by the server's witchlight positions (R21).
61. **Wave 2** builds §J, page by page, each slice blocked by the Spire slice that builds its
    entity.

## User Stories

1. As a mage, I want to open my Spellbook with `K` or a corner icon, so that I can see what my
   level has taught me.
2. As any delver, I want the book named for my class (Spellbook, Hunter's Journal, The Ledger,
   Scars), so that it feels like my class's own thing.
3. As a delver, I want locked pages shown greyed with the level they open at, so that I know what
   is coming.
4. As a delver, I want a page to unlock on its own when I reach its level, so that I never have
   to spend points on it.
5. As a delver, I want to click a page and then click where it goes, so that I aim it like a
   spell from an old book.
6. As a delver, I want the reticle to show the page's reach and to fade when I am out of range,
   so that I do not waste a click.
7. As a delver, I want right-click or Esc to put an armed page away without doing anything else,
   so that I can change my mind safely.
8. As a delver, I want self pages (Hardened, the Long Night) and pages without a target (Recall,
   Brew, Tracker's Eye) to cast on the click, so that they are quick.
9. As a delver, I want to keep walking with the book open, so that a monster never catches me
   reading.
10. As a delver, I want a cast bar while a page casts, so that I know how long to stand still.
11. As a delver, I want walking or being hit to break a cast with nothing spent, so that a broken
    cast costs me only time.
12. As a delver, I want a page's cooldown shown as a sweep over its roundel, so that I know when it
    is back.
13. As a delver, I want a page I cannot afford dimmed, so that I see why it will not cast.
14. As a delver, I want book cooldowns to carry across floors and reset each run, so that a run
    is the unit I plan around.
15. As a mage, I want Witchlight to light a spot and lift the fog around it, so that my party can
    see a dark room before walking in.
16. As a mage, I want to Levitate an ally or myself, so that we can float over a hazard (and,
    later, a chasm).
17. As a mage, I want Binding Glyph to hold the first monsters that cross it, so that I can lay a
    trap in a doorway.
18. As a mage, I want Recall to pull my living teammates to me once a floor, so that a scattered
    party can regroup.
19. As a solo mage, I want Recall refused when there is no one to pull, so that I do not waste the
    floor's use.
20. As an archer, I want Tracker's Eye to sharpen my sight for a while (and, later, show traps
    and secret doors), so that I can lead the party.
21. As an archer, I want to brew a draught any of us can drink, so that I can heal a teammate
    after a fight.
22. As any delver, I want to drink an archer's draught by interacting with it, so that the heal
    is mine to take.
23. As an archer, I want to call a hound that fights beside me, so that I have help when a room
    goes bad.
24. As a teammate, I want the hound drawn and its kills counted as the archer's, so that loot and
    experience work as for any kill.
25. As a warrior, I want Hardened, so that I can lead through danger (its trap and poison immunity
    arriving with traps).
26. As a warrior, I want the Long Night to turn nearby monsters on me while I take less damage, so
    that I can protect my party.
27. As a mercenary, I want The Ledger's pages (Pick the Lock, Strike a Deal, Take a Contract) once
    the Spire has locks, encounter groups and marks, so that I can bargain and burgle my way up.
28. As a teammate, I want to see a mage's light and rune, a delver afloat, a warrior hardened or
    under the Long Night, so that I understand what my party is doing.
29. As a player in the hub or a field, I want the book's icon greyed and `K` inert, so that I am
    not offered pages that cannot work there.
30. As a designer, I want every cost, cooldown, cast time and unlock level in one server table, so
    that tuning never needs a client change.
31. As a player who has not reached a page's wave, I want it absent from the book rather than a
    page that does nothing, so that the book never lies.

## Acceptance Criteria

### game-service

- [ ] `classBooks` holds the 14 pages of §B with their unlock levels, target kinds, ranges, cast
      times, costs and cooldowns; each class config names its pages in book order.
- [ ] A page cast is refused with no effect, no cost and no cooldown when locked by level, outside
      a run, by a caster not in play, on cooldown or spent, short of cost, on a bad or out-of-range
      target, while casting, or while pinned (R4).
- [ ] A page with no cast time resolves on the tick; pays its cost; starts its cooldown; does not
      start the pin; its cooldown is not shortened by attack speed.
- [ ] A page with a cast time starts casting; completes after the cast time with cost, cooldown and
      effect; is broken with nothing spent by moving, by a hit that costs health, by another
      resolving cast, by leaving play and by a floor change.
- [ ] Book cooldowns are kept across floors within a run; once-per-floor resets on climbing; once
      per delve never resets in the run.
- [ ] `current_player.book` carries the offered pages and `casting` in a run, absent elsewhere and
      on `other_players`.
- [ ] Witchlight lays a 20 s light at a walkable point within 8 cells; the fog rule of R22 holds
      where fog is computed.
- [ ] Levitate makes an ally or self afloat for 8 s; afloat refuses attacks, the class ability and
      the tree ability; afloat is on the delver's state.
- [ ] Binding Glyph lays a 30 s rune; the first 3 distinct monsters entering are stunned 4 s (boss
      2 s); then it goes.
- [ ] Recall moves every other living, un-escaped delver on the floor to free spots within 2
      cells of the mage; refused with no one to pull; once per floor.
- [ ] Tracker's Eye, Hardened and the Long Night set their timed states; the Long Night turns
      monsters within 5 cells on the warrior and cuts damage taken by 30 %.
- [ ] Brew sets a draught; a delver who interacts drinks it once for 30 % max health over 6 s; it
      is gone when drunk or the floor ends.
- [ ] Call the Hound summons a 40 s hound that bites monsters, can be struck, follows the archer,
      replaces an earlier hound, and whose kills count as the archer's.
- [ ] Only wave-1 pages are offered; the wave-2 pages are refused and not sent.

### game-client

- [ ] `K` and the corner row's book icon open and close the class book in a run; greyed and inert
      in the hub and fields; the book is a UI-scene window that Esc closes.
- [ ] The book is titled by class and shows the offered pages as roundels in book order with
      locked, recovering, spent, dim and ready states and a hover tip.
- [ ] Clicking a ready ground or ally page arms it with the right reticle; a valid click sends
      `cast_skill` with the page id and target; right-click or Esc disarms without side effects;
      none and self pages cast on the click.
- [ ] Left-clicks over the book and the armed click do not attack.
- [ ] The cast bar fills while `casting` is present and clears when it goes.
- [ ] The 14 roundels follow ADR-0094; a contact sheet of all 14 exists before they are wired.
- [ ] Witchlights, runes, hounds, draughts and the four delver states are drawn for every viewer;
      the witchlight lifts the fog in its 3 cells.
- [ ] The book's types decode `current_player.book` and the world effects; tests cover the state
      machine of arming and the roundel states.

## Edge States

- **Level-up mid-run:** a page unlocks on the next tick the level reaches its unlock level; the
  book redraws from the state.
- **Casting when the target dies or escapes:** the completion re-check fails; nothing spent.
- **Ally walks out of range during the cast:** within range plus one cell completes; beyond, it
  ends with nothing.
- **Caster downed or killed while casting:** the cast ends with nothing.
- **Floor change during a cast:** the cast ends with nothing; once-per-floor uses reset; the
  witchlights, runes and draughts of the old floor go; the hound goes (it does not climb).
- **Recall pulls a teammate mid-cast or mid-timed-open:** theirs breaks (they moved).
- **Recall with every teammate dead or escaped:** refused, nothing spent.
- **Two archers' draughts on one floor:** each is its own; drinking both restarts the heal.
- **Hound with no monster near:** follows the archer; with the archer dead or escaped it stands
  until its time runs out.
- **Rune laid on a monster:** catches it on the first tick.
- **Stunned monster under the Long Night:** stays stunned; takes the warrior as target when free.
- **Afloat delver presses attack:** refused, nothing drawn; walking and book pages still work.
- **Book open when the player dies or escapes:** the book closes and any armed page disarms.
- **Disconnect mid-cast:** the body stays in the run; a disconnected body does not move, so the
  cast completes or breaks on its own rules.
- **A cast arrives for a wave-2 page:** refused as a locked page.
- **A level-1 character:** an empty book shows every offered page locked; the book still opens.
- **A mercenary's book in wave 1:** all three pages are wave 2, so the book opens empty with the
  line "The Ledger is not yet written." *[derived]*

## WebSocket message surface

No HTTP endpoints change. No inbound action is added.

**Inbound (client → server)**

| Action | Change |
|---|---|
| `cast_skill` | the skill may be a page id (§B); for `ally` and `interactable` pages it carries a target entity id |

**Outbound (server → client), state broadcast**

| Field | Change |
|---|---|
| `current_player.book` (new, run only) | `{pages: [{id, unlock_level, cost, cooldown: {remaining, total}, spent}], casting?: {page, remaining, total}}` |
| `other_players[].book` | never sent |
| `book_states` (new) | `[{name, remaining}]`, names `afloat`, `hardened`, `long_night`, `trackers_eye`, `draught`, on `current_player` and `other_players` |
| `book_effects` (new, run) | `[{id, kind, x, y, remaining}]`, kinds `witchlight`, `rune` (+`caught`), `draught`, `hound` (+`owner_id`, `health`, `max_health`, `action`, `bay?: {x, y}`); cut per recipient by distance |
| `current_player.book.pages[]` | also `cooldown_length`, `limit?` (`floor`/`delve`), `cast_time` (Reconciled at review) |
| `traps[].revealed`, `barriers[].revealed` | true once a page revealed it (Reconciled at wave 2) |

**Outbound (server → client), replies**

| Action | Change |
|---|---|
| `cast_skill` reply (new) | the refused reply an interact already uses (`success: false`, a `reason`), sent when a page's entry point refuses; reasons in "Reconciled at wave 2" |

## Out of Scope

- Gold on any page or contract. *[owner]*
- Pages in the hub or the fields. *[charter default]*
- Rebinding keys, a page hotbar, or dragging pages to the ability bar.
- Turncoat. *[owner: replaced by Take a Contract]*
- Heave holding a closing door or a crushing ceiling (waits for FS-5FZ4J's deferred crushing
  ceiling). *[charter default]*
- Any Spire entity (traps, poison, secret doors, levers, plates, stone blocks, chasms, cages,
  encounter groups, hired allies, contract marks): FS-5FZ4J and FS-4EC7Z build them.
- Pages beyond the 14, and specialization variants of pages.
- Sound for the pages (a later FS-AND39 change).

## Change: Illuminated pages and the open tome

> Status: work-order · Date: 2026-11-25 · Related ADRs: [ADR-0095](../adr/0095-class-book-page-icons-are-illuminated-bone-glyphs-on-their-pigment.md) (amends ADR-0094's inks)

The owner compared variants of the page icons and the book panel (`/variants`, 2026-11-25,
relayed by the coordinating session) and picked **Illuminated** icons and an **Open tome**
panel. A look change only: casting, the bridge, the wire and the server are untouched. Styling
only, so the `/code-review` gate is skipped for this section (the owner's standing art rule).

### Requirements

C1. **Illuminated roundels** (ADR-0095): the page's pigment fills the disc as a soft radial
    (pigment at the centre top, `shade(pigment, 0.35)` at the rim), the picture's body is bone
    and its detail `shade(pigment, 0.55)`; the bronze rim is a little thicker and lifts to
    `brassBright` on hover; hovered lifts the ground's centre toward bone; locked is a flat warm
    near-ink ground with a `hudFaint` body; dim sinks every layer; recovering is ready under the
    sweep. The 14 pictures and the pigment-by-what-it-does mapping (R45) stay. Replaces R45's
    and ADR-0094's inks.
C2. **The contact sheet** (`docs/art/class-book-pages-contact-sheet.png`) is re-rendered in the
    new inks, all 14 pages in their states and at render scales 1, 1.5 and 2.
C3. **The open tome** replaces R37's panel: a two-page vellum spread in a dark leather border
    (tokens: leather about `#3b2a1d`; vellum about `#c9b98f` at the outer edges to `#d8caa3` near
    the middle; a gutter shadow about `#a89772` at the spine). It stands to one side of the
    screen, not the middle, because the run goes on behind it.
C4. **The left page**: the book's title in madder-brown ink, centred over a hairline rule; under
    it one row per offered page in book order: a 28 px roundel, the page's name in dark ink
    (about `#2c2118`), and its cost right-aligned in a muted brown (about `#5e4c34`). A locked row
    is at about 55 % opacity and shows "Lv N" instead of the cost. A spent row shows "spent". The
    hovered row has a soft `vellumDark` wash.
C5. **The right page** replaces R37's hover tip: the hovered page in full: a 64 px roundel, its
    name in madder-brown, its one line (and a Scar's earned-where line), then "cost · cast time ·
    cooldown" (cooldown words from the wire's `cooldown_length` and `limit`), then an italic hint:
    "Click to arm, then pick …" naming the target by the page's kind ("the ground", "an ally"),
    "Click to cast." for none and self pages, or the reason it waits ("Recovering.", "Not enough
    mana.", "Spent until the next floor.", "Learned at level N."). With no hover it shows the
    first ready page, or a blank page.
C6. **Clicking a row** arms or casts exactly as a click on a roundel did (R40). `K`, the corner
    icon, Esc, × and stepping aside for other windows are unchanged (R36).
C7. **A state flip redraws in place.** A page's state changing (a cooldown ending, a cast, the
    resource crossing a cost) redraws its row and the right page; it never rebuilds the panel and
    its roundel textures. (Was I-X2CMM-23 item 2.)
C8. **The cast bar** keeps its 28 px roundel, in the new inks.
C9. **The look stays swappable**: inks in `pageRoundel.ts`, the spread's tones and type in
    `classBookStyle.ts`, its geometry in `classBookLayout.ts`, behind the panel's draw.

### Acceptance Criteria

- [ ] Roundels draw ADR-0095's inks in every state; the contact sheet is re-rendered.
- [ ] The open tome draws the leather border, the vellum spread and gutter, the left page's rows
      and the right page, at one side of the screen.
- [ ] Hovering a row fills the right page; no hover shows the first ready page or a blank page.
- [ ] Clicking a row arms or casts as before; K, the icon, Esc, × and stepping aside still work.
- [ ] A state-only change redraws without rebuilding roundel textures.
- [ ] Client suites green.

### Edge States

- **A book with no offered pages** (the Ledger in wave 1): the left page shows the title and the
  "not yet written" line; the right page is blank.
- **Every page locked:** the right page shows the first page with "Learned at level N."
- **Small viewports** (1080 logical wide): the spread fits beside the ability bar and stays clear
  of the corner row and chat.

### Out of Scope

- Any change to casting, the bridge, the wire or the server.
- New pictures for the pages.
