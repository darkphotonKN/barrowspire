# FS-X2CMM: Class books

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Classes" (class book abilities unlocked by level); `game-client/SPECIFICATION.md` "### Escape run" (class book), "### Presentation" (class book page icons) → this FS · Siblings (same scoping session, 2026-11-25): [FS-5FZ4J](5FZ4J-sealed-floors.md) (the floors the pages answer), [FS-4EC7Z](4EC7Z-dungeon-encounters.md) (hired allies and contract marks the Ledger drives), [FS-9JV5K](9JV5K-wandering-merchant.md) · Builds on: [FS-04EEA](04EEA-class-tree-abilities.md) (tree ability, key 3, the resolve path), [FS-Q18Q3](Q18Q3-ability-bar.md) (cooldowns in the owner's state), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (class resources), [FS-BDA7X](BDA7X-character-leveling.md) (level cap 20), [FS-3EBCA](3EBCA-hud-corner-icons.md) (corner icons) · Related ADRs: [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md), [ADR-0080](../adr/0080-canvas-hud-icons-are-embossed-bronze-knockouts-from-one-shared-renderer.md) (the icon style these pages depart from), [ADR-0084](../adr/0084-the-interface-is-one-ui-scene-over-every-world-talking-to-the-worlds-through-a-typed-interface.md)–[ADR-0086](../adr/0086-which-interface-goes-in-the-ui-scene-and-which-stays-in-the-world.md) (UI scene)

## Scoping notes (raw)

Residue from the 2026-11-25 scoping session (Kranti), plus the charter defaults Kranti approved
the same day. **[owner]** = Kranti's words or approval; **[charter default]** = the charter's
pick, with its reason.

### Why [owner]

"One of the most important pieces of this game": class-specific abilities in a slow dungeon-crawl
style. The mage opens a spellbook (an old-school spellbook grid was the reference), clicks a
spell and casts it. "Takes time and is finicky, but is part of the wizard theme." The core
keybinds (left-click, right-click ability, key 3 tree ability) stay the strongest, most
convenient, kit-centric ways to move and attack; book pages may be strong but are situational.
Not every class is click-oriented, but each still opens a class-specific thing, not called a
spell book.

### The four books [owner]

| Class (display) | Book |
|---|---|
| Mage | **Spellbook** |
| Archer | **Hunter's Journal** (brewing, a summoned assist) |
| Mercenary | **The Ledger** |
| Warrior | **Scars** (each page a scar learned in the past, with a line of where it was earned) |

Class display names stay Mage/Archer (not Sorcerer/Ranger: "Shadow Ranger" is already an archer
specialization, FS-E1ZDG).

### Vocabulary

- **Class book**: the per-class panel. **Page**: one entry. **Book ability**: what a page casts
  (parallel to *tree ability*, FS-04EEA; never a bare "ability").

### Casting [owner]

"Shouldn't root you; the only downside is it needing to be clicked, with a cast/root where
necessary for balance purposes."

- **[charter default]** Open/close with **B** and a new corner icon (FS-3EBCA row); the panel is a
  UI-scene piece (ADR-0084–0086). The game never pauses. Walking stays free with the book open.
- Click an unlocked, ready page → the cursor becomes a reticle for that page's target kind
  (ground point, ally, interactable, self, none). Click the target to send the cast. Right-click
  or Esc disarms. Pages with target kind *none* cast on the click.
- The server resolves a book ability as a `cast_skill` like every other cast (ADR-0030): refused
  when locked, on cooldown, short of cost or out of range, with no effect, no cost, no cooldown.
- **Cast time** (only where listed below): the server counts it; moving or taking damage breaks
  it with no effect, no cost and no cooldown (the FS-MQYEX rule). A small bar shows it.
- Book abilities do not start the attack pin (FS-JS7C8) and are not shortened by attack speed
  **[charter default — reason: they are utility, sized against run length]**.
- Runs only in v1: the corner icon and **B** do nothing in the hub and fields **[charter default —
  reason: the pages answer Spire floors]**.
- Cooldowns are per run, reset at run start, kept across floors, sent in the owner's state like
  the other cooldowns (FS-Q18Q3). "Once per floor" resets on climbing; "once per delve" never.

### Unlocking [owner]

Pages unlock automatically by character level, spread over 1–20 (cap 20), with no tree points.
The tree ability holds 10 and the specialization 20; pages fill the levels between. A locked page
shows greyed with "Lv N". The server checks the level on every cast.

### Costs [owner]

