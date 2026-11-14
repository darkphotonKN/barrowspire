# FS-M8CSE: Spire height and the climb

> Status: shipped · SPECIFICATION.md: none. This is a change FS with no thin line of its own (`docs/specs/README.md`, The FS ledger). Each owning FS carries the stub `## Change: Spire height and the climb → FS-M8CSE`: [FS-F6F88](F6F88-multi-floor-delves.md), [FS-KE075](KE075-floor-1-dungeon.md), [FS-77AB6](77AB6-monsters-and-combat.md), [FS-VHGE7](VHGE7-blood-demon-and-demon-fire-claw.md), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md), [FS-8RBQY](8RBQY-tower-interior-run-look.md), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md), [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md) · Related ADRs: [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (scene art groups), [ADR-0060](../adr/0060-the-floor-map-is-sent-once-and-snapshots-are-cut-per-recipient.md) (floor map), [ADR-0061](../adr/0061-floor-layout-conventions-later-floors-follow.md) (later-floor conventions), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (blood demon art on demand) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md), [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md)

> Promoted `--from-thread` on 2026-11-09 from the locked scoping notes (all decisions the owner's)
> and the owner's approved charter, which answers every open question the notes left. Requirements
> marked **(charter default)** are that charter's, each with its reason. Those marked
> **(spec)** fill an acceptance-level gap that neither source settled, and are this spec's own.
> Every number is a starting value, expected to move in play. Code citations are against the
> working tree at `08aa558a`.

## Summary

A run through the Spire no longer has a fixed three floors. Each run rolls a height from 3 to 10
that only the server knows, so players climb without knowing where the stair ends. Every floor is
a full dungeon, the monsters on it stay dangerous without overscaling, and the two rarest things
in the game reward pushing higher: more drops above floor 5, and a Fabled chance that is very low,
normally reserved for bosses. At height 10, the rarest roll, the party meets Daa'gon on the top
floor. Two new tower monsters, the Barrow Thrall and the Spire Wraith, join the Spire's mix. It is
not a new mode: nobody picks a height or queues for one.

## Bounds

Agents may change `game-service`, `game-client` and baked art. Issues under this FS may **not**:

- touch `internal/matchmaker`, `internal/match_queue` or their wiring;
- start backend services;
- add kill or match stats (the `killExperienceBase` rows below are XP tables, not those stats);
- add a migration, or change the HTTP contract;
- touch `game-service/cmd/server/main.go`.

In `game-service/internal/game/session.go` only the floor and height sites may be edited
(`InitialSystems`, `buildFloor`, `layBuildings`, and the comments on them). The owner's uncommitted
removal of two `slog.Debug` lines in that file (the `ActionInteract` and `ActionAttack` cases) stays
exactly as it is.

No `SPECIFICATION.md` changes for this FS: it has no thin line of its own, and the two owning lines
reworded at lock already read true.

## Requirements

### §A. Spire height

1. **Height is rolled once per run,** when the run-level entity is made, from these odds: 3 floors
   35%, 4: 23%, 5: 15%, 6: 10%, 7: 7%, 8: 5%, 9: 3%, 10: 2% (average 4.68 floors; 27% of runs go
   above floor 5). It is fixed for the run. Chance decides height only: no per-floor type or theme
   is decided by chance.
2. **The odds are one table in `monster_tuning.go`,** drawn from the session's spawn source, so a
   seeded run rolls the same height. **(charter default: forcing a height is editing this table in
   a local build, no dev flag. That is how monsters are forced today.)**
3. **`FloorComponent.Count` holds the rolled height** and `constants.RunFloorCount` is removed.
   Every reader of the old constant reads the run's height instead: `hasStairs` and both top-floor
   decisions in the floor build (`session.go:3296`, `:3392`). `regenerateFloor`'s
   `floor.Depth >= floor.Count` guard stands unchanged.
4. **The top floor** is the floor whose depth equals the run's height. It has no stairs, and it
   holds the run's guaranteed boss (§E). Floor 1 is never the top, since the shortest height is 3.
5. **Height is server-only.** `floor_count` leaves the broadcast (`types/messages.go:92`,
   `BackendGameState.FloorCount`, and `state_serializer.go`). No message, snapshot, floor map or
   reply may carry the height or anything that derives from it. A run's height may be logged on
   the server. Kept as a requirement rather than an ADR, like the existing server-only guards.
6. **The client stops needing `floor_count` before the server stops sending it.** The client slice
   lands first, so no build in the sequence has a client that reads a field the server no longer
   sends.

### §B. What the client shows of the climb

7. **The HUD reads "Floor N"** with no total, from `floor` alone. Where there are no floors (the
   hub) it shows nothing, as today.
8. **Top-floor signal: the client treats an empty `stairs` list in the broadcast as the top floor.**
   Absent `stairs` (the hub) is not the top. **(charter default: `stairs` is already sent every
   tick, `types/messages.go:93`, so no new wire field. This replaces the notes' floor-map
   suggestion.)** The list is not interest-cut (only monsters and containers are,
   `state_serializer.go:562`), and a climb happens between ticks, so a floor's first broadcast
   carries that floor's stairs.
9. **The floor card** keeps its two lines and takes the top-floor read from R8: on an empty `stairs`
   list, "No stair climbs higher. Only the way out remains."; otherwise "The dead walk heavier
   here." It plays on a climb only, as today, so a reconnect shows no card and needs nothing new.
10. **No Master Spire card.** Floor 10 reads as any top floor, and Daa'gon's name is the reveal.
    **(charter default: smaller v1.)**
11. **Floor look comes from the floor number alone:** floors 1-2 `lower`, 3-5 `middle`, 6+ `upper`.
    No band on the wire. `floorBand` loses its count parameter, and this replaces FS-8RBQY §C.1's
    fraction of the climb. The upper look marks the floors where non-boss Fabled begins. A 3-floor
    run never sees the upper look (accepted at lock).

### §C. Every Spire floor is a dungeon

12. **Every Spire floor is built from the dungeon generator,** with the population FS-KE075 §C
    gives floor 1 (45-70 monsters besides bosses, by room and role). This supersedes FS-KE075's
    floor-2+ rules: floors 2-3 are no longer "unchanged" (§B R10-11, §H R49), "not cut" (§G R39) or
    a "straight chase" (§D R26).
13. **Floors 2+ use floor 1's parameter set** (72x48 cells of 80 px, 18-28 rooms): `dungeonParams`
    returns `DungeonFloor1Params` at every depth. **(charter default: it already passes the
    1,000-seed gate.)** ADR-0061's conventions apply unchanged.
14. **Dungeon systems follow any dungeon floor,** keyed on being a dungeon and never on depth:
    guarded chests (FS-KE075 §J), A* paths (§D), the interest cut (§G), the fog and the minimap
    (FS-SRA9J). **(charter default: all five already key on the floor having a layout. Fog already
    resets per floor, FS-SRA9J.)** No depth check is added for any of them.
15. **Generation failure keeps FS-KE075 R17:** a floor that cannot be generated falls back to a
    floor of buildings, logged, and still plays. **(charter default: rare, and the floor still
    plays. 8-14 monsters and no guarded chests on such a floor is accepted.)** Its stairs and its
    boss follow R4 and §E as on any floor.

### §D. Monsters

16. **Monster level step is +1 per floor,** from +2 (`Tunes FS-77AB6`, its R21 starting value). Floor
    10 is +9, about 2.1x HP and damage on the level curve, where +2 would have been +18, about
    3.2x. It also sets item level, through `areaLevel` and the kill's level.
17. **Two new standard monsters** join the Spire, new names on the Forest's models:
    **Barrow Thrall** (the zombie, grave-ash) and **Spire Wraith** (the ghost, bone-white).
18. **Mix.** A rolled non-troll monster is 70% ghoul, 20% Barrow Thrall, 10% Spire Wraith, on every
    Spire floor. Troll share and hall packs (one troll plus ghouls) are unchanged. Treasure guards
    draw through the same roll. **(charter default: this keeps the drop estimates true.)**
19. **Stats** are the Forest's sheets: Barrow Thrall is the zombie's sheet (70 HP, 9 damage), Spire
    Wraith the ghost's (30 HP, 8 damage), each with every other sheet field copied, and no field
    stat factor. **(charter default: reuses the Forest's starting values.)**
20. **Drops and XP rows.** Both drop on the ghoul row's values (`MonsterDrops`). XP base: Barrow
    Thrall 15, Spire Wraith 20. **(charter default: matching the Forest.)** An archetype without
    these rows drops nothing and gives no XP. They are not the kill or match stats ruled out in
    §Bounds.
21. **Archetype strings are `barrow_thrall`, `spire_wraith`, `daagon`.** **(charter default:
    `elitePlate` splits on `_` read as a space, so the plate splits as "Dread" + "Barrow Thrall".)**
    `elitePlate` (`render/creatures/monsters.ts:288`) does **not** read `_` as a space today: it
    looks for the raw archetype, `barrow_thrall`, in the name, misses it and sets no prefix. So the
    default's result needs a small client change, and this FS requires it: `elitePlate` matches the
    archetype with each `_` read as a space, leaving single-word archetypes as they are.
22. **"Barrow-cursed Barrow Thrall" is accepted for v1.** **(charter default: cosmetic, and a prefix
    filter is a new rule.)**

### §E. Bosses

23. **Heights 3-9: the Green Demon guards the top floor,** as the top floor's guaranteed boss today.
24. **Height 10 is the Master Spire.** Daa'gon replaces the Demon on its top floor, and no random
    Blood Demon rolls on that floor. It is a height, not a mode. The off-top chances on floors 1-9
    of a Master Spire are the same as any run's.
25. **Daa'gon** is its own archetype (`daagon`), never an elite, spawned `Boss: true` at party level
    + floor offset + 5, no spread. Sheet: the Blood Demon's with 2200 HP and 45 damage, and the same
    attack timings, ranges, mitigation, aggro and demon moves. Display name "Daa'gon". (Blood Demon
    for reference: 1600, 34, +3.)
26. **Daa'gon drops on the boss row,** always 2-3 items with no consumables, and its XP base is 50
    with the boss multiplier. **(charter default: 50 is scaled by HP over the Blood Demon's 35.)**
27. **The Blood Demon's chance table is otherwise unchanged:** its last row (10%) applies past
    floor 3, so a Blood Demon can roll on every floor above floor 3, the top floor of heights 3-9
    included.

### §F. Kill drops and the floor factor

28. **Floor factor:** x(1 + 0.05 x floors above 5), so x1.05 on floor 6 up to x1.25 on floor 10, and
    x1 on floors 1-5. One rule for ordinary drops and Fabled. Spire-only.
29. **A Spire kill's drop chance is its row's chance x the floor factor** at the kill's floor
    (`KillRecord.Floor`), capped at 100%. Floor 10: ghoul 10%, troll 18.75%, elite 62.5%. A boss
    stays 100%, 2-3 items, no consumables.
30. **The factor is applied at Spire roll time only.** `MonsterDrops`, `EliteMonsterDrop` and
    `BossMonsterDrop` stay the fields' source and are not rewritten, so **field drop chances do not
    change** (FS-X2F2H R31's chance rule stands). Sack and chest item odds do not change.

### §G. Fabled

31. **Fabled is a flat per-item roll made before the item type** and ignoring the DB Fabled weight:
    `rarityWeights` always gives Fabled 0, so consumables and the elite and demon weight
    multipliers cannot change the stated rate. No migration: the `item_rarities` row is left as it
    is and still supplies the Fabled rarity id.
32. **The chance per item,** by source:

    | Source | Chance per item |
    |---|---|
    | Any boss | 0.2% x floor factor (floors 1-5 0.2%, F6 0.21, F7 0.22, F8 0.23, F9 0.24) |
    | Daa'gon | 0.4% base x floor factor: 0.5% per item, about 1.25% per kill |
    | Elites, floors 6+ | 0.1% x floor factor |
    | Guarded treasure-room chests, floors 6+ | 0.1% x floor factor |
    | Everything else | 0% |

    "Everything else" is ordinary monsters, tower monsters, ordinary chests, sacks, every field and
    every non-boss on floors 1-5. A boss always beats anything else on its floor per item.
33. **Fields lose Fabled entirely.** This changes FS-X2F2H R31 ("Item count, type split, rarity
    source and item level ... come from the same row unchanged"): a field roll takes no Fabled chance
    and the DB weight no longer reaches it. The rest of R31 stands, field drop chances included.
34. **A Fabled result still resolves to a unique or falls back to Runed** (FS-4R9M9 R25-27): a
    uniform pick among the uniques the item level allows, any type, or a Runed item of the drop's
    type when none is eligible. A chest's pick still cannot be a ring. A hit with no eligible
    unique and no eligible base for the drop's type yields nothing, as a failed base pick does
    today. **(spec)** On a Fabled hit the drop's type does not gate the unique, so a hit on a
    would-be consumable is still a unique, and its fallback may be a Runed consumable, which the
    Runed weight already allows. Unique minimum item level runs 6-18, so a low-level party's Fabled
    often becomes Runed (accepted at lock).
35. **A guarded treasure-room chest** is a chest in one of the floor's treasure rooms that had
    guards placed at the build (the chest carries `GuardedComponent`). A guarded chest in a hall
    (FS-KE075 §J's other kind) and a treasure-room chest whose guards all failed to place are both
    ordinary chests. **(spec: the notes say "guarded treasure-room chests", and the estimates count
    3.5 such chests per floor, which is the treasure rooms alone.)** The Fabled roll needs the
    chest's standing at open, and `session.go:2053`, which opens it, is out of bounds. So the
    standing crosses that line inside the existing call: `containerKindOf` returns a roll-only
    kind for such a chest, the stored `ContainerComponent.Kind` stays `chest` and the wire is
    unchanged, and `rollChest` reads it. A kind without a row rolls chest odds (FS-1D6BX D2).
36. **Expected Fabled per full-clear run** (hand estimates, not playtested, recorded at lock): about
    1 in 57 on average, 1 in 168 at height 3, 1 in 9 at height 10, assuming 57.5 monsters per floor,
    3.5 guarded chests x 3 items, 2.5 items per boss, and today's troll and elite mix. Non-boss
    sources supply none of it at heights 3-5, about 59% on average, about 85% at height 10:
    "normally only from bosses" holds per item and on short runs, not in total on tall ones.
    Recorded, not reopened.

### §H. Art

37. **Two baked recoloured sheets** (`Content: FS-Q14EV`): `creature_barrow_thrall_base`
    (grave-ash) and `creature_spire_wraith_base` (bone-white), built from the Forest's zombie and
    ghost builders. Baked, because `MonsterLook.tint` overrides the elite wash and can only darken
    (ruled out at lock).
38. **Tower sheets go in the `creatures` atlas group, not `fodder`.** **(charter default:
    BarrowspireScene already holds `creatures` and the Forest does not, about 40 MB more per run.
    This replaces the notes' "load fodder for BarrowspireScene".)** `SCENE_ART` does not change.
39. **Colours are existing `BARROW` tokens only,** with no new palette rule. **(charter default.)**
    If neither recolour reads on the contact sheet, that is an escalation to the owner, not a new
    token.
40. **The contact sheet goes to the owner in the final report and is the art gate.**
    **(charter default.)**
41. **Daa'gon's art is a second `ON_DEMAND_ART` row on the `blood_demon` group,** with the same
    stand-in as the Blood Demon's. **(charter default: ADR-0071 Decision 6 covers this as a table
    change, no new ADR.)** Its look draws `creature_blood_demon_base` at the boss tier.
42. **A landed group redresses every archetype on it (spec).** `onDemandArt` (`phaser.ts`) remembers each group it
    has asked for and drops a later request's callback, so a Blood Demon fetch still in flight when
    the party climbs to Daa'gon would leave it in its stand-in. The landed callback redresses by
    group, not by the one archetype that asked.

## User Stories

1. As a player, I want each run's height to vary, so that no two climbs feel the same length.
2. As a player, I want not to know how high this Spire goes, so that every stair is a real decision.
3. As a player, I want the HUD to say only which floor I am on, so that nothing gives the height away.
4. As a player, I want the floor card to tell me when no stair climbs higher, so that I know it is time to get out.
5. As a player on a run's top floor who reconnects, I want the game to still know there is no stair, so that nothing looks wrong after a drop.
6. As a player, I want floor 6 and up to look different, so that I can see I have reached dangerous, rewarding floors.
7. As a player, I want a floor's look to depend on how high it is, so that it never hints at how long the run will be.
8. As a player, I want every floor to be a full dungeon, so that the climb does not get easier after floor 1.
9. As a player, I want fog, the minimap and guarded chests on every floor, so that each floor plays like the first.
10. As a player, I want monsters to path around walls on every floor, so that upper floors are not trivially kited.
11. As a player, I want higher floors tougher without becoming impossible, so that a tall run is survivable.
12. As a player, I want new monsters in the Spire, so that the tower has its own dead.
13. As a player, I want the Barrow Thrall and Spire Wraith to read as different from the Forest's dead, so that the two places feel apart.
14. As a player, I want an elite Barrow Thrall's plate to set its prefix apart as any elite's does, so that it reads like the rest.
15. As a player, I want a boss on every top floor, so that the climb has an ending.
16. As a player who reaches floor 10, I want to meet Daa'gon by name, so that I learn I climbed a Master Spire by facing it.
17. As a player, I want better odds of a drop on floors above 5, so that pushing higher pays.
18. As a player, I want Fabled items very rare and mostly from bosses, so that finding one means something.
19. As a player, I want a little more Fabled chance the higher I go, so that I have a reason to risk the climb.
20. As a field player, I want my drop chances unchanged, so that fields stay as they were to farm.
21. As an owner, I want fields to drop no Fabled, so that a Fabled item means someone went into the Spire.
22. As a developer, I want the height odds in one table, so that I can force a height in a local build.
23. As a developer, I want the height nowhere on the wire, so that no client can read it.
24. As a developer, I want a failed generation to keep a run going, so that a rare bad seed never strands a party.
25. As a developer, I want every Daa'gon, Thrall and Wraith row present, so that no archetype drops nothing or gives no XP by omission.
26. As a player on a slow machine, I want Daa'gon's art fetched only when it appears, so that most runs do not load it.

## Acceptance Criteria

Height:

- [ ] A height roll over a seeded source lands only in 3-10, and the table's weights sum to 100%.
- [ ] A run's height is fixed: it does not change across floors or on reconnect.
- [ ] `RunFloorCount` no longer exists. Depth equal to the run's height builds with no stairs and with the guaranteed boss, on a dungeon floor and on a fallback floor; depth below it builds with stairs.
- [ ] No broadcast, floor map or interact reply contains `floor_count` or any value derived from the height. The serialized state of a run has no `floor_count` key.

Client:

- [ ] The HUD shows "Floor 4" for floor 4, and nothing for a state with no floor.
- [ ] `stairs: []` reads as the top floor, a non-empty list and an absent list do not, and the floor card's line follows.
- [ ] `floorBand` takes only the floor: 1-2 `lower`, 3-5 `middle`, 6 and up `upper`.
- [ ] No client source reads `floor_count`. The client's type no longer declares it.
- [ ] `elitePlate` splits "Dread Barrow Thrall" (archetype `barrow_thrall`) into prefix "Dread" and rest "Barrow Thrall · Lv N". Existing single-word cases are unchanged.

Dungeon floors:

- [ ] Every depth from 1 to 10 builds a dungeon with 45-70 non-boss monsters from floor 1's parameter set.
- [ ] On floor 2 and above: chests in guarded rooms wait on their guards, the monster AI paths on the grid, snapshots are interest-cut, and a floor map with regions is sent.
- [ ] A forced generation failure on floor 2 or above logs and builds a playable floor of buildings, with stairs below the top and its boss on the top.

Monsters and bosses:

- [ ] A monster level on floor F is party level + 1 x (F - 1) + spread, at least 1. FS-77AB6's acceptance criteria still pass.
- [ ] Over a large seeded sample, non-troll standard rolls are about 70/20/10 ghoul / Barrow Thrall / Spire Wraith on any floor, troll share is unchanged, and every hall pack is one troll plus ghouls.
- [ ] Barrow Thrall and Spire Wraith carry the zombie's and ghost's sheets, drop on the ghoul row's values, and give base XP 15 and 20.
- [ ] Heights 3-9: exactly one Demon on the top floor. Height 10: exactly one Daa'gon, no Demon and no Blood Demon on floor 10.
- [ ] Daa'gon has 2200 HP and 45 damage at level 1, level = party + offset + 5, the boss drop row, and base XP 50.

Drops:

- [ ] Spire kills on floors 1-5 roll their row's chance unchanged. Floor 10 rolls ghoul 10%, troll 18.75%, elite 62.5%, boss 100%.
- [ ] A field kill's chance is its row's chance x the place's drop factor, exactly as before.
- [ ] Sack and chest item odds are unchanged.

Fabled:

- [ ] A DB Fabled weight of any size produces no Fabled through `rarityWeights`.
- [ ] Rates per item match §G R32 at floors 1, 5, 6, 9 and 10, for a boss, for Daa'gon and for an elite; ordinary monsters, tower monsters, ordinary chests, sacks and hall chests never roll Fabled; a field kill and a field chest never roll Fabled.
- [ ] A guarded treasure-room chest on floor 6 or above rolls the chance. One on floor 5, or one whose guards failed to place, does not.
- [ ] The rate holds on a would-be consumable: the flat roll is made before the type gates anything.
- [ ] A Fabled hit with no eligible unique yields Runed, and a chest's Fabled pick is never a ring.
- [ ] `ContainerComponent.Kind` on a guarded treasure-room chest is still `chest` on the wire.

Art:

- [ ] `creature_barrow_thrall_base` and `creature_spire_wraith_base` are in `creatures` atlas pages and resolve from `MONSTER_LOOKS`. No new `BARROW` token exists.
- [ ] A contact sheet of both sheets reached the owner. Neither has shipped into a slice without it.
- [ ] `onDemandFor("daagon")` names the `blood_demon` group with the Blood Demon's stand-in, and `ON_DEMAND_ART`'s coverage test passes.
- [ ] A group landing while two archetypes on it are in their stand-in redresses both.

## Edge States

- **Reconnect on the top floor.** The next broadcast carries `stairs: []`, and the client reads the top from it. No card plays.
- **A climb to the top with the client still holding the old floor's frame.** A late frame from below is dropped as today (FS-KE075 §H.41); the first frame of the new floor carries its own `stairs`.
- **Party dies or escapes before the top.** Nothing reveals the height. Learning it from how many floors a run happened to reach is the game.
- **Height 3 or any height where Fabled-eligible floors are never reached.** Only bosses can roll Fabled. Accepted.
- **Upper look never seen on heights 3-5.** Accepted.
- **Generation fails on a Master Spire top floor.** Fallback floor of buildings, Daa'gon still placed by the guaranteed-boss rule. No guarded chests on it.
- **Treasure room has no chest** (container placement skipped). No chest to roll, no Fabled. As today.
- **No unique eligible on a Fabled hit** (low item level). Runed of the drop's type, as FS-4R9M9 R26. A low-level party's Fabled often falls back; accepted.
- **`item_rarities` has no Fabled row.** No Fabled can be built; the hit falls through to the Runed fallback, as `rarityByCode` already handles.
- **Daa'gon appears before the `blood_demon` group has loaded.** It draws its stand-in and redresses when the group lands (R41, R42).
- **The `blood_demon` fetch failed earlier in the run.** Daa'gon keeps its stand-in. ADR-0071's behaviour, unchanged.
- **Client running a build older than the §B slice against a server past §A R5.** Not reachable in sequence (R6); a client from before this FS would show no floor label and no floor card.
- **A climb's floor build runs on the run's own loop, between ticks,** now a full dungeon each climb rather than a small map. Floor 1's build already blocks the tick the same way; a climb is under the veil. No new rule.

## Out of Scope

- A height picker, a Master Spire queue, "Floor N of M", or height in any client-visible form.
- A Master Spire card or any special floor-10 presentation (R10).
- New dungeon parameter sets per floor (R13), new room types or per-floor themes.
- The monster target frame on floors above 1. `MARKER_MODES` stays `run: {1: "frame"}` (FS-48CTQ, ADR-0061 Decision 12), so floors 2+ keep overhead plates. Not part of this change.
- New stat sheets or a stat factor for the tower monsters; new monster behaviour.
- A prefix filter for "Barrow-cursed Barrow Thrall".
- Changing `item_rarities`, any migration, any field drop chance, or sack and chest item odds.
- `SPECIFICATION.md` or `CONTEXT.md` edits (the glossary was updated at lock).
- `internal/matchmaker`, `internal/match_queue`, `cmd/server/main.go`, kill or match stats, the HTTP contract.

## Ruled out at scoping (do not bring back)

- +5 percentage points of drop chance per floor: replaced by the shared floor factor.
- 1% or 0.5% per floor Fabled schedules, the +5 boss bonus, and "bosses elsewhere keep 0.8-1.1%": about 1 in 3 full clears.
- Fabled from all containers: dungeon floors hold 10-14, so containers would far outweigh bosses (about 1 in 4 at height 10).
- A server-sent art band: bands as a fraction of the climb leak the roll.
- Sending height to the client, including "Floor N of M".
- Per-floor types or themes decided by chance.
- `MonsterLook.tint` for tower colours.
- A tougher Daa'gon (3000 HP, 55, +6), and keeping floors 2+ small.
