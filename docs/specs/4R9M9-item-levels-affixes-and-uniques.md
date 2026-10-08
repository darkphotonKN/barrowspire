# FS-4R9M9: Item levels, affixes and uniques

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" (equipped gear contributes to character stats · item levels on dropped loot · random affixes on rolled loot · Fabled uniques), "### Enemies" → "Loot drops from slain monsters"; `game-server/items-service/SPECIFICATION.md` "## Catalogue" (item levels and level-gated bases · Fabled unique catalogue · ring item type), "## Inventory" → "Affixes and item level on owned instances"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Affixes and item level in item summaries"; `game-client/SPECIFICATION.md` "### Escape run" → "Affixes and item level in item views", "### Marketplace" → "Affixes and item level in listing detail" → this FS · **Partly supersedes** [FS-F8T3H](F8T3H-fantasy-loot-and-dev-seed.md) (R6 and R8 for the Fabled tier and the tier stat multipliers, R9's per-tier crit step, R10's Fabled name form; F8T3H is not edited) · Depends on: [FS-77AB6](77AB6-monsters-and-combat.md) (kill record §R28–31, CombatSystem), [FS-BDA7X](BDA7X-character-leveling.md) (character level; required-level enforcement §R30–34, issue I-BDA7X-8), [FS-F6F88](F6F88-multi-floor-delves.md) (floor depth, floor entities cleared by exclusion) · Related ADRs: [ADR-0001](../adr/0001-contract-layer.md) (contract is generated), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code, not sourced) · Vocabulary: [`items-service/CONTEXT.md`](../../game-server/items-service/CONTEXT.md), [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*item level*, *area level*, *base tier*, *affix*, *affix tier*, *unique*, *unique effect*, *drop pile*, *gear bonus* pending via `domain-model`; *rarity tier*'s definition changes: it now decides affix count, not stat scale)

> **Decision provenance.** The thread is the two "Scoping notes (raw)" passes (2026-10-08 and
> 2026-10-09; the second overrides the first where they differ), folded into this body. Items the
> notes left open were delegated and are marked **(OD)** — *orchestrator default, user may
> revise*. Everything unmarked was settled with the user.

## Summary

Loot gets an item level and random affixes, and the rarest drops become handcrafted uniques with
one gameplay-changing effect. An item's level is the level of the monster that dropped it (or the
floor's level, for a chest); a higher item level unlocks stronger bases and stronger affix tiers
and raises the odds of a rare drop, but never inflates numbers on its own. Rarity now mostly
means *more affixes*: Normal 0, Uncommon 1, Rare 2, Runed 3–4. Fabled means one of six
handcrafted uniques. Monsters drop loot where they die — rarely, more often for elites, always
for the demon. What a delver wears finally counts: attributes, health, speed, crit and the rest
flow into combat. Item level, affixes and the item's required level live on the owned instance
and show in the run, the loadout and the marketplace.

**Balance direction (user, explicit).** No loot explosion: death loses everything, so drops stay
conservative. Stats must grow slowly (a Diablo II classic feel, not a modern number race): ilvl
gates *which* tiers can roll, tiers are narrow bands of small integers, and gear power from level
1 to 20 grows about 1.6×. Required level follows the D2 rule, so a high-ilvl item that happened
to roll low-tier affixes can be worn early, which gives it trading value.

**Lane.** Backend is the human lane by default (root CLAUDE.md). This FS is sliced into
agent-sized issues at the orchestrator's request; the human may take any backend slice by hand.

### Decision record

Settled by the user (scoping passes 1 and 2):
- **Fabled = handcrafted uniques only.** Runed is the top random tier. Six uniques in v1 (R31).
- **Item level = level of the monster that dropped it.** Higher ilvl = larger pool and better odds.
- **Random affixes** drawn from character-facing stats; **one affix collection per instance**
  (`item_level` column + `affixes` JSONB list on `item_instances`, proto `repeated` affix), never
  a column per stat.
- **Affixes and ilvl persist** on the owned instance and show in run views and the marketplace.
- **Rings are a new item type** filling the two existing loadout ring slots, with no base defense:
  a pure affix carrier and a home for uniques. Amulets are not in v1.
- **Existing random Fabled instances are relabelled Runed** by migration, stats untouched.
- **Flat curve:** base tiers I / II / III unlock at ilvl 1 / 8 / 15, about +25% per step; affix
  tiers are narrow integer bands unlocking at ilvl 1 / 8 / 15 with required levels 1 / 6 / 13.
- **Affix count:** Normal 0 · Uncommon 1 · Rare 2 · Runed 3–4.
- **Rarity multipliers flattened** to ×1.00 / 1.05 / 1.10 / 1.15 (Normal → Runed).
- **Required level (D2 rule):** max(base tier requirement, highest rolled affix tier requirement).
- **Rarity weights:** Normal 1.00 / Uncommon 0.40 / Rare 0.15 / Runed 0.05 / Fabled 0.005;
  Rare-and-above × (1 + ilvl / 40); elite drops: weights above Normal ×2; demon ×4 and never Normal.
- **Drop chances per kill:** fodder ~8%, brute ~15%, elite ~50%, demon guaranteed 2–3.
- **Chests: rates and counts unchanged**; chest items take the floor's level as ilvl and roll
  through the same rules.