Class resource or long cooldowns, sized to how long a run takes now that it is slowed down
(about 6–10 minutes a floor, up to 10 floors). **No gold on any page** (owner reversed an earlier
gold idea). Strike a Deal gets a long cooldown sized to run length; Take a Contract is once per
delve.

### The roster [owner-approved; numbers are charter defaults]

Mage, **Spellbook** (mana):
| Lv | Page | Target | Cast | Cost | Cooldown | Effect |
|---|---|---|---|---|---|---|
| 2 | Witchlight | ground ≤ 8 cells | 1 s | 20 mana | 45 s | a drifting light for 20 s; within 3 cells of it, hidden doors, switches and traps are revealed to the party, and fog lifts |
| 5 | Far Hand | interactable ≤ 6 cells | 1 s | 15 mana | 30 s | works a lever, plate, chest or door from range; springs a detected trap |
| 9 | Levitate | ally or self ≤ 6 cells | 1.5 s | 35 mana | 90 s | the target floats for 8 s over pits, spikes and gas (no trap fires, chasm cells walkable); cannot attack while afloat |
| 13 | Binding Glyph | ground ≤ 6 cells | 2.5 s | 40 mana | 60 s | a 1.5-cell rune for 30 s; the first 3 monsters to cross it are held 4 s (as the stun, FS-04EEA) |
| 17 | Recall | none | 3 s | 50 mana | once per floor | pulls every living, un-escaped teammate on the floor to the mage |

Archer, **Hunter's Journal** (stamina):
| Lv | Page | Target | Cast | Cost | Cooldown | Effect |
|---|---|---|---|---|---|---|
| 3 | Tracker's Eye | none | — | 20 stamina | 60 s | for 15 s every trap, tripwire and secret door within 10 cells shows to the party |
| 9 | Brew | none | 3 s | 30 stamina | 120 s | sets down a draught any delver can drink (interact): heals 30% max health over 6 s and cures poison; lasts until drunk or the floor ends |
| 15 | Call the Hound | ground ≤ 4 cells | 2 s | 40 stamina | 180 s | a hound for 40 s that fights, can hold a plate, and bays at secret doors and ambush rooms within 6 cells |

Mercenary, **The Ledger** (no resource cost):
| Lv | Page | Target | Cast | Cost | Cooldown | Effect |
|---|---|---|---|---|---|---|
| 3 | Pick the Lock | locked door, cage or chest, adjacent | 4 s | — | 30 s | opens it without its key |
| 9 | Strike a Deal | an encounter NPC group (FS-4EC7Z) | 2 s | — | 900 s (about one deal per two or three floors) | hires a willing group for the rest of the floor |
| 15 | Take a Contract | none | — | — | once per delve | a mark spawns on this floor (FS-4EC7Z); killing it grants Contract Settled (+15% damage, mercenary only, until the delve ends) |

Turncoat (turn a humanoid monster for 20 s) was replaced by Take a Contract. **[owner]**

Warrior, **Scars** (stamina):
| Lv | Page | Target | Cast | Cost | Cooldown | Effect |
|---|---|---|---|---|---|---|
| 3 | Scar of the Gate (Heave) | block, jammed portcullis, adjacent | 2 s | 25 stamina | 20 s | forces a jammed portcullis, shoves a stone block a full cell |
| 9 | Scar of the Pit (Hardened) | self | — | 30 stamina | 90 s | for 10 s trap damage and poison on the warrior are ignored |
| 15 | Scar of the Long Night (Last Stand) | self | — | 40 stamina | 120 s | for 6 s monsters within 5 cells turn on the warrior, who takes 30% less damage |

Heave's "hold a closing door/crushing ceiling" use waits for the crushing-ceiling trap, deferred in
FS-5FZ4J. **[charter default]**

### Icons [owner]

"Learn from the example but colour it in our serious Ultima-like vibe." **[charter default]**:
muted pigment glyphs (verdigris, ochre, madder, lapis, bone) inside bronze-rimmed roundels, built
in code, colours from `BARROW` tokens (ADR-0013). This departs from ADR-0080's embossed bronze
knockouts, so it needs an ADR. Art gate: a contact sheet of all 14 icons before wiring.

### Open questions (left for write-a-spec under the charter)

- Exact panel look (vellum page spread vs grid like the reference); charter default: a grid of
  roundels on a vellum panel with the page's name and one-line text on hover.
- Hired-ally and mark mechanics live in FS-4EC7Z; this FS wires the pages to them.
