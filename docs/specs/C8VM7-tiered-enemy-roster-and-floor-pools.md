# FS-C8VM7: Tiered enemy roster and floor pools

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Enemies" (monster families with level-tiered variants · monster special abilities · Spire floor enemy pools by level tier · champion bosses), `game-client/SPECIFICATION.md` "### Presentation" (monster ability effects · enemy art loaded per floor pool · champion boss look) → this FS · Also the change FS for: [FS-77AB6](77AB6-monsters-and-combat.md) (Spire mix, top-floor boss), [FS-KE075](KE075-floor-1-dungeon.md) (hall packs from the pool), [FS-B4SG9](B4SG9-ranged-monsters-and-the-bone-archer.md) (archer slots go to the pool's ranged member); each carries `## Change: Tiered enemy roster and floor pools → FS-C8VM7` · Sibling (same scoping session, 2026-11-14): [FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) (Vorsk, the tome and the altar) · Builds on: [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (height, the Spire's own dead, Daa'gon), [FS-VHGE7](VHGE7-blood-demon-and-demon-fire-claw.md) (the blood demon, on-demand art), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) §A (the roster pipeline), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md) (scene art table, eviction), [FS-BDA7X](BDA7X-character-leveling.md) (kill experience), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (drops) · Related ADRs: [ADR-0081](../adr/0081-a-spire-variants-art-is-its-own-on-demand-group-scoped-to-the-floor-whose-pool-names-it.md) (variant art is floor-scoped, recorded with this FS), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (on-demand groups), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (eviction), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (the floor map), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) (dungeon population by room and role), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from tokens only)

> Promoted `--from-thread` on 2026-11-14 from the scoping notes of the owner's 2026-11-14
> scope-it session. The owner approved the whole charter up front ("lock it") and asked for the
> whole thing to be built ("split develop the whole thing"). There was no interview and nothing
> was asked of anyone. The decisions were not challenged (no `challenge-me` pass).
>
> **Markers.** Unmarked decisions are the owner's. **(approved default)** is a starting value
> the owner approved at lock. **(charter default: …)** is a question the notes left open,
> answered here with the smaller v1, with its reason; each is listed in §Open questions so the
> owner can revise it. Every number is a *starting value*, expected to move in play.

## Summary

Every Spire floor meets the same three fodder, the troll and the Bone Archer. This makes the
Spire grow with monster level: eight **families** (five old, three new: goblins, ogres, dark
warriors) carry 25 named **variants**, each unlocked at a **tier** of monster level, and each
step up a family is stronger on health, speed, damage and armour. The top variant of an old
family gains one simple **ability**; every variant of a new family has its family's one ability.

Each Spire floor draws a **pool** of five variants from everything its tier has unlocked, and
its monsters come only from that pool, so two floors of the same run play differently and the
deep endgame holds the most variety. The top floor of a height 3-9 run no longer holds the Green
Demon: its boss is a **champion**, a variant left out of the pool, scaled to boss size and
strength and named from a lore list. Because abilities make floors harder, floors hold fewer
monsters (30-45, down from 45-70). On the client, abilities are telegraphed and drawn, champions
read as bosses, and each floor fetches only its own pool's art.

## Bounds

- **May change:** game-service `internal/game`, `internal/systems`, `internal/components`,
  `internal/serializer`, `internal/types`; game-client; `game-client/tools/bake` and the baked art
  under `game-client/public/art`.
- **May not change:** `internal/matchmaker`, `internal/match_queue`; proto, api-gateway,
  OpenAPI, the generated client; any database or migration; any other microservice; kill or
  match statistics (stats-service and what feeds it); the existing text of any FS.
- **The WebSocket state is not the HTTP contract** (ADR-0004). This FS adds new values of
  existing string fields (`archetype`, `action`, `projectile_type`), one optional object on a
  monster's state (`ability`, §B R17) and one optional list on the floor map (`enemy_pool`,
  §G R40). Each is mirrored by hand in `game-client/src/types/gameState.ts`.
- Field worlds (Gentle Meadows, the Forlorn Forest) are untouched: no variant, pool or champion
  ever appears in a field. Their level bands and elites are FS-X2F2H's and FS-3QHQZ's changes.
- The Green Demon's random roll, its rename to Vorsk, the tome and the altar, and every Fabled
  rule are FS-3103M's. This FS only takes the top-floor place from the demon (§D).

## Requirements

### §A. Families, variants and tiers (game-service)

