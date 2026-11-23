# FS-8RZ51: Passive skill tree

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Progression" (passive skill tree), "### Persistent world (MMO-RPG refactor)" (skill tree persistence); `game-client/SPECIFICATION.md` "### Character" (passive skill tree) → this FS · Owner of persisted allocations: **character-service** (no SPECIFICATION.md of its own; its lines are carried by game-service's "Skill tree persistence", as FS-BDA7X did) · Siblings (same scoping session, 2026-11-21): [FS-04EEA](04EEA-class-tree-abilities.md) (the tier-3 ability), [FS-E1ZDG](E1ZDG-specializations.md) (the tier-6 pick), [FS-1J1CB](1J1CB-specialization-looks.md), [FS-Q18Q3](Q18Q3-ability-bar.md) · Changes: [FS-BDA7X](BDA7X-character-leveling.md) R20 ("no skill points") via its `## Change: Passive points from levels → FS-8RZ51` stub · Touches: [FS-3EBCA](3EBCA-hud-corner-icons.md) (a sixth corner icon, §F), [FS-HRH2J](HRH2J-gear-and-stats-overlay.md) (passives on the character panel, §F R44) · Builds on: [FS-JS7C8](JS7C8-class-run-attack-walk-pointer-facing.md) (the attack slow), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (worn crit, attack speed, move speed, pierce and their caps), [FS-MAMHR](MAMHR-mercenary-class.md) (parry window, riposte), [FS-JTNPR](JTNPR-shadow-shot.md), [FS-8AY7S](8AY7S-class-resources-and-combat-hud.md) (class resource) · Related ADRs: ADR-0009 (idempotency belongs to the caller), ADR-0030 (aiming is client presentation), ADR-0064 (own-frame state), ADR-0079 (the acting player is the connection's), ADR-0080 (canvas HUD icons), ADR-0082 (passive points are spent only in town and take effect at the next seating), ADR-0083 (character-service owns passive ranks; the spend rule is one shared package), ADR-0084, ADR-0085, ADR-0086 (the UI scene: where the client pieces live, who sends the spend; integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*HUB world*, *town*, *character in play*, *seating*); pending via `domain-model`: *passive point*, *passive tree*, *node*, *rank*, *tier gate*, *filler node*, *kicker*, *unspent points*

## Summary

Every level-up from 2 to 20 gives a character passive points (20 in all), which the player spends
in town on a class tree of six tiers. Most nodes are passives taken over two or three ranks, the
last rank of a kicker adding a small rule that changes how the class plays. One node in the
middle grants the class's tree ability (FS-04EEA), and one two-way pick at the bottom grants a
specialization (FS-E1ZDG). There is no respec: a point spent is spent for good, and a full
character cannot take everything. The tree opens with a key and a corner icon in every world, and
every node says what it gives before it is picked.

The tree is there for choice and class identity, not to make the game easier ("too easy is beside
the point"). Power is a side effect, so the v1 numbers below are small placeholders.

### Decision record

Settled by Kranti during scoping (2026-11-21): the points (1 per level-up 2..19, 2 at level 20),
saving points, spending only in town and viewing anywhere, no respec, the six-tier shape with its
gates (option A; per-class branches rejected), key 3 at level 10, tier 6 at 18 spent, the rank
curve (R1 and R2 a stat, R3 the stat again plus a kicker), kickers built only on primitives the
game already has, shared filler icons and 7 class icons per class, a tooltip on every node.

Charter defaults (approval by Kranti, 2026-11-21), marked *charter default — reason: …* where they
appear: the spend over the game socket, persistence in character-service with derived points, the
shared definition package, the effect timing, the wire, the overlay and its shortcut, the icon
build, the v1 numbers, ownership of the tier-3 and tier-6 effects, and no reset tool.

Defaults picked here where neither covers a question (the smaller v1), marked *(v1)*.

## Requirements

### A. The tree definition (game-server/common)

1. **One definition, shared** *(charter default — reason: FS-BDA7X R15's precedent; character-service
   and game-service must agree on every rule, so neither keeps its own copy)*. A package under
   `game-server/common/` (`passivetree`) holds, per class: every node's id, tier, slot, max rank,
   per-rank values, and the tier gates; the points earned at each level; and the spend rule (R9).
   Both services import it. Tuning a value is an edit to this package only.
2. **The shape** (decided). Every class tree has six tiers:

   | Tier | Gate | Nodes (max rank) |
   |---|---|---|
   | 1 | open | filler `t1a` (2), filler `t1b` (2) |
   | 2 | 4 points spent above | kicker `t2a` (3), kicker `t2b` (3) |
   | 3 | 8 points spent above | ability `t3` (1), FS-04EEA |
   | 4 | the tier-3 node taken | filler `t4a` (2), filler `t4b` (2) |
   | 5 | 13 points spent above | kicker `t5a` (3), kicker `t5b` (3) |
   | 6 | 18 points spent above | specialization `t6a` (1) **or** `t6b` (1), FS-E1ZDG |

   22 ranks for 20 points. "Spent above" counts the ranks held in every tier with a smaller number.
   Tier 4's gate is the tier-3 node alone (by then at least 9 points are spent).
3. **Node ids** are `<class>.<slot>`, e.g. `warrior.t2a`, `mercenary.t6b`: the slot, never the
   node's name *(v1 — reason: the names are placeholders and ids are permanent, R5)*. Classes are
   `warrior`, `mage`, `archer`, `mercenary`. A class's nodes are only its own.
4. **Points earned** (decided): level L has earned `L − 1` points for L < 20, and **20** at level 20
   (two arrive at level 20). Level 10 has earned 9: the 8-point gate plus the ability.
5. **Node ids are permanent once shipped.** Saved ranks point at them, and there is no respec or
   refund path, so a shipped node is never removed, renamed, re-tiered or given fewer ranks. Its
   name, copy and per-rank values may be retuned. A change that would invalidate saved ranks needs
   a refund path first (out of scope).
6. **The client is pinned to the definition by a golden** *(charter default — reason: drift fails a
   test. The golden sits beside the client's data, as the town's does, not in
   `game-server/contract-fixtures`, which holds only the contract gates' known-bad inputs)*. A Go test in the package writes
   `game-client/src/data/passiveTree.golden.json` (ids, class, tier, slot, kind, max rank, gates,
   per-rank values) and fails when the definition and the file differ; `-update` rewrites it,
   never a hand edit, as `hub_town_golden_test.go` does for the town (FS-B0H2D R19). The client
   reads the tree's structure and numbers from that file and keeps only presentation (R39), and a
   client test fails when either side has a node id the other lacks.

### B. Points and the spend rule

7. **Unspent points are derived, never stored** *(charter default — reason: one fact, one place;
   level is already persisted)*: `earned(level) − Σ ranks held`. Points may be saved
   indefinitely (decided); saving never gets round a gate or the tier-6 rule.
8. A rank is taken **one at a time, in order**: rank n of a node needs rank n − 1 of it.
9. **The spend rule** (one function in the package, R1). A spend of node N to target rank r for a
   character of class C, level L, holding ranks H, is allowed when all hold:
   - N is one of C's nodes;
   - r = H[N] + 1 and r ≤ N's max rank;
   - N's tier gate is met by H;
   - unspent(L, H) ≥ 1;
   - N is a tier-6 node and the other tier-6 node is not held, or N is not a tier-6 node.

   It answers with which rule refused it: unknown node, out of order, max rank, tier locked, no
   points, specialization taken.
10. **A target already reached is a no-op success** (ADR-0009's principle: the target rank is the
    deterministic key). A spend whose target r ≤ H[N] changes nothing and reports success with
    nothing applied, so a retried or duplicated spend never takes a second point.

### C. Persistence (character-service)

11. **character-service persists ranks per (character, node)** *(charter default — reason: it owns
    the character)*: a new table keyed by `(character_id, node_id)` with the rank (1..3) and when it
    last changed. A migration in `character-service/migrations` creates it (the Dockerfile copies
    migrations; the migrations redesign is deferred).
12. **A spend RPC** (`SpendPassivePoint`, §API surface), scoped by member like every other call:
    another member's, a deleted and an unknown character are NotFound (FS-BDA7X R1).
13. **The spend is decided again where it is written** *(v1 — reason: the owner of the data guards
    its invariants; game-service's check is for the player's answer, this one is the truth)*. In one
    transaction character-service locks the character row, reads its level and ranks, and runs the
    same spend rule (R9) on what it holds. Refused, it writes nothing and answers with the rule's
    code. Allowed, it writes the rank. A target already held (R10) answers OK with `applied = false`.
    Two concurrent spends of the same character are serialised by the row lock; at most one takes
    any given rank.
14. **The character read returns the ranks** *(charter default — reason: game-service loads them at
    entry like level and experience, FS-BDA7X R5/R7)*. `Character` gains its held ranks (nodes at
    rank ≥ 1). `GetCharacter` and `ListCharacters` carry them; the gateway's character operations
    keep their response shape (no OpenAPI change).
15. Deleting a character (soft delete) leaves its ranks; a deleted character reads and spends as
    NotFound.

### D. The spend over the game socket (game-service)

16. **The client spends with one inbound action**, `spend_passive_point`, payload
    `{ node_id, rank }` where `rank` is the target rank *(charter default — reason: the town rule
    and the seated character already live in game-service; no gateway or OpenAPI change)*. Who
    spends is the connection's player (ADR-0079); the character is their character in play.
17. game-service **refuses**, without calling character-service, a spend when:
    - the player's record names no world or any world but the HUB world ("town" in copy) *(charter
      default)*;
    - the player is queued for a run *(v1 — reason: a queued member's run is built from the
      character they queued with, and a run on another pod would never see the spend; leaving the
      queue first keeps every run's seating true without touching the matchmaker)*;
    - the spend rule (R9) refuses it against the character in play.
18. A spend whose target the character in play already holds (R10) is answered as a success with
    nothing sent and nothing called.
19. Otherwise game-service calls `SpendPassivePoint` **off the message hub's loop** (as `enter_hub`
    does: every other connection's messages pass through that loop), with a timeout.
20. **On success the character in play takes the ranks at once** *(charter default — reason: the
    player sees the spend in town straight away)*: the server-held record merges the returned ranks
    by taking the higher rank per node (ranks only rise, so two answers arriving out of order
    still leave the record right), and the player's HUB world body takes the new effects (R27).
    Nothing is sent on success: the next state shows it.
21. A refusal is answered with the existing refusal message (action + reason words, as
    `forfeit_run` is), in the words of §Edge States. A refusal code from character-service that
    game-service's own check passed (R13) is answered in the same words, except **no points**,
    which reads as a level still being recorded (§Edge States).
22. A spend is never retried by the server. The client's retry is the same message with the same
    target rank (R10 makes it safe).

### E. The wire

23. **`current_player` carries the tree in every world** *(charter default — reason: the tree can be
    viewed anywhere)*: `passive_ranks` (an object of node id → rank, nodes at rank ≥ 1 only; `{}`
    when none) and `passive_points` (unspent, R7, from the character's current level, so a level-up
    in a run raises it at once). Own frame only (ADR-0064): `other_players` carries neither (what
    others see of a specialization is FS-E1ZDG's).

### F. Effects

24. **Effects apply when a character is seated in a world** *(charter default — reason: one place,
    the seating, already builds the body from class, level and gear)*: the HUB world, a field, a
    run, the same-pod switch, the return to the HUB, a field visit and a handoff seat. A field or a
    run sees a spend from its next seating.
25. **Passive bonuses sit beside the character's own stats like worn gear does, never written into
    them**, and are summed with gear wherever gear's are read. Attack speed and move speed from the
    tree count inside the same caps as gear's (FS-4R9M9): one ceiling on the total.
26. Percent of max HP is of the character's **own** max HP at seating (class base plus level growth,
    no gear), rounded to the nearest whole point; a level-up later in the same world does not
    recompute it *(v1)*. Percent of regen is of the class's base regen and accrues below a whole
    point like regen already does, never rounded away.
27. **A spend in town changes the HUB world body at once**: its bonuses are recomputed from the new
    ranks; a max HP or max resource that rose raises its current value by the same amount (a full
    bar stays full).
28. **Filler nodes** (2 ranks, per rank; the scoping placeholders) *(charter default)*:

    | Slot | warrior | mage | archer | mercenary |
    |---|---|---|---|---|
    | t1a | +4% max HP | +4% max HP | +4% max HP | +4% max HP |
    | t1b | +10 max stamina | +15 max mana | +10 max stamina | +2 Strength |
    | t4a | +2 Strength | +2 Intelligence | +2 Agility | +2 Agility |
    | t4b | +10% stamina regen | +10% mana regen | +10% stamina regen | +4% max HP |

    The mercenary's parry charges have no max to raise and no regen, so its `t1b` and `t4b` are
    +2 Strength and +4% max HP *(charter default for `t1b`; `t4b` is v1 — reason: same gap, same
    fix)*. Its main stat in `t4a` is Agility (its growth stat; the cut scales on both).
29. **Kickers** (3 ranks: R1 and R2 add the stat, R3 adds it again **plus** the kicker rule). All
    numbers are placeholders *(charter default)*. A *kill* is FS-77AB6's kill record with this
    delver as the killer. A *refund* is a gain of the class resource, capped at its max. A *forced
    crit* is that one hit rolled at 100% crit chance.

    | Node | Name | Per rank | R3 kicker |
    |---|---|---|---|
    | warrior.t2a | Heavy Hand | +6% slash damage | a slash that hits 2 or more monsters refunds 5 stamina |
    | warrior.t2b | Thick Skin | +4% max HP | while below half max HP, damage taken is 10% less |
    | warrior.t5a | Long Wind | +10% stamina regen | a kill refunds 15 stamina |
    | warrior.t5b | Bull Rush | dash costs 3 less stamina | the warrior's first hit after a dash ends is a forced crit, if it lands within 3 s |
    | mage.t2a | Kindling | +6% fireball damage | a fireball crit refunds 5 mana |
    | mage.t2b | Deep Well | +15 max mana | +25% mana regen |
    | mage.t5a | Wide Volley | triple fireball costs 2 less mana | the volley throws 5 fireballs, not 3 |
    | mage.t5b | Searing | +8% fireball flight speed | fireballs pierce one more monster |
    | archer.t2a | Quick Draw | +4% attack speed | every 4th arrow pierces one more monster |
    | archer.t2b | Fleet Foot | +3% move speed | **Sidestep:** 10% of monster strikes on the archer miss *(integrator correction 2026-11-21 — reason: moving while shooting will not be allowed (Kranti); replaces "the archer's attacks start no attack slow")* |
    | archer.t5a | Eagle Eye | +3 crit points | every Shadow Shot is a forced crit |
    | archer.t5b | Hunter's Breath | +10% stamina regen | a kill refunds Shadow Shot's cost |
    | mercenary.t2a | Keen Edge | +6% cut damage | a cut on a monster in its wind-up is a forced crit |
    | mercenary.t2b | Practiced Guard | +0.02 s parry window | a strike parried in the first half of the window grants 2 parry charges |
    | mercenary.t5a | Bloodied Riposte | +8% riposte damage | a riposte that hits heals 5% of max HP, once per riposte |
    | mercenary.t5b | Steady Hand | cut cooldown 4% shorter | a cut that kills grants 1 parry charge |

    - "+x% <attack> damage" multiplies that attack's coefficient. "Fireball" is the left-click
      fireball for Kindling and both fireball kinds (left-click and the triple volley) for Searing.
    - Wide Volley's extra two fireballs widen the spread symmetrically, one more step either side.
    - Searing's and Quick Draw's pierce add to a worn Lantern's (FS-4R9M9 R35).
    - Quick Draw counts the archer's arrows fired in the current world; every 4th pierces.
    - Eagle Eye's R3 reads every fired Shadow Shot as fully drawn: the server holds no hold time
      (ADR-0030, FS-JTNPR R4), and a release fires only once the draw is ready (FS-JTNPR R13).
    - Hunter's Breath refunds the Shadow Shot cost the attack table holds (90 today), so a retune
      follows.
    - The parry cap (3) and the parry window's "first half" are read after Practiced Guard's bonus.
    - Sidestep *(integrator correction 2026-11-21 — reason: moving while shooting will not be
      allowed (Kranti))*: each monster strike (melee or shot) that would land on the archer rolls
      once; on a miss it is negated like a parry (no damage, no crit roll, nothing for an on-hit
      effect to reflect) but grants no parry charge and opens no stance. The archer's attacks keep
      the FS-JS7C8 attack slow.
30. **The tier-3 node's effect is "grants the class tree ability"**, owned by FS-04EEA *(charter
    default)*. This FS owns its gate, its single rank and its place in tier 4's gate. Until FS-04EEA
    ships, holding the node grants nothing.
31. **The tier-6 nodes' effects are FS-E1ZDG's** *(charter default)*: this FS owns their gate (18
    spent), their single rank and the one-of-two rule (R9). Until FS-E1ZDG ships, holding one grants
    nothing. `t6a` is the first row of FS-E1ZDG's table for the class and `t6b` the second
    (warrior Guardian / Berserker, mage Spellwarden / Pyromancer, archer Hunter / Shadow Ranger,
    mercenary Duelist / Sellsword). The package names, per class, its ability node and its two
    specialization nodes, so the sibling features read them rather than hard-coding slots.
    **The seated body carries its held ranks**, readable by the systems, so FS-04EEA's gate (the
    tier-3 node held) and FS-E1ZDG's specialization read the body, not the record.