- **All balance numbers live in one place** (tuning tables), retunable without logic changes.
  Monster level curve and class growth stay as built; a joint balance pass is flagged.
- **Not in scope:** crafting / reroll / upgrade (parked); loot-explosion rates.

Orchestrator defaults **(OD)** — the user may revise:
- The exact tier II / III base names and stats (R5), ring bases (R6), the affix tier table and
  which slots each affix rolls on (R16–R17), unique base stats, fixed affix ranges, required
  levels and effect numbers (R31–R38), monster-drop type split (R44), drop piles (R46).
- **Vitality is not an affix** in v1: it changes nothing in combat today (FS-77AB6), so an affix
  on it would be dead weight. Ring of the Last King still raises it, harmlessly.
- Consumables keep F8T3H's behaviour with the flattened multiplier; never affixes, never Fabled.
- Rings never roll Normal (a Normal ring would carry nothing).
- Chests never drop rings; rings come from monsters (keeps "chests: don't touch").
- A Fabled roll ignores the drop's rolled type and picks among all eligible uniques.
- Gear bonuses are recomputed every tick from what is worn (no equip-time bookkeeping).
- Unique effects hook in at: a kill consumer (on-kill effects), the CombatSystem (reflect,
  burning trail), the ProjectileSystem (pierce), the gear computation (per-floor attributes).
- The catalogue additions are created by the dev seed script, as F8T3H's bases are.

## Requirements

### Catalogue (items-service)

1. **Base tiers.** Every equippable base belongs to one base tier, I / II / III. A template gains
   `min_item_level` (the lowest item level it can drop at; default 1) alongside its existing
   `required_level`. Tier I: min ilvl 1, required level 1 · tier II: min ilvl 8, required level
   6 · tier III: min ilvl 15, required level 13. The 24 F8T3H bases are tier I.
2. Each weapon archetype and each armor archetype gains a tier II and a tier III base, about +25%
   per step on its base stats, so its type flavour (Seax crit, Bone warding, Plate defense) is
   kept. Crit rate does not grow with tier.
3. **Weapons (OD)** — attack_power per tier, critical_rate unchanged from tier I:

   | Tier I | Tier II | Tier III | attack I / II / III | crit |
   |---|---|---|---|---|
   | Longsword | Bastard Sword | Blackiron Sword | 6 / 8 / 9 | 0.08 |
   | Seax | Langseax | Grave Seax | 3 / 4 / 5 | 0.15 |
   | Flanged Mace | Morning Star | Blackiron Mace | 9 / 11 / 14 | 0.02 |
   | Boar Spear | Winged Spear | Partisan | 5 / 6 / 8 | 0.06 |
   | Bearded Axe | Broad Axe | Dane Axe | 7 / 9 / 11 | 0.05 |
   | Iron Cestus | Spiked Cestus | Blackiron Cestus | 4 / 5 / 6 | 0.10 |

4. **Armor (OD)** — `defense_rating / magic_resistance` per slot; tier II and III keep the slot
   nouns of tier I with a new material word:

   | Material I → II → III | head | chest | legs | gloves |
   |---|---|---|---|---|
   | Leather → Hardened Leather → Studded Leather | 2/1 → 3/1 → 3/2 | 4/1 → 5/2 → 6/2 | 3/1 → 4/1 → 5/2 | 1/1 → 2/1 → 2/2 |
   | Bone → Carved Bone → Wight-bone | 1/3 → 1/4 → 2/5 | 3/5 → 4/6 → 5/8 | 2/4 → 3/5 → 3/6 | 1/2 → 1/3 → 2/3 |
   | Ringmail → Chainmail → Scale | 3/1 → 4/1 → 5/2 | 6/2 → 8/2 → 9/3 | 4/1 → 5/1 → 6/2 | 2/1 → 3/1 → 3/2 |
   | Plate → Banded → Blackiron | 5/0 → 6/0 → 8/0 | 8/1 → 10/1 → 13/1 | 6/0 → 8/0 → 9/0 | 3/0 → 4/0 → 5/0 |

   Names follow the tier I pattern, e.g. "Hardened Leather Jerkin", "Wight-bone Helm",
   "Chainmail Tunic", "Banded Greaves". Every new base has a one-line description in the F8T3H R4
   register.
5. **Rings** are a fourth item type, `ring`, alongside weapon, armor and consumable. A ring has no
   base stats: its power is its affixes. **(OD)** There is one ring base per tier, differing only
   in name and min ilvl (Iron Band 1, Silver Band 8, Barrow-gold Band 15); every ring base has
   required level 1, because a ring base adds no power to gate. Rings use the loadout's existing
   `ring_1` / `ring_2` slots. Wherever the items-service constrains `item_type`, it admits `ring`.
6. **Unique catalogue.** A unique is its own template at the `fabled` rarity (its name, its
   description as lore, its base stats, its required level and min ilvl) **plus** a unique row
   keyed by that template: the effect code, the one-line effect text shown to players, and its
   fixed affixes as stat ranges. Effect codes are a closed set (R31). Unique templates are never
   part of the base pool (R12).
