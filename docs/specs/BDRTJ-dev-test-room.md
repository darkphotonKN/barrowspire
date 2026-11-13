# FS-BDRTJ: Dev test room

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Field worlds" and `game-client/SPECIFICATION.md` "### Dev tooling" → this FS · Related ADRs: [ADR-0030](../adr/0030-field-worlds-are-per-replica-channels-entered-by-a-local-world-switch.md) (field channels), [ADR-0031](../adr/0031-field-visits-settle-as-match-ended-with-a-world-type-consumers-skip-fields.md) (visit settlement, which this room skips) · Builds on: [FS-X2F2H](X2F2H-field-worlds-and-gentle-meadows.md), [FS-0XMCP](0XMCP-hub-destination-gates.md) · Surface: game-service and game-client only

Scoped 2026-11-07 under a charter. Every decision here is a *charter default*, locked with the user before writing, except the notes marked *(from code)*, which record what reading the code showed the decisions need. Throwaway-grade dev tool: no polish.

## Summary

A dev-only field world where a developer tries a build against enemies by feel. They walk in through a hub gate, dress from chests of top gear at level 20, hit enemies that stand still and come back, and walk out with their real character exactly as it was. It never reaches players.

## Requirements

**Guards**

1. Server: on only when `strings.EqualFold(environment, "development")`, using `environment` from `cmd/server/main.go` (default `"production"`). No new env var, and not the lookup in `config/routes.go`, whose default is `"development"`. Unset, a typo and `production` are all off. It reaches the server as a boot option whose zero value is off (`SetupRouter` takes the bool from `main`).
2. Client: on only when `process.env.NODE_ENV !== "production"`, with no override.
3. Server off: no room built, no gate in the hub, `enter_field` answers `unknown_field`. Client off: a dev gate in a hub's state is ignored, with no label and no `enter_field` *(from code: a production-built client can meet a server that is on)*.

**Entry**

