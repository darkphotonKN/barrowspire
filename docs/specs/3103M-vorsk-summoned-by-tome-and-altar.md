# FS-3103M: Vorsk, summoned by tome and altar

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Enemies" (summoned demon boss), `game-client/SPECIFICATION.md` "### Escape run" (tome and altar summoning) → this FS · Also the change FS for: [FS-77AB6](77AB6-monsters-and-combat.md) (the Demon renamed Vorsk and never rolled), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (boss Fabled floors 6+, Vorsk on any floor); each carries `## Change: Vorsk summoned by tome and altar → FS-3103M` · Sibling (same scoping session, 2026-11-14): [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) (champions take the Demon's top-floor place) · Related: [FS-M8CSE](M8CSE-spire-height-and-the-climb.md) (height is server-only, R5; Fabled rates, §G R32), [FS-VHGE7](VHGE7-blood-demon-and-demon-fire-claw.md) (the blood demon), [FS-KE075](KE075-floor-1-dungeon.md) (dungeon rooms, the interest cut, the interact refusal), [FS-9K8EZ](9K8EZ-die-by-choice.md) (the run menu's confirm) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (art built in code), [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from tokens only), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (on-demand art groups)

> Promoted `--from-thread` on 2026-11-14 from the scope-it session's raw notes. Every decision is
> the owner's; values marked **(default)** were approved at lock as starting values; anything the
> notes left open is marked **(charter default)** with its reason, chosen as the smaller v1.

## Summary

The Green Demon becomes **Vorsk**, and it is never rolled again: no top-floor place (FS-C8VM7
gives that to champions) and no rare chance on other floors. In 1 run in 50 a small **Tome of
Filth** lies hidden on a lower floor, and an **Altar of Consecration** stands on a floor above it,
never the top. A party that finds the tome can carry it up and burn it at the altar, which
summons Vorsk beside them, on top of the run's own top-floor boss. Vorsk drops more than any other
boss and is the only boss that can drop Fabled on floors 1-5. A party that reaches the altar
without the tome is told a tome was once burned there, and knows what it missed.

## Requirements

### §A. Vorsk leaves every random roll (game-service)

1. **The Demon is renamed Vorsk.** Its server-authored display name (the `monsterSheets` row for
   archetype `demon`) becomes "Vorsk". **(charter default)** The archetype code stays `demon`
   on the wire, in the sheet table and in the art: renaming the code would touch the client's art
   keys and the blood demon's stand-in for no player-visible gain.
2. **No floor rolls Vorsk.** `DemonChance` (today 1% on every floor but the top) is removed, with
   every code path that rolls it. The only way a `demon` enters a run is R18 (the burn).
3. **The top floor's place is not this FS's work.** FS-C8VM7 replaces the guaranteed top-floor
   Demon with a champion (height 3-9) and keeps Daa'gon on a height-10 run's top floor. This FS
   removes only the roll below the top (R2): `rollDemon` yields nothing on a floor that is not the
   top. After both changes no population path yields archetype `demon`. The top-floor branch,
   the shared boss placement helpers (`placeDemon`, `placeDungeonDemon`, `demonOddsOf`) and the
   blood demon's "never in the demon's room" rule (FS-VHGE7 §A R10, the champion's room after
   that change) are FS-C8VM7's to reshape.
4. Vorsk's stat sheet, moves (slam and fire claw, FS-VHGE7 §B), level rule (party + floor offset
   + 2, `demonLevel`) and XP base are unchanged.

### §B. The tome plan (game-service)

5. **2% of runs have a tome (default), at most one per run.** The chance is one tunable
   (`TomeRunChance`) beside the other spawn rates, so a local build can force a tome by setting
   it to 1, as FS-77AB6 R25 lets a developer force a demon. Rolled once, when the run is created
   and its height is drawn, from the session's spawn source (so a seeded run is reproducible).
6. **Where the pair stands (default).** The tome's floor is drawn uniformly from 1 to height - 2;
   the altar's floor uniformly from the tome's floor + 1 to height - 1. Neither is ever the top
   floor. At height 3 the only outcome is tome on floor 1, altar on floor 2.
7. **The plan is run-level state** on the run-level entity, beside the floor component, so it
   survives every floor change: the tome's floor, the altar's floor, whether the party carries
   the tome, whether it has been burned. It is never sent to a client as such (R14).

### §C. The tome and the altar on their floors (game-service)

8. **The tome is placed on its floor's build** in a random room that is not the start room, at a
   spot found as a container's is (off the room's doorways, clear of what is already placed,
   through the occupied-area check). **(charter default)** It is placed after the floor's
   containers, so it never displaces one; a room with no free spot is passed over for the next
   one drawn.
