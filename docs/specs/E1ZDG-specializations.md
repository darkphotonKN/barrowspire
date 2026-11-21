# FS-E1ZDG: Specializations

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Progression" (specializations); `game-server/api-gateway/SPECIFICATION.md` "### Characters" (specialization in the character read); `game-client/SPECIFICATION.md` "### Character" (specialization titles) → this FS · Character-service (no SPECIFICATION.md of its own) carries the derivation under this FS · Siblings (same scoping session, 2026-11-21): [FS-8RZ51](8RZ51-passive-skill-tree.md) (the tree, the tier-6 gate and the one-of-two rule; owns the pick), [FS-04EEA](04EEA-class-tree-abilities.md) (Settle the Debt), [FS-1J1CB](1J1CB-specialization-looks.md) (each spec's look, and the shadow on Shadow Shot) · Changes: [FS-MAMHR](MAMHR-mercenary-class.md) §E.23 (riposte arming and cost) via `## Change: Duelist and Sellsword riposte rules → FS-E1ZDG`; [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) R14, R22 (parry charges max 3, 3 pips) via `## Change: Sellsword's five parry charges → FS-E1ZDG` · Interacts with: [FS-77AB6](77AB6-monsters-and-combat.md) (attack table, damage formula), [FS-BDA7X](BDA7X-character-leveling.md) (seating, level-up growth, the character read), [FS-JTNPR](JTNPR-shadow-shot.md) (the archer's right-click), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (worn attack speed and its cap, pierce, reflect), [FS-F6F88](F6F88-multi-floor-delves.md) (floor changes), [FS-CH21F](CH21F-party-member-overhead-bars.md) (party frames), [FS-Q18Q3](Q18Q3-ability-bar.md) (where the ability name shows once the card goes) · Related ADRs: ADR-0001 (the edge checks shape, the owner decides), ADR-0030 (casts resolve on the server) · Vocabulary: pending via `domain-model` (specialization, title, Last Stand, Arcane Ward, spell resistance, Combustion, Split Shot, split arrow)

## Summary

At level 20 a character spends its tier-6 passive point (FS-8RZ51) on one of its class's two
**specializations**. The pick is for good. Each specialization is a strong passive that changes
how the class plays, plus a **title** shown with the class wherever the character appears
("Warrior · Berserker"). The title replaces the classes' old second names (IRON GUARDIAN, ARCANE
MASTER, SHADOW RANGER, OATHLESS BLADE), which go entirely; before the pick a character has no
title. The point is identity. Each spec's look is FS-1J1CB's.

## Requirements

Values marked **(charter default — reason: …)** were set by the charter Kranti approved on
2026-11-21. Values marked **(decided)** came from the 2026-11-21 scoping session. Values marked
**(v1)** are the smaller first version picked where neither covered the question. Every number is a
starting value, expected to move in play.

### §A. The eight specializations

1. Each class has exactly two specializations **(decided)**. Server ids (snake_case) and the display
   names game-client owns:

   | Class | Spec id | Display name | Passive |
   |---|---|---|---|
   | `warrior` | `guardian` | Guardian | Last Stand (§C) |
   | `warrior` | `berserker` | Berserker | Blood price (§D) |
   | `mage` | `spellwarden` | Spellwarden | Arcane Ward and spell resistance (§E) |
   | `mage` | `pyromancer` | Pyromancer | Combustion (§F) |
   | `archer` | `hunter` | Hunter | Split Shot (§G) |
   | `archer` | `shadow_ranger` | Shadow Ranger | Shadow Shot pierces and refunds (§H) |
   | `mercenary` | `duelist` | Duelist | Quick riposte (§I) |
   | `mercenary` | `sellsword` | Sellsword | Five charges, no riposte (§J) |

2. A character has **no specialization or one**, never two, and never one of another class.
3. The pick itself (the tier-6 node, its gate of 18 points spent, one point, one of two, spent in
   town, no respec) is **FS-8RZ51's**. This FS owns what a specialization does once held: the eight
   effects, the title, and the wire.

### §B. Where the specialization comes from, and the wire

4. **Derived, never stored on its own** *(charter default — reason: the tier-6 node already records
   the pick; a second copy could disagree with it)*. A character's specialization is the one its
   allocated tier-6 node grants, read through the shared tree definition (FS-8RZ51). No tier-6
   node allocated: no specialization.