4. A new `GateDestination` `dev_test_room`, on a hub gate at about (120, 900), arrival (260, 900): clear of every wall, NPC and resident region. It reuses the field gate walk-in. It is added only when on, and kept out of `hubGates` *(from code: that table feeds the golden and lane tests)*.
5. A plain text label stands at the gate so it can be found. The field-name sign is not used for it *(from code: `signpostOf` picks the nearest signpost at any distance, which here is the Forest's)*.

**Room**

6. A field `dev_test_room`, 900x600, in the Meadows look, entrance (40, 300), arrival (180, 300). Registered only when on.
7. Its place has an empty layout, no creature table, `DropFactor` 0 and no `ChestRestockDelay` *(from code: a delay would make `restockFieldChests` wipe the chests; an empty layout leaves `fieldPopulation` holding nothing)*.

**Character**

8. Seated at `progression.MaxLevel` (20), on the room's body only. The level is set on the copy of the character passed to `SeatVisitor`. The real character and the record are untouched.
9. Entering makes no items-service call: no gear checkout, real gear left behind, the body starts naked. `SeatVisitor` gets an empty, non-nil loadout *(from code: a nil one is refused as `ErrNoLoadout`)*.

**Leaving**

10. `settleVisit` returns at once for this field: no outbox write, no XP or item write, no `ApplyRunProgress`. This is what keeps test items from ever reaching inventory.

**Items**

11. A fixed list in code, built with `CreateItemEntity`, with no rolls, no instance ids, in ECS memory only: top-tier weapons and armor at max affix values, rings, and all six uniques (`knownUniqueEffects`). Values are copied from `items-service/migrations/000024_catalogue_tiers_rings_and_uniques.up.sql` and the loot tuning; items-service itself does not change.
12. They stand in pre-opened chests (`IsOpen` and `HasBeenOpened` true, so nothing rolls), one each for weapons, armor, rings and uniques, near the arrival point.
13. A taken item reappears in its chest 2s later. The channel never shuts down.

**Enemies**

14. Level 20 Troll, elite Troll and Demon boss in the middle of the room, about (450, 150), (450, 450), (450, 300).
15. Each has its Velocity component removed at spawn. `MonsterAISystem` already skips those, so they never move or strike, and `resolveCollision` ignores them, so they can be walked through. No system changes.
16. 2s after death: the corpse is removed and a new one spawned the same way *(from code: this is ahead of `MonsterCorpseLifetime`, 4s; a corpse already gone is not an error)*. One call in `step` in `session.go`; the rest in a new file.
17. No drops. XP earned is discarded with the visit (`gainExperience` never lowers a level, so a body at 20 stays at 20).

## User Stories

1. As a developer, I want a gate in my dev hub, so that I can reach the room without any setup.
2. As a developer, I want every top item at hand at level 20, so that I can try any build at once.
3. As a developer, I want enemies that stand still and come back, so that I can keep hitting them and judge the build by feel.
4. As a developer, I want to leave with my real character unchanged, so that testing never touches my progress or inventory.
5. As a player, I never see this room, so that test gear cannot reach the game.

## Acceptance Criteria

- [ ] Off (unset, `production`, a typo): no room, no hub gate, `enter_field` answers `unknown_field`.
- [ ] On (`development`, `DEVELOPMENT`): the gate is in the hub state and walking in enters the room.
- [ ] Entering makes no items-service call, and the body is level 20 and naked.
- [ ] Every way out (leave, disconnect, leave_hub, enter_hub, normal close, and an entry aborted after seating) publishes no field visit and applies no progress. The record keeps its real level, XP and gear.
- [ ] The three enemies never move or strike, and can be walked through.
- [ ] A killed enemy is replaced 2s later, with no drop.
- [ ] Each listed item is in its chest with nothing rolled, and a taken one is back 2s later.
- [ ] No files change outside game-service and game-client.
- [ ] Client on: the label shows, the gate enters the room, and the room draws at 900x600 in the Meadows look with Troll and Demon art.
- [ ] Client with `production`: no label, and no `enter_field` from the gate.

## Edge States

- **Disconnect or leave mid-room:** the visit ends the usual way, unsettled. Worn items leave with the body and the chests are unaffected.
- **Two developers in one channel:** they share enemies and chests. A taken item restocks for the next one.
- **Items dropped on the ground:** they stay in memory in this channel until the pod restarts.
- **Server off, client on:** the hub state carries no gate, so nothing shows.

## Out of Scope

DPS meter, keybind, randomizing, polish, agent playtesting. Any change to items-service, character-service, proto, migrations, deploy manifests, the combat, gear or monster systems, or the matchmaker.

## Change: Endgame test run
Status: work-order
Date: 2026-11-14

Owner request at the [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md) /
[FS-3103M](3103M-vorsk-summoned-by-tome-and-altar.md) charter (2026-11-14), for trying the endgame
those two add. Promoted `--from-thread`: the thread is the section's locked scoping notes, all
decisions the owner's, and the owner approved the charter up front, so no interview was held.
Marked **(charter default)**: the owner's approved defaults from the notes, and the smaller-v1
answer to every question the notes left open, each with its reason. Marked *(from code)*: what
reading the code at `8812744c` showed the decisions need.

The owner's words, which bound everything below: the run "is not randomized in terms of enemy
spawns and levels, so save the work by fixing what that session has in its entities. However do
keep the logic and randomness there for item drops, and unlike the dev test room I can keep the
items if they leave there - it's hidden in prod anyways." "Level 6 to 10" means Spire floors 6 to
10.

Locked (owner):

- **L1.** A fresh endgame Spire run, dev-only behind this FS's guards (R1-R3). Hidden in prod.
- **L2.** It guarantees the tome, the altar and Dark Warriors, and climbs from floor 6 to floor 10.
- **L3.** Same code, no new systems: the run uses the Spire's floor build, monsters, tome and altar
  as they ship. Only what the session spawns is fixed by hand: no pool draw, no height roll, no
  level spread.
- **L4.** Item drops keep their random logic: kill drops, chests, Fabled rates.
- **L5.** Unlike the test room, it settles as a normal run: items carried out are kept.

Found in the code:

- **C1** *(from code)*. A run of one is made today without the queue or the matchmaker:
  `start_solo` (FS-NSV3D) runs its guards in `messageHub.Run` and calls
  `Server.CreateGameSession` directly. Its one queue touch is a read through the existing
  `QueueManager` interface (`Server.IsQueued`). So this run needs no change to
  `internal/matchmaker` or `internal/match_queue`, and makes none.
- **C2** *(from code)*. A run's height is rolled in `Session.InitialSystems`
  (`rollSpireHeight`), and its first floor is the constant `firstFloor` (1), set in
  `CreateMatchProgressEntity` and built by `InitialMapObjects`. Everything keyed on the floor
  number (floor look, floor factor, Fabled from floor 6, the monster level step) reads
  `FloorComponent.Depth`, so a run whose first floor is 6 gets floor 6's behaviour with no change
  to any of them.
- **C3** *(from code)*. A seated body's level and XP are written back to the record at the end
  (`ApplyRunProgress`, `Seated`), so a body seated above its real level would raise the record.
  The test room's level-20 seat (R8) cannot carry over to a run that settles.

### Requirements

**Guards and entry**

18. **Same guards as the room.** The run's gate and action exist only when the room's server
    guard is on (R1, the same boot option, `WithDevTestRoom`), and the client acts on the gate
    only when the room's client guard is on (R2). No new flag or env var.
19. **A second dev hub gate**, destination `dev_endgame_run`, at about (160, 720), arrival
    (300, 720): beside the room's gate, its range overlapping no other gate's, its arrival outside
    every gate's range, and clear of every wall, NPC and resident region. Added at boot only when
    on, and kept out of `hubGates`, as the room's gate is (R4). **(charter default: the notes'
    "beside the test room's"; the point is 184 px from both the room's gate and the Forest's,
    more than two gate ranges, 160.)**
