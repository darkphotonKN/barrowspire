# FS-B4SG9: Ranged monsters and the Bone Archer

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Enemies" → "Monsters that shoot from range"; `game-client/SPECIFICATION.md` "### Presentation" → "Ranged monsters drawn with their shots" → this FS

## Scoping notes (raw)

Scoped 2026-11-11 under the owner's charter "一樓壓力". The owner's answers are the locked
decisions below (approved 2026-11-11); nothing was asked of anyone in this session and the lock
preview was approved under the charter. Not challenged: no `challenge-me` pass. Nothing here is
expensive to get wrong (no persistence, no contract, tuning values only).

**Locked decisions (owner, verbatim in substance)**

- Name Bone Archer. Its look is the existing Ghoul (the skeletal one) holding a bow. The owner
  calls the ghoul "the skeleton".
- Level-1 sheet: HP 30, damage 7, move speed 130. Frailer than the ghoul: a priority target.
- Shoots from 320 px. Aggro radius 360. Leash radius 560.
- One arrow every 2.0 s, wind-up 0.6 s: a telegraph the player can read.
- Arrow speed 420 px/s, aimed at where the target stands at release, no lead. Strafing dodges it,
  running straight away does not.
- Arrows stop at walls. With no line of sight it walks until it has one. Reuse the existing monster
  pathfinding and the existing projectile system.
- v1 stands and shoots. It does not back away or kite.
- Floor 1 only. In ordinary rooms 1 in 4 ghouls is a Bone Archer instead. In a hall's pack one
  ghoul is. None in corridors.
- The hall's archer is still one of the chest's guards. FS-KE075 §J's guard definition is
  unchanged.
- Elites, experience and loot follow the ghoul's rules. No new rule.
- A new baked sheet (the ghoul rig holding a bow, with a shoot clip), and a dev-gallery card for
  anything new in a tracked family (`game-client/CLAUDE.md` "Dev gallery").
- All damage goes through the CombatSystem and a projectile snapshots its attacker (FS-77AB6).
  Projectiles are in the tick order already.

