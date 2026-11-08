# FS-VHGE7: Blood demon and the demons' fire claw

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Enemies" (blood demon boss · demon fire claw); `game-client/SPECIFICATION.md` "### Presentation" (blood demon boss look · demon fire claw look) → this FS · Builds on: [FS-77AB6](77AB6-monsters-and-combat.md) (the demon boss, monster AI, strikes), [FS-Q14EV](Q14EV-expanded-baked-enemy-roster.md) §B (the demon rig and sheet), [FS-KE075](KE075-floor-1-dungeon.md) §C (dungeon rooms and the demon's room), [FS-F6F88](F6F88-multi-floor-delves.md) (run floors), [FS-KYPQ9](KYPQ9-remainder-restyle-town-dressing-and-effects.md) (effects table), [FS-C4JWH](C4JWH-scene-scoped-art-loading.md) (scene art table, eviction; §F amends its §A R4 run row and §B R9 for the blood demon's group only) · Amended 2026-11-08, A1 (§F: the blood demon's art on demand) · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (colours from `BARROW` only), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored in code, contact-sheet gate), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (atlas groups), [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md) (the blood demon's group, on demand; amends ADR-0059), [ADR-0062](../adr/0062-monsters-path-on-the-floor-cell-grid-with-a-star.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Bosses" · Art: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) "Enemy design language"

> Promoted `--from-thread` on 2026-11-08 from the coordinator's locked decisions under the owner's
> charter. There was no interview. Markers: **[owner decision]** is the owner's own words or
> confirmation. **[charter default]** is a default the owner approved in the charter; its reason is
> given. **[agent default]** is a gap the charter left open, filled at promotion with the smaller
> v1 and open to override. *Starting value* means a tuning knob, expected to move in play. Code
> citations are against `165d6dfb`.

## Summary

The Spire gets a second, rarer boss: the **Blood Demon**, a red, horned, bat-winged infernal that
can turn up on any run floor at low odds that climb with the floor. It is tougher than the green
demon, and the two can meet on the top floor. Both demons also learn a second move, the **fire
claw**: a fast swipe with no wind-up that hits as hard as the slam did, while the roaring slam, now
rationed by a cooldown, hits twice as hard.

## Requirements

### A. The blood demon spawns (game-service)

1. **Archetype.** A new archetype value `blood_demon` on the existing archetype string
   (`components.MonsterArchetype`, `internal/components/monster.go:10`; on the wire
   `MonsterState.archetype`, `internal/types/game.go:342`). It is a value, not a field. No
   protobuf carries monsters; game state is JSON over the socket, and FS-5QC03 (compression) is a
   draft with nothing built, so nothing is regenerated. [charter default: a value on the existing
   field is inside Bounds]
2. **Name.** Its server-authored name is `Blood Demon`. [owner decision, D2]
3. **Stat sheet.** A `monsterSheets` row (`internal/game/monster_tuning.go:224`): HP 1600, damage
   34. Every other field is the green demon's: attack interval 1.6 s, wind-up 0.8 s, attack range
   75, move speed 120, defense 15, magic resistance 15, aggro radius 320, leash radius 700.
   *Starting values.* [charter default D5: rarer, so it should hurt] [agent default for the
   unnamed fields: same as the green demon, which also keeps the client's `BOSS_AGGRO_PX` /
   `BOSS_LEASH_PX` (`game-client/src/render/creatures/targetPick.ts:35,43`) true for both bosses]
4. **Level.** Party level + the floor's offset + `BloodDemonLevelBonus` 3, with no spread, the way
   `demonLevel` (`monster_tuning.go:341`) does it with +2. *Starting value.* [charter default D5]
5. **Boss, never elite.** It spawns with `Boss: true` and is never promoted. At most one per floor.
6. **Odds.** On every run floor, an independent roll against a per-floor table in
   `monster_tuning.go`: floor 1 = 0.02, floor 2 = 0.05, floor 3 = 0.10. *Starting values.* The roll
   is independent of the green demon's. A floor past the table's last row uses the last row, so
   raising `RunFloorCount` never quietly removes it. It is never guaranteed on any floor. Over a
   three-floor run, about 16% of runs meet one. [charter default D3] [agent default: past-the-end
   uses the last row]
