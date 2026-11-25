# FS-TAGWA: Exploration pace

> Status: work-order · SPECIFICATION.md: none of its own: a change FS spanning several capabilities. It changes "Continuous-velocity movement" (`game-server/game-service/SPECIFICATION.md`, FS-none, its line kept as is) and the stated speeds of [FS-77AB6](77AB6-monsters-and-combat.md), [FS-B4SG9](B4SG9-ranged-monsters-and-the-bone-archer.md), [FS-C8VM7](C8VM7-tiered-enemy-roster-and-floor-pools.md), [FS-4EC7Z](4EC7Z-dungeon-encounters.md), [FS-JTNPR](JTNPR-shadow-shot.md) and [FS-JS7C8](JS7C8-class-run-attack-walk-pointer-facing.md); each carries `## Change: Exploration pace → FS-TAGWA` · Charter: item A of the old-school-crawl charter (2026-11-25; B, smaller rooms, and C, the dodge roll and economy, land after it) · Related ADRs: [ADR-0099](../adr/0099-movement-pace-is-one-scale-on-every-travel-speed-and-never-on-timings.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) "Pace scale"

> Promoted `--from-thread` on 2026-11-25 from the scope-it notes. The owner approved the charter's
> decisions P1–P5 as given; everything else the notes left open is marked **(charter default)** with
> its reason.

## Summary

A run should play like an old first-person dungeon crawl: you walk into a room, take in what is in
it and move on, rather than sprinting through packs. Everything that travels (delvers, monsters,
allies, hub residents, the hound, a pushed block, every projectile) moves at half today's speed,
through one knob the owner can turn. How hard things hit, how long they wind up and how far they
reach stay as they are.

## Requirements

### The knob

1. **One pace scale.** `PaceScale` in `game-server/game-service/common/constants/game.go` is the
   one knob, `0.5`, with a comment saying so. Go's name for the charter's `PACE_SCALE`
   **(charter default: Go naming)**.
2. **Every base travel speed is its full-pace figure times the scale, written where it is
   defined** (`200 * PaceScale`), so a reader sees both today's number and that it is paced
   **(charter default: the literal over a hidden multiply at the spawn, so no reader of a sheet is
   misled and no read point can be missed)**. The classes:
   | Class | Where | Full pace (px/s) | At 0.5 |
   |---|---|---|---|
   | Delver walk | `DefaultSpeed` | 200 | 100 |
   | Hub resident amble | `NPCWanderSpeed` | 60 | 30 |
   | Monster sheets | `monsterSheets` `MoveSpeed` | 75 – 175 | 37.5 – 87.5 |
   | Variant step gain | `VariantStepSpeedGain` | 8 per step | 4 per step |
   | Allies (freed captive, hired cutthroat) | `AllySheets` `MoveSpeed` | 190 | 95 |
   | Monster shots | `boneArrowShot`, `thrownDaggerAbility`, `rockThrowAbility` | 420, 480, 240 | 210, 240, 120 |
   | Delver shots | the attack table's projectile rows | arrow 480, fireball 350, shadow shot 260, triple fireball 360 | 240, 175, 130, 180 |