### G. The tree overlay (game-client)

> *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: every piece of this section lives in the **UI scene** (`UIScene`, ADR-0084), never in a
> world scene. ADR-0086 places them: the overlay, the corner icon and its marker are fixed to the
> screen and shared by every world (rules 1.1, 1.2); the Passives group is part of the gear
> overlay, already there. No world scene (`HubScene`, `FieldScene`, `BarrowspireScene`) changes for
> this section, and no new request crosses the UI bridge.

32. **The tree opens with P** *(charter default reworded — reason: T is taken by the party panel in
    every world, FS-3EBCA; P is free in the HUB, fields and runs)* and with a **tree icon in the corner
    row** beside FS-3EBCA's icons, in every world. A second press closes it. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: P is bound by the UI
    scene alone, a `keydown-P` handler on its keyboard (uncaptured, so it still types in DOM fields),
    as the party panel's T is; no world scene binds it (ADR-0084 Decision 4). It takes no key while
    the player is typing in chat (`ui.typing`). The tree icon is one more entry in the UI scene's
    corner row (`UiCornerRow`), its press toggling the UI scene's tree slot inside the scene's `act`,
    like Party.
33. **A marker on the tree icon while points are unspent** (`passive_points > 0`): a small ember
    point in the corner of the icon, drawn through the ADR-0080 renderer, no numeral. None at 0.
    *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the row is built once per world, so the marker is set on the standing row as the points
    change, without rebuilding it.
34. **A canvas overlay in the gear and stats overlay family** (FS-HRH2J): the shared panel frame and
    title, on the game palette (ADR-0025, tokens only, ADR-0013). *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: it stands in the UI scene's
    window band (ADR-0086 Decision 4), above the gear overlay and below the party panel (between 1103
    and 1110), with an interactive ground over its rect at its own depth (`uiGround`), so a press or
    hover on it never reaches the world or the party frames under it. Its tooltips stand in the item
    tips' band (2200).
35. **It lays the tree out by tier**, top to bottom, tier 1 at the top: each tier's gate stated
    beside it ("4 spent", "needs <ability name>", …), each node an icon with its rank as `r / max`,
    the two tier-6 nodes joined by an "or". A header shows the character's class and the unspent
    points. Each node reads as one of: **held at max**, **held, more to take**, **available** (the
    rule would allow its next rank), **locked** (gate not met), **closed** (the other tier-6 node is
    held).
36. **Windows** *(v1)*: opening the tree closes Inventory and Character; opening either closes the
    tree; the party panel opens over it; opening the menu closes it (FS-3EBCA R17); Esc closes it in
    the order letter → menu → party → tree → gear. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the tree is refused under the gear overlay's
    refusals (the UI scene's menu slot filled, or the world's `blockers().gear`), and the run's end
    clears it with the gear (`endPopped`). Its open state is reported as a part of the UI's state
    (`reportUi({ tree })`): the bridge's `gearOpened` counts it, so every world ends an aim as the
    tree opens with no world change, and the interface sounds' window rule takes it as one more
    window, playing the character panel's open and close sounds *(v1 — reason: no new sound effect;
    FS-WDM0X owns the set)*.
37. **Every node has a hover tooltip**, before it is picked *(decided)*: its name, its kind, its
    rank (`r / max`), the effect of each rank with the ranks held marked, the R3 kicker labelled as
    the last rank's, and why it is locked when it is. A tier-3 node's tooltip names the ability and
    its key (3); a tier-6 node's names the title it grants and says the look changes. The copy for
    those three is a placeholder here; FS-04EEA and FS-E1ZDG own the words. The tooltip uses the
    gear overlay's tip ground and placement (`tipGround`, `itemTipRow`).
