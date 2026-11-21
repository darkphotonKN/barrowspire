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