1. **A tier is a monster-level bucket.** Six tiers: **1** = levels 1-5, **2** = 6-10, **3** =
   11-15, **4** = 16-20, **5** = 21-25 (endgame), **6** = 26 and above (deep endgame, open-ended).
   A floor's tier is read from the floor's **base level**: party level + `MonsterLevelPerFloor` ×
   (floor − 1), with no spread (the party level is FS-K2HKP R18's, expected members included).
   Each monster keeps its own ± `MonsterLevelSpread` for its level; a monster's spread may put it
   one level past its floor's tier boundary, and that is accepted.
2. **A family** groups variants that share a body (rig), a **role** and, for the new families, an
   ability. Roles are **fodder**, **brute** or **ranged**. **A variant** is a named step in a
   family with its own stat sheet and an **unlock tier**. **Tiers only add:** a floor at tier T
   may draw every variant whose unlock tier is ≤ T; nothing unlocked earlier is ever removed.
3. **The roster** (8 families, 25 variants), with each variant's archetype id (its wire
   `archetype` and sheet key) and unlock tier:

   | Family | Role | Step 0 | Step 1 | Step 2 | Step 3 |
   |---|---|---|---|---|---|
   | Ghoul | fodder | Ghoul `ghoul` (1) | Ghast `ghast` (3) | Ravener `ravener` (6) | |
   | Skeleton | ranged | Bone Archer `bone_archer` (1) | Ashen Archer `ashen_archer` (4) | Wight Archer `wight_archer` (6) | |
   | Troll | brute | Troll `troll` (1) | Cave Troll `cave_troll` (3) | Blood Troll `blood_troll` (6) | |
   | Thrall | fodder | Barrow Thrall `barrow_thrall` (1) | Plague Thrall `plague_thrall` (4) | Blightborn `blightborn` (6) | |
   | Ghost | fodder | Spire Wraith `spire_wraith` (1) | Shade `shade` (2) | Phantom `phantom` (4) | Banshee `banshee` (6) |
   | Goblin | fodder | Goblin `goblin` (2) | Goblin Cutthroat `goblin_cutthroat` (3) | Goblin Reaver `goblin_reaver` (5) | Goblin Warchief `goblin_warchief` (6) |
   | Ogre | brute | Ogre `ogre` (4) | Ogre Mauler `ogre_mauler` (5) | Ogre Tyrant `ogre_tyrant` (6) | |
   | Dark Warrior | brute | Dark Warrior `dark_warrior` (6) | Dark Reaper `dark_reaper` (6) | | |

   The five tier-1 variants are today's archetypes, unchanged in name, id and sheet. Forest
   Zombie, Ghost and Boar stay field-only; in the Spire the thrall and ghost families start from
   the Barrow Thrall and the Spire Wraith (FS-M8CSE). **(charter default: archetype ids are the
   variant names in snake case, as `bone_archer` was, so the wire and the sheet keys need no new
   field.)**
4. **No name collides with an elite prefix.** No variant name and no champion name or epithet
   (§D R26) contains a word of `ElitePrefixes` ("Dread", "Grave-sworn", "Hollow",
   "Barrow-cursed"), so an elite reads "Hollow Banshee", never "Dread Dread …". A test holds it.
5. **Each step up a family is better on all four**: health, move speed, damage and defence. The
   step rule, applied to the family's step-0 sheet at level 1, for step k: HP × 1.2^k, damage ×
   1.15^k, defence × 1.25^k and magic resistance × 1.25^k, each rounded half up, with defence at
   least the step below's + 1; move speed + 8k px/s. Timings (attack interval, wind-up), attack
   range, aggro and leash radii, and a ranged family's shot are the family's step-0 values.
   **(charter default: one multiplicative rule per stat, so a family is retuned by its step-0
   sheet and every variant follows; the resulting table is R6.)**
6. **Variant sheets at level 1** (from R5; the level curve, FS-77AB6 R20, then scales HP, damage
   and mitigation as for every monster):

   | Variant | HP | Dmg | Def | MR | Speed |
   |---|---|---|---|---|---|
   | Ghoul / Ghast / Ravener | 40 / 48 / 58 | 6 / 7 / 8 | 2 / 3 / 4 | 0 / 0 / 0 | 150 / 158 / 166 |
   | Bone Archer / Ashen Archer / Wight Archer | 30 / 36 / 43 | 7 / 8 / 9 | 2 / 3 / 4 | 0 / 0 / 0 | 130 / 138 / 146 |
   | Troll / Cave Troll / Blood Troll | 140 / 168 / 202 | 16 / 18 / 21 | 10 / 13 / 16 | 4 / 5 / 6 | 90 / 98 / 106 |
   | Barrow Thrall / Plague Thrall / Blightborn | 70 / 84 / 101 | 9 / 10 / 12 | 5 / 6 / 8 | 1 / 1 / 2 | 100 / 108 / 116 |
   | Spire Wraith / Shade / Phantom / Banshee | 30 / 36 / 43 / 52 | 8 / 9 / 11 / 12 | 0 / 1 / 2 / 3 | 8 / 10 / 13 / 16 | 175 / 183 / 191 / 199 |
   | Goblin / Cutthroat / Reaver / Warchief | 32 / 38 / 46 / 55 | 8 / 9 / 11 / 12 | 1 / 2 / 3 / 4 | 0 / 0 / 0 / 0 | 160 / 168 / 176 / 184 |
   | Ogre / Mauler / Tyrant | 200 / 240 / 288 | 24 / 28 / 32 | 12 / 15 / 19 | 4 / 5 / 6 | 75 / 83 / 91 |
   | Dark Warrior / Dark Reaper | 260 / 312 | 30 / 35 | 16 / 20 | 10 / 13 | 120 / 128 |

   Every speed stays below a delver's 200 px/s.
7. **The new families' step-0 sheets** (the timings and radii R5 carries up the family):

   | Family | Interval | Wind-up | Range | Aggro | Leash | Source |
   |---|---|---|---|---|---|---|
   | Goblin | 1.0 s | 0.3 s | 45 px | 280 px | 540 px | charter default: the ghoul's reach, quicker and keener; low HP and defence, medium damage (8 against the ghoul's 6), per the notes |
   | Ogre | 2.4 s | 0.9 s | 70 px | 220 px | 480 px | charter default: slower and harder-hitting than the troll (2.0 s, 0.7 s, 60 px), per the notes |
   | Dark Warrior | 1.6 s | 0.6 s | 70 px | 320 px | 600 px | charter default: a disciplined greatsword, the demons' rhythm, a brute's reach |