20. **A plain text label** reading "Endgame Test Run" stands at the gate, as the room's does (R5).
21. **Walking into the gate starts the run.** Stepping in sends one `start_dev_endgame_run`, with
    an empty payload, and nothing more until it is answered by `world_entered` or a refusal, as
    `start_solo` is. No dialogue. **(charter default: the field gates' walk-in, R4; a door panel
    would be a second UI for a dev tool.)**
22. **The server runs `start_solo`'s guards, in its order** (FS-NSV3D R8-R12), with one change:
    the player must stand at this gate, not the Spire's. No character in play, in a party (a
    party of one included), queued, or away from the gate: refused in `start_solo`'s words
    (`Walk to the gate first.` for the gate). Already in a run: resumed into it. Unreadable gear:
    refused `loadout_unavailable`, as `start_solo` is (`checkGear`). **(charter default: solo
    only, the notes' "a solo run of the entering character".)**
23. **Off.** Server off: no gate in the hub state, and `start_dev_endgame_run` is answered as any
    unknown action is (`Unknown action`), with no run made. Client off (`production` build): a
    `dev_endgame_run` gate in the hub state is ignored, with no label and no message sent.

**The run**

24. **An ordinary run.** World type `run`, built by the Spire's code as any run is: the dungeon
    generator, room roles, guarded chests, stairs, monster AI, kill drops, chests, the floor
    factor and Fabled rates, the champion and Daa'gon rules (FS-C8VM7, FS-M8CSE), the tome and the
    altar (FS-3103M). Nothing here is a new system: the run differs from a Spire run only in the
    fixed plan below.
25. **One fixed plan, in code.** The plan is one table in a new file beside
    `dev_test_room.go`, read by the session in place of its rolls. It fixes exactly:
    - **height 10**, in place of `rollSpireHeight`;
    - **first floor 6**, in place of `firstFloor`, so the run climbs floors 6, 7, 8, 9, 10 and
      floor 10 is its top;
    - **each floor's pool** (R26), in place of FS-C8VM7's draw;
    - **each floor's monster level** (R27), in place of the party level, the floor offset and the
      spread;
    - **the tome on floor 6 and the altar on floor 8** (R29), in place of FS-3103M's 2% roll and
      its floor rolls;
    - **no Blood Demon** on any floor, in place of its chance (FS-VHGE7). **(charter default:
      the owner's "not randomized in terms of enemy spawns"; a rolled boss is a random spawn,
      and none was asked for.)**

    Changing the plan is `Tunes FS-BDRTJ`: this requirement names it.
26. **Pools.** Each floor's pool of 5 is fixed, named by family and FS-C8VM7 tier (the 26+
    variant unless noted), and holds at least one brute and two fodder as every pool must:

    | Floor | Brutes | Fodder | Ranged |
    |---|---|---|---|
    | 6 | Dark Warrior, Troll family (Blood Troll) | Ghoul family (Ravener), Thrall family (Blightborn) | Skeleton family (Wight Archer) |
    | 7 | Dark Warrior, Ogre family (Ogre Tyrant) | Ghost family (Banshee), Goblin family (Goblin Warchief) | Skeleton family (Wight Archer) |
    | 8 | Dark Warrior, Dark Reaper | Ghoul family (Ravener), Ghost family (Banshee) | Skeleton family (Wight Archer) |
    | 9 | Dark Warrior, Troll family (Blood Troll) | Thrall family (Blightborn), Goblin family (Goblin Warchief) | Skeleton family (Wight Archer) |
    | 10 | Dark Warrior, Dark Reaper, Ogre family (Ogre Tyrant) | Ghoul family (Ravener), Ghost family (Banshee) | none |

    Every 26+ variant appears on at least one floor, so one climb shows every new ability.
    Floor 10's pool has no ranged member, so its archer slots stay fodder (FS-C8VM7). Variant
    names follow FS-C8VM7's roster; a rename there carries here. **(charter default: the notes
    fix the pools without naming them; this is the smallest table that guarantees Dark Warriors
    on every floor and shows every variant once.)**