7. **Fabled weight and relabel.** One items-service migration: widens
   `item_rarities.drop_rate_multiplier` so it can hold 0.005, sets Fabled's to **0.005** (others
   unchanged: 1.00 / 0.40 / 0.15 / 0.05), and relabels every existing `fabled` instance as
   `runed`, stats and names untouched. The header says the relabel is not reversible: the down
   migration restores the column and the 0.01 weight but leaves relabelled instances Runed.
8. The template listing game-service loads at session start (`ListItemTemplates`) carries, per
   template, `min_item_level`, `required_level`, rings, and, for a unique, its unique row (effect
   code, effect text, fixed affix ranges).
9. Admin creation of rings and uniques over HTTP is not added **(OD)**: the dev seed script
   creates them (R60).

### Item level

10. Every rolled item has an **item level** (ilvl, ≥ 1), fixed at the roll and never changed:
    - a **monster drop** takes the slain monster's level (kill record `Level`);
    - a **chest** item takes the floor's **area level**: the highest level among the run's
      delvers + 2 × (floor − 1), the same base FS-77AB6 levels the floor's monsters from, without
      the ±1 spread, measured when the chest is first opened **(OD)**.
11. Item level only *gates* things — which bases (R12) and which affix tiers (R16) can roll —
    and improves rarity odds (R21). It is not a stat multiplier: there is no level scaling of base
    numbers.

### The loot roll (game-service)

12. **Base pick.** A drop of a given type picks uniformly among that type's non-unique templates
    whose `min_item_level` ≤ ilvl. Higher ilvl therefore widens the pool without removing the
    lower tiers.
13. **Base stats.** Integer stats (`attack_power`, `defense_rating`, `magic_resistance`,
    `healing_amount`) roll `round(base × uniform(0.8, 1.2) × rarity multiplier)`, floored at 0, a
    base of 0 staying 0; the rarity multiplier is Normal ×1.00, Uncommon ×1.05, Rare ×1.10, Runed
    ×1.15. `critical_rate` rolls `base ± 0.02`, clamped to [0, 0.50], two decimals, **with no
    per-tier step**. Everything else is copied, as in F8T3H R9.
14. **Names** keep F8T3H R10's forms and word lists for Normal → Runed (Runed takes the grand
    suffix). Rings use the armor prefix list. A unique keeps its authored name.
15. Consumables keep F8T3H's roll with the flattened multipliers. They record an ilvl, never take
    affixes, never roll Fabled (its weight is left out for them), and have required level 1.

### Affixes

16. An **affix** is `{stat, tier, value}`: one stat code from the affix table, the tier it rolled
    at, and an integer value drawn uniformly from that tier's band (inclusive). An affix tier can
    roll only when ilvl ≥ its unlock level. When several tiers are unlocked, **each affix picks its
    tier uniformly among the unlocked tiers (OD)** — so high-ilvl items still often carry low
    tiers.
17. **Affix table (OD)** — integer values; `%` affixes are whole percent, crit is percentage
    points:

    | Stat code | Means | Tier I (ilvl 1, req 1) | Tier II (ilvl 8, req 6) | Tier III (ilvl 15, req 13) | Rolls on |
    |---|---|---|---|---|---|
    | `strength` | + Strength | 1–2 | 3–4 | 5–6 | weapon, armor, ring |
    | `agility` | + Agility | 1–2 | 3–4 | 5–6 | weapon, armor, ring |
    | `intelligence` | + Intelligence | 1–2 | 3–4 | 5–6 | weapon, armor, ring |
    | `max_health` | + maximum health | 4–7 | 8–12 | 13–18 | armor, ring |
    | `max_mana` | + maximum mana | 4–7 | 8–12 | 13–18 | armor, ring |
    | `attack_speed` | + % attack speed | 2–3 | 4–5 | 6–7 | weapon, gloves, ring |
    | `move_speed` | + % movement speed | 2–3 | 4–5 | 6–7 | legs, ring |
    | `crit_chance` | + % critical chance | 1 | 2 | 3 | weapon, head, gloves, ring |
    | `flat_damage` | + damage | 1 | 2 | 3 | weapon, gloves, ring |
    | `defense` | + defense | 1–2 | 3–4 | 5–6 | armor, ring |
    | `magic_resistance` | + magic resistance | 1–2 | 3–4 | 5–6 | armor, ring |

18. **Affix count by rarity:** Normal 0 · Uncommon 1 · Rare 2 · Runed 3 or 4 (even odds). Affix
    stats on one item are **distinct**, drawn uniformly from the stats that can roll on that item's
    type/slot. A count larger than the eligible pool takes the whole pool.
19. A unique's fixed affixes are stored the same way with **tier 0** ("fixed"), values rolled
    within the unique's ranges (R31).
20. An item's affixes are rolled once and never re-rolled: a loadout item carried into a run and
    extracted again keeps exactly what it had (as F8T3H).

### Rarity roll