9. **The altar is placed on its floor's build** the same way, in a random non-start room,
   **whether or not the tome was picked up**. Altars appear only in tome runs.
10. **(charter default)** A floor that falls back to a floor of buildings (FS-KE075 R17) places
    neither, with a warning in the log: the fallback is already rare and has no rooms to hide a
    tome in. A tome or altar whose floor has no free spot in any room is skipped the same way.
11. **Floors regenerate on climb (FS-F6F88)**: a tome left lying when the party climbs is gone
    with its floor. There is no way back down.

### §D. Picking up the tome (game-service)

12. **Interact on the tome** (in interact range, as every interactable, by any in-play delver)
    takes it: the tome entity is removed and the run-level plan records that the party carries
    it. **(default)** The tome is run-level state, not an inventory item: it takes no bag slot,
    is never extracted, settled or sold, and vanishes with the run. The carrier dying or escaping
    changes nothing; the party still holds it.
13. **The taker's reply** is the interact reply with `success: true` and `reason: "tome_taken"`,
    so the client writes its own copy (as it does for `container_guarded`). **(charter default)**
    Only the taker is told; the rest of the party learns it at the altar (R16).

### §E. The wire (game-service → game-client)

14. **Two new run-only keys on the state broadcast, plus one flag**, all absent in the hub, a
    field, and on any run floor without them:
    - `tome`: `{ entity_id, position }` while the tome lies on the current floor. It is cut per
      recipient by distance on a dungeon floor, exactly as containers are (FS-KE075 §G R36),
      since it is hidden.
    - `altar`: `{ entity_id, position, burned }` on the altar's floor, sent whole like the stairs
      **(charter default: one landmark per floor, no cut needed)**.
    - `tome_carried: true` while the party carries the tome and has not burned it; absent
      otherwise.
15. **Height stays off the wire.** No key, reply or floor map names the tome's floor, the altar's
    floor or the run's height. The altar's presence says "this is not the top floor", and a tome
    on floor f says the run is at least f + 2 floors tall; both were accepted at scoping as a
    1-in-50 leak against FS-M8CSE R5. Nothing else may derive from height.

### §F. Burning the tome summons Vorsk (game-service)

16. **Interact on the altar without the tome** (the party never took it, or the run has no tome
    carried) is refused with `reason: "altar_without_tome"`; the client writes the lore line
    (R24). The altar is released at once, as every refused reach is.
17. **Interact on the altar while the party carries the tome** burns it: `tome_carried` clears,
    the altar's `burned` becomes true. Any in-play delver in range may burn it. The interact is
    already applied on the tick (`queueIntent`), so the burn and the spawn happen inside one tick.
    The confirmation is the client's (R25); the server burns on the interact it is sent, as the
    Fall confirm is the client's (FS-9K8EZ).