8. **Goblin looks.** A goblin variant has two looks, **blade** and **blade + shield**, each its
   own archetype id: `goblin` / `goblin_shield`, `goblin_cutthroat` / `goblin_cutthroat_shield`,
   `goblin_reaver` / `goblin_reaver_shield`, `goblin_warchief` / `goblin_warchief_shield`. Each
   goblin spawned of a variant rolls its look, shield at `GoblinShieldShare` = 0.5. A shield look
   has the blade look's sheet with defence + `GoblinShieldDefense` = 3; its name, experience and
   drops are the variant's. The pool counts the variant once, whichever looks spawn. **(charter
   default: two archetypes per variant, so the client keys its look on `archetype` as today and
   no wire field is added; 50 % and +3 so the shield is common and felt.)**
9. **Where it lives.** The roster (families, roles, variants, unlock tiers, looks), every sheet,
   and every number in this FS are in `monster_tuning.go` with the other sheets (FS-77AB6 R25);
   the types and the functions that read them are in their own file (`monster_roster.go`). Which
   variant belongs to which family, has which role, or carries which ability is this data, never
   a check on an archetype.

### §B. Monster abilities (game-service)

10. **An ability is sheet data.** A sheet may carry one **ability**: its kind, its **shape**, the
    distances at which it is used, its wind-up, its cooldown, its damage multiplier over the
    monster's level damage, and its shape's numbers. Which archetypes have one is this data
    (R9), as the shot and the claw are (FS-B4SG9 §A R1, FS-VHGE7 §B R15). The ability is copied
    to the monster at spawn with its timings.
11. **Who has one.** In the five old families only the step-2 or step-3 (tier-6) variant has
    an ability, one each. Every variant of a new family has its family's one ability, the top
    variant included; its numbers follow the family (R5), its damage the variant's level damage.

    | Archetype(s) | Ability (kind) | Shape | Used when the target is | Wind-up | Cooldown | Damage | Shape numbers |
    |---|---|---|---|---|---|---|---|
    | `ravener` | pounce | leap, then area at the landing | 120-300 px, in sight | 0.5 s | 6 s | × 1.5 | leap 0.3 s; area radius 60 px |
    | `wight_archer` | volley | shots | within its shooting range, in sight | its shot's 0.6 s | 5 s | × 1.0 per arrow | 3 `bone_arrow`s fanned 12° apart, centre on the target |
    | `blood_troll` | ground slam | area around itself | within 90 px | 0.9 s | 7 s | × 1.5 | radius 130 px |
    | `blightborn` | death burst | area at its corpse | (on death, R16) | fuse 0.8 s | once | × 2.0 | radius 110 px |
    | `banshee` | wail | area around itself | within 200 px | 0.7 s | 8 s | × 1.2 | radius 180 px |
    | every goblin | thrown dagger | shot | 90-260 px, in sight | 0.4 s | 5 s | × 1.0 | `thrown_dagger`: 480 px/s, radius 8, max flight 520 px |
    | every ogre | rock throw | shot | 140-380 px, in sight | 1.0 s | 7 s | × 1.5 | `ogre_rock`: 240 px/s, radius 18, max flight 420 px |
    | every dark warrior | cleave | cone in front | within 110 px | 0.8 s | 6 s | × 1.6 | cone 120°, reach 110 px |

    **(charter default: every number above. Each follows the notes' word: a pounce and a slam
    readable through a wind-up; a volley as a "3-arrow volley"; a rock "slow, slightly ranged,
    easy to dodge but painful" as the slowest, largest, longest-wound shot at × 1.5; a dagger
    the goblin's reach past melee; a cleave "wide" at 120°.)**
12. **When an ability is used.** An ability is ready when its cooldown is 0; it is 0 at spawn.
    In place of starting its next basic attack (the moment its attack interval has elapsed and it
    would wind up), a hunting monster whose ability is ready and whose target is inside the
    ability's distances (and in sight, for a shot or a leap, by the shot sight test of
    FS-B4SG9 §A R5) uses its ability instead: it stands, faces its target, and winds up for the
    ability's wind-up. Its cooldown starts when the wind-up starts. A monster whose target is
    outside its basic attack's range but inside its ability's distances (a goblin at 200 px)
    stops chasing to use it. Otherwise it attacks as today. **(charter default: the ability
    replaces a swing rather than running on its own clock, so a monster never acts twice at once
    and the attack interval still paces it.)**
13. **Where an ability aims.** The aim is fixed when the wind-up **starts**, at where the target
    stands then, except a shot's, which keeps turning through its wind-up and leaves at where
    the target stands at the end, as the Bone Archer's does (FS-B4SG9 §A R7). An area around
    the monster is centred on where it stands; a cone points along its facing at the start. So
    every area and cone shows where it will land for its whole wind-up, and stepping out of it
    dodges it. **(charter default: a telegraph a player can read must not move.)**
14. **What it hits.** An area or cone hits every **delver** in play whose body overlaps it when
    it lands (a cone: the body's centre within the reach and within half the angle of the
    facing). Monsters are never hit by a monster's ability. Each hit is the monster's level
    damage × the multiplier, physical, with the 5 % base crit, mitigated by defence, through the
    CombatSystem as every monster strike is (FS-77AB6 R19), snapshotting the attacker as its
    projectiles do. A shot ability is one or more monster shots (FS-B4SG9 §A) with the ability's
    projectile type and numbers, each hitting the first delver it meets and stopped by walls.
    An elite's ability hits at the elite's damage; a champion's at the champion's (§D R25).
15. **Pounce.** After the wind-up, if the straight line to the aimed point is still walkable for
    its body (the navigation grid's clear test at its body radius), the Ravener moves to that
    point over the leap time, colliding with nothing, then its area lands centred where it
    stands. If the line is not clear, the pounce is called off with its cooldown spent and it
    goes on as before. It cannot leave its floor's walkable cells. **(charter default: a blocked
    leap is a miss, never a teleport through a wall.)**