21. Each drop rolls one rarity, weighted from `item_rarities.drop_rate_multiplier` (base weights
    R7), adjusted in this order:
    1. Rare, Runed and Fabled weights × (1 + ilvl / 40);
    2. an **elite** drop multiplies every weight above Normal × 2;
    3. a **demon** drop multiplies every weight above Normal × 4 and sets Normal's to 0;
    4. a consumable drop leaves Fabled out (R15); a **ring** that rolls Normal becomes Uncommon
       **(OD)**.

    At ilvl 1 from a standard source that is ≈ Normal 62 / Uncommon 25 / Rare 9 / Runed 3 /
    Fabled 0.3 %. **Balance flag:** with these weights and R44 / R47's volumes, a full three-floor
    run at max level yields roughly one unique per 15–25 runs, more often than the scoping
    estimate of one per 60–80. The 0.005 weight is the user's; it is kept, and the rate is flagged
    for the joint balance pass (≈ 0.0015 would match the estimate).
22. A Fabled roll becomes a **unique** (R30). If rarities fail to load or come back empty, F8T3H
    R5's fallback stands: no rarity, unscaled base stats, no affixes; the item still records its ilvl.

### Required level

23. **Required level (D2 rule):** max(the base template's `required_level`, the highest required
    level among its rolled affix tiers: 1 / 6 / 13). A unique's required level is its template's
    (R31). A consumable's is 1.
24. The rolled item carries its derived required level from the roll onward: in the run (equip
    gate, FS-BDA7X R32 reads it unchanged), on the extraction event, and on the stored instance.
    FS-BDA7X R34 anticipated exactly this change of source.

### Uniques

25. Fabled is never a random tier any more: a Fabled result picks **uniformly among the uniques
    whose min ilvl ≤ the drop's ilvl**, regardless of the drop's rolled item type **(OD)**.
26. **None eligible → Runed.** The drop is rolled as a Runed item of its own type instead.
27. A unique's name and lore (template description) are fixed. Its base stats roll as a base item
    at Runed's multiplier (×1.15, R13); its fixed affixes roll within their ranges (R19).
28. A unique's rarity is `fabled`. It extracts, is stored, listed and traded like any instance.
29. A unique's effect works only **while worn** in an equipment slot, and **each effect applies
    once** however many copies are worn **(OD)**. Its fixed affixes stack like any affix.
30. The unique catalogue is data (R6); its effects are code, keyed by effect code. A unique whose
    effect code the running game-service does not know is left out of the pool with a `slog.Warn`.
31. **The six uniques of v1** (base stats are the centre of the roll; numbers **(OD)** unless
    noted; names, bases, min ilvls and effects approved by the user):

    | Unique | Type / slot | Min ilvl | Req lvl | Base stats | Fixed affixes | Effect code — effect |
    |---|---|---|---|---|---|---|
    | Wightfang | weapon, knife | 6 | 5 | attack 4, crit 0.18 | agility 2–4, attack_speed 4–6 | `kill_frenzy` — each kill grants +15% attack speed for 4 s, stacking ×3 |
    | Gravewarden's Oath | armor, chest | 8 | 7 | defense 10, MR 1 | max_health 10–16, strength 2–3 | `melee_reflect` — reflects 20% of melee damage taken to the attacker |
    | Lantern of the Drowned | ring | 10 | 9 | — | intelligence 2–4, max_mana 10–16, magic_resistance 2–3 | `pierce` — your projectiles pierce one extra target |
    | The Hollow Crown | armor, head | 12 | 10 | defense 2, MR 5 | max_health 12–18, defense 2–3 | `kill_heal` — kills restore 4% of max health |
    | Ashwalk Greaves | armor, legs | 14 | 12 | defense 4, MR 2 | move_speed 6–8, agility 3–4 | `burning_dash` — dash leaves a burning trail that damages monsters |
    | Ring of the Last King | ring | 18 | 16 | — | strength 1–2, agility 1–2, intelligence 1–2, crit_chance 1–2 | `floor_attributes` — +1 to all attributes per floor climbed this run |

    Each has a one-line lore description in the F8T3H R4 register.

### Unique effects

32. **`kill_frenzy`.** A kill credited to the wearer (kill record `KillerMemberID`) while the
    wearer is alive and in play adds one stack, up to 3; each stack is +15% attack speed (R40); all
    stacks expire together 4 s after the latest kill.
33. **`kill_heal`.** A kill credited to the wearer, alive and in play, restores
    `max(1, round(4% × max health))`, never above max.
34. **`melee_reflect`.** When a monster's strike damages the wearer, the attacking monster takes
    `max(1, round(20% × the damage dealt))` as a hit from the wearer: unmitigated, never a crit,
    resolved by the CombatSystem. A reflected killing blow is a kill credited to the wearer (so it
    makes a kill record, drops and experience). Reflect never triggers reflect. All monster attacks
    are melee in v1 (FS-77AB6).
35. **`pierce`.** Each projectile the wearer fires (arrow, fireball and their triple forms) can hit
    **one more distinct** valid target after its first; it never hits the same target twice, and it
    still stops at walls and closed doors. This is the "no pierce" FS-77AB6 R10 deferred here.
36. **`burning_dash`.** A dash by the wearer leaves a **burning trail** along the path dashed, for
    3 s. Every 0.5 s it hits each monster within 30 px of the path once, as a magic hit from the
    wearer: power `4 + wearer level`, coefficient 1.0, no scaling stat, no crit, mitigated by magic
    resistance; kills are credited to the wearer. Delvers are never hurt by it. A trail is a floor
    entity (cleared by a floor change, FS-F6F88) and is sent in world state so clients can draw it.