3. **What follows on its own.** The book hound moves at `DefaultSpeed` (FS-X2CMM R28, "the
   archer's base speed"), a stone block slides at `DefaultSpeed × BlockPushSpeedShare`
   (FS-5FZ4J R19, "half their walk speed"), a split arrow at its row's speed and the Wight Archer's
   volley at the bone arrow's. Each is already stated relative to a scaled speed and needs no edit.
4. **Percentages stay on top.** Worn move speed and its 30 % cap, the passive tree's move and
   projectile speed, the attack pin's walk factor (FS-JS7C8) and the variant gains all apply to the
   paced base as before. Faster monsters stay faster relative to the rest, by the same ratio.
5. **Timings and reach never scale.** Wind-ups, attack intervals, cooldowns, the attack pin's
   0.6 s, ranges, aggro and leash radii, max flights, poison and regen are untouched. So are two
   moves that carry a body over a fixed distance in a fixed time, which are attack timing and reach
   and not travel **(charter default: P4)**: the warrior's charge (180 px in 0.4 s, `dashSpeed`)
   and a monster's pounce (its 0.3 s `LeapTime`).
6. **The hub slows too.** `DefaultSpeed` is every delver's walk in every world, so the hub's walk and
   its residents' amble halve with the run's **(charter default: "one slower baseline for all
   movement"; the hub keeps one walk with the run)**.

### Proof without play

7. **A pin test per class.** A server test lists every class of speed in R2 with its full-pace
   figure and holds each live value to figure × `PaceScale`. Every monster archetype in
   `monsterSheets`, every ally kind and every projectile row of the attack table must have a row in
   it, so a new one added without the scale fails.
8. **The timing table**, with an 80 px cell, at the scale's 0.5 (before is today's full pace):
   | Measure | Before | After |
   |---|---|---|
   | Cross a 4-square room (320 px) | 1.6 s | 3.2 s |
   | Cross an 8-square room (640 px) | 3.2 s | 6.4 s |
   | Cross a 10-square room (800 px) | 4.0 s | 8.0 s |
   | Walk a 12-square corridor (960 px) | 4.8 s | 9.6 s |
   | A 190 px/s mover's gain on a delver (190 vs 200, then 95 vs 100) | −10 px/s | −5 px/s |
   | A delver's arrow over 6 squares (480 px; 480, then 240 px/s) | 1.0 s | 2.0 s |
   | A bone arrow over 6 squares (420, then 210 px/s) | 1.14 s | 2.29 s |
   | A stone block's push, then its slide, over one cell (80 px at half the walk) | 0.8 s + 0.8 s | 1.6 s + 1.6 s |
   A negative gain is the delver pulling away: nothing at 190 px/s full pace catches an unhurt,
   unpinned delver, at either pace.

### The client follows

9. **One pace golden.** A Go test writes `game-client/src/data/pace.golden.json` from the live
   constants (`paceScale`, `defaultSpeed`, `blockPushSpeedShare`) and fails while the checked-in
   file differs (`-update` rewrites it), as the hub town golden does. The client reads its pace
   from that file and keeps no literal of its own **(charter default: P5's "derive it from one
   shared value"; reading the golden makes the owner's tweak one number plus a regenerate,
   ADR-0099)**.
10. **The block slide** (`BLOCK_SLIDE_SPEED`, `render/world/seal.ts`) is `defaultSpeed ×
    blockPushSpeedShare` from the golden: 50 px/s at 0.5.
11. **Walk playback keeps the feet planted.** A walking or running character, monster or hound
    already plays its clip at the speed drawn over the clip's own stride (`WALK_PACE`, `RUN_PACE`,
    `HOUND_PACE`), the stride the bake keyed. Those are facts of the art, not copies of a server
    speed, and stay. At the paced base the walk plays at about 1.35x and the run at about 0.52x.
    Tests read the base from the golden, and the comments that say "200" say the paced base.
12. **The class card's Speed** (`data/classLore.ts`, shown on class select and the character sheet)
    is the paced base: 100 for the warrior, mage and mercenary, the archer's 220 at full pace scaled
    to 110, and the bar's full mark (250) scaled the same, so the bars read as before
    **(charter default: a card saying 200 while everyone walks 100 is a stale copy)**.
13. **No dead copy stays.** `GAME_CONFIG.PLAYER_SPEED` and `GAME_CONFIG.BULLET_SPEED`
    (`utils/Constants.ts`) are read by nothing; they are deleted rather than kept in step.
14. **Speeds come from the snapshot.** The client never moves a body by a speed of its own: it eases
    toward broadcast positions and reads `direction.speed` and projectile velocities as sent. No
    wire field changes.

## User Stories