16. **Death burst.** A Blightborn dies as every monster does (FS-77AB6 R28): one kill record,
    its drops and experience, its corpse. Its burst then lands after the fuse, centred on its
    corpse, whether or not anyone is near, once. Its damage is the Blightborn's level damage
    (an elite's if it was one) × 2.0, snapshotted at its death; a delver it kills is killed by
    the Blightborn. Leaving the floor before the fuse ends removes the burst with the corpse.
17. **On the wire.** While a monster winds up an ability, and through a pounce's leap, its
    `action` is **`ability`**. While an ability's area or cone is pending (its wind-up, a leap,
    or a death burst's fuse), the monster's state carries **`ability`**: `{ kind, x, y, radius,
    arc, remaining }`: the kind (`pounce`, `ground_slam`, `burst`, `wail`, `cleave`, `volley`,
    `dagger`, `rock`), the area's centre in world px, its radius (a cone's reach), the cone's
    full angle in degrees (0 for a circle), and the seconds until it lands. For a shot ability
    only `kind` and `remaining` are set (radius 0). A dead Blightborn's state carries its burst
    until it lands. Nothing else in the state changes. **(charter default: the telegraph's
    numbers come from the server, so the client never holds a second copy of an ability's
    reach.)**
18. **Projectiles.** Shot abilities appear as projectiles with new `projectile_type` values,
    `thrown_dagger` and `ogre_rock`; a volley's arrows are `bone_arrow`s.

### §C. The floor pool (game-service)

19. **Each Spire floor draws a pool of 5 variants** when it is built, from every variant
    unlocked at its tier (R1, R2), and its standard monsters come only from that pool. Each floor
    draws its own; a run's floors may share variants. When 5 or fewer are unlocked (tier 1:
    exactly 5), the pool is all of them.
20. **The draw** is without replacement and weighted: every variant weighs 1, except the Dark
    Warrior family's, which weigh `DarkWarriorPoolWeight` = 2 **(approved default)**. Roles are
    guaranteed: the pool holds at least one brute and two fodder. The guaranteed places are drawn
    first (one brute among the unlocked brutes, then two fodder among the unlocked fodder), then
    the rest among everything left, each draw weighted. **(charter default: guaranteed places
    first, so the guarantee needs no retry loop; every tier has at least one brute and two
    fodder, so it always holds.)**
21. **A rolled monster** (an ordinary room's, a top-up's, a corridor's, a treasure guard's) is a
    brute at the floor's **brute share** (today's troll share curve, `trollShare`, renamed),
    drawn uniformly among the pool's brutes; otherwise it is drawn uniformly among the pool's
    fodder. The 70 / 20 / 10 ghoul / thrall / wraith mix (`spireNonTrollMix`, FS-M8CSE §D R18)
    retires on every tier. **(charter default: uniform within a role, the notes' "in random
    numbers"; no per-variant weights inside a floor.)** Its level and elite roll are today's
    (`rollAs`). A goblin's look is rolled after its variant (R8).
22. **Ranged members fill the archer slots.** Where FS-B4SG9 §B puts a Bone Archer (a rolled
    ordinary-room or top-up monster that came up fodder turns ranged at `BoneArcherRoomShare`;
    the first `HallPackBoneArchers` of a hall pack's fodder), the monster is instead drawn
    uniformly among the pool's ranged members. With no ranged member in the pool, those slots
    stay fodder and no extra draw is made. A ranged member is never rolled in any other way.
23. **Hall packs** take a brute plus fodder from the pool: the pack's leader is drawn uniformly
    among the pool's brutes, its members (FS-KE075's hall-pack count, §I) uniformly among the
    pool's fodder, the first of them in the archer slot (R22). Placement around the leader is
    FS-KE075 §C's, unchanged. **Treasure guards** (always elite) are rolled monsters (R21).
24. **Dark Warriors are capped.** After the floor's total is held (FS-KE075 §C), if the floor
    holds more Dark Warrior family monsters than `min(DarkWarriorCapMax, ⌊n / DarkWarriorPer⌋)`
    (n = the floor's monsters; `DarkWarriorPer` = 12, `DarkWarriorCapMax` = 4, **approved
    default**), the excess, chosen at random, are each redrawn as another brute of the pool, or
    as fodder when the pool has no other brute; position, level and elite status are kept. The
    champion (§D) is not counted.
25. **Per-floor curves stand:** the brute share rises with floor as the troll share did, and the
    elite chance per floor is unchanged (FS-77AB6 R23). The demon and blood demon rolls are not
    pool members and are unchanged here (FS-3103M changes the demon's).

### §D. Champion bosses (game-service)

26. **The top floor of a height 3-9 run holds a champion** where the Green Demon stood: a variant
    unlocked at the floor's tier but **not in the floor's pool**, drawn uniformly (no Dark
    Warrior weight) among those left over. When nothing is left over (tier 1, every variant in
    the pool), it is drawn uniformly from the pool. A goblin champion rolls its look as R8.
    Daa'gon keeps the top floor of a height-10 run, unchanged.
27. **A champion is a boss**: never an elite, at most one per run, placed as the guaranteed
    demon was (the room farthest from the start, the relaxed retry, FS-KE075 §C R19), counted
    outside the floor's total, with the boss flag on the wire.
28. **Its numbers** **(approved default)**: level = the old demon's (party + floor offset +
    `DemonLevelBonus` 2, no spread). HP and damage are the Demon sheet's at that level (1200 and
    28 at level 1, on the level curve). Defence and magic resistance are the variant's at that
    level × `ChampionMitigationMultiplier` = 1.5. Speed, timings, range, aggro, leash, shot and
    ability are the variant's; its ability hits at the champion's damage (R14).