38. **Spending, in town only.** A click on an available node sends `spend_passive_point` for its next
    rank; there is no confirm, save on tier 6, which asks once in the panel ("Choose <name>?
    <other> is gone for good.") *(v1 — reason: tier 6 is the one spend that closes another node)*.
    While a spend is in flight its node takes no second click, until the state shows the rank, a
    refusal arrives, or 5 s pass. A refusal shows its reason in the panel. Outside town nodes do not
    take clicks and the footer says "Points are spent in town." *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the spend is the tree's own
    command, sent **from the piece** through its own command module over the app's socket
    (ADR-0085 Decision 2, as `partyCommands(socketManager)`): composing it reads only the node and
    rank the piece already holds and the world type in the game store, never a world's fields. It
    is not a bridge request. The refusal is heard through the socket's `onError` for the action,
    registered as the party's are, as the UI scene mounts the tree, open or not: an
    error reply nobody claims reaches the session's global handler, which treats it as fatal.
39. **The client's presentation copy** (`game-client/src/data/passiveTree.ts`) is keyed by node id and
    holds only the name, the tooltip copy and the icon *(charter default)*; structure and numbers
    come from the golden (R6). Effect lines are written from the golden's per-rank values, so a
    retuned number shows without a copy edit.
40. **Icons, built in code** through the ADR-0080 renderer *(charter default)*: four filler icons
    shared by every class (health, reserve, attribute, regen; the mercenary's Strength and Agility
    use attribute, its max HP health), and seven per class (four kickers, the ability, two
    specializations), each with the line-glyph fallback the renderer needs. Fidelity bar and
    contact-sheet gate as the art rules say (build art, don't source). *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the tier-3 node draws
    its class's tree-ability picture already built for the ability bar (`ABILITY_ICONS` in
    `abilityIcons.ts`: `earthbreaker`, `blink`, `arrow_rain`, `settle_the_debt`, picture and lines),
    so the tree adds 4 filler + 24 class pictures (six per class) and the corner icon: 29 new, 33 on
    the contact sheet with the four reused. New pictures take the same shape (`picture` and
    `lines`) and the renderer's shared inks (`BRONZE`, `GREYED`, `GREYED_ALPHA`) and `stroke()`.
41. Every state the tree reads (`passive_ranks`, `passive_points`, the class) comes from
    `current_player`; the overlay updates while open when they change. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: it reaches the UI
    scene as the own-player state each world already hands the bridge every tick (the gear
    message `seen`, its `character`): `CharacterSource` gains `passive_ranks` and `passive_points`,
    and the UI scene hands that character to the tree slot as well as the gear. The world type is
    the game store's (`worldType`, from `world_entered`).
42. **A class the client does not know**, or a node id the copy lacks, draws the node with the
    fallback glyph and its id as its name, never a crash.
43. The sixth corner icon moves the XP bar's clearance with the row (`cornerRowLeft`, FS-77DVN).
44. **The character panel shows the tree's contributions**: a "Passives" group beside the gear's,
    one line per summed bonus from `passive_ranks` and the golden's values (e.g. "+8% max HP",
    "+2 Strength"), each R3 kicker held named on its own line. Health and resource maxima already
    come from the server, so a spend in town shows in them at once (R27). *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the character
    panel is the UI scene's gear overlay (FS-TQZ5J § Change: Phase 3); the group reads the same
    `seen` character as R41.

## User Stories

1. As a player, I want a passive point each time I level up, so that leveling gives me a choice as
   well as stats.
2. As a player, I want two points at level 20, so that the cap pays off with my specialization and
   one last rank.
3. As a player, I want to save points, so that I can wait until I know what I want.
4. As a player, I want to open my tree with P or the corner icon in any world, so that I can plan in
   a run as well as in town.
5. As a player, I want a marker on the tree icon while I have points to spend, so that I don't
   forget them.
6. As a player, I want to see every tier and what opens it, so that I can plan my path to the ability
   and the specialization.
7. As a player, I want each node's tooltip to show every rank and the last rank's kicker before I
   pick it, so that I know what a point buys.
8. As a player, I want the last rank of a kicker to be the best one, so that it is worth finishing a
   node.
9. As a player, I want to spend a point with one click in town, so that spending is quick.
10. As a player, I want the tier-6 pick to ask me once, so that I don't lose a specialization to a
    misclick.
11. As a player, I want a spend refused with a reason I can act on, so that I know what to do next.
12. As a player in a run, I want to see that points spend in town only, so that I'm not left
    clicking a dead node.
13. As a player, I want a point spent in town to show on my character panel at once, so that I see
    what I bought.
14. As a player, I want my spends to apply in my next field or run, so that the tree matters in
    combat.
15. As a player, I want my tree to follow my character to any browser and pod, so that progress is
    never lost.
16. As a player, I want the tree ability at level 10 if I spend as I earn, so that the middle of the
    climb has a milestone.
17. As a player, I want to choose one of two specializations knowing my kickers, so that my
    character is mine.
18. As a player, I want not to be able to take everything, so that two characters of one class can
    differ.
19. As a warrior, I want kickers about slashing crowds, toughness, stamina and the dash, so that the
    tree deepens how the warrior already plays.
20. As a mage, I want kickers about fireball crits, mana, the volley and pierce, so that my build
    changes how I cast.
21. As an archer, I want kickers about attack speed, moving, crits and Shadow Shot, so that I can
    build around crit or around Shadow Shot.
22. As a mercenary, I want kickers about wind-up punishes, parries and ripostes, so that the parry
    rhythm gets richer.
23. As a mercenary, I want my tree not to offer max charges or charge regen that do nothing, so that
    no point is wasted.
24. As a player with a slow connection, I want a retried spend never to take a second point, so that
    a lag spike costs me nothing.
25. As a player who just levelled in a run, I want to spend the new point when I'm back in town, so
    that a run's level-up pays off at once.
26. As a player, I want the tree drawn in the game's own style, with a picture per class node, so
    that it feels part of the world.
27. As a developer, I want one definition of the tree shared by both services, so that the rule that
    allows a spend is the rule that saves it.
28. As a developer, I want the client's tree held to the server's by a golden, so that a node added
    or retuned on one side fails a test until both agree.
29. As a developer, I want node ids to be slots, never names, so that renaming a kicker never
    strands a saved rank.
30. As an operator, I want each spend to be one small idempotent write, so that a character's whole
    life costs about 20 writes.

## Acceptance Criteria

Points and rules (common)
- [ ] `earned(1) = 0`, `earned(2) = 1`, `earned(10) = 9`, `earned(19) = 18`, `earned(20) = 20`.
- [ ] Every class's tree matches R2's table: 11 nodes, max ranks 2/2/3/3/1/2/2/3/3/1/1, the gates as
      listed; a test pins every row.
- [ ] The spend rule refuses, each with its own code: another class's node; an unknown id; rank 2
      with rank 0 held; rank 3 of a 2-rank filler; a tier-2 node with 3 spent above; a tier-4 node
      without `t3`; a tier-5 node with 12 spent above; a tier-6 node with 17 spent above; `t6b` with
      `t6a` held; any node at 0 unspent. It allows each of those one step later.
- [ ] A target rank already held is reported as a no-op, not a refusal.
- [ ] The golden test fails when the definition changes and the golden does not; `-update` rewrites
      it.

Persistence (character-service)
- [ ] `SpendPassivePoint` writes one rank; a repeat of the same call answers OK, `applied = false`,
      and writes nothing.
- [ ] Two concurrent spends that together exceed the unspent points: one lands, the other is refused
      with no points.
- [ ] A spend for another member's, a deleted or an unknown character is NotFound; nothing written.
- [ ] A refused spend writes nothing and carries the rule's code (FailedPrecondition + ErrorInfo).
- [ ] `GetCharacter` and `ListCharacters` return the held ranks; a character with none returns none.
- [ ] The gateway's character responses and `openapi.yaml` are unchanged.

Spend over the socket (game-service)
- [ ] In the HUB world with a point to spend, `spend_passive_point {node_id, rank}` persists the rank
      and the next `current_player` carries it, with `passive_points` one lower.
- [ ] In a field or a run the spend is refused "Points are spent in town." and character-service is
      not called.
- [ ] While queued, refused "Leave the queue to spend points."; not called.
- [ ] A rule refusal answers in its words and does not call character-service.
- [ ] A repeat of a spend already applied sends nothing and calls nothing.
- [ ] character-service unreachable or timing out: refused "Could not save the point. Try again.",
      character in play unchanged.
- [ ] The spend runs off the message hub's loop: a slow character-service does not delay another
      connection's messages (test with a blocking fake).
- [ ] After a run that raised the level, a spend that character-service refuses with no points (its
      grant not yet consumed) answers "Your new level is still being recorded. Try again in a
      moment."
- [ ] Entering the HUB loads the character's ranks into the character in play; a handoff seat and a
      same-pod switch into a run carry them.

Wire
- [ ] `current_player` carries `passive_ranks` and `passive_points` in the HUB world, a field and a
      run; `other_players` carries neither.
- [ ] A level-up in a run raises `passive_points` in the same tick's state.

Effects (game-service)
- [ ] Seated with `t1a` at 2, a warrior's max HP is own max HP × 1.08 (rounded), gear on top.
- [ ] Each filler in R28 changes exactly its stat for each class, per rank.
- [ ] Attack speed and move speed from the tree plus gear never exceed the gear caps.
- [ ] A spend in town of `t1a` raises the HUB body's max and current HP by the same amount at once.
- [ ] A spend in town does not change a body in a field or run; the next seating there has it.
- [ ] Each kicker's per-rank stat applies at R1 and R2, and its R3 rule only at R3, one test per
      kicker row of R29.
- [ ] A refund never takes the resource above its max; Practiced Guard's 2 charges never pass the
      cap.
- [ ] Fleet Foot at R3 (Sidestep): with the roll forced to miss, a monster strike on the archer deals
      no damage, rolls no crit and leaves the class resource and parry state unchanged; forced to
      land, it resolves as today; at R2 no strike is ever negated; the archer's casts still start
      the attack slow *(integrator correction 2026-11-21 — reason: moving while shooting will not be
      allowed (Kranti))*.
- [ ] Holding `t3`, `t6a` or `t6b` changes no stat in this FS.

Client
- [ ] P and the tree corner icon open and close the overlay in the HUB, a field and a run; the icon
      names itself "Tree (P)" under the pointer.
- [ ] The marker shows at `passive_points > 0` and not at 0.
- [ ] Every node of the player's class is drawn in its tier with `r / max` and one of the five
      states of R35.
- [ ] Hovering any node shows its tooltip with every rank's effect, the R3 kicker and, when locked,
      why.
- [ ] In town a click on an available node sends one `spend_passive_point` for its next rank; a
      second click before the state answers sends nothing.
- [ ] A tier-6 click asks once; "no" sends nothing.
- [ ] A refusal's reason shows in the panel.
- [ ] Outside town no node takes a click and the footer says "Points are spent in town."
- [ ] The client test fails when the golden has a node id the presentation copy lacks, or the reverse.
- [ ] Inventory, Character, party panel, menu and Esc follow R36.
- [ ] The character panel's "Passives" group lists the summed bonuses and the R3 kickers held.
- [ ] Every node icon and the corner icon are drawn through `Knockout` with a line-glyph fallback;
      a contact sheet of all 33 pictures (29 new, the four tree-ability pictures reused from
      `ABILITY_ICONS`) is approved before the icon slices close. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*
- [ ] The overlay, the corner icon and the marker are the UI scene's: no world scene binds P or
      draws them; a press on the overlay never reaches the world or a party frame under it; the
      spend goes from the tree's command module, not through a bridge request. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*
- [ ] The XP bar keeps clear of the six-icon corner row.

## Edge States

- **No points to spend:** every node that is not held at max reads locked or available-but-greyed;
  clicking sends nothing; header reads "0 points".