37. **`floor_attributes`.** While worn, Strength, Agility, Intelligence and Vitality are each
    raised by (current floor depth − 1).
38. Effects never fire in the HUB (no combat there) and never from a dead or out-of-play wearer.

### Gear contributes to character stats (game-service)

39. **What is worn counts.** For each delver, a **gear bonus** is the sum, over items in the weapon,
    head, chest, gloves, legs, ring 1 and ring 2 slots (never the consumable slots), of their
    affixes, plus active unique effects (R32, R37). It is recomputed **every tick** from what is
    worn **(OD)**, so equip, unequip, a level-up and a floor climb take effect on the next tick.
40. It enters play as follows (the CombatSystem's formulas, FS-77AB6, are otherwise unchanged):
    - **Strength / Agility / Intelligence / Vitality:** added to the character's own attributes
      wherever attributes are read (the attack's scaling stat). The character's own attributes,
      which level-ups grow (FS-BDA7X), are not rewritten.
    - **Flat damage:** added to the attack's power, next to the weapon's `attack_power`.
    - **Crit chance:** added, in points, to the crit chance from the weapon (cap 50% unchanged).
    - **Attack speed:** every attack cooldown is divided by (1 + total% / 100), total capped at
      **+50%** (affixes plus `kill_frenzy`) **(OD)**.
    - **Move speed:** the delver's movement speed is the default × (1 + total% / 100), total
      capped at **+30%** **(OD)**.
    - **Defense / magic resistance:** added to mitigation, next to the armor's base ratings.
    - **Max health / max mana:** raise the maximum. Gaining maximum never raises current; losing
      it (unequip) lowers current to the new maximum if above it. A delver is **seated at full**
      health and mana including gear.
41. Weapon `attack_power` / `critical_rate` and armor `defense_rating` / `magic_resistance` keep
    being read directly by the CombatSystem, as today. Rings contribute only affixes.
42. **Rings are worn.** Equipping a ring puts it in the first empty ring slot (ring 1, then
    ring 2); with both full it replaces ring 1. Unequip takes a named ring out. The level gate
    (FS-BDA7X R32) applies to rings like any slot.
43. Gear applies in every world (in the HUB it only changes movement speed) **(OD)**.

### Drops from monsters (game-service)

44. **Drop table (OD for the type split).** Each kill record rolls the drop table once:

    | Source (kill record) | Chance | Items | Rarity bias (R21) | Type split weapon / armor / ring / consumable |
    |---|---|---|---|---|
    | ghoul (fodder) | 8% | 1 | — | 30 / 40 / 10 / 20 |
    | troll (brute) | 15% | 1 | — | 30 / 40 / 10 / 20 |
    | any elite | 50% | 1 | elite | 30 / 40 / 10 / 20 |
    | demon (boss) | 100% | 2 or 3 (even odds) | demon | 35 / 45 / 20 / 0 |

    A new archetype adds a row. Each item rolls at the monster's level (R10) through the loot roll.
    Expected yield of a full three-floor run with every monster killed: about 4 items from standard
    and elite monsters plus 2–3 from the demon.
45. Drops are rolled by a **kill consumer** subscribed to the run's kill records (FS-77AB6 R29),
    synchronously on the tick that made the record, without blocking. A monster with no kill record
    drops nothing. The killer's own state (dead, escaped, left) does not matter: the loot still lands.
46. **Drop piles (OD).** A kill that drops at least one item places a **drop pile** at the kill
    record's X, Y — under the corpse for its 4 s — holding the items. A drop pile behaves as an
    already-open container: delvers take items from it exactly as from an opened chest (same range,
    same pickup path). It never re-rolls. It is a floor entity: a floor change clears it and
    everything still in it (FS-F6F88). An emptied pile stays in the world; clients do not draw an
    empty one.

### Chests

47. Chest counts, rates and the 20 / 30 / 50 weapon / armor / consumable split are unchanged
    (F8T3H, F6F88). Chests never drop rings **(OD)**. Each chest item rolls at the area level
    (R10) through the same roll, so it gains ilvl, affixes, a derived required level, and can be a
    unique.

### Persistence and extraction

48. `item_instances` gains `item_level` (integer ≥ 1, default 1), `affixes` (JSONB array of
    `{stat, tier, value}`, default empty) and an instance-level `required_level` (integer ≥ 1,
    nullable). Existing rows read as ilvl 1, no affixes, and their template's required level.
49. The extraction event's item (`events.Item`) carries `item_level`, `required_level` and the
    affix list (additive; regenerated, never hand-edited). The items-service consumer stores them.
    An event without them (older producer, zero values) stores ilvl 1, no affixes, NULL required
    level — exactly today's behaviour.
50. The consumer stores well-formed affixes and **drops a malformed affix entry with a
    `slog.Warn` rather than losing the item (OD)**. Well-formed = a known stat code, tier 0–3, value
    ≥ 0.
51. Every `ItemInstance` the items-service returns (`GetLoadoutWithItems`, `ListItemInstances`)
    carries item level, affixes, required level (the instance's own, else the template's) and, for
    a unique, its effect code and effect text (from the unique row of its template).
52. `GetItemSummaries` (the public, marketplace-facing summary) carries item level, required level,
    affixes and, for a unique, its effect text. No effect code, no owner, no source.
53. Loadout items brought into a run are hydrated with their stored ilvl, affixes, required level
    and unique effect, and are extracted with them unchanged (R20).

### In-run state protocol (game-service → game-client)

54. Every item in world state (inventory, equipment slots, container and drop-pile contents) carries
    its `rarity` (code), `item_level`, `required_level`, `affixes`, `magic_resistance` (armor; missing
    today) and, for a unique, `unique_effect` (the effect text). These are game-service's typed
    message layer, not OpenAPI.
55. A container in world state carries `kind`: `chest` or `drop_pile`.
56. World state carries active burning trails (entity id, path end points, time left).

### Gateway

57. `list-item-instances` and the marketplace listing operations that embed an item summary
    (`browse-listings`, `get-listing`, `list-my-listings`) gain item level, affixes, required level
    and unique effect, per §API surface. Both surfaces are already serialized (typed), so this is an
    additive extension, not a serialize-on-touch retrofit.
58. Contract artifacts are generated: edit the typed handlers' wire types, then
    `make openapi && make client`; `openapi.yaml` and `game-client/src/api/generated/` are never
    hand-edited.

### Client

59. Every item view — satchel, loadout, container / drop-pile view, equipped slots, and the
    marketplace listing detail — shows: the name in its rarity colour, the base stats, "Item level
    N", "Requires level N" (highlighted when above the character's level; FS-BDA7X R45), one line
    per affix ("+3 Strength", "+5% attack speed", "+2% critical chance", "+2 damage", "+12 maximum
    health"…), and for a unique its effect line and lore. Fixed (tier 0) affixes read the same as
    rolled ones. Listings created before this FS show no affix lines and ilvl 1, never an error.
    Appearance follows `game-client/docs/design-guideline.md`.
60. Rings can be placed in and removed from the two ring slots of the loadout and the in-run
    equipment, and have an icon, built in code (ADR-0021's rule; no sourced art).
61. The canvas draws a drop pile (a small heap of remains, built in code) where a monster dropped
    loot, opens it with the container view, and stops drawing it once it is empty. It draws a
    burning trail while one is live.

### Dev seed

62. `game-server/scripts/seed-dev.sh` creates the full v1 catalogue — the 24 tier I bases, the 44
    tier II / III bases (R3–R4), the 3 ring bases and the 6 uniques with their unique rows — using
    the complete-* endpoints where they exist (with `required_level`) and SQL for the rest
    (`min_item_level`, rings, unique rows). Its "already seeded" check counts the new total.
63. Seeded owned instances follow the new rules: no random Fabled instance; every tier appears;
    Uncommon–Runed instances carry valid ilvls, affixes and derived required levels; at least two
    seeded instances are uniques; at least one is a ring.

### Tuning

64. Every number this FS introduces — base-tier unlocks and requirements, affix table, affix
    counts, rarity multipliers, ilvl / elite / demon weight modifiers, drop table, type splits,
    caps, unique effect numbers — lives in **one game-service tuning file**, beside
    `monster_tuning.go`. The base rarity weights stay in `item_rarities` (retuned by `UPDATE`, as
    F8T3H R13). The roll is pure with an injectable random source (F8T3H R11).

## User Stories

1. As a delver, I want items from harder monsters to come from a bigger pool, so that pushing deeper is worth it.
2. As a delver, I want a stronger tier of my favourite weapon to exist, so that I can keep my style while I grow.
3. As a delver, I want random affixes on rarer drops, so that two items of the same base are worth comparing.
4. As a delver, I want affixes that touch the stats my class uses, so that a drop can make my character better.
5. As a warrior / mage / archer, I want Strength / Intelligence / Agility on my gear to raise my damage, so that the right item matters to my class.
6. As a delver, I want gear to add health, mana, defense and magic resistance, so that I can build to survive.
7. As a delver, I want attack speed and movement speed on gear, so that items change how I play, not only my numbers.
8. As a delver, I want what I wear to count the moment I put it on, so that I can feel an upgrade mid-run.
9. As a delver, I want rings to exist for my two ring slots, so that those slots are not dead.
10. As a delver, I want monsters to sometimes drop loot where they fall, so that fighting is rewarded.
11. As a delver, I want elites to drop more often and better, so that taking them on pays.
12. As a delver, I want the demon always to drop something good, so that the boss fight is a goal.
13. As a delver, I want drops to stay rare, so that every one still feels like a find and death still costs.
14. As a delver, I want a very rare chance at a named unique, so that every run carries a jackpot.
15. As a delver, I want each unique to change how I fight, so that finding one changes my run, not just my numbers.
16. As a delver, I want to read an item's level, requirement, affixes and effect before I pick it up, so that I can decide fast.
17. As a delver, I want items above my level shown as such, so that I know what I can wear yet.
18. As a delver, I want a high-level item with weak affixes to be wearable early, so that lucky finds help me now.
19. As a delver, I want my items' affixes and level kept exactly when I extract and when I bring them back, so that what I earned stays mine.
20. As a delver, I want my old items to keep working after the update, so that nothing in my stash breaks.
21. As a trader, I want listings to show item level, requirement, affixes and unique effects, so that I can price and judge an item.
22. As a trader, I want uniques to be rare and recognisable, so that they are worth a lot of gold.
23. As a trader, I want rarity to mean more affixes, not just a colour, so that a Runed item is clearly worth more.
24. As a player who dislikes power creep, I want stats to rise slowly, so that a level-20 character still cares about a +2.
25. As a delver in a party, I want monster loot to stay on the ground for anyone to take, so that we can share it.
26. As a delver, I want loot I left on a floor to be gone when we climb, so that the choice to leave it is real.
27. As a game designer, I want every loot number in one tuning place, so that a playtest retune is an edit, not a rewrite.
28. As a game designer, I want uniques as catalogue data with effects as code, so that adding one is a data change plus one effect.
29. As a developer, I want affixes stored as one collection, so that adding a stat doesn't thread a column through eight copy points.
30. As a developer, I want the roll pure and seeded, so that I can test it deterministically.
31. As a developer, I want the dev seed to produce affixed items and uniques, so that I can test the marketplace with real-looking data.

## Acceptance Criteria

### Catalogue and storage
- [ ] Templates carry `min_item_level`; the seeded catalogue has 24 tier I, 44 tier II / III, 3 ring bases and 6 uniques with unique rows; `ListItemTemplates` returns all of them with min ilvl, required level and unique data.
- [ ] `ring` is accepted as an item type everywhere items-service constrains it.
- [ ] After migrating, Fabled's weight is 0.005 and no pre-existing instance is `fabled`.
- [ ] `item_instances` stores `item_level`, `affixes`, `required_level`; legacy rows read as ilvl 1, no affixes, template required level.
- [ ] An extraction event's item level, required level and affixes are stored; malformed affix entries are dropped with a warning and the item is still stored; an event without the fields stores today's defaults.
- [ ] `GetLoadoutWithItems`, `ListItemInstances` and `GetItemSummaries` return item level, affixes, required level and (unique) effect.

### Roll
- [ ] A seeded roll at ilvl 7 never yields a tier II base or a tier II affix; at ilvl 8 it can.
- [ ] Affix counts per rarity are 0 / 1 / 2 / 3–4; stats on one item are distinct and eligible for its type/slot; values are inside their tier band.
- [ ] Required level = max(base requirement, highest affix tier requirement); a tier III base with only tier I affixes requires 13; a tier I base with one tier II affix requires 6.
- [ ] Rarity multipliers are 1.00 / 1.05 / 1.10 / 1.15; crit has no tier step.
- [ ] Weight modifiers: ilvl factor on Rare+, elite ×2 above Normal, demon ×4 and no Normal, no Fabled on consumables, a Normal ring becomes Uncommon (table-driven tests on the weight function).
- [ ] A Fabled roll yields a unique eligible at the ilvl; with none eligible it yields a Runed item of the drop's type.
- [ ] A unique's fixed affixes are tier 0 and inside their ranges; its required level is its template's.
- [ ] Without rarities, drops keep base stats, no affixes, and still record ilvl.

### Drops
- [ ] Each kill record rolls once; ghoul 8%, troll 15%, elite 50%, demon 2–3 guaranteed, never Normal (seeded tests).
- [ ] Monster drop items have ilvl = monster level; chest items have ilvl = area level.
- [ ] A drop pile appears at the kill position holding the items; items are taken from it like from an open chest; a floor change removes it.
- [ ] Chests never drop rings; chest counts and type split are unchanged.

### Gear
- [ ] Wearing an item with +4 Strength raises a warrior's hit as if Strength were 4 higher; unequipping restores it on the next tick.
- [ ] Flat damage, crit, defense and magic resistance affixes change damage dealt / taken as R40 states.
- [ ] Attack speed shortens cooldowns (capped +50%); move speed raises movement (capped +30%).
- [ ] Max health gear raises max without healing; unequip clamps current to max; a delver seats at full health including gear.
- [ ] A ring can be equipped into ring 1 then ring 2, replaces ring 1 when both are full, and is gated by required level.

### Uniques
- [ ] Each of the six effects behaves as R32–R37 in a session test; duplicate uniques apply their effect once; effects never fire from a dead or out-of-play wearer.
- [ ] A reflected or trail kill is credited to the wearer (kill record, drop roll, experience).

### Protocol, gateway, client
- [ ] World-state items carry rarity, item level, required level, affixes, magic resistance and unique effect; containers carry `kind`; burning trails are in state.
- [ ] `list-item-instances` and the three listing operations carry the §API surface fields; `openapi.yaml` and the generated client are regenerated; `make gates`' contract gates pass (the seam gate's existing red on legacy wallet writes is not this FS's).
- [ ] Every item view shows rarity colour, item level, required level (highlighted when too high), affix lines and unique effect + lore; legacy listings show none and never error.
- [ ] Rings can be equipped from the loadout and in a run, and have a built-in-code icon.
- [ ] Drop piles and burning trails are drawn; an empty pile is not drawn.

### Seed
- [ ] `seed-dev.sh` on a fresh DB creates the full catalogue and instances obeying R63, and refuses to duplicate on re-run.

## Edge States

- **No eligible unique at a Fabled roll:** Runed item of the drop's type (R26). Unique catalogue
  empty or unknown effect code: same, with a warning (R30).
- **No template of a type at the ilvl / catalogue missing rings:** that item is skipped with a
  `slog.Warn` and the other items still drop (F8T3H R15's rule). Tier I always unlocks at ilvl 1,
  so only a missing type triggers this.
- **Rarities fail to load:** F8T3H R5 fallback; ilvl still recorded; no affixes (R22).
- **Kill on the same tick as a floor change request:** the floor change waits for the loop between
  ticks (FS-F6F88), so the pile is placed and then cleared with the floor. Acceptable loss.
- **Two delvers take the same pile item:** the existing pickup path's lock decides; one gets it.
- **A pile under a corpse:** both are drawn; the corpse disappears after 4 s, the pile stays.
- **Killer dead, escaped or left before the drop:** the loot still lands (R45).
- **Drop on the top floor / at run end:** unextracted piles are lost with the run, like the chest.
- **Unequip lowers max health below current:** current becomes the new maximum.
- **Unequip during a frenzy:** stacks stay on the delver but give nothing until a Wightfang is worn
  again, and expire on their timer.
- **Two Rings of the Last King / two Lanterns:** effect once; their affixes both count.
- **Level-up while wearing gear:** gear bonus is unaffected; attributes grow underneath it.
- **Over-level unique picked up:** carried and extractable; equip refused until the level is
  reached (FS-BDA7X R32).
- **Legacy instances and old events:** ilvl 1, no affixes, template required level (R48–49).
- **Relabelled ex-Fabled instances:** Runed, no affixes, ilvl 1; they keep their old names.
- **Marketplace listing of an instance created before this FS:** affixes empty, ilvl 1; never an error.
- **Malformed affix from a producer:** entry dropped with a warning; the item is kept (R50).
- **Pierce at a wall:** stops, as any projectile. **Pierce through an invalid target:** passes as
  today and does not spend the pierce.
- **Burning trail on a floor change:** cleared with the floor. **Trail in the HUB:** impossible
  (no combat, R38).
- **Reflect against a monster already at 0:** nothing (CanHit refuses dead targets).

## API surface

**Conventions.** Both surfaces are typed already. The item-instance wire is **snake_case** like
the rest of `list-item-instances`; the listing wire is **camelCase** like the rest of the listing
resource. All changes are additive response fields plus a widened documented value set
(`item_type` / `itemType` may be `ring`). No request changes; no new errors.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `list-item-instances` **(changed, additive)** | GET `/api/items/instances` | unchanged | — | unchanged envelope; each `ItemInstance` gains `item_level`, `affixes`, `unique_effect?`; `required_level` now the instance's derived requirement (template's for legacy rows); `item_type` may be `ring` | unchanged |
| `browse-listings` **(changed, additive)** | GET `/api/marketplace/listings` | unchanged | — | unchanged page; each embedded `ItemSummary` gains `itemLevel`, `requiredLevel`, `affixes`, `uniqueEffect?`; `itemType` may be `ring` | unchanged |
| `get-listing` **(changed, additive)** | GET `/api/marketplace/listings/{listing_id}` | unchanged | — | as `browse-listings` for its `ItemSummary` | unchanged |
| `list-my-listings` **(changed, additive)** | GET `/api/marketplace/listings/mine` | unchanged | — | as `browse-listings` for its `ItemSummary` | unchanged |

**New fields on `ItemInstance` (snake_case):**

| Field | Type | Notes |
|---|---|---|
| `item_level` | int32 ≥ 1 | always present |
| `affixes` | `Affix[]` | always present, may be empty |
| `unique_effect?` | string | the unique's effect text; absent unless the item is a unique |

**New fields on `ItemSummary` (camelCase):**

| Field | Type | Notes |
|---|---|---|
| `itemLevel` | int32 ≥ 1 | always present |
| `requiredLevel` | int32 ≥ 1 | always present |
| `affixes` | `Affix[]` | always present, may be empty |
| `uniqueEffect?` | string | absent unless the item is a unique |

**`Affix` (new, shared shape; same field names on both wires):**

| Field | Type | Notes |
|---|---|---|
| `stat` | string | one of the R17 stat codes |
| `tier` | int32, 0..3 | 0 = a unique's fixed affix |
| `value` | int32 ≥ 0 | whole units; `%` for attack/move speed, percentage points for crit |

## Out of Scope

- **Crafting, rerolling, upgrading, socketing** — parked (scoping pass 1).
- **Amulets**, any slot beyond the existing loadout slots.
- **Vitality doing anything** in combat, and so a Vitality affix (OD; joint balance pass).
- **Affix search / filtering in the marketplace** (a GIN index on `affixes` comes with it).
- **Admin HTTP endpoints for creating rings and uniques** (seeded, R9).
- **Loadout-save validation of slot vs item type** in items-service (unchanged behaviour).
- **Rebalancing monster levels or class growth** — flagged for a joint balance pass with this FS's
  numbers, not changed here.
- **Forfeit-on-death / gear escrow** — parked to its own thread; the conservative drop rates assume
  it lands.
- **Client rarity colours vs server `color_hex`** reconciliation (design-guideline's job).
- **Character sheet** showing effective (gear-included) attributes.
- **The marketplace's `ItemReserved` payload** — unchanged; the gateway reads live summaries.
- **CONTEXT.md entries** for the new terms — routed to `domain-model`.