27. **Levels.** Every standard monster on floor N is level 20 + N, with no spread: 26 on floor 6
    up to 30 on floor 10. Elites and treasure guards stand at that level too. Daa'gon on floor
    10 is 35 (the floor's level + its flat 5, FS-M8CSE R25). Vorsk, when summoned, is the altar
    floor's level + 2, 30 (FS-3103M). Item level follows the kill's level as shipped. **(charter
    default: the notes' "deep-endgame (26-30)"; 20 + N is the top of a level-20 party's range on
    floor N, party + (N - 1) + 1. Vorsk and Daa'gon keep their own rules' bonus over the
    floor's level, read from the plan instead of the party.)**
28. **Dark Warriors on every floor.** At least one Dark Warrior-family monster stands on every
    floor, and never more than FS-C8VM7's cap (1 per 12 monsters, at most 4). The rest of the
    floor's population (how many, which room, which role, elite or not) is FS-C8VM7's and
    FS-KE075's, drawn from the fixed pool as shipped. **(charter default: the notes'
    "Dark Warriors on every floor, within the cap"; counts, placement and the elite roll are not
    "spawns and levels", and fixing them would be new code.)**
29. **Tome and altar.** The run is a tome run: the tome lies on floor 6 and the altar stands on
    floor 8, set directly in FS-3103M's run-level plan (its R7) in place of `TomeRunChance` and
    its floor draws (its R5, R6), and each placed in its floor by FS-3103M's own placement (a
    random non-start room). Picking up, the lore lines, burning and Vorsk are FS-3103M's, unchanged.
    **(charter default: the notes' "tome on floor 6, altar on floor 8"; it meets FS-3103M's
    rules, tome below altar below the top, at height 10.)**
30. **Bosses.** Floor 10, the top of a height-10 run, holds Daa'gon and no champion
    (FS-C8VM7, FS-M8CSE R24). No other boss stands unless the tome is burned.

**The character and the end**

31. **The real character, real gear.** The body is the entering character at their own level,
    seated with their worn gear checked out as any run's (`CheckOutRunGear`). No level override
    and no test gear. **(charter default: C3; a level-20 seat would write level 20 to the record
    when the run settles. A developer who wants level 20 enters with a level-20 character.)**
32. **It settles as a normal run.** Every way a run ends (escape, death, leave_run, forfeit,
    disconnect past the grace, the run closing) settles as it does for any run: `match.ended`,
    extracted items reach the character, XP and level are applied. Nothing in `settleVisit` or
    the run's settlement checks for this run. **(owner, L5: "I can keep the items if they leave
    there".)**
33. **Drops are random as shipped.** Kill drops, chest rolls, the floor factor and the Fabled
    rates (floor 6+ for elites, guarded chests, champions; any floor for Vorsk; Daa'gon's) are
    the shipped logic, untouched by the plan. **(owner, L4.)**

**Bounds**