29. **Its name** is "<Name> the <Epithet>", one drawn from each of two authored lists in
    `monster_tuning.go` **(approved default)**. Starting lists **(charter default: twelve each,
    lore-fitting, clear of the elite prefixes, Vorsk and Daa'gon)**:
    - Names: Morgrath, Skarn, Ulveth, Hesk, Druun, Caelith, Bellakar, Ashka, Thule, Grend,
      Myrrow, Saelk.
    - Epithets: Unburied, Gnawer, Ash-born, Last Warden, Rot-king, Bone-crowned, Patient,
      Grieving, Lantern-eater, Twice-slain, Pale, Unforgiven.
30. **Kept:** the blood demon's own roll on every floor, the top floor included, never in the
    champion's room (FS-VHGE7 §A R5-R10, with "demon" read as "the top floor's boss"); no blood
    demon beside Daa'gon (FS-M8CSE §E R24). FS-3103M removes the demon's random roll; the demon
    is then only ever summoned.
31. **Drops and experience.** A champion drops on the boss row (`BossMonsterDrop`), as every boss.
    Its experience base is the Demon's (25) with the boss multiplier, not its variant's.
    **(charter default: its HP is the Demon's, so its reward is too; the top floor pays what it
    paid.)** Its Fabled chance is the boss rule as FS-3103M sets it.

### §E. Drops and experience for variants (game-service)

32. **Each variant drops on its family's base row (approved default)**: the ghoul, skeleton,
    thrall, ghost and goblin families on the ghoul's row (`GhoulMonsterDrop`); the troll, ogre and
    dark warrior families on the troll's. A goblin's shield look drops as its blade look. Nothing
    new in `MonsterDrops`'s chances; an elite drops on the elite row, a champion on the boss row,
    as today.
33. **Experience base per variant (approved default)** = the family's step-0 base × (variant HP /
    step-0 HP), rounded half up. The new families' step-0 bases take the same rule against the
    family they drop as: goblin = 10 × 32 / 40 = 8, ogre = 25 × 200 / 140 = 36, dark warrior =
    25 × 260 / 140 = 46. **(charter default: the notes' scaling extended to the step-0s, which
    the notes left without a base.)** The resulting rows: Ghast 12, Ravener 15; Ashen Archer 12,
    Wight Archer 14; Cave Troll 30, Blood Troll 36; Plague Thrall 18, Blightborn 22; Shade 24,
    Phantom 29, Banshee 35; Goblin 8, Cutthroat 10, Reaver 12, Warchief 14 (each shield look
    the same); Ogre 36, Mauler 43, Tyrant 51; Dark Warrior 46, Dark Reaper 56.

### §F. The client: looks, champions and ability effects (game-client)

34. **A look for every variant.** `MONSTER_LOOKS` has a row per new archetype (R3, R8): its own
    sheet, `creature_<archetype>_base`, at its family's size tier: fodder for the ghoul,
    skeleton, thrall, ghost and goblin families, brute for the troll, ogre and dark warrior
    families. The ogre family stands at the top of the brute band (1.5×, a per-look aim), so it
    reads bigger than a troll. **(charter default: an `aim` override on the look, inside the
    guideline's band.)** An unknown archetype still falls back to the troll (FS-77AB6).
35. **The champion look.** A monster with `boss: true` whose look is not boss tier is a champion:
    it is drawn from its variant's sheet scaled to the boss tier's aim, with the boss plate a
    demon carries, reading its server-authored name. Its level and HP bar are as every boss's.
36. **Ability telegraphs.** While a monster's state carries `ability` with a radius, the client
    draws its area on the ground for its `remaining` time: a circle for `pounce`, `ground_slam`,
    `burst` and `wail`, a cone for `cleave`, filling as it nears landing, in the hostile
    channel, tokens only (ADR-0013). When it lands (the field goes away), the client plays a
    short impact of the same shape. A `burst` is drawn on the corpse.
37. **Ability poses.** `action: "ability"` plays the monster's `attack` clip paced to the
    remaining wind-up, as `attack` is paced today; a pounce's leap is the sprite following the
    server's position. **(charter default: no new baked clip; the effect, not the body, tells
    the ability apart. A clip per ability is a later art change.)**
38. **Hostile projectiles.** `thrown_dagger` and `ogre_rock` have their own flights in the
    hostile channel, drawn where the server says and eased like every projectile; the rock reads
    big and slow. A volley's arrows are bone arrows.