7. **The green demon is unchanged.** Still guaranteed on the top floor and at `DemonChance` 0.01
   below (`monster_population.go:133-145`). With both, about 10% of runs have both bosses on the
   top floor. [charter default D4] [owner decision: "Both bosses being together at the top is
   possible too"]
8. **Order.** The blood demon is rolled and placed after the green demon's roll and placement, on
   open and dungeon floors alike, so the green demon's draws come first.
9. **Placement on an open floor.** The valid spot farthest from the delvers among the bounded
   sample (`placeFarthest` with `area.valid`, `monster_population.go:358`). It keeps
   `MonsterSpacing` from every placed monster, the green demon included. It gets no relaxed retry:
   it is never guaranteed. With no valid spot it is skipped with a `slog.Warn` naming the session
   and floor. Never an error. [charter default D7]
10. **Placement on a dungeon floor** (FS-KE075 §C). The rooms are ordered farthest from the start
    first, by walking distance, as `placeDungeonDemon` does (`dungeon_population.go:336`). The
    blood demon starts its search at the **second-farthest** room and walks on down the list. It
    never takes the start room or the room the green demon stands in. It takes the first room with
    a valid spot (`area.valid`, no relaxed pass). With none, it is skipped with a `slog.Warn`.
    `placeDungeonDemon` reports the room it used so the blood demon can avoid it. [charter
    default D7: so the two never share a room]
11. **Run floors only.** Field worlds (Forest, Meadows) and the hub never roll it.
    `populateMonsters` already returns outside a run (`monster_population.go:44`), and field
    population is untouched. [charter default D8]
12. **Loot.** A blood demon kill rolls `BossMonsterDrop` (2–3 items, ×4 rarity weight, the
    demon's type split). It does so through `record.Boss` (`monster_drops.go:67`), and
    `MonsterDrops` gains a `blood_demon` row pointing at `BossMonsterDrop`, the way the demon's
    does (`loot_tuning.go:238`). [charter default D6: smaller v1]
13. **Experience.** `killExperienceBase` gains `blood_demon: 35`. The boss multiplier (×10) applies
    as for the demon. *Starting value.* [charter default D5]
14. **Not a guard.** Like the green demon, it is never one of a room's guards
    (`guarded_chests.go:24`). A chest is never waiting on it.

### B. The demons' two moves (game-service)

15. **Two moves, demons only.** The green `demon` and the `blood_demon` each have two moves, the
    **slam** and the **fire claw**. Every other archetype keeps its one strike, unchanged. Which
    archetypes have the claw is data on the sheet, not a check on the archetype in the AI.
16. **The slam** is today's strike: it winds up for 0.8 s (action `attack`), holds still, and lands
    if the target is within range × 1.25 when the wind-up ends (`monster_ai.go:186-213`). Its
    damage **doubles**: 2 × the demon's level damage, through a `SlamDamageMultiplier` of 2. At
    level 1 that is green 56 and blood 68. [owner decision F2]
17. **The fire claw** has no wind-up. When it is chosen, it lands that same tick on the target in
    range, for 1 × the demon's level damage: green 28 and blood 34 at level 1. [owner decision F1]
18. **Choosing a move.** When a demon is in range of its target and its attack cooldown has run
    out, it slams if its slam cooldown has run out, and claws otherwise. Either move sets the
    attack cooldown to the attack interval (1.6 s). A slam also sets its slam cooldown to
    `DemonSlamCooldown` 6 s. *Starting value.* [charter default F3: the doubled hit needs
    rationing, or the boss's damage just doubles]
19. **Opening move.** A newly spawned demon's slam is ready, so its first swing is the slam, with
    its roar as the tell. [agent default]
20. **The slam cooldown always runs.** It counts down every tick, whatever the demon is doing
    (wandering, chasing, leashing home). A slam that whiffs, because the target stepped out by the
    end of the wind-up, has still spent its cooldown.
21. **Reach.** Both moves use the attack range that today's strike uses: 75, and the slam's ×1.25
    at landing. [charter default F4]
22. **Parry.** Both moves are monster strikes and are parriable, like every monster strike today
    (`combat.go:183`). The claw has no tell, so in practice only a stance already open catches it.
23. **Fire is presentation.** The claw deals physical damage, mitigated by defense, exactly like
    the slam. No burn, no damage over time, no new damage type. [charter default F5]
24. **Telling the client.** `MonsterState.action` gains one value, `claw`
    (`components.MonsterAction`, `internal/components/monster.go:29`). From the tick a claw lands,
    the demon reports `claw` for `ClawShowFor` 0.4 s and stands still, facing its target. After
    that it does whatever it would otherwise do. `attack` keeps meaning the slam's wind-up and
    strike for a demon, and the one strike for every other archetype. Nothing else on the wire
    changes. [charter default F7: nothing on the wire names the move today; the action field
    carries it as one enum value, no new field] [agent default: the 0.4 s show window, because the
    client changes clip the moment `action` changes (`character.ts:266`), so a claw reported for a
    single tick could be dropped between two render frames and never drawn] *Starting value.*
25. **Death and floor change.** A demon that dies reports `dead`, mid-claw or mid-slam alike (the
    serializer already overrides, `state_serializer.go:731`). Monster death clears its claw show
    as it clears the wind-up (`monster_death.go:60`).

### C. The client draws the blood demon (game-client)

26. **Archetype.** `MonsterArchetype` (`src/types/gameState.ts:275`) gains `"blood_demon"`.
    `MONSTER_LOOKS` (`src/render/creatures/monsters.ts:79`) gains a `blood_demon` look at the
    `boss` size tier.
27. **Placeholder until the bake.** Until its own sheet is baked (§E), the look draws
    `creature_demon_base` under a multiply `tint` from a new `canvasPalette` token in the
    oxblood (hostile) family that cites this FS (ADR-0013: tokens only, no literal). It must read
    as a different boss from the green demon at a glance. [charter default, slicing guidance]
    *(Amended 2026-11-08, A1: this look returns as the stand-in of §F R46, drawn until the blood
    demon's own art is resident.)*
28. **Nameplate and target frame.** The plate reads the server's name, `Blood Demon · Lv N`
    (`nameplate`, `monsters.ts:228`). The target frame and the engaged-boss rule (FS-48CTQ §D)
    treat it as a boss because `boss` is true. They need no archetype check.
29. **Two bosses at once.** With both demons engaged, the frame names whichever the existing rule
    picks: the hovered monster first, then the first engaged boss (`BossEngagement`,
    `targetPick.ts`). No new rule.
30. **Scene art.** The green demon's sheet is in the `boss` group, which the run loads for every
    floor (`sceneArt.ts:39`; FS-C4JWH §B R9). The blood demon's sheet is in its own group, outside
    `boss`, fetched only when a `blood_demon` first appears to the client, as §F says. The
    `dev_test_room` group list is unchanged. [owner decision, 2026-11-08] *(Amended 2026-11-08, A1.
    Was: both demon sheets in the `boss` group, loaded on every floor.)*

### D. The client plays the fire claw (game-client)

31. **Action and clip.** `MonsterAction` (`gameState.ts:286`) gains `"claw"`, `ACTION_CLIPS`
    (`monsters.ts:200`) maps it to a `claw` clip, and `CharacterAnimation`
    (`src/render/art/animationSelect.ts:22`) gains `"claw"`. A sheet that has no `claw` clip plays
    its `attack` clip for it. So the claw is visible before the bake lands, and an archetype
    without one never freezes.
32. **Flame trail and flash.** When a shown monster turns to `claw`, the client plays a flame trail
    swept along the swipe in its facing, plus one brief ember transient light (FS-KYPQ9 §C.1),
    both from a new effects-table entry (`src/render/effects/table.ts`) that cites this FS. The
    entry uses the existing baked fx textures (`fx_ember`, `fx_fire_core`) and `BARROW` tokens from
    the torch-warmth ember family, never amber, which means *interactable*. Duration ≤ 250 ms, no
    shake. *Starting values.* [charter default F5]
33. **One claw, one effect.** The effect plays on the transition into `claw`, not on every tick
    the action stays `claw`. A monster hidden by the dark or the fog plays no effect.
34. **Boss engagement.** `engages` (`targetPick.ts:76`) counts `claw` the way it counts `attack`:
    a claw within the leash radius of a living member engages the boss.

### E. The art (game-client bake)

35. **Guideline amendment first.** `design-guideline.md` "Enemy design language" gains a
    **blood-hide clause (bosses only)**: a dark, desaturated oxblood hide mixed from `BARROW`
    oxblood toward charcoal and umber, never brighter or more saturated than oxblood, and shaded
    off the knight's heraldic oxblood so it is never read as a player's red. Emissives stay ember
    red and must still read against the hide. The amendment also names the fire claw's flame
    trail as a hostile effect in the ember family. It is a rule change, flagged to the owner and
    dated the way the green-hide clause is. [charter default D9; the guideline today allows only a
    green boss hide and forbids "a player's heraldic red"]
36. **The blood demon sheet.** `creature_blood_demon_base`, built in code on the existing demon rig
    (`tools/bake/page/characters/demon.js`) as a variant, the way `eliteBoar` is the boar's. It has
    a red hide recipe in `demonTone.js` (palette tokens only, held by a unit test to the blood-hide
    clause the way `demonTone.test.mjs` holds the green one), heavier horns, and wings larger than
    the green demon's. Its body size is the green demon's: boss tier, at least 1.8× the player.
    It has the same clips as the green demon, plus the claw. [charter default D9] [agent default:
    same body size; it is set apart by hide, horns and wings]
37. **No mirrored skirt.** `clearance.js` `MIRRORED_LEGACY` lists `creature_demon_base` and only
    ever shrinks. The blood demon variant must not inherit `skirt({ mirrored: true })`: it uses
    the current weighting and passes the clearance guard as a new sheet.
38. **The claw clip.** `DEMON_ANIMATIONS` gains `claw: { frames: 5, fps: 12, loop: false }`
    (about 0.42 s, inside the server's 0.4 s show plus one tick). It is a one-arm raking swipe
    across the body, baked in 8 directions for both the green and the blood sheets. *Starting
    values.* [charter default F6]
39. **Original, in code.** The owner's reference (a red, horned, bat-winged demon with a tail) sets
    the mood only. Nothing is traced or copied (ADR-0021).
40. **Contact sheet gate.** Both sheets' contact sheets (the blood demon in full, and the green
    demon's new claw clip) are shown to the owner and approved before the bake merges (ADR-0021).
41. **Switch to the baked sheet.** Once baked, the `blood_demon` look draws
    `creature_blood_demon_base` as baked, with no tint. *(Amended 2026-11-08, A1: the sheet packs
    into its own group (§F R42), and the §C token stays, as the stand-in's tint (§F R46). Was: the
    sheet packs into the `boss` group, and the token is removed if nothing else uses it.)*

### F. The blood demon's art on demand (game-client, amendment A1)

Decided by the owner on 2026-11-08 after the review of the bake slice; the decision and its
reasoning are [ADR-0071](../adr/0071-the-blood-demons-art-is-its-own-group-fetched-on-demand-when-one-first-appears.md).

42. **Its own group.** `creature_blood_demon_base` is packed in an atlas group of its own,
    `blood_demon`, by the `group` of its entry in `tools/bake/page/characters/cast.js`. `boss` holds
    only `creature_demon_base`, its `claw` clip included. No sheet's pixels change, only the packing
    and the manifest. [owner decision] [agent default: the group's name]
43. **The table says so.** `sceneArt.ts` names `blood_demon` as an on-demand scene-scoped group,
    with the archetype that fetches it and the stand-in it draws meanwhile. It counts among the
    scene-scoped groups, so boot does not load it and eviction covers it (a group the table does not
    name is resident, FS-C4JWH §A R3). No scene's `preload()` queues it. [owner decision]
44. **Trigger.** The first game-state snapshot a scene receives that lists a monster of archetype
    `blood_demon` queues every page of the group that is not yet a texture, on that scene's loader,
    while it runs. A monster hidden by the dark or the fog counts: being listed is the trigger. Later
    snapshots queue nothing while the pages are loading or loaded. No wire change, nothing new from
    the server. [charter default: the snapshot already says so]
45. **No bar.** An on-demand load shows no torch bar and no fade, and holds nothing back: the scene
    is already running. [agent default: FS-C4JWH's bar is for entering a world]
46. **Stand-in.** Until the group is resident, a blood demon draws `creature_demon_base` under a
    multiply tint from a `canvasPalette` token in the oxblood (hostile) family that cites this FS
    (ADR-0013: tokens only), the look of R27. It keeps the boss tier, the server's name and the
    target frame, and plays the green sheet's clips, `claw` included. It is never the placeholder
    texture and logs no missing-sheet warning (FS-C4JWH §E R20). A demon is never invisible.
    [charter default]
47. **Registering.** When every page of the group is a texture, its frames and animations are
    registered as a preload's are, and the art library serves its sheet, before any monster is
    re-dressed. Partial arrival changes nothing: a sheet spans the group's pages.
48. **The swap.** Once registered, every blood demon the roster draws is re-dressed on its own
    sprite to `creature_blood_demon_base`, untinted, with a new `CharacterAnimator` (which decides
    `baked` at construction), keeping its position, facing and current action. Its size, crown and
    plate height are read from the new sheet, as for any first draw. The sprite is never destroyed,
    hidden or left without a texture between the two looks, and the swap is one frame to the next.
    A blood demon first drawn after that draws its own sheet directly. [charter default]
49. **Eviction.** FS-C4JWH §C as written: the group is in no scene's preload set, so the next
    scene's completed preload evicts its pages, animations first. Leaving the run frees it. Climbing
    a floor stays in the same scene and keeps it. [charter default]
50. **Stop and failure.** A scene stopped while the pages download calls them off as its preload's
    are (FS-C4JWH § Edge States, `File.resetXHR`), so none lands on the next scene. A page that
    fails leaves the stand-in for the rest of that scene, with one warning, and nothing retries in
    that scene; a later scene that sights one fetches again. [agent default: FS-C4JWH §E R19, the
    game never blocks on art]
51. **`dev_test_room`.** Its preload list stays `creatures, boss`. It meets no blood demon today
    (`sceneArt.test.ts`); the on-demand path lives with the monster roster, which the run and the
    fields share, so one that ever appeared there would be served the same way. [charter default:
    the simplest thing under FS-C4JWH]
52. **Coverage test.** FS-C4JWH §E R21's test accepts a look on an on-demand group only when its
    stand-in lies on a group the scene holds, and fails a look on an on-demand group with no
    stand-in. No scene's preload set may contain an on-demand group.
53. **Cost.** The decoded size is re-measured in a headless browser, FS-C4JWH §F R22's way, on a run
    without a blood demon and after one has appeared, and recorded in § Amendment A1 below.

## User Stories

1. As a delver, I want a rare second boss that can appear on any floor, so that a run can surprise me.
2. As a delver, I want the blood demon to be likelier the higher I climb, so that the top floors feel more dangerous.
3. As a delver, I want to tell the blood demon from the green demon at a glance, by hide, horns and wings, so that I know which fight I'm in.
4. As a delver, I want its nameplate to read "Blood Demon · Lv N", so that I know what it is and how strong.
5. As a delver, I want the blood demon to hit harder and last longer than the green demon, so that its rarity is earned.
6. As a delver, I want a blood demon kill to drop boss loot, so that the fight is worth taking.
7. As a delver, I want a blood demon kill to give more experience than a green demon kill, so that the harder fight pays more.
8. As a delver on the top floor, I want the chance to face both demons at once, so that some runs end in a climactic fight.
9. As a delver in a dungeon, I want the two demons in different rooms, so that I can take them one at a time if I'm careful.
10. As a delver, I want the blood demon never to spawn beside me when I arrive, so that it is found, not sprung on me.
11. As a delver in a field world, I want no blood demon there, so that the fields stay gentle.
12. As a delver, I want the demons' slam to keep its roaring wind-up, so that I can see the big hit coming and step out or parry.
13. As a delver, I want the slam to hurt twice as much as it did, so that dodging it matters.
14. As a delver, I want the slam to come only now and then, so that a demon fight is survivable.
15. As a delver, I want a demon's regular attack to be a quick fire claw, so that standing next to it is never free.
16. As a delver, I want to see the claw land, with a flame trail and a flash, so that I know what just hit me.
17. As a mercenary, I want both demon moves to be parriable, so that my stance still answers a boss.
18. As a delver, I want the claw to be plain damage and leave no burn, so that the fight stays readable in v1.
19. As a delver, I want the target frame to pick up the blood demon when it engages, as it does the green one, so that I can read its health.
20. As a delver facing both demons, I want the frame to show the one I hover, so that I choose which health I read.
21. As a delver in the dark or under fog, I want no flame flash from a demon I cannot see, so that the fog of war is not leaked.
22. As the owner, I want the odds, stats and cooldowns as tuning values in one place, so that balance changes are one-line edits.
23. As the owner, I want the blood demon's art built in code on the demon rig and approved on a contact sheet, so that it meets the art bar and stays ours.
24. As the owner, I want the art rule for a red hide written into the guideline, so that later bosses follow a rule, not a precedent.
25. As a developer, I want a skipped blood demon logged as a warning, never an error, so that the logs show placement failures without paging.
26. As a developer, I want move choice to be sheet data, so that a later boss can get a second move without touching the AI's archetype checks.
27. As a developer, I want the claw on the wire as one `action` value, so that no client parses a new field.
28. As a client developer, I want an unbaked claw to fall back to the attack clip, so that client and server can ship in either order.
29. As a delver on a machine with modest memory, I want a run with no blood demon to hold none of its art, so that a boss most runs never meet costs me nothing.
30. As a delver meeting a blood demon, I want it on screen at once in a blood-red wash, so that a demon is never invisible while its art arrives.
31. As a delver fighting a blood demon, I want it to change to its own look with no flicker or gap, so that the fight is not interrupted.
32. As a delver climbing a floor after meeting one, I want no second download, so that the climb stays one continuous run.
33. As a delver leaving the run, I want its art freed, so that the hub does not carry the cost.
34. As the owner, I want the run's memory re-measured with and without a blood demon, so that I know what this bought.
35. As a developer, I want the on-demand group named in the scene art table and held by the coverage test, so that a look cannot be left with no stand-in.

## Acceptance Criteria

### Server (Go tests next to the code)

- [ ] `blood_demon` is a `MonsterArchetype` with a sheet (HP 1600, damage 34, every other field the green demon's), a `killExperienceBase` row of 35, and a `MonsterDrops` row of `BossMonsterDrop`.
- [ ] A seeded population test shows a blood demon rolled at each floor's table chance (a draw just under the chance spawns one, a draw at or over it does not), independent of the green demon's roll, and never on a draw at or over the chance on the top floor.
- [ ] A floor past the table's end uses the last row.
- [ ] The blood demon's level is party + floor offset + 3, and it spawns with `Boss: true`, `Elite: false`, name `Blood Demon`.
- [ ] On an open floor the blood demon stands clear of the delvers by `MonsterDelverExclusion` and of the green demon by `MonsterSpacing`. With no valid spot it is absent and a warning is logged. The green demon's placement is unchanged by its presence.
- [ ] On a dungeon floor the blood demon is never in the start room or the green demon's room. With both present it starts its search at the second-farthest room. With no valid room it is absent with a warning.
- [ ] Field worlds and the hub never contain a `blood_demon`.
- [ ] Killing a blood demon drops 2–3 items from the boss row and awards base 35 × level growth × the boss multiplier.
- [ ] A demon in range with its slam ready slams (`attack` through the 0.8 s wind-up) and lands 2 × its level damage. With its slam cooling down it claws, landing 1 × its level damage the same tick and reporting `claw` for 0.4 s while standing still.
- [ ] After a slam the next slam is not chosen for 6 s, and claws fill the 1.6 s swings in between. A whiffed slam still spends the cooldown.
- [ ] A freshly spawned demon's first swing is a slam.
- [ ] Ghoul, troll, boar, zombie and ghost strikes are unchanged: no `claw`, no multiplier, no slam cooldown.
- [ ] Both demon moves are negated by an open parry stance, like any monster strike.
- [ ] A demon killed mid-claw reports `dead`.
- [ ] `go test ./...` and lint pass in game-service.

### Client (vitest)

- [ ] `monsterLook("blood_demon")` is boss tier. Until its group is resident it draws `creature_demon_base` with the new oxblood-family token tint, and once resident `creature_blood_demon_base` untinted.
- [ ] The run's scene-art test lists `blood_demon` among the run's archetypes. Its sheet is in the `blood_demon` group, the on-demand group is in no scene's preload set and is scene-scoped, and the coverage test fails a look on an on-demand group with no stand-in on a group its scene holds.
- [ ] The first snapshot listing a `blood_demon` queues the group's pages once, a hidden one included. Later snapshots queue nothing, and a snapshot without one queues nothing.
- [ ] A blood demon is drawn from the first frame it is listed, as the stand-in, with no placeholder texture and no missing-sheet warning.
- [ ] When the group lands, each drawn blood demon is re-dressed on the same sprite, with a new animator and the new sheet's size, and is never destroyed or hidden in between.
- [ ] No bar and no fade shows for the on-demand load.
- [ ] The next scene's completed preload evicts the group's pages and their animations; a climb keeps them.
- [ ] A scene stopped mid-download aborts the pages and no `art:blood_demon` texture lands afterwards. A failed page leaves the stand-in, with one warning.
- [ ] `monsterClip` maps `claw` to the `claw` clip, and to `attack` on a sheet without a `claw` clip.
- [ ] The claw effect entry exists in the effects table with `BARROW` tokens only, duration ≤ 250 ms, and the table test passes. It plays once per transition into `claw` and never for a hidden monster.
- [ ] `engages` is true for a `claw` within the leash radius of a living member.
- [ ] The nameplate reads `Blood Demon · Lv N`.
- [ ] `npm test` and lint pass in game-client.

### Art

- [ ] `design-guideline.md` carries the dated blood-hide clause and the claw-flame line, flagged to the owner.
- [ ] `demonTone.js` carries the blood hide recipe, and a unit test holds it to the clause (tokens only, never brighter than oxblood).
- [ ] `creature_blood_demon_base` is baked in 8 directions with idle, walk, attack, claw and death, at boss tier, and passes the clearance guard without being added to `MIRRORED_LEGACY`.
- [ ] `creature_demon_base` gains the `claw` clip. Its other clips' pixels are unchanged.
- [ ] `creature_blood_demon_base` is on the `blood_demon` group's pages and `boss` holds only `creature_demon_base`, in the rebaked manifest, with no sheet's pixels changed by the move.
- [ ] The run's decoded size is measured in a headless browser with and without a blood demon, and recorded in § Amendment A1.
- [ ] Both contact sheets are approved by the owner before merge.

## Edge States

- **Both demons on one floor.** Both are placed, the green one first. On an open floor both seek
  the far side and may stand within sight of each other, at least `MonsterSpacing` apart. The
  owner allows the two to be fought together.
- **No spot for the blood demon.** Skipped with a warning. The floor is still complete; nothing
  retries.
- **Green demon skipped** (a non-top dungeon floor where it found no room). The blood demon still
  starts at the second-farthest room. No green room to skip.
- **Dungeon with only two rooms** (start + one). The second-farthest room is the start room, which
  is excluded, so the blood demon is skipped with a warning.
- **Party still connecting** (FS-K2HKP R18). The roll and placement run as for any monster, using
  the expected party's level and kept arrival spots.
- **Floor change.** Both demons are cleared with the floor like any monster. Nothing carries over.
- **Target leaves mid-claw show.** The demon finishes its 0.4 s standing still, then chases. The
  claw already landed.
- **Target steps out during the slam wind-up.** It whiffs, as today, and the slam cooldown is
  spent.
- **Demon leashes home with its slam cooling.** The cooldown keeps running, so it may open the
  next fight with a claw.
- **Parry on a claw.** It is negated and grants a parry charge, as any parried monster strike
  does. With no tell, a stance must already be open.
- **Old client, new server.** An unknown `claw` action falls back to the idle clip
  (`ACTION_CLIPS[action] ?? "idle"`), and an unknown `blood_demon` archetype draws as a troll. Both
  ship together, so this lasts only for a stale tab.
- **Client before the bake.** The blood demon is the tinted green sheet, and the claw plays the
  attack clip. Both are correct, just plainer.
- **Hidden demon.** No plate, no frame, no claw effect, per the existing hide rule (FS-9PN7X §C.2,
  FS-SRA9J §D.15).
- **Reconnect.** The roster is rebuilt from the snapshot. A demon mid-`claw` shows the claw clip
  from its start, and no stale effect replays.
- **Blood demon on an open floor.** Every monster is sent, so the fetch starts with the floor's
  first snapshot, long before it is met.
- **Blood demon on a dungeon floor.** Monsters are sent within 1600 px of a recipient
  (`state_serializer.go:643`, FS-KE075 §G), so the fetch starts there, well outside its 320 px aggro
  radius.
- **Slow connection.** The stand-in fights the whole fight. It is still a boss, still named Blood
  Demon, only plainer.
- **It dies before the art lands.** It dies as the stand-in. The pages still land and stay until the
  scene ends; nothing is cancelled for a corpse.
- **Both demons on the floor.** Each draws from the green sheet until the group lands, the blood
  demon under its tint, so they still read as two bosses.
- **Run ends mid-download.** The scene stops, the pages are called off, and the next scene's load
  decides what is held (R50).
- **Reconnect in the same scene.** The group is already in or still loading, so nothing is queued
  twice. A fresh scene fetches again on its first sighting.
- **Second run.** The group was evicted, so it is queued again, usually from the browser's HTTP
  cache. The stand-in shows for that long.

## Amendment A1 2026-11-08 (the blood demon's art on demand)

**Why.** The review of the bake slice found the `boss` group, loaded on every run floor, grown from
122.7 MB to 323.6 MB decoded, which put the run at about 577 MB, above the 473.1 MB load-everything
figure FS-C4JWH was written to avoid. About 16% of runs ever meet a blood demon (R6). ADR-0059
deferred on-demand boss loading "until a 2x boss makes it worth it"; the owner chose to do it now.
Amends R27, R30 and R41, and adds §F. Built as I-VHGE7-7.

**Cost.** Decoded, width × height × 4, in MB. The "today" column is `public/art/manifest.json` as
the bake slice left it. The "after" column is a dry run of the bake's own packer
(`tools/bake/lib/pack.mjs`) on the two demon sheets, which reproduces today's six `boss` pages
exactly when both are in one group. Estimates until I-VHGE7-7 fills in the last column.

| | Before FS-VHGE7 | Today (both in `boss`) | After (estimate) | After (measured, I-VHGE7-7) |
|---|---|---|---|---|
| `boss` group | 122.7 (2 pages) | 323.6 (6 pages) | 143.2 (3 pages) | 143.2 (3 pages) |
| `blood_demon` group | | | 172.8 (4 pages) | 172.8 (4 pages) |
| Run, no blood demon listed | 376.5 (measured, FS-C4JWH) | 577.1 | 396.7 | 396.8 † |
| Run, after one has appeared | | 577.1 | 569.5 | 569.6 † |

† Headless Chrome (playwright-core, SwiftShader, 1280 × 845), our static pages and the real Phaser
4.2.1 texture manager, width × height × 4 of every `art:` texture, through `preloadArt`, `registerArt`
and `onDemandArt` in a harness scene with no backends, so not a logged-in run; the group rows are the
manifest's arithmetic, which these totals match.

Resident groups are 200.0 and `creatures` 53.5. The `boss` group's rise from 122.7 to 143.2 is the
green demon's `claw` clip. A floor with a blood demon stays above 473 MB until the run ends, which
ADR-0071 accepts.

## Out of Scope

- Burn, damage over time, or a fire damage type (F5). A later FS can make the claw ignite.
- Any change to the green demon's spawn rule, odds or placement (D4).
- Blood demons in field worlds or the hub (D8).
- A blood-demon-only loot row, a unique drop, or a different type split (D6).
- New sound, screen shake, or a boss health bar beyond the existing target frame.
- A boss arena, a boss room role, or any change to dungeon generation.
- Any WS message or field other than the `claw` value on `action` and the `blood_demon` value on
  `archetype`.
- `internal/matchmaker` and `internal/match_queue` (owner-held).
- Renaming the green demon or giving it a new sheet beyond the added `claw` clip.
- On-demand loading for the green demon or any group but `blood_demon`; prefetching a group before a monster is listed; a bar or a retry for an on-demand load.