18. **Vorsk spawns on the burn (default: beside the altar)**, archetype `demon`, `Boss: true`,
    never an elite, at `demonLevel(party level, current floor)` with the party level taken as
    population takes it. **(charter default)** It stands at the free spot in the altar's room
    nearest the altar, off doorways and clear of walls, fixtures and every delver's body, among a
    bounded sample; a room with none falls back to the floor's farthest valid spot with the
    delver exclusion relaxed, as a guaranteed boss is placed (FS-77AB6 §Edge States "Placement
    exhausted"), and is logged loudly if even that fails.
19. **A burned altar** refuses every later interact quietly with `reason: "altar_burned"`. Two
    delvers burning in the same tick: the first burns, the second is refused `altar_burned`.
20. **Vorsk comes in addition to everything on the floor**: a blood demon already there fights
    beside it (accepted), and it does not count toward the floor's monster count.

### §G. Vorsk's loot and the boss Fabled rule (game-service)

21. **Vorsk's drop row (default):** always drops, **3-4 items**, on the boss row's rarity source
    and type split (`lootSourceDemon`, `demonDropSplit`), at the kill's level. It is its own row,
    chosen by archetype ahead of the generic boss row. Every other boss keeps the boss row (2-3).
22. **The Fabled chance per item becomes** (this replaces FS-M8CSE §G R32's table; R31, R33-34
    stand):

    | Source | Chance per item |
    |---|---|
    | Vorsk | **0.3% x floor factor, on any floor (default)** |
    | Daa'gon | 0.4% x floor factor (unchanged) |
    | Any other boss (champions, the blood demon), floors 6+ | 0.2% x floor factor |
    | Any other boss, floors 1-5 | 0% (was 0.2%) |
    | Elites, floors 6+ | 0.1% x floor factor (unchanged) |
    | Guarded treasure-room chests, floors 6+ | 0.1% x floor factor (unchanged) |
    | Everything else | 0% |

    The floors-6+ threshold is one tunable beside `EliteFabledMinFloor`. Rejected at scoping:
    Vorsk and Daa'gon the only bosses that ever drop Fabled.

### §H. The tome and altar models (game-client bake)

23. **Two small new props, modelled in code in the bake tool** (ADR-0021, ADR-0020), very minor
    and small: the **Tome of Filth**, one still frame, a small grimy book lying on the floor; the
    **Altar of Consecration**, two states framed together (`dormant`, `burned`), so the state
    swap never moves the sprite (as the chest's are). **(charter default)** Both are packed in the
    run's interactables (resident) group, not on demand: they are tiny. Colours from `BARROW`
    tokens only. The owner gates the look on a contact sheet, attached to the issue's PR.

### §I. The client (game-client)

24. **Lore lines** are the existing HUD notice (`showNotification`, which fades), in the
    `waiting` tone **(charter default: a lore line is neither a success nor a refusal, and a new
    tone is more than v1 needs)**, written by the client from the reply's `reason`:
    - `tome_taken` → *"Wonder if I can burn it."* (owner's words)
    - `altar_without_tome` → *"A tome was burned here once, they say, to insult a demon."*
      **(charter default: the owner's meaning, in the client's lore voice)**
    - `altar_burned` → no notice.
25. **E at the altar while `tome_carried`** and the altar is not burned opens a confirmation in
    the run menu's confirm panel (as Fall where you stand does): the line *"Burn tome?"* (owner's
    words) and the choices **Burn** and **Not yet [Esc]**. Burn sends the interact; Not yet sends
    nothing. Without `tome_carried`, E at the altar sends the interact straight away (the server
    answers with R16).
26. **The burn is heard by everyone on the floor:** when a broadcast's `altar.burned` turns true
    against the previous broadcast's false, the client shows *"You hear a sound from hell"*
    (owner's words) in the `refused` tone **(charter default: dread, the strongest existing
    tone)**. A first broadcast (connect, reconnect, a new floor) is the baseline and shows
    nothing, as `climbed()` treats the floor.
27. **The tome and the altar are drawn** from their sheets at their positions, depth-sorted as
    props are, the altar in its `dormant` or `burned` frame. The tome is an E target while it is
    listed; a burned altar is not an E target. Vorsk needs no client change: its nameplate is the
    server's name, its art the demon sheet the run scene already holds.
28. A refusal reply for the altar must not disturb a pending coffer reach in a way that differs
    from today's refusals (`chestRefused` clearing it is acceptable, as for any refusal).

## User Stories

1. As a player, I want demons to be rare, so that meeting one means something.
2. As a player, I want a hidden tome to exist in some runs, so that exploring every room can pay off.
3. As a player, I want to find the tome only rarely, so that finding it feels like an event.
4. As a player who picks up the tome, I want a line that hints at what to do with it, so that I know it matters without a tutorial.
5. As a player carrying the tome, I want to find an altar on a higher floor, so that the climb has a purpose beyond the stair.
6. As a player at the altar with the tome, I want to be asked before I burn it, so that I do not summon a demon by a stray key press.
7. As a player who chose to burn the tome, I want to hear that something terrible answered, so that I brace for the fight.
8. As a party member who did not burn it, I want to hear the same sound, so that I know what just happened wherever I stand on the floor.
9. As a party, we want Vorsk to appear beside the altar, so that the summoning is immediate and readable.
10. As a party on a tall run, we want Vorsk on top of the top-floor boss, so that a double-boss run is the hardest and richest a run can be.
11. As a player who kills Vorsk, I want more loot than any other boss gives, so that the risk was worth it.
12. As a player on a short run, I want Vorsk to be able to drop Fabled even on low floors, so that a summoning on floor 2 is still exciting.
13. As a player, I want ordinary bosses on low floors to drop no Fabled, so that Fabled keeps its weight and Vorsk stands out.
14. As a player reaching the altar without the tome, I want a lore line that tells me a tome existed, so that I know what I missed and look harder next time.
15. As a party, we want any of us to be able to burn the tome, so that the one who found it dying does not waste the find.
16. As a party whose tome finder escaped, we want to keep the tome, so that one player leaving does not end the chance.
17. As a player, I want the tome never to clutter my bag or follow me out of the run, so that it stays a run event, not loot.
18. As a player on a floor where a blood demon already roams, I want burning to still work, so that the choice stays mine.
19. As a player, I want the tome to be hidden, not sent to my screen from across the floor, so that finding it means exploring.
20. As a player arriving or reconnecting after the burn, I want no false "sound from hell", so that the line means it happened just now.
21. As a player, I want the altar to look burned after the summoning, so that the floor tells its story.
22. As the owner, I want the run's height to stay hidden except for this accepted rare hint, so that the climb keeps its uncertainty.
23. As the owner, I want the tome and altar to be my own art built in code, so that they fit the Spire's look.
24. As the developer, I want one tunable to force a tome into every run locally, so that I can test the whole flow without waiting for 1 in 50.
25. As the developer, I want the burn and spawn to happen on the tick, so that the spawn never races the monster AI.
26. As the developer, I want the archetype code unchanged, so that renaming Vorsk does not touch art keys or stand-ins.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] The `demon` sheet's display name is "Vorsk"; the archetype code is still `demon`.
- [ ] `DemonChance` no longer exists; over many seeded populations of every floor below the top, no population yields archetype `demon`. The same holds on the top floor once FS-C8VM7's champion has it.
- [ ] With `TomeRunChance` 1, every run has a tome plan; with 0, none. Over many seeded runs at the default, the share of tome runs is about 2%.
- [ ] Over many seeded plans at each height 3-10, the tome's floor is always in [1, height - 2] and the altar's in [tome + 1, height - 1]; at height 3 always 1 and 2.
- [ ] A forced tome run's tome floor holds exactly one tome in a non-start room, off doorways, overlapping nothing; its altar floor holds exactly one altar likewise; no other floor holds either.
- [ ] The altar is placed on its floor whether or not the tome was taken.
- [ ] A floor of buildings (forced fallback) places neither and logs a warning.
- [ ] Interact on the tome in range removes it, sets the plan's carried, and replies `success: true`, `reason: "tome_taken"` to the taker only; out of range it is refused as any interactable is.
- [ ] The broadcast carries `tome` only while it lies on the current floor and only to recipients within the interest cut; `altar` on its floor to everyone with `burned`; `tome_carried: true` only while carried and unburned; none of the three in the hub, a field, or a run floor without them.
- [ ] No key, reply or floor map carries the tome's floor, the altar's floor or the height (serializer test over a forced tome run).
- [ ] Interact on the altar without the tome replies `altar_without_tome` and changes nothing.
- [ ] Interact on the altar while carried burns it: `burned` true, `tome_carried` absent, exactly one `demon` boss at `demonLevel` spawned in the altar's room, the nearest valid spot to the altar, overlapping no delver.
- [ ] A burned altar refuses later interacts with `altar_burned`; two burns queued in one tick summon one Vorsk.
- [ ] The tome stays carried after its taker dies or escapes, and the burn still works for another delver.
- [ ] A Vorsk kill always drops 3 or 4 items on the boss row's source and split; a blood demon kill still drops 2 or 3.
- [ ] `fabledChanceFor`: Vorsk 0.003 x floor factor on floors 1 and 9; Daa'gon unchanged; a blood demon (and any other boss) 0 on floors 1-5 and 0.002 x floor factor on 6+; elites unchanged.
- [ ] `make test` and `make lint` / `make check` green in game-service.

### Client (vitest)

- [ ] `interactNotice` writes the R24 lines for `tome_taken` and `altar_without_tome` in the `waiting` tone, and nothing for `altar_burned`.
- [ ] A pure "burn heard" check is true only when the previous state's altar was unburned and the incoming is burned; a first state is the baseline.
- [ ] E at an unburned altar with `tome_carried` opens the "Burn tome?" confirm and sends nothing; Burn sends one interact for the altar; Not yet sends nothing; without `tome_carried` E sends the interact at once.
- [ ] A burned altar is not an E target; a listed tome is.
- [ ] The tome and altar draw from their sheets at their positions; the altar's frame follows `burned`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

### Art

- [ ] The tome and the altar's two states are baked from code in `tools/bake`, with colours from `BARROW` tokens, and a contact sheet is attached for the owner's gate.

## Edge States

- **No tome this run (98%)**: nothing changes anywhere; no altar, no keys on the wire.
- **Tome never found**: it vanishes with its floor on the climb; the altar still stands above, and E there gives the lore line.
- **Party never reaches the altar's floor** (all dead, all escaped, or the run ends): nothing happens.
- **Party climbs past the altar's floor carrying the tome**: the altar is gone with its floor; `tome_carried` stays true until the run ends, harmlessly **(charter default: clearing it buys nothing)**.
- **Tome taker dies, disconnects or escapes**: run-level state; the party still carries it.
- **Every delver gone but one**: that one can still burn it.
- **Two delvers reach the tome at once**: interacts apply in order on the tick; the second finds no entity and is refused as any vanished target is.
- **Two delvers burn at once**: one Vorsk; the second gets `altar_burned`.
- **A blood demon on the altar's floor**: both fight; accepted.
- **Burn on a height-10 run's floor 9**: Vorsk, then Daa'gon above; the "double boss" the owner wants.
- **No free spot near the altar**: the floor's farthest valid spot, relaxed; logged loudly if even that fails (Vorsk then does not appear and the altar is still burned).
- **Floor generation fallback on the tome's or altar's floor**: neither placed there, warning logged; a carried tome then has no altar.
- **Reconnect after the burn**: the first state is the baseline; no "sound from hell".
- **Reconnect while carrying**: `tome_carried` comes back with the next state; the confirm works.
- **Interest cut**: a tome beyond every interest centre is not sent; it appears as the party nears it, as a container does.
- **The leak**: an altar says "not the top floor"; a tome on floor f says "at least f + 2 floors". Accepted at scoping (1 run in 50).

## Out of Scope

- **The top floor's boss**: the champion replacing the Demon, and the blood demon's room rule after it, are FS-C8VM7's.
- **Going down a floor, revisiting a floor**: rejected at scoping (floors regenerate in place, FS-F6F88; a bounce could farm the tome or the boss).
- **The tome as an item**: no bag slot, no tooltip, no extraction, no sale, no tome icon in the HUD.
- **A minimap or fog marker** for the tome or the altar.
- **Any change to Vorsk's stats, moves, level rule or XP**, or to the blood demon's and Daa'gon's spawn.
- **Renaming the `demon` archetype code**, its art keys or its sheet.
- **Moving Vorsk's art group** (the `boss` group the run scene holds). If FS-C8VM7's per-pool loading takes `boss` out of the run scene's set, Vorsk's sheet then needs an on-demand row (an ADR-0071 table change), which is that change's to make.
- **Kill or match stats**, migrations, HTTP contract changes, `internal/matchmaker` and `internal/match_queue`.
- **The dev endgame test run** forcing a tome and an altar onto fixed floors, and Vorsk's level there: FS-BDRTJ's (I-BDRTJ-4), which sets this FS's run-level plan (R7) in place of the roll and reads the summon's level hook (R18).
- **CONTEXT.md entries** for Vorsk, the Tome of Filth, the Altar of Consecration and burning: routed to `domain-model` (a sibling owns vocabulary this session).

## Amendment A1 2026-11-14 (the lines are lore lines, FS-XWHZP)

**Why.** The owner's override, 2026-11-14, during this charter run: R24 had defaulted the tome's
lines to the plain HUD notice; the owner wanted "in-game story pop up visual vibe lore thing"
instead, then widened it to every Spire message, which became
[FS-XWHZP](XWHZP-spire-messages-as-lore-lines.md). This amendment replaces the text of R24 and
R26 and the client criteria that name their tones; the rest of §I stands. Built as I-3103M-7,
on FS-XWHZP's lore module.

- **R24, amended.** The tome pickup and altar-without-tome lines are **FS-XWHZP lore lines** in
  the `lore` tone, not the HUD notice, written by the client from the reply's `reason` through
  FS-XWHZP's copy table (its R16): `tome_taken` → *"Wonder if I can burn it."* (owner's words);
  `altar_without_tome` → *"A tome was burned here once, they say, to insult a demon."*;
  `altar_burned` → no line. The `waiting` tone and the charter default that chose it are
  withdrawn.
- **R26, amended.** The hell line, *"You hear a sound from hell"* (owner's words), is an FS-XWHZP
  lore line in the `dread` tone (its ember burst and slight tremor), played on the same
  unburned-to-burned flip with the same first-broadcast baseline, not the HUD notice in the
  `refused` tone. Who sees which line is unchanged: the taker alone for `tome_taken` (R13), the
  one who reached the altar for `altar_without_tome` (R16), everyone on the floor for the hell
  line (R26).
- **Client acceptance criteria, amended.** "`interactNotice` writes the R24 lines … in the
  `waiting` tone" reads: FS-XWHZP's copy gives R24's lines for `tome_taken` and
  `altar_without_tome` in the `lore` tone and nothing for `altar_burned`, and the run scene plays
  them as lore lines. Add: the burn flip plays the hell line as a `dread` lore line, not a HUD
  notice.
- **Blocked by.** I-3103M-7 now also waits on FS-XWHZP's lore module and copy.