39. **Gallery.** Each new effect (the four circle telegraphs, the cone, the impacts, the two
    flights) is a piece in the tracked `effects` family, so its card is added to
    `src/dev/gallery/effects.ts` in the same change (FS-1819Q; `game-client/CLAUDE.md` "Dev
    gallery"). Monster sheets are not a tracked family.

### §G. Art loaded per floor pool (game-service + game-client)

40. **The floor map names the pool.** A dungeon floor's `floor_map` carries **`enemy_pool`**:
    every archetype id the floor's pool can spawn (a goblin variant both its looks). It never
    names the champion or any boss, so it says nothing of whether the floor is the top
    (FS-M8CSE: height stays server-only). A floor map without the field (an older server)
    leaves the client fetching on sight only (R42).
41. **Every variant beyond the five tier-1 looks is on demand, scoped to the floor** (ADR-0081):
    its sheet is in an atlas group of its own, named by its variant id (a goblin variant's two
    looks share one group); no scene preloads it. The tier-1 looks stay in `creatures`, loaded
    with the run.
42. **Fetched with the floor.** When a floor map for a new floor arrives, the client fetches the
    groups of the pool's archetypes not yet held, on the scene's loader, with no bar or fade
    (ADR-0071 Decision 5). A variant listed in a snapshot whose group is neither held nor named
    by the floor's pool (a champion, a variant met in another scene) is fetched on that first
    listing, as ADR-0071 Decision 2.
43. **Evicted with the floor.** On the same new floor map, every variant group held that the new
    pool does not name is evicted, animations first, as ADR-0059 evicts a scene's groups. A
    group both floors use is kept. The blood demon's group (ADR-0071) is not a variant group and
    keeps its scene scope.
44. **A stand-in until it lands, never the placeholder.** Until its group is in, a variant draws
    its family's tier-1 look at its own tier (a champion at the boss tier): the five old families
    as baked (their variants recolour that look), the goblin as the ghoul, the ogre as the troll
    and the dark warrior as the ghoul, each under a stand-in tint from the canvas palette.
    **(charter default: a stand-in on `creatures`, which every Spire floor holds.)** When its
    pages land each such monster is re-dressed in place (ADR-0071 Decision 3).

### §H. The art (game-client bake; Content: FS-Q14EV)

45. **Recolours of the old families**, baked sheets (never a runtime tint: `MonsterLook.tint`
    overrides the elite wash and can only darken, FS-M8CSE §H): Ghast, Ravener (ghoul rig); Ashen
    Archer, Wight Archer (the Bone Archer's); Cave Troll, Blood Troll (troll); Plague Thrall,
    Blightborn (the Barrow Thrall's); Shade, Phantom, Banshee (the Spire Wraith's). Eleven sheets,
    each a "different colour shade" of its family, deepening with the step, colours from existing
    `BARROW` tokens.
46. **Three new rigs on the shared rig** (ADR-0021, built in code, never sourced), each with its
    tiers as recolours:
    - **Goblin:** little (fodder band, below a ghoul's height), green, ugly, sharp-eyed; a blade
      look and a blade + shield look. Eight sheets (4 variants × 2 looks).
    - **Ogre:** bigger than a troll (top of the brute band), heavier and slower in its walk,
      a rock-throwing arm. Three sheets.
    - **Dark Warrior:** grim, reaper-like, bony but upright and deliberate, not a hunched
      skeleton, with a greatsword. Two sheets.
47. **Pipeline.** Each sheet: one `CAST` entry, 8 directions × `idle`, `walk`, `attack`, `death`
    at the standard rates, an `authored:` provenance line, deterministic bake (`npm run bake --
    --check` exits 0), per FS-Q14EV §A, packed in its variant's group (R41).
    `src/render/art/manifest.test.ts` asserts each sheet's directions, clips, source and group.
48. **Review.** The bake writes contact sheets to `tools/bake/review/`. The owner gates the look
    on them (ADR-0021). For this build the owner reviews the results, so an art slice does not
    stop at the sheet: it finishes and names its contact sheets in its report.

### §I. Floor population (Tunes FS-KE075)

49. Floors hold fewer monsters: the dungeon total **45-70 becomes 30-45** (`DungeonMonstersMin`
    / `Max`). The counts that make it up scale by about −35 %, room structure and every
    per-floor modifier kept: a hall pack's members **2-4 → 1-3** (a brute plus 1-3);
    ordinary-room monsters **0-3 → 0-2**, top-up cap **4 → 3**; corridor monsters **4-8 →
    3-5**. Treasure guards (1, or a pack of 2-3) are unchanged. These are values FS-KE075 §C
    names, so the change is a tune, built as `Tunes FS-KE075`.

## User Stories

1. As a delver climbing at a higher level, I want floors to show me monsters I have not met
   before, so that the Spire stays fresh as I grow.
2. As a delver, I want each floor of a run to hold a different set of enemies, so that two
   floors of one climb play differently.
3. As a delver at level 26 and above, I want the deep endgame to hold the most variety, the
   newest variants, abilities on the old families and Dark Warriors, so that the top of the
   game feels like the top.
4. As a delver, I want a stronger variant of a family to look like a shade of the one I know,
   so that I read its family and its danger at a glance.
5. As a delver, I want every step up a family to be stronger in health, speed, damage and
   armour, so that the name means something.
6. As a delver, I want goblins to be weak alone but dangerous in numbers, with some carrying
   shields, so that ignoring them gets me overwhelmed.
7. As a delver, I want ogres to hit harder and move slower than trolls, and their rock to be
   easy to sidestep if I watch, so that skill beats them.
8. As a delver in the deep endgame, I want Dark Warriors to be rare and frightening, never a
   swarm, so that each one is an event.
9. As a delver, I want every area attack to show me where it will land before it lands, so that
   I can step out of it.
10. As a delver, I want a Blightborn's death to warn me before it bursts, so that I can back off
    from the corpse.
11. As a delver, I want a Ravener's pounce and a Blood Troll's slam to wind up visibly, so that
    I can dodge them.
12. As a delver, I want a Wight Archer's volley and a goblin's dagger to be projectiles I can
    strafe and that walls stop, so that the rules of the Bone Archer hold.
13. As a delver, I want every floor to have a brute and fodder, so that hall packs and
    pacing still exist.
14. As a delver, I want archers only when the floor drew a ranged family, and fodder in their
    place otherwise, so that the floor stays consistent with its pool.
15. As a delver, I want fewer monsters on a floor now that monsters have abilities, so that
    the floor is harder per fight but not longer.
16. As a delver reaching the top floor, I want a named champion with a boss's strength, so that
    the climb ends in a fight worth remembering.
17. As a delver, I want the champion to be something the floor's pool did not show me, so that
    the boss is a surprise.
18. As a delver, I want a champion to drop like a boss and pay a boss's experience, so that the
    top floor is still worth the climb.
19. As a delver on a height-10 run, I want Daa'gon to stay the boss, so that the Master Spire
    keeps its ending.
20. As a delver, I want the blood demon to still be a chance on any floor, so that the rare
    fight stays rare and possible.
21. As a delver, I want an elite variant to read as "Hollow Banshee", never with a doubled
    word, so that names stay readable.
22. As a delver, I want a variant's kills to pay experience in step with its strength, so that
    harder floors pay more.
23. As a delver, I want a variant to drop on its family's row, so that drops stay familiar.
24. As a delver on a slow connection, I want a variant to show as a plainer look of its family
    while its art downloads, never as a placeholder or nothing, so that I can always fight it.
25. As a player, I want the game to fetch only the art my floor needs, so that it fits my
    machine's memory on long deep runs.
26. As a delver in the endgame, I want floors to be the same tier for everyone at a level, so
    that party level and floor both push me toward later tiers.
27. As a game designer, I want every family, variant, ability, pool weight and cap to be data in
    one tuning file, so that I retune or add a variant without hunting.
28. As a game designer, I want a family retuned by its first sheet, so that its variants follow.
29. As a client developer, I want each new effect in the dev gallery, so that I find it before
    building another.
30. As the owner, I want the new looks on contact sheets, so that I can judge the art.
31. As a server developer, I want the floor map to name the pool but never the boss, so that the
    client cannot tell the top floor from it.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] `tierOf` returns 1 for base levels 1-5, 2 for 6-10, … 6 for 26, 30 and 60; a floor's
      tier reads its base level, not any monster's spread.
- [ ] The roster holds exactly R3's 8 families and 25 variants with R3's roles and unlock tiers,
      and every tier unlocks at least one brute and two fodder.
- [ ] Every variant's level-1 sheet matches R6 and R7; each step is strictly better than the
      step below on HP, speed, damage and defence; every speed is below 200.
- [ ] No variant, champion name or epithet contains an elite-prefix word; an elite variant is
      named "<prefix> <variant name>".
- [ ] A goblin spawn rolls its shield look at 0.5; a shield look has the blade's sheet with
      defence + 3 and the same name, experience and drops.
- [ ] Each ability in R11 is on exactly the archetypes it names, with R11's numbers; every other
      sheet has none.
- [ ] A hunting monster with a ready ability and its target inside the ability's distances (and
      in sight for a shot or leap) winds up the ability instead of its next swing, reports
      `action: ability` and the `ability` field, and starts its cooldown; with the ability
      cooling it attacks as before.
- [ ] A slam, wail and cleave land on the area fixed at the wind-up's start: a delver who
      leaves it before it lands is not hit; one inside is hit at level damage × the multiplier,
      mitigated; no monster is ever hit.
- [ ] A cleave hits a delver in front within 110 px and 60° of the facing, not one behind.
- [ ] A pounce with a clear line ends at the aimed point and hits there; a blocked line is
      called off with the cooldown spent.
- [ ] A Blightborn's death records one kill, then its burst lands once after 0.8 s centred on the
      corpse, at × 2.0 its (elite) damage; a delver killed by it is credited to the Blightborn;
      a floor change before the fuse ends removes it.
- [ ] A volley looses 3 `bone_arrow`s 12° apart; a goblin's dagger and an ogre's rock leave as
      `thrown_dagger` and `ogre_rock` shots with R11's numbers and are stopped by walls.
- [ ] A floor's pool has 5 distinct variants unlocked at its tier (all 5 at tier 1), at least
      one brute and two fodder; across many seeded draws every unlocked variant appears, and at
      tier 6 a Dark Warrior variant appears about twice as often as a weight-1 variant.
- [ ] Every standard monster on a floor is a pool variant; brutes appear at the floor's brute
      share; no `spireNonTrollMix` remains.
- [ ] With a ranged member in the pool, ordinary-room fodder turns ranged at
      `BoneArcherRoomShare` and each hall pack's first fodder is ranged; with none, no monster on
      the floor is ranged.
- [ ] Each hall pack is a pool brute plus pool fodder; treasure guards are pool variants, all
      elite.
- [ ] A floor never holds more Dark Warriors than min(4, ⌊n / 12⌋), the champion not counted.
- [ ] The top floor of a height 3-9 run holds exactly one champion and no Green Demon; it is a
      variant unlocked at the floor's tier and not in the pool (from the pool at tier 1), boss,
      not elite, with R28's numbers and a "<Name> the <Epithet>" name from the lists.
- [ ] A height-10 top floor still holds Daa'gon and no champion; the blood demon still rolls on
      every other floor and the champion's top floor, never in the champion's room.
- [ ] A champion's kill rolls the boss row and pays the Demon's experience base × the boss
      multiplier at its level.
- [ ] Each new variant's kill rolls its family's drop row and pays R33's experience base.
- [ ] A dungeon floor's `floor_map` carries `enemy_pool` listing exactly the pool's archetypes
      (both looks of a goblin variant) and never the champion's.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service; `make test` passes.

### Server, the population tune (Tunes FS-KE075)

- [ ] Across seeded floors every dungeon floor's total, demon and champion aside, is within
      30-45 where the layout allows; hall packs have 1-3 members; ordinary rooms 0-2 (top-ups to
      3); corridors 3-5.

### Client (vitest)

- [ ] Every archetype in R3 and R8 has a look at its family's tier; the ogre family's scale is
      the brute band's top; an unknown archetype still draws as the troll.
- [ ] A `boss: true` monster whose look is not boss tier draws its own sheet at the boss tier's
      aim with the boss plate.
- [ ] Each `ability` kind with a radius draws its telegraph shape at the given centre for its
      `remaining` time and an impact when it goes; `burst` draws on a corpse; `action: ability`
      plays the attack clip.
- [ ] `thrown_dagger` and `ogre_rock` draw their own flights; the gallery's effects registry has
      a card for each new effect.
- [ ] A new floor map's `enemy_pool` queues exactly the pool's groups not held and evicts the
      held variant groups it does not name; a group both name is kept; the blood demon's group
      is untouched.
- [ ] A variant whose group is not in draws its family's tier-1 look (the goblin, ogre and dark
      warrior their named stand-ins) under its tint, never the placeholder; on landing it is
      re-dressed in place.