- **Level 1:** the tree shows, every tier-1 node greyed with "Reach level 2 for your first point."
- **Points earned in a run:** `passive_points` rises in the run; the nodes take no click there; the
  marker shows; the point spends once back in town.
- **Not in town:** "Points are spent in town." (server refusal and client footer alike).
- **Queued for a run:** "Leave the queue to spend points."
- **Tier locked:** "Spend N more points above to open this tier." / tier 4: "Take <ability name>
  first."
- **Max rank:** "Already at its highest rank."
- **Out of order** (a target more than one above the held rank, a modded or stale client): "Take the
  ranks one at a time."
- **Unknown node or another class's node:** "Unknown node."
- **No points:** "No points to spend."
- **The other specialization held:** "You chose <name>." (the closed node's tooltip says the same).
- **character-service down or slow:** "Could not save the point. Try again." Nothing changes; the
  client's retry is the same target rank and is safe.
- **Level not yet recorded** (the run's grant still in flight, FS-BDA7X R25): "Your new level is
  still being recorded. Try again in a moment."
- **Duplicate or retried spend:** a no-op; nothing sent, nothing written, no second point.
- **Two tabs spending at once:** character-service's row lock serialises them; the record merges by
  higher rank; at most one takes a given rank.
- **Disconnect mid-spend:** the write either landed or not; the next entry reads the truth from
  character-service.
- **Character deleted mid-session:** the spend is NotFound and refused "Could not save the point.
  Try again."; the entry path handles the rest as today.
- **Character switch:** the new character's ranks come with its read; nothing carries over.
- **Sidestep and a parry-like negation:** a strike Sidestep negates is gone; nothing else (an
  on-hit effect, a teammate's parry) sees it. The roll is per strike, so a burst of strikes rolls
  each one *(integrator correction 2026-11-21 — reason: moving while shooting will not be allowed
  (Kranti))*.
- **A level-up mid-run** does not recompute a percent-of-max-HP bonus until the next seating (R26).
- **A Sellsword holding Bloodied Riposte** (FS-E1ZDG turns the riposte off) keeps a node that does
  nothing; accepted (decided), the spec pick comes last.
- **A shipped node retuned:** saved ranks keep their meaning by slot; the golden and the client move
  together (R5, R6).
- **Unknown class or node id on the client:** drawn with the fallback glyph and the id (R42).
- **Renderer fallback:** a picture that cannot draw shows its line glyph (ADR-0080).

## API surface

No HTTP endpoint changes (the gateway's character responses keep their shape). Two RPC-level
surfaces change; shapes only, meanings in §Requirements.

| Op | Surface | Request | Response | Errors |
|---|---|---|---|---|
| spend-passive-point | gRPC `CharacterService.SpendPassivePoint` (new) | `member_id`, `character_id`, `node_id` (string), `rank` (int32, target) | `applied` (bool), `passive_ranks` (repeated `PassiveRank`) | `NOT_FOUND` · NotFound (character); `VALIDATION_FAILED` · InvalidArgument (malformed ids, rank < 1); `PASSIVE_UNKNOWN_NODE`, `PASSIVE_RANK_OUT_OF_ORDER`, `PASSIVE_MAX_RANK`, `PASSIVE_TIER_LOCKED`, `PASSIVE_NO_POINTS`, `PASSIVE_SPECIALIZATION_TAKEN` · FailedPrecondition (errcode.Refusal); Unavailable (database) |
| character read | gRPC `Character` message (additive) | — | gains `passive_ranks` (repeated `PassiveRank { node_id, rank }`) on Get/List/Create | unchanged |
| spend | WS inbound `spend_passive_point` (new) | `{ node_id: string, rank: int }` | none on success (next state); refusal message `{action, reason}` | the words of §Edge States |
| own state | WS `current_player` (additive) | — | `passive_ranks: {[node_id]: rank}`, `passive_points: int` | — |

The six refusal codes are added to `common/errcode` (adding a code is non-breaking). The `.proto`
is edited and regenerated with `make gen`, never hand-edited.

## Out of Scope

- **Respec, refunds and a reset tool** *(charter default)*. Node ids are permanent (R5).
- The tier-3 ability itself (FS-04EEA) and the tier-6 specializations, titles and looks (FS-E1ZDG,
  FS-1J1CB).
- The ability bar and key 3 (FS-Q18Q3).
- Showing ranks or unspent points on the character list, the gateway, or other players.
- Tooltip comparisons between nodes, a build planner, or previewing a full path.
- Manual attribute points (FS-BDA7X deferred them).
- Balancing: every number here is a placeholder tuned later under `Tunes FS-8RZ51`.
- Re-applying a spend to a body already in a field or a run (R24).
- Rebindable keys.

## Change: Tree v2: a traversal graph with locked sides
Status: work-order
Date: 2026-11-22

> Charter approved by Kranti, 2026-11-22. Every decision below is a *charter default*, with its
> reason where the charter or this promotion gave one; the charter's own words are quoted where it
> settled the point. Kranti's ask, in his words: the tier-6 nodes don't say what they do ("your look
> changes" isn't the point, it's a note); the icons should be whiter and higher contrast, and a lit
> node should light the whole plate; there are too many points: "single point of basic passives
> that give everyone the same amount... 1 point here, 1 point there, with the tree side you didn't
> choose [unreachable]... We want some that you can't reach at all... Add some links in between
> where if you choose that side, you can't get the other side, and that it checks out." The
> specialization tree will grow, so this is built for extension.
>
> **What this changes in the work order above:** R2 (the six-tier shape), R5 (one refund path, V20),
> R9 (the spend rule), R28 (fillers retired), R31's gate ("18 spent" and the one-of-two rule), R35
> (the layout and the five states), R37 (the tier-3 and tier-6 words), R40 (the filler pictures, the
> picture count, the ink), R44 (how the Passives group sums), and the "Points and rules", "Effects"
> and "Client" acceptance rows that name tiers, fillers or the 11-node shape. **Unchanged:** R1, R3,
> R4, R6–R8, R10–R27, R29, R30's effect, R32–R34, R36, R38 (save the ask, V27), R39, R41–R43, the
> API surface's RPC and socket shapes, and every kicker, ability and specialization rule.
>
> **Lanes:** every slice is agent-authored; the server slices are named in the charter, so this is
> not server work taken on by inference. **Vocabulary** folded into `game-service/CONTEXT.md` by
> `domain-model` (2026-11-22): *traversal node*, *link*, *reachable*, *exclusive group*, *side*,
> *locked side*; *tree tier*, *tier gate* and *filler node* retired.

### Summary

The tree stops being six tiers of gated rows and becomes a **graph**: a node can be ranked once any
node it links from is held. Most nodes are now one-rank **traversal** nodes (Vitality, Might, Haste,
Fleetness), the same for every class, which carry a character from the root to the kickers, the
ability and the specialization. The upper and lower halves each split into two **sides**, and
taking any node on one side **locks** the other side for good, as the specialization pair already
did. The cheapest path to a specialization costs 10 of the 20 points, so a character can never fill
even the sides it chose, and the sides it didn't choose are out of reach.

The overlay draws the graph: its links, node sizes by kind, a locked side under a lock mark. Every
node now says what it does, the specialization in plain words with its numbers. The pictures are
drawn in near-white ink, and a lit node lights its whole plate. Existing spends are void: one
migration clears every character's ranks, a one-time full refund (alpha, very few players).

### Requirements

Numbered 1–30 below and cited as **V1–V30**, apart from the work order's R1–R44.

#### §V-A. The graph (game-server/common/passivetree)

1. **The node, as the package and the golden carry it** *(charter default — reason: the gates
   become links, so tier and gate leave the node)*: `id`, `class`, `slot`, `kind`, `maxRank`,
   `requires` (node ids, **any of**, empty for the root), `minLevel` (0 when none), `exclusive`
   (`{group, side}`, absent when the node is on no side), `perRank`, `kicker`. `tier` and `gate`
   are gone from the node and the golden. The golden also gains a top-level `primaryAttributes`
   (V14). Golden node order is the definition's: trunk, upper side a, upper side b, middle, lower
   side a, lower side b, end, the specializations.
2. **The shape, the same for every class** *(charter default)*. Slots, kinds, ranks, links, gates
   and sides:

   | Slot | Kind | Max rank | Requires (any of) | Min level | Exclusive | Per rank |
   |---|---|---|---|---|---|---|
   | `r1` | traversal | 1 | (root) | | | Vitality |
   | `r2` | traversal | 1 | r1 | | | Might |
   | `ua1` | traversal | 1 | r2 | | upper:a | Haste |
   | `t2a` | kicker | 3 | ua1 | | upper:a | unchanged (R29) |
   | `ua2` | traversal | 1 | t2a | | upper:a | Vitality |
   | `ua3` | traversal | 1 | ua2 | | upper:a | Might |
   | `ua4` | traversal | 1 | ua3 | | upper:a | Haste |
   | `ub1` | traversal | 1 | r2 | | upper:b | Fleetness |
   | `t2b` | kicker | 3 | ub1 | | upper:b | unchanged (R29) |
   | `ub2` | traversal | 1 | t2b | | upper:b | Vitality |
   | `ub3` | traversal | 1 | ub2 | | upper:b | Might |
   | `ub4` | traversal | 1 | ub3 | | upper:b | Fleetness |
   | `m1` | traversal | 1 | ua1, ub1 | | | Vitality |
   | `m2` | traversal | 1 | m1 | | | Might |
   | `t3` | ability | 1 | m2 | 10 | | none (R30) |
   | `m3` | traversal | 1 | t3 | | | Vitality |
   | `la1` | traversal | 1 | m3 | | lower:a | Haste |
   | `t5a` | kicker | 3 | la1 | | lower:a | unchanged (R29) |
   | `la2` | traversal | 1 | t5a | | lower:a | Vitality |
   | `la3` | traversal | 1 | la2 | | lower:a | Might |
   | `la4` | traversal | 1 | la3 | | lower:a | Haste |
   | `lb1` | traversal | 1 | m3 | | lower:b | Fleetness |
   | `t5b` | kicker | 3 | lb1 | | lower:b | unchanged (R29) |
   | `lb2` | traversal | 1 | t5b | | lower:b | Vitality |
   | `lb3` | traversal | 1 | lb2 | | lower:b | Might |
   | `la5` | traversal | 1 | la4 | | lower:a | Vitality |
   | `lb4` | traversal | 1 | lb3 | | lower:b | Fleetness |
   | `m4` | traversal | 1 | la1, lb1 | | | Vitality |
   | `lb5` | traversal | 1 | lb4 | | lower:b | Vitality |
   | `t6a` | specialization | 1 | m4 | 20 | spec:a | none (R31) |
   | `t6b` | specialization | 1 | m4 | 20 | spec:b | none (R31) |

   31 nodes and 39 ranks per class. *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*: there is no `m5`; the specializations require `m4`
   directly, and each lower side ends in a fifth single node (`la5`, `lb5`, Vitality). `m1` and `m4` link from either side's first node, so a kicker
   is never required. Requires are written as full ids (`warrior.r1`).
3. **Ids stay permanent** (R5). The kicker, ability and specialization ids (`t2a`, `t2b`, `t3`,
   `t5a`, `t5b`, `t6a`, `t6b`) keep their ids, rules and per-rank stats. The fillers `t1a`, `t1b`,
   `t4a` and `t4b` are **retired**: no class defines them, and those slots are never used again.
   Kind `filler` goes with them. This change's one-time refund (V20) is the refund path R5 asks
   for. It is used once, here.
4. **Points earned are unchanged** (R4): 1 per level-up from 2 to 19, 2 at level 20, 20 in all. No
   respec.
5. **The spend rule** (replaces R9; still one function, `CheckSpend`). A spend of node N to target
   rank r for a character of class C, level L, holding H, answers in this order:
   - N not one of C's nodes: **unknown node**;
   - r ≤ H[N]: **already held**, a no-op success (R10, unchanged);
   - r ≠ H[N] + 1: **out of order**; r > N's max rank: **max rank**;
   - N has an `exclusive {group, side}` and any node of **another side of that group** is held at
     rank ≥ 1: **side taken** (`PASSIVE_SIDE_TAKEN`);
   - N has requires and none of them is held at rank ≥ 1, or L < N's `minLevel`: **not reachable**
     (`PASSIVE_TIER_LOCKED`, the same code, V7);
   - unspent(L, H) < 1: **no points**;
   - otherwise **allowed**.

   *(charter default — reason for the order: a locked side is for good, so it is the more useful
   answer than "not connected", which it usually also is.)* The per-tier "points spent above"
   gates are gone.
6. **Locked sides.** A side is *taken* when any of its nodes is held at rank ≥ 1. Taking one side
   of a group locks every node of every other side of it, permanently. Groups and sides are data:
   a group may have any number of sides, and a node on no side belongs to no group *(charter
   default — reason: future specialization sub-trees, e.g. three sides under one spec)*. Each class
   has `upper` (a/b), `lower` (a/b) and `spec` (a/b). The specialization pair is the `spec` group,
   so `otherSpecializationHeld` goes. `SpecializationOf` still reads `t6a`/`t6b` (FS-E1ZDG §B R7).
7. **Refusal codes.** `PASSIVE_SIDE_TAKEN` is added to `common/errcode` and registered as a
   refusal. `PASSIVE_TIER_LOCKED` now means "not reachable yet": not linked, or the level is too
   low. The six existing codes stay registered (removing one would break a reader).
   `PASSIVE_SPECIALIZATION_TAKEN` is no longer answered by the rule, because the spec pair refuses
   with `PASSIVE_SIDE_TAKEN`. Its constant stays.
8. **Unspent counts only nodes the definition knows**, each at most its max rank. A retired or
   otherwise unknown id costs nothing *(charter default — reason: R42's "unknown ids are ignored",
   applied to the points as well; a stray row never reads as points short)*.
9. **The package names what the sides need.** Per class: `AbilityNode` and `SpecializationNodes`
   (unchanged), the primary attributes (V14), and a read of which side of a group is taken, if any,
   so game-service's words (V18) never restate the rule.
10. **The math, pinned by a test per class** *(charter default — the charter: "must be stated and
    pinned by a test")*:
    - the cheapest path to either specialization is **10** points (r1, r2, ua1 or ub1, m1, m2, t3,
      m3, la1 or lb1, m4, t6), leaving **10** of 20 *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*;
    - the chosen sides hold **13** more ranks (upper: a kicker at 3 and three singles; lower: a
      kicker at 3 and four singles), more than 10, so at least 3 always stay unfilled;
    - the unchosen sides (**15** ranks) and the other specialization can never be taken;
    - **no trap** *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*: everything above the lower fork holds at most **13** ranks (r1, r2, one
      upper side's 7, m1, m2, t3, m3), so any character with 18 spent holds `la1` or `lb1`, and at
      level 20 its 2 new points always reach `m4` and a specialization;
    - the ability's cheapest path is **6** points (reachable by level 7), but it waits for level 10.

    The test computes these from the definition (a cheapest-path walk over `requires`), never from
    constants. A shape change that breaks one fails it.
11. **Built for extension.** The rule, the math walk and the client layout read only `requires`,
    `minLevel` and `exclusive`, never a slot name. A fixture tree with nodes past a specialization
    and a three-sided group is ruled on and laid out with no code change (V-E's test).
12. **The golden is rewritten** with `-update` (R6). The client test still fails when either side
    has an id the other lacks.

#### §V-B. Traversal nodes

13. **Kind `traversal`**: 1 rank, the same four in every class, named in the client copy: Vitality,
    Might, Haste, Fleetness *(charter default)*.
14. **Their values** *(charter default; all placeholders, tuned later under `Tunes FS-8RZ51`)*:

    | Node | Per rank (stat, amount, unit) | Reads |
    |---|---|---|
    | Vitality | `max_hp`, 5, flat | +5 max HP |
    | Might | `primary_attribute`, 2, flat | +2 to the class's attribute |
    | Haste | `attack_speed`, 2, percent | +2% attack speed |
    | Fleetness | `move_speed`, 2, percent | +2% move speed |

    - **Vitality's 5:** about 4% of the median class base max HP. game-service's class config has
      warrior 150, mage 100, archer 100, mercenary 130, so the median is 115, 4% of that is 4.6,
      and the whole number is **5**.
    - **`primary_attribute`** is a new stat. The package names each class's primary attributes:
      warrior `[strength]`, mage `[intelligence]`, archer `[agility]`, mercenary
      `[strength, agility]`. Each one named gets the full amount, so a mercenary's Might is +2
      Strength **and** +2 Agility, because the cut scales on their average. The golden carries
      the table as `primaryAttributes`.
    - Haste and Fleetness sum with gear inside gear's caps (R25).
15. **Placement** is V2's table: the same in every class.

#### §V-C. Effects (game-service)

16. **`sumPassives` reads `max_hp`'s unit.** Percent is of own max HP at seating (R26; Thick Skin
    keeps it). Flat adds whole points (Vitality). Both sum into the one max HP bonus.
    `primary_attribute` adds its amount to each attribute the class names. A spend in town raises
    the HUB body's max and current HP together (R27, unchanged).
17. **The retired fillers' references go.** Stats no node names any more lose their constant and
    their `sumPassives` row: `max_stamina`, `mana_regen`, and the bare `strength`, `intelligence`
    and `agility` rows, now reached only through `primary_attribute`. Dead code is deleted, never
    kept (docs/specs/README.md *Removal*). Tests that seated or spent `t1a`, `t1b`, `t4a` or `t4b`
    move to live ids.
18. **The refusal words** (game-service, §Edge States):
    - not reachable, not linked: "Not reachable yet: take a node linked to it first.";
    - not reachable, level too low: "Not reachable yet: reach level N.";
    - side taken in the `spec` group: "You chose <specialization name>." (the words used today);
    - side taken in any other group: "Locked: you chose the other side."

    game-service holds no kicker names (they are the client's), so its words name only the spec.
    The tooltip names the kicker (V25). A `PASSIVE_TIER_LOCKED` from character-service that
    game-service's own check passed reads as a level still being recorded, the same as
    `PASSIVE_NO_POINTS` does today (R21), because level is the only input the two can disagree on.
    A `PASSIVE_SIDE_TAKEN` from character-service (a race, see §Edge States) answers in the
    side-taken words.
19. **The gRPC client maps `PASSIVE_SIDE_TAKEN`** to the rule's refusal, as it maps the six today.

#### §V-D. Persistence (character-service)

20. **Existing spends are void.** One migration, `000005`, clears `passive_ranks`
    (`DELETE FROM passive_ranks`). It runs once and is a **one-time full refund** of every
    character's points, the tier-3 ability and the specialization included. Every character reads
    back `earned(level)` unspent and no specialization. The down migration is a no-op: the refund
    cannot be undone. *(charter default — reason: alpha, a very small player base; mapping old
    ranks onto the new shape would invent choices the player never made.)* It rolls out with a
    redeploy of game-service, so no seated body keeps its old ranks. The table, its key and its
    rank check (1..3) are unchanged.
21. **Unknown ids are still ignored** everywhere: the rule (V8), `sumPassives` (it walks the
    class's nodes), the client (R42). A spend naming one is refused as an unknown node.
22. **No `.proto`, gateway or OpenAPI change.** `PassiveRank`, the character read and
    `SpendPassivePoint` keep their shape. Only the refusal set gains one code.

#### §V-E. The overlay draws a graph (game-client)

23. **The layout comes from the node data, not from per-class placement** (replaces R35's rows)
    *(charter default)*:
    - **Depth** runs left to right, the root at the left. A node's depth is 0 for the root, else 1
      more than the smallest depth among its requires. *(Reason: today's shape is 13 deep, which
      does not fit 720 px tall with rank labels; a 1280×720 screen has width to spare.)*
    - **Lane** is a node's `exclusive {group, side}`, or the trunk for a node on no side. The trunk
      is the middle row. Sides `a` stand above it, and `b` and later sides below it, alternating
      outward when a group has more than two.
    - **Rows.** A lane takes the free row on its side nearest the trunk across every depth it
      spans. Lanes are placed in order of their first depth, deepest first, so the end of the tree
      sits nearest the trunk. Ties go by group order in the definition, then side order.
    - **Today's shape** therefore lays out on 13 columns (depth 0–12) and 5 rows *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*. The
      trunk is row 0. `spec:a` and `spec:b` take rows −1 and +1 at depth 9. `lower:a` and `lower:b`
      take −2 and +2 at depths 7–12. `upper:a` and `upper:b` take −1 and +1 at depths 2–6.
    - **Starting sizes:** columns 64 px apart, rows 72 px apart. Plates are 24 px and round for
      traversal, 32 px for a kicker, 40 px for the ability and a specialization. These are tuned
      at the browser check.
    - The panel is centred, as now, and fits a 1280×720 view and up, clear of the corner row. It
      keeps its title, its header with the class and the unspent points, and its footer.
24. **Links.** One link per `requires` edge: a straight line from plate edge to plate edge, under
    the plates. It is **lit** (bright brass) when both ends are held, faint otherwise, and dimmed
    with the node when its far end is locked. No link passes through a plate other than its two
    ends (tested on today's shape).
25. **Node states** (replace R35's five):
    - **max** and **held**: as before;
    - **available**: reachable, its side not taken;
    - **closed**: not reachable yet, because none of its requires is held or the level is too low.
      Greyed, no lock mark. Its tooltip says what it needs;
    - **locked**: another side of its group is taken. Dimmed, with a small **lock mark** on the
      plate. This is for good. Its tooltip reads "Locked: you chose <name>.", where the name is the
      held side's headline node: its kicker, else its specialization, else "the other side" for a
      side with neither (a future sub-tree).

    The words "closed" and "locked" swap meaning against R35: "locked" is now only the permanent
    case.
26. **Tooltips** (replace R37's tier-3 and tier-6 words; copy stays in
    `game-client/src/data/passiveTree.ts`, keyed by id) *(charter default)*:
    - **every node:** its name, its kind (Passive, Kicker, Ability, Specialization), `Rank r / max`,
      then the lines below, then why it cannot be taken, if it cannot. No tier line;
    - **traversal:** one line, "<Name>: <effect>", e.g. "Vitality: +5 max HP", "Might: +2
      Strength" (mercenary: "Might: +2 Strength, +2 Agility"), written from the golden's value and
      `primaryAttributes`, so a retune shows without a copy edit;
    - **kicker:** unchanged (each rank, the R3 kicker);
    - **ability:** its name, one plain line of what it does (FS-04EEA), and "Cast with 3." The
      lines:
      - Earthbreaker: "Slam the ground: hit and stun everything within 90 px for 1 s (0.5 s on a
        boss)."
      - Blink: "Teleport up to 180 px toward the cursor; walls stop you."
      - Arrow Rain: "Five volleys of arrows fall on a 70 px circle over 1.5 s."
      - Settle the Debt: "A flurry all round you that spends every parry charge, harder for each
        one."
    - **specialization:** its title, then **what it does** in plain words, numbers included (the
      FS-E1ZDG effect), then the reason line if any, and last a separate, faint note, "Your look
      changes." That note is never the main line. The lines:
      - Guardian: "Last Stand: once per floor, a hit that would kill you leaves you at 1 HP and
        refills your stamina."
      - Berserker: "Blood price: 33% less max HP for +25% attack speed and +10% damage; each slash
        that hits heals 1.5% of max HP."
      - Spellwarden: "Arcane Ward: a quarter of each hit's damage comes off your mana first, and
        magic hits deal 10% less."
      - Pyromancer: "Combustion: a fireball crit explodes for half its damage on every other monster
        within 60 px."
      - Hunter: "Split Shot: an arrow crit splits off a 60% arrow at the nearest other monster
        within 220 px."
      - Shadow Ranger: "Shadow Shot pierces every target in its line; each monster it hits refunds
        8 stamina."
      - Duelist: "Quick riposte: your cut ripostes at 2 parry charges and spends only 2."
      - Sellsword: "Five parry charges and no riposte; each charge held gives +5% cut damage and +5%
        attack speed."

      The ability and specialization numbers are FS-04EEA's and FS-E1ZDG's, copied into the
      words. A retune there is a copy edit here, because those numbers are not in the golden.
    - **reasons:** closed, not linked: "Not reachable yet: take <requires' names, joined by 'or'>
      first."; closed by level: "Not reachable yet: reach level N."; locked: V25's words; no points
      and level 1: as today.
27. **The ask covers every spend that locks a side** (extends R38) *(charter default — reason: R38
    asked only on tier 6 because it was "the one spend that closes another node"; now the first
    node of any side does that too)*:
    - the first node of a side, when no side of its group is taken, asks once: "Take <name>?
      <other side's headline>'s side is gone for good.";
    - a specialization keeps its words: "Choose <name>? <other> is gone for good.";
    - "no" sends nothing.
28. **The client's rule is the server's, restated for the answer only** (as R9 was): reachability,
    `minLevel` and sides from the golden. The server decides every spend again.
29. **Icons** *(charter default)*:
    - **Ink.** Every tree node picture is drawn in near-white ink: the canvas palette's lightest
      vellum token, `palette.hudText` (`BARROW_HEX.vellum`), as a new tree ink beside `BRONZE` in
      `knockout.ts`. Never raw hex (ADR-0013). Greyed stays `GREYED`, plainly dimmer. The ability
      bar's icons keep `BRONZE` and are untouched.
    - **Lit plate.** A lit node (available and spendable, held, max) lights its **whole plate
      fill**, not only its edge: the plate fills with its edge's token over the panel ground. The
      mix starts at 0.35 and is tuned at the contact sheet. The near-white picture stays readable
      on it.
    - **Four new pictures, built in code** (ADR-0080 renderer, `picture` and `lines`), each distinct
      from every kicker picture:
      - **Vitality:** a heart with a pulse line cut across it;
      - **Might:** a clenched fist, knuckles parted by cuts (not Steady Hand's open palm);
      - **Haste:** a gust, three swept wind strokes (not an hourglass, which is Practiced Guard's);
      - **Fleetness:** a bare foot in stride trailing three speed lines (not a winged foot: Fleet
        Foot's picture is already a winged boot).

      The charter asked for "an hourglass-or-wind mark" and "a winged foot". The hourglass and the
      winged foot would repeat Practiced Guard's and Fleet Foot's pictures, so the distinctness
      rule wins.
    - **The lock mark** is a small padlock drawn in code from palette tokens.
    - **Retired pictures.** The four filler pictures (`health`, `reserve`, `attribute`, `regen`)
      are deleted with the fillers.
    - **The gate** is a contact sheet of the four new pictures and the lock mark, plus every tree
      picture in the new ink, lit and greyed, approved before the icon slice closes.
30. **The character panel's Passives group** (R44) keeps working:
    - it sums per stat **and unit**, so a flat and a percent max HP are two lines ("+10 max HP",
      "+4% max HP");
    - `primary_attribute` sums into the class's attribute lines ("+4 Intelligence"; a mercenary
      "+4 Strength" and "+4 Agility");
    - the kickers-held lines are unchanged.

### User Stories

1. As a player, I want most of my points to go into small nodes that walk me across the tree, so
   that every point is a step toward something I want.
2. As a player, I want taking one side of my tree to lock the other, so that my build is a real
   choice and two characters of one class differ.
3. As a player, I want a locked side drawn locked with the name of what I chose, so that I know why
   I can't take it.
4. As a player, I want to be asked once before a spend locks a side, so that a misclick never costs
   me half a tree.
5. As a player, I want a node I can't reach yet to say what it needs, so that I can plan the next
   points.
6. As a player, I want to see the links between nodes, lit along my path, so that the tree reads as
   a route.
7. As a player, I want to see big nodes as big plates, so that I can tell a kicker, my ability and
   my specialization from a small step.
8. As a player, I want the specialization's tooltip to say what it does, with its numbers, so that
   I pick it for its play and not its look.
9. As a player, I want the look change as a small note, so that it does not hide the effect.
10. As a player, I want the ability's tooltip to say what it does and that it casts with 3, so that
    I know what level 10 brings.
11. As a player, I want the tree's pictures bright and clear, and a lit node lit across its plate,
    so that I can read the tree at a glance.
12. As a player, I want the four small nodes to have pictures of their own, so that I never mistake
    a step for a kicker.
13. As a player whose old spends were voided, I want all my points back at once, so that I can
    rebuild on the new tree.
14. As a player at level 19 with every point spent, I want the tree to show what level 20 opens and
    what it still needs, so that I'm not surprised.
15. As a player with two tabs open, I want a spend on one side to block the other side's spend in
    the other tab, so that I never hold both sides.
16. As a mercenary, I want Might to raise both Strength and Agility, so that it helps my cut, which
    scales on both.
17. As a player, I want the character panel to show my Vitality and Might bonuses, so that I see
    what my steps bought.
18. As a developer, I want the sides and the links to be data, so that a specialization sub-tree
    with three sides needs no new rule code.
19. As a developer, I want the tree's math pinned by a test computed from the definition, so that a
    shape change that lets a character fill everything fails.
20. As a developer, I want the layout computed from the links and sides, so that a new node lays
    itself out without per-class placement.
21. As an operator, I want the refund to be one migration that runs once, so that the reset is
    simple and auditable.

### Acceptance Criteria

Graph and rule (common)
- [ ] Every class's tree matches V2's table: 31 nodes, 39 ranks, each node's kind, max rank,
      requires, min level, side and per-rank value pinned by a test.
- [ ] No class defines `t1a`, `t1b`, `t4a` or `t4b`, and no node is of kind `filler`.
- [ ] The rule allows `r1` at level 2 with nothing held, and refuses `r2` with `r1` unheld
      (not reachable).
- [ ] `m1` is allowed with only `ua1` held, and with only `ub1` held.
- [ ] With `ua1` held, `ub1`, `t2b` and `ub2` are refused side taken. With `la1` held, every
      `lower:b` node is refused side taken. With `t6a` held, `t6b` is refused side taken.
- [ ] `t3` with `m2` held is refused not reachable at level 9 and allowed at level 10. `t6a` with
      `m4` held is refused not reachable at 19 and allowed at 20.
- [ ] The refusal order is V5's: a node both side-taken and unlinked answers side taken. A
      side-taken node at 0 unspent answers side taken.
- [ ] A target already held is a no-op, not a refusal (R10, unchanged).
- [ ] `Unspent` ignores a retired id (`warrior.t1a: 2` costs nothing) and caps a rank at its max.
- [ ] The math test (V10), per class and computed from the definition: cheapest spec path 10, the
      own sides' remaining 13 > 10, the unchosen 15 ranks plus the other spec unreachable from any
      chosen state, the ability's path 6 with level 10.
- [ ] The no-trap test (V10), per class: the most ranks holdable without `la1` or `lb1` is 13, so
      every state with 18 spent holds one; from every such state at level 20, 2 points reach `m4`
      and a specialization. *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*
- [ ] A fixture tree with a three-sided group and nodes past a specialization is ruled on
      correctly by `CheckSpend` with no code change.
- [ ] `PASSIVE_SIDE_TAKEN` is a registered refusal. All six existing codes are still registered.
- [ ] The golden carries `requires`, `minLevel`, `exclusive` and `primaryAttributes`, and no
      `tier` or `gate`. It fails when the definition differs, and `-update` rewrites it.

Persistence (character-service)
- [ ] Migration `000005` empties `passive_ranks`. After it, every character reads no ranks and no
      specialization, and `passive_points` = `earned(level)`. The down migration changes nothing.
- [ ] Two concurrent spends of `ua1` and `ub1` for one character: exactly one lands, and the other
      is refused `PASSIVE_SIDE_TAKEN` and writes nothing (DB test, the row lock).
- [ ] A spend of a retired id is refused `PASSIVE_UNKNOWN_NODE`.

Effects and words (game-service)
- [ ] A body holding `r1`, `m1` and `m3` has +15 max HP flat, current raised with it. With Thick
      Skin at 2 as well, it also has 8% of own max HP, both summed.
- [ ] Might adds +2 Strength (warrior), +2 Intelligence (mage), +2 Agility (archer), and +2
      Strength and +2 Agility (mercenary).
- [ ] Haste and Fleetness add 2% each inside gear's caps. The tree plus gear never exceeds the cap.
- [ ] A body holding a retired id seats with nothing from it.
- [ ] No `sumPassives` row or stat constant names a stat no node uses. No test seats or spends a
      retired id.
- [ ] The refusal words of V18, one test each, including a character-service `PASSIVE_TIER_LOCKED`
      that game-service passed reading as the level still being recorded.

Client
- [ ] Every node of the class is drawn at its derived depth and lane. On today's shape the
      expected placement is V23's (13 columns, 5 rows). No two plates overlap. No link passes
      through a plate other than its ends. The panel fits 1280×720 clear of the corner row.
- [ ] The fixture tree of the rule test lays out with no layout code change.
- [ ] Plate sizes by kind: traversal small and round, kicker larger, ability and specialization
      largest.
- [ ] A link is lit only when both its ends are held.
- [ ] After `ua1`, every `upper:b` node draws locked with the lock mark, and its tooltip reads
      "Locked: you chose Heavy Hand." (warrior). After `t6a`, `t6b` reads "Locked: you chose
      Guardian."
- [ ] A closed node's tooltip says what it needs: the linked nodes' names, or the level.
- [ ] Every traversal tooltip reads "<Name>: <effect>" from the golden. Every specialization
      tooltip's first line after the title is its V26 effect line, and "Your look changes." is the
      last line, in the faint tone. Every ability tooltip names the ability, its V26 line and
      "Cast with 3."
- [ ] The first spend on a side asks once, and "no" sends nothing. A spend on a side already taken
      by this character does not ask.
- [ ] Tree pictures draw in the vellum ink token. A lit node's plate fill is lit. A greyed one is
      plainly dimmer. The ability bar's icons are unchanged.
- [ ] Four traversal pictures and the lock mark exist with line fallbacks. The filler pictures are
      gone. A contact sheet is approved before the icon slice closes.
- [ ] The Passives group shows flat and percent max HP as separate lines, and Might under the
      class's attributes.
- [ ] The golden ↔ copy id test still holds both ways.

### Edge States

- **A body holding a retired id** (a record loaded before the wipe on a pod that outlived it, or a
  row an old character-service wrote mid-rollout): it gives nothing at seating, costs no point
  (V8), is required by nothing, sits on no side, and is drawn nowhere. The Passives group ignores
  it. A spend naming it is "Unknown node." It is never deleted by game-service. The next entry
  reads the truth from character-service.
- **Two clients racing to spend on opposite sides** (two tabs, `ua1` and `ub1`): both may pass
  game-service's check against a record that holds neither. character-service decides each under
  the same `SELECT … FOR UPDATE` on the character row: the first writes its rank. The second
  reads that rank under the lock and is refused `PASSIVE_SIDE_TAKEN`, writing nothing. Its client
  hears "Locked: you chose the other side." The idempotency key is still the target rank: a retry
  of the landed spend is a no-op, and a retry of the refused one is refused again. The record
  merges the landed answer by higher rank (R20), so it never holds both sides.
- **Level 19 with all points spent** *(charter default (coordinator), 2026-11-22 — reason: removes the level-19 trap)*: 18 are held, so by V10's no-trap guarantee
  `la1` or `lb1` is among them (at most 13 ranks fit above the lower fork). The specializations
  draw closed with "Not reachable yet: reach level 20." (plus "take Vitality first" when `m4` is
  not held), and the header reads "0 points". At level 20 the two new points always reach `m4` and
  a specialization, or the specialization and one more rank when `m4` is held. No character can
  spend itself out of a specialization.
- **The ability reachable before level 10:** at level 7 the path to `t3` can be held. `t3` draws
  closed, "Not reachable yet: reach level 10."
- **Level 1:** `r1` draws available-but-greyed, "Reach level 2 for your first point." Everything
  else is closed.
- **The first node of a side:** the ask (V27). Confirmed, the other side locks at once in the
  drawing, and the server's next state confirms it.
- **A spend refused side taken** while the client still drew the side open (a stale state):
  "Locked: you chose the other side." The next state draws the lock.
- **Level not yet recorded** at level 10 or 20 (the run's grant still in flight): character-service
  answers `PASSIVE_TIER_LOCKED` where game-service passed. The words are "Your new level is still
  being recorded. Try again in a moment."
- **The wipe while online:** the redeploy drops every session. The next entry reads no ranks and
  full points, and the marker shows.
- **A specialization lost to the wipe:** the title and look go (FS-E1ZDG derives them from the
  ranks). The pick is taken again at level 20 under the new rule.
- **A Sellsword holding Bloodied Riposte:** unchanged (accepted in the work order).
- **Unknown class or node id on the client:** fallback glyph and id (R42). A link to an id the
  golden lacks is not drawn.
- **A future group with three sides:** the layout alternates its sides outward. The lock reads
  "Locked: you chose the other side." when the held side has no kicker or spec.

### API surface

No HTTP endpoint, `.proto` or OpenAPI change. The shapes in the work order's table are unchanged.
What changes:

| Op | Surface | Change |
|---|---|---|
| spend-passive-point | gRPC `CharacterService.SpendPassivePoint` | Errors gain `PASSIVE_SIDE_TAKEN` · FailedPrecondition (errcode.Refusal). `PASSIVE_TIER_LOCKED` now means "not reachable yet". `PASSIVE_SPECIALIZATION_TAKEN` stays registered and is no longer answered. |
| spend | WS inbound `spend_passive_point` | Payload unchanged. The refusal words gain V18's lines. |
| tree definition | `game-client/src/data/passiveTree.golden.json` (the client's contract with `common/passivetree`, R6) | Nodes lose `tier` and `gate` and gain `requires`, `minLevel` and `exclusive`. Top-level `primaryAttributes` is added. Kind `traversal` is added and `filler` removed. Stat `primary_attribute` is added. `max_hp` may be `flat`. |

### Out of Scope

- Respec, refunds beyond this one, and a reset tool.
- New kickers, new specializations, specialization sub-trees (built for, not built), and any
  change to a kicker, ability or specialization rule or number.
- A build planner, a path preview, or a warning that a spend leaves too few points for a
  specialization.
- Mapping old ranks onto the new shape.
- The ability bar's icons and FS-E1ZDG's or FS-04EEA's own text (their "18 spent" wording is
  superseded here, since the pick's gate is this FS's, FS-E1ZDG §A R3).
- Balancing: every number is a placeholder, tuned later under `Tunes FS-8RZ51`.

## Change: A lit node glows in its own colour
Status: work-order
Date: 2026-11-23

> Charter "天賦點亮上色", approved by Kranti, 2026-11-23. Every decision below is a *charter
> default* the owner approved, with its reason. His ask, in his words: 「介面ui的tree天賦點亮後
> 內容icon要跟著變亮 顏色可以根據內容是什麼加一些色彩 例如 法師第一個是Hardened Frame 是愛心 點亮後 愛心會是紅色的
> 顏色配色可以模仿徽章的古銅質感有漸層 你再看看其他徽章適合搭配什麼顏色」, and on the charter: 「ok
> 重點是激活後裡面要是有active發亮的」. ("Hardened Frame" is tree v1's name; in tree v2 the heart is
> Vitality.) Decision: [ADR-0089](../adr/0089-a-lit-passive-tree-node-draws-its-picture-in-its-own-hue-with-a-glow.md),
> amending ADR-0080 for the tree's pictures only.
>
> **Owner change, 2026-11-23** (same day, before any code drew it), asked whether open nodes should
> go bronze: 「我說的是激活天賦後的圖示目前是暗的 要變成有顏色 但不是白一點 是要有圖案適合的配色 不是全部都用古銅色」. So
> an open (rank-0) node keeps V29's near-white `TREE_INK` exactly as today, and charter default T1's
> "open is plain bronze" is withdrawn; a lit node takes a colour that suits its picture, read as that
> colour, not whiter and not bronze for everything, so its bronze mix drops from 35% to a light touch
> (10%, within 10–15%). L1, L3, L7, L12 and the criteria below are edited in place for it.
>
> **What this changes in § Change: Tree v2:** V29's **Ink** clause (one near-white ink for every
> picture that is not greyed), for lit nodes only. **Unchanged:** V25's states and which of them are greyed, V29's ink on open nodes, V29's lit
> plate, its pictures and its lock mark, V24's links, every plate's shape, edge and fill, the hover
> ring, the rank labels, the tooltips, and everything outside the overlay.
>
> **Lane:** game-client only, agent-authored. No server, wire or golden change.

### Summary

A node the character holds now looks switched on. Its picture takes a colour of its own, by what
the node gives (a held Vitality's heart is red, a held Searing's flame ember), with a light touch of the
badges' bronze and lit from above like them, and a soft halo of that colour glows behind it. A node
open to take keeps today's near-white; a closed or locked node stays greyed. So a glance tells what
is held, what can be taken, and what each held node is for.

### Requirements

Numbered 1–14 below and cited as **L1–L14**.

#### §L-A. Which ink a picture takes

1. **Three inks, by the node's state** *(charter default T1, as the owner corrected it the same day —
   reason: 「點亮後 內容icon要跟著變亮」; 「是要有圖案適合的配色 不是全部都用古銅色」)*:
   - **greyed** (closed, locked, or available with no point to spend, as `greyed()` rules today):
     `GREYED`, unchanged;
   - **open** (available and spendable, rank 0): V29's near-white `TREE_INK` (`palette.hudText`,
     flat, alpha 1), exactly as today;
   - **lit** (held or max, so rank > 0): the node's own hue (L4–L6), at full alpha. It reads more
     alive than open by its colour, its lifted top and its glow, not by being lighter: vellum is the
     canvas's lightest tone, and the owner asked for colour, 「不是白一點」.

   A node `passiveTreeModel` draws locked keeps the greyed ink whatever its rank: locked wins, as
   V25 already rules (`passiveTreeModel.ts` decides `locked` before `held`).
2. **Every rank above 0 wears the same colour** *(charter default T3 — reason: a smaller v1)*. A
   kicker at 1/3 and at 3/3 look alike; the edge and the rank label still tell max from held (V25).
3. **V29's near-white `TREE_INK` stays, for open nodes only.** No lit picture is drawn in it; the
   constant is kept.

#### §L-B. The hues

4. **Ten hues, each a palette token** *(charter defaults T4 and T5 — reason: colour by what the
   node gives; tokens only, ADR-0013)*. The charter's list named "nine" and gave ten; all ten are
   kept. Starting values, retuned at the review page (L12):

   | Hue | Meaning | Token (`palette.treeHue.*`) | Resolves from | Starting value | Nodes |
   |---|---|---|---|---|---|
   | crimson | health | `health` | `BARROW_HEX.oxbloodText` (reused: health's own colour, the HP bar's) | `#c96b5e` | Vitality, Bloodied Riposte, Berserker |
   | copper | power | `power` | new `BARROW_HEX.copper` | `#d49274` | Might, Heavy Hand, Earthbreaker |
   | ember | fire | `fire` | `BARROW_HEX.ember` (reused: the shared torch-and-fire token, not one of fire's own three) | `#c2611f` | Kindling, Wide Volley, Searing, Pyromancer |
   | steel blue | defence | `defence` | new `BARROW_HEX.steelBlue` | `#5f82b8` | Thick Skin, Practiced Guard, Guardian |
   | mana blue-green | mana | `mana` | `BARROW_HEX.necrotic` (reused: the mana bar's, `hudMana`) | `#688b8f` | Deep Well, Blink, Spellwarden |
   | frost | speed | `speed` | new `BARROW_HEX.frost` | `#8cc4d0` | Haste, Quick Draw, Arrow Rain |
   | verdigris | movement, evasion | `movement` | new `BARROW_HEX.verdigris` | `#5fa88a` | Fleetness, Fleet Foot, Hunter |
   | amethyst | crit | `crit` | new `BARROW_HEX.amethyst` | `#a088cc` | Bull Rush, Eagle Eye, Keen Edge, Shadow Ranger |
   | pale gold | resource refund | `refund` | derived, `tint(BARROW_HEX.brassBright, 0.5)`, no new base | `#cbb074` | Long Wind, Hunter's Breath, Steady Hand, Sellsword |
   | silver | the duel | `steel` | new `BARROW_HEX.silver` | `#c4cad0` | Duelist, Settle the Debt |

   The six new bases go into `BARROW` and `BARROW_HEX` (`src/utils/theme.ts`) and the guideline's
   palette table, in that order (ADR-0013). `palette.treeHue` in `canvasPalette.ts` names them by
   meaning. Nothing outside the tree's pictures reads them.
5. **Which hue a node wears is presentation copy**, keyed by node id beside its name and icon
   (`PassiveNodeCopy.hue` in `src/data/passiveTree.ts`, R39). The traversal four carry theirs in
   `TRAVERSAL`, so every class's slots share them. `NodeView` carries the hue to the overlay. A node
   the copy lacks has no hue and draws the fallback glyph as today (R42). A test pins the table
   above: every node of every class has the hue listed, and every hue listed is used.
6. **Never amber, never arcane green** *(charter default T5 — reason: amber means interactable,
   arcane green allies and healing)*. No `palette.treeHue` value is, or resolves from, `amber`,
   `amberBright`, `arcane` or `arcaneDeep`, and none is a fire-only token (`fireCore`, `fireHot`,
   `fireDeep`; `theme.test.ts` already keeps those out of `palette`). Tests hold both.

#### §L-C. The lit ink

7. **A light touch of bronze, lit from above** *(charter default T2, as the owner corrected it —
   reason: 「模仿徽章的古銅質感有漸層」, and 「不是全部都用古銅色」)*. A lit ink's tint is its hue mixed toward
   `BRONZE`'s idle tint by `TREE_BRONZE_MIX`, 0.10 (tunable within 0.10–0.15: the bronze is an orange
   and greys the cool hues, so the low end), and it is drawn through the renderer's own top-lit
   gradient (`topLit`), not flat, on the same drop shadow. The gradient carries the metal's feel;
   the mix only keeps the hue in its family.
8. **A brighter highlight.** A lit ink lifts its top further than bronze's 0.25 (starting at 0.4),
   and toward its hue's own light end, `tint(hue, 0.5)`, not toward the amber bronze lifts to, so a
   hue stays itself at the top. `KnockoutInk` gains the optional fields that say this (how far, and
   toward what); `topLit` reads them and keeps today's lift where an ink does not set them, so every
   other icon draws exactly as before.
9. **Hover does not change a picture** (V29). The tree marks hover with its ring; the lit inks'
   `hover` equals their `idle` (as `TREE_INK`'s already does), and the overlay never redraws a
   picture under the pointer.

#### §L-D. The glow

10. **A lit picture glows** *(charter default T9 — reason: 「重點是激活後裡面要是有active發亮的」)*: a soft
    halo in its hue stands behind the picture.
    - **Where:** on the overlay's plate graphics, drawn after the plate's fill and edge and under
      the picture (`PICTURE_DEPTH`), centred on the plate, inside it: its outer radius stops short of
      the plate's edge line, so it never covers the edge that carries the state.
    - **How:** a few stacked discs in the hue, each smaller and adding a little alpha, so it is
      brightest at the centre and fades out (starting at 4 discs, from the plate's inner radius
      down to 0.4 of it, about 0.45 alpha at the centre). Round on a round plate and on a square one.
    - **Static:** drawn once with the plate, rebuilt only when the overlay rebuilds (R41). No
      animation, no per-frame redraw, no Phaser filter (Phaser 4's Glow filter is a framebuffer pass
      on every render, ADR-0089).
    - **With the fallback:** because the halo is on the plate's graphics and not in the knockout's
      texture, it shows the same where the scene makes no texture and the picture is drawn in lines.
11. **It never reads as another state.** The halo shows only on a lit node, in that node's own hue
    and never in amber or the edge's brass; the open and greyed states have none. A held node and a
    max node glow alike; their edges and rank labels tell them apart (V25).

#### §L-E. The fallback, the review page, the guideline

12. **The line fallback is inked the same.** Where the knockout cannot stand, `drawIconLines`
    draws in the state's ink: the lit ink's mixed tint at full alpha, the open near-white as today,
    the greyed faint, as today. A slot is never empty (ADR-0080).
13. **A review page for the owner** *(charter default T7 — reason: the owner retunes single colours
    there, inside the charter)*. A dev gallery family (FS-1819Q, `families.ts`), **Tree colours**:
    - every class's nodes, each in its three states (greyed, open, lit) on its real plate, drawn by
      the overlay's own plate and picture code, so what is approved is what ships;
    - a render-scale switch, 1 and 2, the knockouts rebuilt at each;
    - each hue's token name and current value beside its nodes, and a colour input per hue that
      previews a retune live on the sheet. A preview is never saved: a retune the owner settles on is
      written into `theme.ts` (or the derivation in `canvasPalette.ts`) as an ordinary edit under
      this section;
    - `TREE_BRONZE_MIX`, the lit lift and the halo's alpha shown with their values.
14. **The guideline follows** (`game-client/docs/design-guideline.md`):
    - the HUD icons rule names the exception: a lit passive-tree picture wears its own hue and glows
      (ADR-0089); every other HUD icon stays bronze;
    - the palette table lists the six new bases;
    - two narrow notes, tree pictures only: **frost** is a pale, desaturated cold tone, not the
      forbidden neon cyan; **amethyst** marks crit in the tree and is not umbra, which stays the
      Shadow Shot's and the Shadow Ranger's gloom.

### User Stories

1. As a player, I want a node I hold to look lit, so that I can see my build at a glance.
2. As a player, I want a held node's picture coloured by what it gives, so that I can tell my
   health nodes from my crit nodes without reading tooltips.
3. As a mage, I want my held Vitality's heart red, so that it reads as health, like my HP bar.
4. As a player, I want a held node to glow from inside its plate, so that "active" is unmistakable.
5. As a player, I want a node I could take now to keep its plain near-white, so that I never mistake
   an offer for something I hold.
6. As a player, I want closed and locked nodes to stay grey, so that what I cannot take still reads
   as out of reach.
7. As a player, I want each held node's colour to read as its own colour, lit from above like the
   badges' metal, so that the tree keeps the game's old-metal look without turning everything bronze
   or plastic.
8. As a player, I want no held node to look amber or ally-green, so that colour keeps meaning what
   it means elsewhere in the game.
9. As a player, I want a held kicker to look the same at every rank, with its edge telling max, so
   that the tree stays calm.
10. As a player on a small screen, I want each colour to read at render scale 1, so that I can tell
    them apart without zooming.
11. As a player in a browser that cannot draw the knockout textures, I want the line pictures and
    the glow coloured the same, so that nothing is lost.
12. As a player, I want hovering a node to keep its ring and leave its picture alone, so that hover
    never looks like a state.
13. As the owner, I want a page with every class's nodes in all three states at scale 1 and 2, so
    that I can judge the colours where they will be seen.
14. As the owner, I want to try a different colour for one hue on that page, so that I can retune
    it without a round trip.
15. As a developer, I want every hue to be a named palette token, so that the fence keeps raw hex
    out and a retune is one edit.
16. As a developer, I want the corner row, the ability bar and every other HUD icon untouched, so
    that the exception stays the tree's alone.

### Acceptance Criteria

Inks
- [ ] A held and a max node draw their picture in their hue's lit ink: the hue mixed toward
      `BRONZE`'s tint by `TREE_BRONZE_MIX`, alpha 1, through the top-lit gradient with the lit lift
      (test on the `Knockout` deps and the tints set).
- [ ] An available, spendable node at rank 0 draws in `TREE_INK`, as today. Closed, locked and
      available-without-points nodes draw `GREYED` (test, one per state).
- [ ] A locked node holding a rank (inconsistent data) draws greyed with its lock mark.
- [ ] A kicker at 1/3 and at 3/3 draws the same ink.
- [ ] No lit picture is drawn in `TREE_INK`; open pictures still are, and the constant stays.
- [ ] Hovering a node changes no picture's tint or alpha; the ring shows as today.

Hues
- [ ] Every node of every class has the hue L4's table gives it (test over the golden's ids and
      `PASSIVE_COPY`); every hue is used.
- [ ] Every `palette.treeHue` value resolves from `BARROW_HEX`; none is amber, amberBright, arcane,
      arcaneDeep or a fire-only token (test).
- [ ] The six new bases are in `BARROW`, `BARROW_HEX` and the guideline's palette table.
- [ ] `npm run lint:fence` passes: no raw hex outside `theme.ts`.

Glow
- [ ] A lit node's plate graphics draw the halo's discs in its hue, after the plate's fill and edge,
      inside the plate's edge line; an open or greyed node draws none (test on the graphics' calls).
- [ ] With the knockout unable to stand, the lit node still draws its halo, and its lines in the lit
      tint (test with a stand-in scene that makes no textures).
- [ ] Nothing in the overlay redraws per frame: the halo and pictures are drawn only on a rebuild
      (the R41 key test still holds), and no filter is added to any tree object.

Untouched
- [ ] The ability bar's icons and the corner row's Tree icon still draw `BRONZE` (test).
- [ ] Plates, links, the lock mark, rank labels and tooltips draw as before (the overlay's existing
      tests pass unchanged).

Review and check
- [ ] The Tree colours gallery family shows every class's nodes in the three states at render scale
      1 and 2, each hue named with its value, a live preview per hue. Kranti approves it (HITL).
- [ ] Browser check (HITL): in town, the tree shows open nodes near-white as today, held nodes
      coloured and glowing, a spend turning a node from near-white to its colour at once.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

### Edge States

- **A node the copy lacks** (R42): no picture, no hue, no halo; the fallback glyph as today.
- **A spend in flight:** the node keeps its old ink until the state shows the new rank (R41,
  `TreeSpend`); the spend's answer rebuilds the overlay, and the node turns from near-white to its
  hue in one redraw.
- **A refused spend:** nothing was held, so nothing lights.
- **No points left:** an open node with no point becomes greyed (as today), so the tree's near-white
  disappears and only held nodes keep colour.
- **A render-scale change** while open: the knockouts rebuild at the new scale (ADR-0080); the
  halo, on the plate graphics, is unaffected.
- **The scene cannot make textures:** lines in the state's ink and the halo on the plate (L10, L12).
- **Outside town:** viewing only (R38); the inks and glow are the same.

### Out of Scope

- Any change to an open node's ink (it stays V29's near-white).
- New pictures or any change to a picture's shape, the plates, links, lock mark, hover ring, rank
  labels or tooltips.
- A colour per rank, an animated or pulsing glow, a glow on hover, a glow on the corner row's Tree
  icon or its marker.
- The ability bar's icons, the corner row and every other HUD icon: bronze under ADR-0080.
- Any server, wire, golden or tree-rule change.
- Saving a retune from the review page: it previews only.