5. **character-service** exposes it on the character read: the gRPC `Character` message gains an
   optional `specialization` (one of §A.1's ids, unset before the pick), on `GetCharacter`,
   `ListCharacters` and `CreateCharacter` alike (always unset on a new character). The `.proto` is
   edited and the Go regenerated with `make gen`; the generated Go is never hand-edited.
6. **api-gateway**'s `Character` gains an additive, read-only `specialization` field (§API
   surface), absent before the pick. The contract and the client are regenerated (`make openapi
   client`) and committed with the wire change; `openapi.yaml` and
   `game-client/src/api/generated/` are never hand-edited.
7. **game-service** seats a character with the specialization its character read carries (the
   character in play gains it beside class and level). It never derives one itself and never
   accepts one from a client.
8. **A pick in town takes effect when FS-8RZ51 applies the tier-6 spend to the character in play**,
   by whatever rule FS-8RZ51 sets for any spend. From that tick the body carries the specialization:
   its effects apply, its title and `specialization` reach the wire, and the Berserker's max HP
   drops (§D.17).
9. **The world state** carries `specialization` on every player entry, `current_player` and every
   `other_players` entry alike (the title and the look are public), absent before the pick.
   game-service's typed message layer, not OpenAPI.
10. An unknown specialization id on a character read (a tree change the service does not know yet)
    seats the character with **no specialization** and logs a warning, never an error that refuses
    the seat *(v1)*.

### §C. Guardian: Last Stand (game-service)

11. **Last Stand.** Once per floor, a hit that would take the Guardian's health to 0 leaves them at
    **1 HP** and refills their **stamina to its max** instead *(decided)*. The hit is otherwise
    resolved as it was (a Gravewarden's Oath reflect still answers it with the hit's resolved
    damage).
12. **Once per floor** *(charter default — reason: one save per floor, the boss included)*: the
    Last Stand is ready when the Guardian is seated in any world, and is ready again each time the
    run's party moves up to a new floor. It works against every hit, the boss's and an elite's
    included. In a world with no floors (the town, a field) it is once per visit *(v1)*: ready at
    seating, not refilled by a field respawn.
13. Only a hit can trigger it. A delver choosing to fall (FS-9K8EZ) dies as before, and a Last Stand
    already spent leaves the next killing blow to kill.

### §D. Berserker: blood price (game-service)

14. **Max HP ×0.67** *(charter default — reason: the decided −33%, as a factor)*, rounded to the
    nearest whole point, on the **class body's** max HP: the class base plus its level growth
    (FS-BDA7X R18–19). Max HP from worn gear and from passive-tree nodes (FS-8RZ51) adds on top,
    unscaled *(v1)*.
15. Applied **at seating** (a Berserker is seated at full HP of the reduced max) and **on level-up**:
    each level's max HP growth is scaled the same way, so the class body's max is always
    `round(0.67 × (base + (level − 1) × growth))`. Current HP does not move on a level-up, as
    FS-BDA7X R17. (At today's level cap of 20 the pick comes at the cap, so a Berserker never levels
    again; the rule holds for a later cap.)
16. **+25% attack speed** and **+10% damage**, always on *(decided)*. The attack speed adds to the
    percentage worn attack speed gives, **after** worn attack speed's cap (FS-4R9M9), and shortens
    every cooldown the same way. The damage multiplies the raw damage of every hit the Berserker's
    own attacks land, before crit and mitigation. Hits from worn uniques (reflect, burning trail)
    are not raised.
17. **At the pick**, current HP is clamped to the new max *(charter default)*.
18. **The heal.** Once per slash that hits at least one target, the Berserker heals
    `max(1, round(1.5% × max HP))`, never above max *(charter default — reason: once per slash, not
    per target, so packs do not refill the bar)*. A slash that hits nothing heals nothing.

### §E. Spellwarden: Arcane Ward and spell resistance (game-service)

19. **Spell resistance.** A magic hit on a Spellwarden deals **10% less**, applied after magic
    resistance's mitigation: `max(1, round(mitigated × 0.9))` *(charter default — reason: reads as a
    percent)*. Physical hits are untouched. Nothing deals magic damage to delvers today, so this has
    no effect in play until a later scope gives monsters magic attacks (parked).