- [ ] A variant listed in a snapshot whose group is not held and not in the pool is fetched once.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

### Art

- [ ] The 24 sheets of R45-R46 exist in the manifest, 8 directions × four clips each, an
      `authored:` source, each in its variant's group; `npm run bake -- --check` exits 0.
- [ ] Contact sheets for every new sheet are in `tools/bake/review/` and named in the slice's
      report.

## Edge States

- **Tier 1 pool.** Exactly five variants are unlocked, so the pool is all of them and the
  champion is drawn from the pool.
- **A floor at a tier boundary.** The base level decides the tier. A monster's ± 1 spread may
  put its own level one past the boundary; its variant is still from the floor's pool.
- **A pool with no ranged member.** Archer slots stay fodder; no extra draw.
- **A pool whose only brute is a Dark Warrior, over the cap.** The excess are redrawn as fodder.
- **Nothing left over for a champion** above tier 1 cannot happen at today's roster (each tier
  past 1 unlocks more than five); if a retune makes it so, the champion is drawn from the pool.
- **A champion that finds no spot.** As the guaranteed demon: a relaxed retry, then skipped
  loudly with an error log, never silently.
- **A champion of an area-ability family.** Its ability hits at the champion's damage.
- **A champion goblin** rolls its shield look; its defence is its look's × 1.5.
- **An elite Blightborn's burst** hits at the elite's damage × 2.0.
- **A Blightborn dies on the last tick before a floor change**: its burst is removed with the
  floor; it never lands on the next floor.