34. Server work is in game-service only; client work in game-client only. No change to
    `internal/matchmaker`, `internal/match_queue` or their wiring, items-service,
    character-service, proto, migrations or deploy manifests, and no new env var. **(owner: the
    matchmaker and queue are the owner's hand-coded work in progress.)**
35. In `session.go` only the sites C2 names change (`InitialSystems`, `InitialMapObjects` and
    the population call), each reading the plan when the session has one; a session without a
    plan behaves exactly as today.

### User Stories

6. As a developer, I want a dev gate that drops me on floor 6 of a 10-floor run, so that I can try
   the endgame without climbing five floors or rolling a height of 10.
7. As a developer, I want the tome and the altar guaranteed, so that I can try summoning Vorsk on
   every run instead of one in fifty.
8. As a developer, I want Dark Warriors on every floor, so that I can judge the deep-endgame
   brute without hunting for it.
9. As a developer, I want each floor's enemies and levels fixed, so that two runs are comparable
   and I can tell a change in my build from a change in the roll.
10. As a developer, I want every new 26+ variant somewhere in one climb, so that I can see every
    new ability in one run.
11. As a developer, I want drops to roll as they ship, so that what I find tells me how the loot
    feels at that depth.
12. As a developer, I want to keep what I carry out, so that a good find can be tried in the test
    room or a later run.
13. As a developer, I want the run to use the Spire's own code, so that what I see is what players
    will meet.
14. As a developer, I want my party and queue state guarded as at the Spire's door, so that the
    dev gate never makes a run the real entry would refuse.
15. As a player, I never see this gate or reach this run, so that a fixed endgame cannot be farmed.

### Acceptance Criteria

- [ ] Off (unset, `production`, a typo): no `dev_endgame_run` gate in the hub state, and
  `start_dev_endgame_run` is answered `Unknown action` with no session made.
- [ ] On: the gate stands at about (160, 720), outside every other gate's range, clear of every
  wall, NPC and resident region, and is not in `hubGates`.
- [ ] On, a solo character with readable gear at the gate: `start_dev_endgame_run` makes one run
  session, seats them with their checked-out gear at their own level, and answers
  `world_entered`. No matchmaker or queue write happens.
- [ ] Refused in `start_solo`'s words: no character, in a party (of one included), queued, away
  from the gate. Unreadable gear refused `loadout_unavailable`. Already in a run: resumed.
- [ ] The run's height is 10 and its first floor is 6; climbing goes 6 → 7 → 8 → 9 → 10; floor 10
  has no stairs and holds Daa'gon at level 35 and no champion.
- [ ] On each floor every standard monster is from that floor's fixed pool (R26) at level
  20 + floor, with no spread; at least one Dark Warrior-family monster stands; no Blood Demon.
- [ ] The tome is on floor 6 and the altar on floor 8; burning the tome there summons Vorsk at 30.
- [ ] Drops roll as shipped: kills, chests and Fabled go through the shipped loot rolls on the
  session's own randomness, and the plan holds no drop, chest or Fabled input.
- [ ] Escaping with an item: `match.ended` is published and the item reaches the character, as for
  any run.
- [ ] A Spire run made through the Spire's door is unchanged: height rolled, floor 1 first, pools
  drawn, levels spread, Blood Demon chance, tome at 2%.
- [ ] No change to `internal/matchmaker`, `internal/match_queue`, items-service,
  character-service, proto, migrations or deploy manifests.
- [ ] Client on: the label shows at the gate, stepping in sends one `start_dev_endgame_run`, and
  `world_entered` takes the player into the run as `start_solo`'s does. A refusal is said the way
  a refused field entry is (`notice`), and the gate can be tried again.
- [ ] Client `production`: no label, and stepping onto the gate sends nothing.
- [ ] The dev gate is never treated as a field gate: no field sign, no `enter_field`.

### Edge States

- **Death in the run:** settles as any run's death (R32): what the rules take is lost, real gear
  included. Accepted: hidden in prod, and the developer chose the character.
- **A low-level character:** enters, and meets level 26-30 monsters. Not refused: the gate is a
  dev tool.
- **XP:** kills at 26-30 give XP as shipped and it reaches the record; the level never passes the
  cap (20).
- **Disconnect and reconnect:** the run is an ordinary run; the grace and resume are the run's.
- **Tome not picked up:** the altar still stands on floor 8 and gives its lore line, as in any tome
  run (FS-3103M).
- **Generation failure on a floor:** the floor of buildings fallback (FS-M8CSE R15) with the
  plan's pool and levels; its tome or altar is placed as FS-3103M places them there.
- **Two developers:** each gets their own run; the gate makes runs of one only.
- **Server on, client production:** the gate is in the hub state but the client ignores it; no
  run can be started from that client.
- **The plan names a variant FS-C8VM7 does not build:** a build-time failure in the plan's test,
  never a run with a missing monster.

### Out of Scope

- Parties, the queue, or a party run through this gate.
- Choosing a floor, a height, a pool or levels from the client; any UI beyond the label.
- A level override or test gear in the run (the test room has them).
- Fixing layouts, room choice, monster counts, placement or the elite roll.
- Any change to drops, the tome and altar flow, Vorsk, Daa'gon, champions or the pools' draw
  for ordinary runs.
- Any change to `internal/matchmaker`, `internal/match_queue`, items-service, character-service,
  proto, migrations, deploy manifests.