20. **Arcane Ward.** 25% of each hit's final damage (after mitigation and spell resistance),
    rounded to the nearest whole point, is taken from the Spellwarden's **mana first**; whatever
    mana cannot cover, and the other 75%, comes off HP *(charter default)*. Mana never drops below
    0. With no mana, the whole hit goes to HP. A hit of 1 (whose quarter rounds to 0) goes wholly to
    HP.
21. The ward applies to every hit the Spellwarden takes: monster strikes, shots and abilities, and a
    delver's hit when player damage is on. Mana regen is unchanged.

### §F. Pyromancer: Combustion (game-service)

22. **Combustion.** When a fireball's hit on a monster **crits**, it explodes *(decided)*: the
    left-click fireball and each of triple fireball's fireballs alike *(charter default)*.
23. The explosion hits every **other** monster whose centre is within **60 px** of the struck
    monster's position *(charter default)* for `max(1, round(50% × the crit's damage))`, where the
    crit's damage is what the crit dealt the struck monster before its health was clamped. Each
    explosion hit is the Pyromancer's: magic, **unmitigated, never a crit, never an explosion
    itself** *(v1 — reason: the reflect's pattern, and no chain)*; a kill it makes is credited to the
    Pyromancer. Delvers are never hit by it.
24. A crit that kills its target still explodes. A fireball crit on a delver (player damage on)
    never explodes.

### §G. Hunter: Split Shot (game-service)

25. **Split Shot.** When a **left-click arrow** (`arrow`) **crits** a monster, it splits: a **split
    arrow** is fired from the struck monster's position toward the nearest **other** living monster
    whose centre is within **220 px** of it *(charter default)*. No monster in reach: no split.
26. The split arrow deals **60%** of an arrow's raw damage, **rolls its own crit**, and **never
    splits** *(charter default)*. It flies straight at where its mark stood at the moment of the
    split, at an arrow's speed, stopped by walls and closed doors like any arrow, never hitting the
    monster it split from, and stops at the first target it hits: it carries no pierce *(v1 —
    reason: a homing projectile and pierce on a split are both new mechanics)*.
27. Shadow Shot never splits. An arrow that pierces (Lantern of the Drowned) may split on each
    impact that crits.
28. The split arrow is an ordinary `arrow` projectile on the wire, so the client draws it with no
    change.

### §H. Shadow Ranger: Shadow Shot pierces (game-service)

29. A Shadow Ranger's Shadow Shot **pierces every target in its line** *(decided)*: it hits each
    target it can hit once and never stops at one, only at a wall, a closed door or its max flight.
30. Each **monster** it hits refunds **8 stamina** to the archer on that tick, capped at max
    *(charter default)*, while the archer is in play.
31. Only the Shadow Ranger's Shadow Shot is changed. Its cost, cooldown, damage and hold are
    FS-JTNPR's.

### §I. Duelist: quick riposte (game-service; changes FS-MAMHR §E.23)

32. A Duelist's cut resolves as the riposte when they hold **2 or more** parry charges, and the
    riposte **spends 2** *(decided)*. A Duelist at 3 who ripostes keeps 1. Their parry-charge max
    stays 3. Everything else about the riposte is FS-MAMHR's.

### §J. Sellsword: five charges, no riposte (game-service; changes FS-MAMHR §E.23, FS-8AY7S R14)

33. A Sellsword's cut **never** resolves as the riposte *(decided)*.
34. A Sellsword's parry-charge max is **5** *(decided)*. They are seated at 0 as every mercenary;
    at the pick the max becomes 5 and the count does not move.
35. **Per held charge:** **+5% cut damage** and **+5% attack speed** *(decided)*, read at the moment
    the cast resolves: +25% / +25% at 5. The cut damage multiplies the cut's raw damage, before crit
    and mitigation. The attack speed adds to worn attack speed's percentage after its cap, as §D.16,
    and shortens every cooldown the Sellsword has.
36. The stacks are the charges: anything that spends or loses charges drops them. Death sets the
    charges to 0 (FS-MAMHR R21). Settle the Debt (FS-04EEA) spends every charge held, so a Sellsword
    can still cast it and loses the stacks by doing so.

### §K. The client: titles (game-client)

37. **The title** is the class's display name, then the spec's, joined by " · ": "Warrior ·
    Berserker", "Archer · Shadow Ranger" *(charter default)*. A surface that sets its text in
    capitals today keeps doing so ("WARRIOR · BERSERKER").
38. **The old second names go entirely** *(decided)*: `classLore`'s `title` field (IRON GUARDIAN,
    ARCANE MASTER, SHADOW RANGER, OATHLESS BLADE) is removed, with every place that reads it.
39. **Character creation** shows the class name alone where it showed `name — title`.
40. **The main menu's hero** and **the character list** show the title where a character has one,
    the class name where it has none, beside the level as today ("WARRIOR · BERSERKER • LV.20",
    "WARRIOR • LV.5"). They read `specialization` from the character read (§B.6).
41. **In a world** (town, fields, runs), from `specialization` on the world state:
    - **Nameplates:** under every player's name drawn over their figure, their own and others', a
      second, smaller line with their title. No title, no line.
    - **The stats panel header** (the gear overlay's character sheet) shows the title in place of
      the class name.
    - **Party frames:** a member's title shows on their frame whenever the state carries that
      member (the player's own row always; a teammate's while they are in this world), the same
      rule as the frame's level (FS-CH21F R10) *(v1 — reason: the party payload does not carry it)*.
42. Chat lines, whispers, the party panel, invites and the settlement record keep showing the bare
    name *(v1)*.

### §L. The client: what each spec changes in the HUD (game-client)

43. **The archer's right-click is named "Heavy Shot"** for every archer except a Shadow Ranger,
    whose shows **"Shadow Shot"** *(charter default)*, wherever the ability's name shows (the
    ability card, the controls help line, and FS-Q18Q3's bar tooltip once it exists). The skill id
    stays `shadow_shot`. The shadow look on the shot is FS-1J1CB's.
44. **Parry pips:** a `parry_charges` resource is drawn as one pip per point of its **max**: 3 for
    a mercenary, 5 for a Sellsword, in the HUD and in the party frames alike (changes FS-8AY7S R22).
45. **The riposte tells:** the riposte-armed tell and the riposte slice (FS-MAMHR §G.33–34) show at
    **2** charges for a Duelist, at 3 for an unspecialized mercenary, and **never** for a
    Sellsword, whose left-click always plays the cut.
46. **Ability copy** follows the spec *(v1 starting copy, grim and terse; the implementer may tune
    the wording)*:
    - Duelist's parry: "Turn a blow as it lands for a parry charge. At two, the cut ripostes."
    - Sellsword's parry: "Turn a blow as it lands for a parry charge. Each one held sharpens the
      cut."
    - Every other card keeps its line.

## User Stories

1. As a level-20 character, I want to pick one of two specializations, so that my class becomes
   mine.
2. As a player, I want the pick to be for good, so that it means something.
3. As a player, I want my title shown with my class wherever I appear, so that others know what I
   became.
4. As a player before the pick, I want no title at all, so that the title is earned.
5. As a player, I want the old second names gone, so that the only title is the one I chose.
6. As a player in the main menu, I want my character list to show each character's title, so that
   I can tell my characters apart at a glance.
7. As a player in a party, I want to see my teammates' titles on their nameplates and frames, so
   that I know what the party brings.
8. As a Guardian, I want a killing blow to leave me at 1 HP with full stamina once a floor, so that
   I can dash out of a fight I should have lost.
9. As a Guardian, I want the Last Stand to work against the boss, so that it saves me where it
   matters most.
10. As a Guardian, I want the Last Stand back on each new floor, so that every floor is a fresh
    chance.
11. As a Berserker, I want permanently faster, harder slashes, so that I play aggressive at all
    times.
12. As a Berserker, I want each slash that lands to heal me a little, so that staying in the fight
    keeps me alive.
13. As a Berserker, I want less max HP as the price, so that the strength costs something.
14. As a Spellwarden, I want part of every hit taken from my mana, so that a deep mana pool keeps me
    standing.
15. As a Spellwarden out of mana, I want the hit to fall on my health, so that the ward is a
    resource, not immunity.
16. As a Spellwarden, I want less damage from spells, so that I am the mage built to endure magic
    once monsters cast it.
17. As a Pyromancer, I want a crit fireball to explode on the pack around its target, so that I
    build for crit.
18. As a Pyromancer, I want triple fireball's crits to explode too, so that both my attacks feed
    the spec.
19. As a Hunter, I want a crit arrow to split toward the nearest other monster, so that crit chance
    is worth stacking.
20. As a Hunter, I want split arrows never to split again, so that the effect stays readable.
21. As a Shadow Ranger, I want Shadow Shot to pierce every monster in its line, so that lining
    monsters up pays.
22. As a Shadow Ranger, I want stamina back for each monster it hits, so that a good line lets me
    shoot again sooner.
23. As a Hunter or an unspecialized archer, I want my right-click called Heavy Shot, so that the
    name does not promise a shadow I don't have.
24. As a Duelist, I want the riposte at 2 charges for 2, so that my parry-riposte rhythm is faster.
25. As a Duelist, I want the armed tell at 2 charges, so that I know when my next cut ripostes.
26. As a Sellsword, I want to hold up to 5 charges and grow faster and sharper with each, so that
    parrying builds toward a fast, clicky fight.
27. As a Sellsword, I want five pips on my HUD, so that I can read my stacks at a glance.
28. As a Sellsword, I want my cut never to become a riposte, so that I never lose my stacks by
    accident.
29. As a Sellsword, I want Settle the Debt still to work, so that I can cash out my stacks when it
    counts.
30. As a teammate, I want a Sellsword's five pips on their party frame, so that their frame reads
    right.
31. As the owner, I want the specialization derived from the tier-6 node, so that the pick has one
    record.
32. As a developer, I want the specialization on the character read and the world state, so that
    menus, titles and looks (FS-1J1CB) read one field.
33. As a developer, I want game-service never to accept a specialization from a client, so that no
    one can claim a spec they did not pick.

## Acceptance Criteria

**Derivation and wire**

- [ ] A character with no tier-6 node allocated reads with no `specialization` on `GetCharacter`,
      `ListCharacters`, and the gateway's `get-character` and `list-my-characters`.
- [ ] A character whose tier-6 node is a class's spec node reads with that spec's id on all four.
- [ ] `create-character` returns a `Character` with no `specialization`.
- [ ] `character.proto` carries an optional `specialization`; the Go is regenerated by `make gen`,
      not hand-edited.
- [ ] `openapi.yaml` and `game-client/src/api/generated/` are regenerated, not hand-edited, and
      committed with the wire change; the change is additive (no breaking-change gate fires).
- [ ] A character seated in any world carries the specialization its character read returned;
      `current_player.specialization` and the matching `other_players[].specialization` show it,
      absent for a character without one.
- [ ] Nothing a client sends sets or changes a specialization.
- [ ] An unknown specialization id on the character read seats the character with none and logs a
      warning.
- [ ] After FS-8RZ51 applies a tier-6 spend to the character in play in town, the next state
      carries the specialization and its effects apply.

**Guardian**

- [ ] A hit that would take a Guardian with Last Stand ready to 0 leaves them at 1 HP with full
      stamina, and they stay in play.
- [ ] The next killing blow on the same floor kills.
- [ ] After the party moves up a floor, Last Stand saves them again.
- [ ] It saves against a boss's strike.
- [ ] A Guardian who falls (FS-9K8EZ) dies, Last Stand ready or not.
- [ ] A non-Guardian warrior's killing blow kills as before.

**Berserker**

- [ ] A level-20 Berserker is seated at max HP `round(0.67 × (150 + 19 × 12)) = 253` plus worn max
      HP, at full.
- [ ] A Berserker's level-up raises max HP by the scaled growth and leaves current HP alone
      (tested on the growth step directly).
- [ ] At the pick, a warrior at full HP drops to the new max; one below it keeps their HP.
- [ ] A Berserker's slash cooldown is `0.25 / (1 + (worn + 25) / 100)` with worn capped at 50.
- [ ] A Berserker's slash, no crit, no mitigation, deals 10% more raw damage than a Guardian's with
      the same stats.
- [ ] A slash hitting three monsters heals once, `max(1, round(1.5% × max HP))`, never above max; a
      slash hitting nothing heals nothing.

**Spellwarden**

- [ ] A magic hit on a Spellwarden deals `max(1, round(mitigated × 0.9))`; a physical hit is
      unchanged.
- [ ] A 40-damage hit on a Spellwarden with 100 mana takes 10 mana and 30 HP.
- [ ] A 40-damage hit with 4 mana takes 4 mana and 36 HP; with 0 mana, 40 HP.
- [ ] A 1-damage hit takes 1 HP and no mana.

**Pyromancer**

- [ ] A fireball crit on a monster deals `max(1, round(50% × crit damage))` to every other monster
      within 60 px of it, and nothing to one at 61 px, the struck monster, or a delver.
- [ ] Each of triple fireball's fireballs explodes on its own crit.
- [ ] The explosion never crits and never explodes again; a kill it makes is credited to the
      Pyromancer.
- [ ] A crit that kills its target still explodes. A non-crit fireball never does.

**Hunter**

- [ ] A left-click arrow crit on a monster with another monster within 220 px fires one split arrow
      from the struck monster toward the nearest other; with none in reach, nothing.
- [ ] The split arrow deals 60% of an arrow's raw damage, can crit, never splits, never hits the
      monster it split from, and stops at its first hit.
- [ ] A Shadow Shot crit never splits.
- [ ] The split arrow appears in the state's projectiles as an `arrow`.

**Shadow Ranger**

- [ ] A Shadow Ranger's Shadow Shot hits every monster in its line once and stops only at a wall, a
      closed door or its max flight.
- [ ] Each monster hit refunds 8 stamina, capped at max.
- [ ] A Hunter's and an unspecialized archer's Shadow Shot behave as FS-JTNPR.

**Duelist and Sellsword**

- [ ] A Duelist's cut at 2 charges resolves as the riposte and leaves 0; at 3 it leaves 1; at 1 it
      is a cut.
- [ ] A Sellsword's cut at any count is a cut; their charges climb to 5 and stop.
- [ ] A Sellsword at 4 charges cuts for `1 + 4 × 5%` of the raw cut damage, with the cut's cooldown
      shortened by an added 20% attack speed.
- [ ] A Sellsword who dies is at 0 charges and no stacks.
- [ ] An unspecialized mercenary's riposte is unchanged (3 charges, spends 3).

**Client**

- [ ] `classLore` has no `title` field, and no screen shows IRON GUARDIAN, ARCANE MASTER, SHADOW
      RANGER (as a title) or OATHLESS BLADE.
- [ ] Character creation shows the class name alone.
- [ ] The main menu hero and the character list show "WARRIOR · BERSERKER • LV.20" for a Berserker
      and "WARRIOR • LV.5" for a warrior with no spec.
- [ ] Every nameplate of a player with a spec carries a title line under the name; one without a
      spec has none.
- [ ] The stats panel header shows the title; the party frames show it on rows the state carries.
- [ ] An archer without a spec and a Hunter see "Heavy Shot" on the ability card and the help line;
      a Shadow Ranger sees "Shadow Shot".
- [ ] A mercenary's HUD and party frame show 3 pips; a Sellsword's show 5.
- [ ] A Duelist's armed tell and riposte slice show at 2 charges; a Sellsword's never show.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Edge States

- **Pick mid-run:** impossible; points are spent only in town (FS-8RZ51). A run's specialization is
  fixed from seating.
- **Character read fails at seating:** seating follows FS-BDA7X's existing rules; there is no
  separate specialization read to fail.
- **Unknown spec id** (a tree change game-service does not know): seated with none, warning logged
  (§B.10). The client shows no title for an id it does not know.
- **Spec of another class** on a character read (a corrupt allocation): treated as unknown.
- **Last Stand on a hit that leaves exactly 0 after a parry:** a parried strike deals no damage,
  so it never reaches Last Stand.
- **Last Stand while already at 1 HP:** a killing blow is still a killing blow; it saves once.
- **Two killing blows on one tick:** the first is saved, the second kills.
- **Berserker at the pick with gear max HP:** only the class body's part shrinks; current clamps to
  the new total max.
- **Arcane Ward on a killing blow:** the ward's mana share is taken first; the HP share may still
  kill.
- **Combustion when the struck monster is alone:** nothing else in range, nothing happens.
- **Combustion near a destructible or a delver:** only monsters take it.
- **Split arrow whose mark dies before it lands:** it flies on and hits whatever it meets, or
  nothing.
- **Split arrow fired from a monster against a wall:** it starts at the monster's centre and is
  stopped by the wall like any arrow.
- **Shadow Ranger at max stamina:** the refund is capped; nothing is banked.
- **Shadow Shot through delvers with player damage off:** passes through as today, no refund.
- **Sellsword at 5 who parries:** the parry negates the strike, counts, and the charges stay 5
  (FS-MAMHR R19's cap rule, at 5).
- **Sellsword's stacks across a floor change:** kept, as the charges are (FS-MAMHR R20).
- **Duelist at 3 charges who parries:** stays at 3 (the max is still 3).
- **A teammate in another world:** their party frame shows no title until they share this world.
- **A character deleted after picking:** nothing in this FS; deletion is FS-BDA7X's.

## API surface

The gateway's character read gains one additive, read-only field. Every op's request, errors and
paging stay as FS-BDA7X specifies.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `get-character` **(changed, additive)** | GET `/api/characters/{characterId}` | unchanged | — | 200 `Character`, gaining `specialization?` | unchanged |
| `list-my-characters` **(changed, additive)** | GET `/api/characters` | — | — | 200 `CharacterList`; each `Character` gains `specialization?` | unchanged |
| `create-character` **(response shape only)** | POST `/api/characters` | — | `CharacterCreate` unchanged: no `specialization` (not writable) | 201 `Character`, `specialization` always absent | unchanged |

**`Character` (changed):**

| Field | Type | Notes |
|---|---|---|
| `specialization?` | string enum | `guardian`, `berserker`, `spellwarden`, `pyromancer`, `hunter`, `shadow_ranger`, `duelist`, `sellsword`; derived by character-service from the tier-6 node; **absent** before the pick. Read-only. |

The game WebSocket field (`specialization` on `current_player` and `other_players`) and the
character-service gRPC field are specified in §B.

## Out of Scope

- The tree, the tier-6 node, its gate, its tooltip and the spend: FS-8RZ51.
- Each specialization's look, and the shadow on Shadow Shot: FS-1J1CB.
- Settle the Debt itself: FS-04EEA.
- Monsters that deal magic damage (parked for a later `/scope-it`).
- A respec, or changing a specialization after the pick.
- A visual for the Combustion explosion or the Last Stand save, and any HUD marker of whether Last
  Stand is ready.
- Homing projectiles; pierce on a split arrow.
- Titles in chat, whispers, the party panel, invites, the settlement record, or a teammate's party
  frame while they are in another world (the party payload does not carry it).
- Balance passes beyond these starting values.

## Rationale (folded from scoping)

How each specialization landed (Kranti's pushback, 2026-11-21):

- **Berserker.** The first draft ("below half HP: +25% attack speed, slashes heal 2%") was rejected:
  the heal made it too easy to climb out of half-HP mode. Kranti made it permanent: −33% max HP as
  the risk, always-on +25% attack speed and +10% damage, a 1.5% heal per hit. No half-HP condition
  at all.
- **Guardian.** Last Stand kept from the first draft.
- **Spellwarden.** First Mana Shield, then Abjurer (the D&D abjuration wizard, whose feature is
  Arcane Ward); Kranti chose Spellwarden and added 10% spell resistance even though monsters deal
  no magic damage yet. Magic resistance already exists (armor stat, `magic_resistance` affix,
  `systems/damage.go`), so the spec reduces magic damage on top of it rather than adding a stat.
  Every monster strike resolves as `DamagePhysical` today (`systems/monster_ability.go`), the
  demon's fire claw included.
- **Pyromancer.** Combustion kept.
- **Hunter.** Deadeye ("stand still 1 s, every arrow crits") was rejected as too strong: it makes
  crit chance moot. Kranti wants a chance on crit to do something, so players build around crit:
  Split Shot.
- **Shadow Ranger.** Skirmisher (+20% to arrows fired while moving) was rejected: moving while
  shooting will not be allowed by upcoming changes. It became a Shadow Shot spec, and the shadow
  look belongs to this spec only (FS-1J1CB), hence "Heavy Shot" for every other archer.
- **Duelist.** Replaces Iron Guard (1 s of immunity after a parry), which Kranti found too strong.
  The duelist vibe: dexterous, a faster parry-riposte rhythm.
- **Sellsword.** Name picked by Claude (Condottiere and Free Lance were offered too). The first
  draft (Debt Collector: hold 5, +4% cut damage per charge) was too weak to give up both the
  riposte and Settle the Debt. Kranti: "the clicky clicky spec". Today a cut at 3 charges
  automatically becomes the riposte (FS-MAMHR §E.23), so hoarding needs the riposte turned off.
  The numbers sit near the Berserker's on purpose: the Sellsword keeps full HP but must earn five
  parries every run and loses them on death.