- **Two bursts overlapping**: each lands; a delver inside both takes both.
- **A pounce whose target moves**: the leap goes to the point fixed at the wind-up's start and
  hits whoever is there.
- **A monster's target dies or escapes during an ability's wind-up**: an area or cone still
  lands where it was fixed (it may hit others); a shot is not loosed, as today; the cooldown is
  spent.
- **A target inside the basic range and the ability's distances, ability ready**: the ability
  goes first.
- **A goblin with its dagger cooling and its target at 200 px**: it chases as today.
- **A delver leaves the floor during a telegraph**: nothing lands on them; the area lands empty.
- **A lost or late floor map** (ADR-0060): the client asks again; until the map arrives no
  prefetch runs, and variants met are fetched on sight with their stand-ins.
- **An older server without `enemy_pool`**: sight-only fetching, nothing evicted per floor
  until a map names a pool.
- **A group that fails to download**: its stand-in stays for the floor with one warning; the
  next floor that names it asks again.
- **A floor change while a group downloads**: if the new pool still names it, the download
  continues; if not, it is called off as a stopped scene's is, and nothing lands on the floor.
- **Disconnect and reconnect**: the client receives the floor map again and fetches the pool;
  every monster and pending `ability` is rebuilt from the next state.
- **Leaving the run** evicts every variant group with the scene (ADR-0059).

## Out of Scope

- Removing the Green Demon's random roll, naming it Vorsk, the tome and altar, and any Fabled
  change: FS-3103M.
- Field zones' level bands (Meadows 1-2, Forest 8-12): `Tunes FS-X2F2H`. Forest elites on its
  trail: FS-3QHQZ's change.
- New baked clips per ability (§F R37), and per-variant elite sheets.
- Variants in field worlds, the hub or the dev test room's fixed spawns (FS-BDRTJ's to decide).
- Scaling the population cut by tier.
- Monster abilities that heal, buff, summon or affect other monsters.
- A per-variant weight inside a floor's draw, or weights in the pool draw beyond the Dark Warrior
  family's.
- Kill and match statistics, the matchmaker and the match queue, migrations and the HTTP
  contract.

## Open questions

Each **(charter default)** above, so the owner can revise it in play:

1. Variant archetype ids are snake-case names (R3).
2. The step rule's multipliers (R5) and the new families' step-0 timings and radii (R7).
3. Goblin looks as two archetypes per variant, shield at 50 %, + 3 defence (R8).
4. Every ability's numbers (R11), the ability replacing a swing (R12), aims fixed at the
   wind-up's start (R13), a blocked pounce called off (R15), the server sending the telegraph's
   numbers (R17).
5. Guaranteed pool places drawn first (R20); uniform draws within a role on a floor, retiring the
   70 / 20 / 10 mix (R21).
6. Champion name lists (R29); a champion's experience from the Demon's base (R31).
7. The new families' experience bases (R33).
8. The ogre's per-look aim (R34); no new ability clips (R37).
9. Stand-ins on `creatures`, the dark warrior's as the ghoul (R44).