1. As a delver, I want to cross a room at a walk, so that I take in what is in it before I am through it.
2. As a delver, I want monsters to close at a walk too, so that a fight starts as a choice, not an ambush.
3. As a delver, I want a faster monster to still be faster than a slow one, so that each family keeps its character.
4. As a delver, I want my boots of speed to still matter, so that a move-speed affix is worth wearing.
5. As a delver, I want an arrow loosed at me to fly at the same ratio to my walk as before, so that I can still step out of it.
6. As a delver, I want a monster's wind-up to last as long as before, so that the tell I learned still reads.
7. As a delver, I want my attacks to come as fast as before, so that a fight is not slowed, only the walking.
8. As a delver, I want my reach and my arrows' range unchanged, so that where I stand to fight is as before.
9. As a warrior, I want my charge to cover its distance as fast as before, so that it is still a burst.
10. As an archer, I want my hound to keep pace with me, so that it heels as before.
11. As a hirer, I want my ally to keep up with me, so that it walks with the party.
12. As a delver, I want a pushed block to slide at half my walk, so that the plate puzzles feel as before relative to me.
13. As a delver, I want my legs to move with my body, so that nothing slides across the floor.
14. As a delver choosing a class, I want the card's Speed to say what I will walk at, so that the card is true.
15. As a hub visitor, I want the town's residents to amble slower than I walk, so that the town keeps its feel.
16. As the owner, I want one number to set the pace, so that I can tune the feel after playing it.
17. As the owner, I want a test to fail if a new speed is added without the pace, so that the knob stays whole.
18. As the owner, I want the client to follow my tweak without a second edit, so that the two never drift.
19. As the owner, I want the before-and-after timings written down, so that I can judge the pace before playing it.
20. As a party, I want every member and every monster on one pace, so that no one is out of step after a floor change.

## Acceptance Criteria

- [ ] `PaceScale` is defined once, in `common/constants/game.go`, at `0.5`, with a comment naming it the knob.
- [ ] `DefaultSpeed` is 100 and `NPCWanderSpeed` 30 at the scale's 0.5, each written as its full-pace figure × `PaceScale`.
- [ ] Every monster sheet's `MoveSpeed`, `VariantStepSpeedGain`, every ally sheet's `MoveSpeed`, the three monster shot speeds and the four delver projectile rows are their full-pace figures × `PaceScale`.
- [ ] A pin test holds each class of R2 to figure × `PaceScale` and fails for an archetype, ally kind or projectile row with no row in it.
- [ ] A delver with worn move speed walks at the paced base × (1 + percent), capped as before.
- [ ] The hound moves at the paced base and a block push and slide take a cell over half the paced base.
- [ ] No wind-up, interval, cooldown, range, radius, max flight, the charge's distance or time, or the leap's time changes.
- [ ] `pace.golden.json` is written by a Go test that fails while it is stale.
- [ ] The client's block slide, its class cards' Speed and its playback tests read the pace from the golden; the client keeps no literal of the base speed.
- [ ] `GAME_CONFIG.PLAYER_SPEED` and `BULLET_SPEED` are gone.
- [ ] The timing table is in this FS and in the build's report.
- [ ] game-service `make test` and vet/lint, and game-client `npm test`, lint, lint:fence and `tsc` pass.

## Edge States

- **A tweak of the knob.** Changing `PaceScale` and running the golden test with `-update` re-paces
  every class, the client included. The pin test survives any value; the timing table above is at
  0.5 and is redone by hand.
- **Dodging in a wind-up.** Wind-ups keep their length while walks halve, so a delver steps half as
  far during a tell as before. In flight the geometry is today's (R3). The bone arrow's 850 px max
  flight still catches a delver running straight away from 320 px from the first tick of the draw:
  (320 + 100 × 0.6) / (210 − 100) × 210 ≈ 725 px, under 850.
- **Gear past the cap.** Unchanged: the 30 % cap applies to the paced base.
- **The hound's gallop floor.** The hound's gallop never plays below 0.5x. At the scale's 0.5 its
  walk is exactly `HOUND_PACE` × 0.5, so nothing slides; a scale below 0.5 would slide its feet a
  little until that floor is lowered. Left as is.
- **The run at about half rate.** A class that runs plays the run at about 0.52x at the paced base:
  its feet stay planted, and its stride reads as a jog. A look call, not a defect.
- **A reconnect mid-slide.** Unchanged: a block farther than two cells from where it is drawn jumps.
- **Field worlds and the hub.** They use the same speeds; a field's monsters are paced by their
  sheets as the Spire's are.

## Out of Scope

- Room size, density and variety (charter item B).
- The dodge roll, the resource economy and the hound as a wolf (charter item C).
- Any change to timings, damage, reach, aggro or leash.
- A walk/run switch for slow paces, or a new clip cadence.
- Any wire field: the snapshot already carries every speed the client needs.