**Bounds.** May change game-service (`internal/game`, `internal/systems`, `internal/components`,
`internal/types`), game-client, `game-client/tools/bake`. May not change proto, api-gateway,
OpenAPI, the generated client, any database or migration, another microservice, or the existing
text of a shipped FS. Out of scope: monster move speeds in general, the guarded-chest rule, floors
2 and up, new loot, a chest-open channel (a sibling's, on another branch).

**Ownership check (five-bin sorter)**

- "Monsters that wander, chase and attack → FS-77AB6" owns melee monsters. Its R19 says every
  attack is melee, and its AI has no shot. A monster that shoots is behaviour that system cannot
  express, and no line owns it: a new capability. The line names the system ("Monsters that shoot
  from range"), not the instance; the Bone Archer lives in the FS body.
- The client's "Expanded baked enemy roster → FS-Q14EV" owns the roster pipeline, which the new
  sheet follows. The client's new facet is drawing a ranged monster and its shot: one line, same FS.
- The floor-1 population change (who a rolled ghoul is, what a hall pack holds) touches FS-KE075
  §C R18 and §J R58's wording ("a hall's troll and ghouls"). KE075's own text is not edited; it
  gets a pointer stub at promotion.
- Rejected as splinters: "Bone Archer on floor 1" (an instance), "Arrow wind-up telegraph" (a
  detail of the shot), "Bone arrow look" (content under the effects family).

**What the code says today (read 2026-11-11, branch cut from main 28a7a377)**

- Sheets: `internal/game/monster_tuning.go` `monsterSheets`. Ghoul 40 HP, 6 damage, speed 150,
  aggro 260, leash 520, defense 2, magic resistance 0. Delvers move at 200.
- Every Spire floor is a dungeon since FS-M8CSE §C, so "floor 1 only" needs a depth test in the
  population; the dungeon population is no longer floor-1-only code.
- A rolled non-troll monster is 70% ghoul, 20% Barrow Thrall, 10% Spire Wraith
  (`spireNonTrollMix`, FS-M8CSE §D R18). "1 in 4 ghouls" applies to the rolls that come up ghoul.
- Treasure guards roll through the same `rollArchetype`. The owner named ordinary rooms and hall
  packs only, so treasure guards and corridors get no archer.
- A hall pack is `[troll, ghouls…]` and a short pack keeps its first members
  (`dungeon_population.go` `hallPack`). Making the archer the first ghoul keeps it in a short pack.
- A hall pack's members are guards by role (`spawnHallPack`, `guarded_chests.go`), whatever their
  archetype. The archer is a guard with no change to §J.
- `MonsterAISystem.think` chases while `distance > AttackRange`, else stands, faces and winds up;
  `windUp` does not turn the monster while it winds up; the strike lands only within
  `AttackRange × 1.25`.
- `NavGrid.Clear(ax, ay, bx, by, half)` already answers "does a body of this half-size moving
  straight overlap only walkable cells". It is the line-of-sight test, with the arrow's radius.
- `ProjectileSystem` already stops a projectile on any wall entity and any closed door, passes
  through what `CanHit` refuses (a monster's shot through monsters, the dead, delvers out of
  play), and hits the first delver it reaches, whoever was aimed at. The dungeon's shell walls
  are wall entities (`dungeon_floor.go` `layDungeon`). A dungeon floor has no doors.
- `CombatSystem.fire` spawns a projectile from an intent's `TargetX, TargetY` with the attacker's
  snapshot. A monster's snapshot is its damage at level, `FromMonster` set, 5% crit.
- Projectile impacts go straight to `applyHit`. The mercenary's parry is tested only in
  `CombatSystem.strike` (targeted delivery), so **no projectile impact is parried today**.
  `applyHit` calls `reflect` for any hit `FromMonster`, so **Gravewarden's Oath would reflect an
  arrow** onto its archer, though FS-4R9M9 R34 names the effect `melee_reflect` and rests on
  "all monster attacks are melee in v1". Both are the owner's call, escalated, not decided here.
- Wire: `MonsterState.archetype` and `ProjectileState.projectile_type` are strings. A new value
  is not a shape change. The client draws an unknown archetype as a troll and an unknown
  projectile type as a fireball.
- Client: `MONSTER_LOOKS` in `src/render/creatures/monsters.ts`; the `attack` action plays the
  sheet's `attack` clip, 7 frames at 12 fps (0.58 s) by default; flights by type in
  `src/render/effects/flights.ts`. The dev gallery tracks two families, `effects` and
  `item-icons` (`src/dev/gallery/families.ts`): a new flight needs a card, a monster sheet does not.
- Bake: `tools/bake/page/characters/cast.js` (`ghoul()`, `CAST`), `gear.js` `longbow` (a live
  string, used by the archer class), `clips.js`. The Barrow Thrall and Spire Wraith sheets went
  into the `creatures` group the run already loads.

**Derived here (not the owner's words; each is a tunable or a small rule)**

- Defense 2, magic resistance 0: the ghoul's. It is the ghoul with a bow.
- Arrow radius 8 (the delver arrow's), physical, max flight 700 px. A delver fleeing straight from
  320 px at 200 px/s is caught after 611 px, so 700 honours "running straight away does not dodge".
- Release: at the end of the wind-up it looses if it still has its target, at where the target
  stands on that tick, in range or not, in sight or not. An arrow loosed at a target that stepped
  behind a wall hits the wall.
- It keeps turning to face its target while it winds up, so the telegraph points where the arrow
  will go.
- No hysteresis on the 320 px edge, as melee has none.
- "1 in 4" is an independent 25% roll per ghoul roll, not every fourth.
- Top-ups go to ordinary rooms, so they roll archers like any room monster.
- A floor 1 built of buildings after a failed generation (FS-KE075 R17) has no archer.
- Its own projectile type, `bone_arrow`, so the client can draw a hostile arrow apart from a
  party archer's.
- XP base 10 and the ghoul drop row, as rows of its own, since a missing row gives nothing.

**Rejected**

- Kiting or backing away: owner, v1 stands and shoots.
- Leading the target: owner, no lead.
- Line-of-sight aggro: ADR-0062 Decision 6 keeps aggro distance-only; this FS leaves it.
- Archers among treasure guards or in corridors: not named by the owner.
- A separate "shoot" action on the wire: `attack` already means wind-up and strike.

**Open, for the owner**

- Does the mercenary's parry negate an arrow? Today it would not.
- Does Gravewarden's Oath reflect an arrow? Today it would.
- Is "line of sight gates a monster's shot" worth an ADR beside ADR-0062?
- Who runs the bake and approves the contact sheet (ADR-0021's gate)?
