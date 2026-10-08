# FS-77AB6: Monsters and combat

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### ECS world" → "Combat system"; "### Gameplay actions" → "Apply attack damage in a combat system rather than inline", "Co-op runs without player-versus-player damage"; "### Enemies" (monsters that wander, chase and attack · monster levels scaled to the party · elite monsters · demon boss); `game-client/SPECIFICATION.md` "### Escape run" → "Monsters with level and elite nameplates" → this FS · Siblings (same scoping session, 2026-10-08): [FS-BDA7X](BDA7X-character-leveling.md) (leveling, consumes the kill record), [FS-4R9M9](4R9M9-item-levels-affixes-and-uniques.md) (items: gear-stat contribution and monster drop tables, consumes the kill record), [FS-F6F88](F6F88-multi-floor-delves.md) (floors, supplies floor depth) · Known defects in the same loop: [FS-QG1HR](QG1HR-simulation-and-lifecycle-defects.md) D4, D5 · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, so the run tick budget is shared), [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) · Art: [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md) "Enemy design language"

**Marker.** Items tagged **[OD]** are *orchestrator defaults*: open calls the user delegated during
promotion, folded in as decided. The user may revise any of them; none is load-bearing for the
shape of the work. Numbers marked *starting value* are tuning knobs, expected to move in play.

## Summary

Runs today have nothing to fight but each other, and the fighting is fake: damage is a hard-coded
10 applied inside `MovementSystem`, skills apply fixed numbers straight from the message handler,
and character stats and gear change nothing. This feature makes the run a co-op dungeon crawl.
Each run is populated with **monsters** (ghouls and trolls, occasionally an **elite**, rarely the
**demon** boss) that wander, notice delvers, chase them and strike. Their **level** is derived
from the party's, and it is shown on their nameplate, so difficulty is visible rather than
hidden. All damage, from delvers and from monsters, is resolved by one real **CombatSystem**
driven by stats, the equipped weapon and worn armor. Delvers can no longer hurt each other: the
code for that stays, behind a switch, and a run now ends when the whole party has escaped or
fallen.

This FS is the foundation for its siblings. It emits a **kill record** for every slain monster.
FS-BDA7X turns those records into experience and FS-4R9M9 turns them into drops. Neither drop
tables nor experience are built here.

## Requirements

### Combat system (game-service)

1. **One place applies damage.** A `CombatSystem`, run inside the run's tick, is the only code
   that reduces an entity's `Health`. Every damage source routes through it: the targeted
   `attack` action, every damaging `cast_skill`, every projectile impact, and every monster
   strike. Afterwards no damage is applied in `MovementSystem`, in `ProjectileSystem`, or in a
   message handler (`handleAttack`, `handleCastSkill`).
2. **Damage resolves on the tick, not on the message goroutine.** A handler validates the
   request and records an attack intent as component data. The `CombatSystem` resolves it on the
   next tick. Today the warrior slash mutates health directly from `handleCastSkill`, off the
   tick. That stops.
3. **The dead `DamageCalculator` is replaced.** The damage math below lives in one pure,
   table-testable function set that the `CombatSystem` calls. `systems/damage.go`'s current
   `DamageCalculator` (Str×2 − Agi/2; Int×skillLvl×3) is deleted or absorbed. Nothing keeps a
   second formula.
4. **Attacker power** is derived at the moment of the hit (or the moment of firing, for a
   projectile; see 9) from what the attacker has at that moment:
   - a delver: class `CombatComponent.Attack` + the **equipped weapon's `attack_power`** (0 when
     no weapon is equipped), scaled by the attack's scaling stat from `StatsComponent`;
   - a monster: its archetype damage at its level (§Monsters).
   This FS reads the equipped weapon's and armor's **existing item columns directly**
   (`attack_power`, `critical_rate`, `defense_rating`, `magic_resistance`). How affixes and other
   gear stats contribute to character stats is FS-4R9M9's job. When that lands, it changes what
   these inputs return, not the formula.
5. **Damage formula** (*starting values*):
   - `raw = power × coefficient × (1 + scalingStat / 20)`. For a monster, `raw` = its damage at
     level (×1.5 if elite). There is no coefficient or stat term.
   - **Critical hit:** chance = `0.05 + equipped weapon critical_rate`, capped at `0.50`. On a
     crit, `raw × 1.5`. Monsters have no weapon, so they crit at the base 5%. The rule is the
     same for everyone **[OD]**.
   - **Mitigation:** `final = raw × 100 / (100 + 2 × M)`, where `M` is the target's **defense**
     for a physical hit and its **magic resistance** for a magic hit.
     - Delver defense = class `CombatComponent.Defense` + Σ equipped armor `defense_rating`.
     - Delver magic resistance = Σ equipped armor `magic_resistance`.
     - Monster defense and magic resistance come from its stat sheet.
   - `final` is rounded to the nearest integer, with a **minimum of 1**. Health never goes below 0.
6. **Attack table** (*starting values*). Coefficients are tuned so a level-1, unequipped delver
   deals roughly what today's hard-coded numbers deal.

   | Request | Who | Delivery | Type | Scaling stat | Coefficient | MP | Server cooldown |
   |---|---|---|---|---|---|---|---|
   | `attack {enemy_entity_id}` | any | instant, target within 60 px | physical | Strength | 0.5 | 0 | 0.5 s |
   | `cast_skill slash` (also `melee_slash`, `strike`) | warrior | 50 px, 120° cone | physical | Strength | 1.0 | 0 | 0.25 s |
   | `cast_skill arrow` (also `power_shot`, `shoot`) | archer | projectile | physical | Agility | 1.4 | 0 | 0.25 s |
   | `cast_skill fireball` | mage | projectile | magic | Intelligence | 1.1 | 0 | 0.25 s |
   | `cast_skill triple_arrow` (also `multishot_arrow`) | archer | 3 projectiles | physical | Agility | 1.2 each | 10 | 0.4 s |
   | `cast_skill triple_fireball` (also `multishot_fireball`) | mage | 3 projectiles | magic | Intelligence | 0.9 each | 10 | 0.4 s |
   | `cast_skill dash` (also `sprint`) | warrior | movement only | — | — | — | 10 | 0.4 s |

   Projectile speed, range, radius and spread angles stay as they are today.
7. **Cooldowns are server-enforced.** A request inside its cooldown is ignored: no damage, no MP
   spent, and no error sent to the client. The cooldowns above match the client's current input
   throttles, so a well-behaved client never trips them. `CombatComponent.AttackSpeed` is not
   used in v1 **[OD]**.
8. **Out of range is not a swing.** A targeted `attack` whose target is beyond range when it
   resolves does nothing and does not start the cooldown. Today it silently consumes it.
9. **Projectiles snapshot their attacker.** A projectile carries its attacker's power, type,
   coefficient, scaling, crit chance and owner identity, captured when it is fired. Mitigation
   uses the target's values at impact. A projectile whose owner has since died, escaped or left
   still resolves, and it still credits that owner.
10. **Projectiles hit any damageable entity.** `ProjectileSystem` detects impacts against any
    entity with `Health` and `Transform` other than its owner, not only players. It hands each
    impact to the `CombatSystem` instead of subtracting health itself. A projectile stops at its
    first valid hit. There is no pierce: piercing is a FS-4R9M9 unique. Projectiles pass through
    targets that are not valid hits (requirement 12, dead monsters, out-of-play delvers) without
    being destroyed.
11. **The slash cone hits monsters**, and any other valid target in the cone, each resolved
    separately through the `CombatSystem`.

### Co-op: no player-versus-player damage (game-service)

12. **Player damage switch.** A single run-level setting, `player damage`, is **off by default**.
    While it is off, every hit whose attacker and target are both delvers is discarded by the
    `CombatSystem`: no damage, no crit roll. A projectile passes through, the slash cone skips
    them, and a targeted `attack` on a delver does nothing and starts no cooldown. The existing
    player-damage code paths are **kept, not deleted**. Turning the switch on restores delvers
    damaging delvers through the same `CombatSystem` and formula. The setting is a constant/config
    at world build, not something a client can send.
13. **Player–player collision is kept.** Delvers still push each other in `MovementSystem`.
14. **Monsters never damage monsters.** Monster strikes only target delvers.
15. **Co-op end rule.** A run ends when **every delver on its roster has resolved**: escaped,
    died, or left the run (disconnect cleanup removed them). It is counted against the run's
    actual roster, not against `DefautMaxSessionPlayers`. This replaces "≤1 alive". A run with
    one delver therefore ends when that delver resolves, not at once.
16. **The end is signalled exactly once.** The co-op rule is monotonic, just like the rule it
    replaces, so it inherits FS-QG1HR D5's "fires every tick" defect. This FS requires the run to
    end once. If FS-QG1HR D5's latch (`MatchProgressComponent.Ended` plus the idempotent
    `Shutdown`) has not landed when the co-op slice is built, that slice carries the latch. It
    does not carry D5's other parked items.
17. **Resolved delvers are out of play.** An escaped or dead delver cannot be targeted or
    damaged, and every monster drops it as a target. Its `move`, `attack`, `cast_skill` and
    `interact` are refused. Nothing refuses them today: an eliminated delver could still act
    until the run ended at once, which no longer happens. Both stay in the run world, receiving
    state, until the run
    ends. Then the existing `end_game` and return-to-hub flow runs for everyone together **[OD]**.
    Returning one resolved delver to the hub early is out of scope.

### Monsters (game-service)

18. **Monster entity.** A monster is a server-authoritative run entity with `Transform`,
    `Velocity`, `Health`, and a monster component. The monster component uses the declared,
    unused `ComponentTypeEnemy` tag, the same way FS-29KSH reused the `NPC` tag. It holds pure
    data: archetype, level, elite flag, boss flag, display name, home point, AI state, current
    target, attack timers, and the last delver to damage it. All behavior lives in systems.
19. **Archetypes v1** (*starting values* at level 1):

    | Archetype | Tier | HP | Damage | Attack interval | Wind-up | Range | Move speed | Defense | Magic res. | Aggro radius | Leash radius |
    |---|---|---|---|---|---|---|---|---|---|---|---|
    | ghoul | fodder | 40 | 6 | 1.0 s | 0.35 s | 45 px | 150 | 2 | 0 | 260 px | 520 px |
    | troll | brute | 140 | 16 | 2.0 s | 0.7 s | 60 px | 90 | 10 | 4 | 220 px | 480 px |
    | demon | boss | 1200 | 28 | 1.6 s | 0.8 s | 75 px | 120 | 15 | 15 | 320 px | 700 px |

    Delvers move at 200, so a delver can always outrun every archetype. All attacks are **melee
    and physical** in v1 **[OD]**: magic resistance still matters against delvers' fireballs.
    Every archetype uses the delver collision radius (`PlayerRadius`). Visual size is
    presentation only in v1 **[OD]**.
20. **Level curve** (*starting value*): HP and damage × `(1 + 0.12 × (level − 1))`. Defense and
    magic resistance × `(1 + 0.05 × (level − 1))`, rounded. Speeds, radii and timings do not scale.
21. **Monster level** **[OD]**:
    - **Party level** = the **highest** `StatsComponent.Level` among the run's delvers when the
      run is populated. That is 1 for everyone until FS-BDA7X makes levels real. This FS reads
      it and does not grow it.
    - **Floor offset** = `2 × (floor − 1)` (*starting value*). `floor` is an input to population
      and **defaults to 1** until FS-F6F88 supplies it.
    - A standard monster's level = party level + floor offset + a uniform spread of **−1, 0 or
      +1**, clamped to **≥ 1**.
    - The demon's level = party level + floor offset + **2**, with no spread **[OD]**.
    - A monster's level is fixed at spawn. Delvers levelling up mid-run (FS-BDA7X) does not
      re-level live monsters.
22. **Population.** A run is populated **once, after its roster is placed** (after every
    delver's entity exists), so that party level and delver positions are known. The hub is
    never populated: no monster exists in the hub, ever.
    - **Count:** a uniform integer in **[8, 14]** standard monsters per floor (*starting value*).
    - **Mix:** each standard monster is a troll with probability `0.25 + 0.10 × (floor − 1)`,
      capped at `0.60`, otherwise a ghoul (*starting values*). Higher floors are harder by
      **visible** means: more trolls, more elites, higher shown levels. No hidden multiplier exists.
    - **Placement:** random positions inside the map that overlap no wall, building, door,
      container, switch or escape door, no other monster, and lie at least **350 px** from every
      delver (*starting value*). Placement attempts are bounded. A monster that cannot be placed
      is skipped and logged, never overlapped or forced (§Edge States).
    - **Randomised every run:** count, mix, placement, levels within spread, and elite and demon
      rolls all come from a fresh roll per run. No two runs are the same.
23. **Elites** are promoted standard monsters, not a separate archetype:
    - Each standard monster rolls once at spawn. Elite chance = `0.03 + 0.02 × (floor − 1)`,
      capped at `0.25` (*starting values*).
    - An elite has **×2.5 HP and ×1.5 damage** over its base at its level. All other stats are
      unchanged. Elites are **stats-only** in v1, with no D2-style enchantment modifiers **[OD]**.
    - An elite's display name carries a **prefix** drawn at spawn from a small authored list
      (starting list **[OD]**: *Dread*, *Grave-sworn*, *Hollow*, *Barrow-cursed*), for example
      "Dread Ghoul". The server authors the name, so every client shows the same one.
    - The demon is never an elite.
24. **The demon boss** is a real server-side archetype, with its own stat sheet (19), level rule
    (21) and spawn rule:
    - **Top floor:** exactly one demon is guaranteed. Population takes an `is top floor` input,
      which FS-F6F88 supplies. Until then it is false.
    - **Any other floor**, including the single-floor runs that exist before FS-F6F88: one demon
      with probability **0.01** per floor (*starting value*).
    - At most one demon per floor. It is spawned **in addition** to the standard count. It is
      placed at the valid position farthest from the delvers among a bounded sample.
    - Its display name is authored server-side (starting value **[OD]**: "Demon").
    - The client renders a placeholder until the demon art lands (requirement 41). The server
      does not depend on the art.
25. **Spawn rates live in one place.** Count range, mix, elite chance, demon chance, offset and
    exclusion radius are named constants in one file, so a developer can force an elite or a
    demon in a local build to verify presentation.

### Monster AI (game-service)

26. **Wander → chase → attack.** A `MonsterAISystem` runs in the run's tick, before movement.
    It only sets monster velocity, facing and AI state. Movement and collision stay
    `MovementSystem`'s job, exactly as for delvers. Damage stays the `CombatSystem`'s.
    - **Wander:** with no target, a monster walks to random destinations within a home radius of
      its spawn point (*starting value* 150 px) and pauses between them. It reuses the hub
      resident's wander-and-unstick pattern (`WanderSystem`: destination, pause, stall-abandon),
      so a monster never wedges permanently on a wall.
    - **Acquire:** the nearest in-play delver within the archetype's aggro radius becomes its
      target. Distance only: no line-of-sight test in v1.
    - **Retaliate:** a monster that takes damage from a delver while it has no target acquires
      that delver, at any distance **[OD]**. Otherwise a ranged delver could kill it for free
      from outside its aggro radius.
    - **Chase:** with a target, it steers straight at the target at its move speed. There is no
      pathfinding: a wall between them can body-block it. That is accepted for v1 (§Out of Scope).
    - **Attack:** when the target is within attack range and the attack interval has elapsed,
      the monster stops, faces the target and enters a **wind-up**. At the end of the wind-up it
      strikes **if the target is still within range × 1.25**. Otherwise the swing whiffs. The
      strike is handed to the `CombatSystem`. A monster in wind-up does not move. The readable
      wind-up is a design-guideline requirement ("Motion tells intent"), so it is part of the
      simulation, not only of the animation.
    - **Keep the target:** a monster does not switch targets mid-chase except when the current
      target becomes invalid.
    - **Leash:** a monster drops its target when the target dies, escapes or leaves the world,
      or is farther than the archetype's leash radius. It then returns to wandering around its
      home point. Leash radius > aggro radius, so it does not flicker between states.
    - A **dead** monster has no AI: it does not move, collide, target or strike.
27. **Tick order** within a run: monster AI → movement → projectiles (detect impacts) → combat
    (resolve every attack intent, impact and strike) → monster death → interaction → elimination
    → rules → broadcast. The hub keeps its current order (wander → movement → …). It runs neither
    monster AI nor monster death.

### Monster death and the kill record (game-service)

28. **A monster dies once.** When its health reaches 0 it enters a dead state that tick. Its
    velocity is zeroed. It stops colliding and stops being a valid target. **Exactly one kill
    record** is produced for it.
29. **Kill record** fields:
    - the monster's entity id, archetype, level, elite flag and boss flag;
    - the **killer**: the member id of the delver whose hit took it to 0, which is the last
      delver to damage it;
    - its position at death, which FS-4R9M9 needs to place ground drops;
    - the floor (1 until FS-F6F88).

    The record is produced inside the run and made available to in-process consumers in the
    same run. The subscription mechanism is settled at implementation. The v1 consumer is a
    structured `slog` line, which a test can observe. **No** experience, drop roll, broker event
    or persistence happens in this FS: FS-BDA7X and FS-4R9M9 consume the record.
30. **Corpse lifetime.** A dead monster stays in the world, broadcast as dead, for **4 s**
    (*starting value* **[OD]**) so every client can play its death animation. Then the entity is
    removed. A monster that dies with an attack mid-wind-up never strikes.
31. **Kill credit with several attackers.** Only the killing blow is recorded. Shared experience
    is FS-BDA7X's rule, and drops are ground drops (FS-4R9M9). This FS does not track damage
    share.

### State protocol (game-service → game-client)

32. The run's state broadcast gains a `monsters` array, which is empty or absent in the hub. Each
    entry carries:
    - `entity_id`
    - `archetype`: `ghoul` | `troll` | `demon`
    - `name`: server-authored display name, including any elite prefix
    - `level`
    - `elite`, `boss`
    - `position {x, y}`
    - `facing {x, y}`: the direction it faces, which is non-zero while it stands still, winds
      up or lies dead
    - `action`: `idle` | `move` | `attack` | `dead`, where `attack` is the wind-up and strike
    - `current_health`, `max_health`

    Field names follow the existing snake_case state conventions. The client composes the
    nameplate text itself.
33. Delver state is unchanged. An escaped delver is already marked by the existing `escape` flag
    and a dead one by `current_health` ≤ 0.

### Client presentation (game-client)

All of it follows [`design-guideline.md`](../../game-client/docs/design-guideline.md): tokens only
([ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md)),
the gameplay accent channels, and "Enemy design language".

34. **Monsters render from baked sheets.** `ghoul` uses `creature_ghoul_base` and `troll` uses
    `creature_troll_base`. Both are already baked to `public/art/creatures-{0,1}.png` and are
    currently unused in `src/`. Each renders in **8 directions** from `facing`, and plays
    **idle / walk / attack / death** from `action`. Rendering uses the same isometric projection,
    depth sorting and lighting as delvers (FS-2325V).
35. **Size reads as threat tier.** Fodder renders at 0.85–1.0× delver height, a brute at
    1.3–1.5×, and the boss at ≥ 1.8×, per the guideline.
36. **Death plays once and the corpse stays.** On `action: dead` the death clip plays once and
    holds its last frame until the server removes the entity.
37. **Nameplate:** `Name · Lv N` above each living monster, for example `Ghoul · Lv 14`, plus an
    HP bar. Both are **hostile markers**: oxblood/damage channel, drawn above the light-map and
    the vignette and below the HUD, meeting the guideline's **3:1** contrast floor at the canvas
    edge (`src/render/markers/`). The nameplate is hidden once the monster is dead.
38. **Elite marker:** the elite prefix renders in the hostile accent, distinct from the base name.
    The monster sprite carries a subtle tint or aura in the hostile (ember/oxblood) family. It is
    never amber (interactable), never arcane green (safe), and never neon.
39. **Targeting monsters.** Hovering a living monster shows the existing strike-mark cursor.
    Clicking it sends `attack {enemy_entity_id}` with the monster's entity id, the same path the
    client uses on rivals today. A hit shows the existing damage flash on that monster.
40. **Other delvers are allies.** While player damage is off (requirement 12), the client treats
    other delvers as allies: no strike-mark cursor, no click-to-attack, and their name and HP
    markers move from the hostile channel to the ally (arcane green) channel. The client
    hard-codes co-op presentation. Re-enabling PvP on the client is out of scope.
41. **Demon placeholder.** Until the demon art lands, `demon` renders with the troll sheet,
    tinted into the hostile family and scaled to ≥ 1.8×. The swap to real art is one mapping
    change. **Art is a flagged dependency, not a blocker.**
42. **Resolved-delver notice.** A delver who has escaped or died while others are still in the
    run sees a short notice in lore voice that the delve continues without them, until the
    `end_game` overlay arrives. Hub copy rules apply: "delve", never "run".

## User Stories

1. As a delver, I want monsters in every delve, so that a run is about fighting through the barrow, not about each other.
2. As a delver, I want each delve's monsters placed and mixed differently, so that no two delves play the same.
3. As a delver, I want monsters to amble until I come near, so that I can choose when to engage.
4. As a delver, I want a monster that sees me to chase me, so that the barrow feels hostile.
5. As a delver, I want a monster that I hit from afar to come for me, so that ranged play still carries risk.
6. As a delver, I want monsters to give up the chase when I get far enough away, so that retreat is a real option.
7. As a delver, I want to see a monster wind up before it strikes, so that I can step away and its hits feel fair.
8. As a delver, I want to see each monster's level on its nameplate, so that I know what I am taking on before I commit.
9. As a delver, I want elites marked by name and look, so that I spot the dangerous ones at a glance.
10. As a delver, I want monster levels to follow my party's level, so that the barrow stays a challenge as we grow.
11. As a delver, I want higher floors to be visibly harder (more trolls, more elites, higher levels), so that pushing up is a choice I understand.
12. As a delver, I want a rare demon to appear, and a certain one on the top floor, so that there is a peak to climb toward.
13. As a delver, I want ghouls and trolls to feel different (fast and fragile vs. slow and heavy), so that I fight them differently.
14. As a warrior, I want my slash to cut every monster in its arc, so that I can hold a crowd.
15. As an archer or mage, I want my projectiles to hit monsters, so that my class works against the barrow's dead.
16. As a delver, I want my stats and my equipped weapon to set my damage, so that what I carry and who I am matter.
17. As a delver, I want my armor to soften blows and resist magic, so that defense is worth wearing.
18. As a delver, I want occasional critical hits, with my weapon's crit rate counting, so that weapon choice has texture.
19. As a delver, I want my allies' arrows and fireballs to pass through me harmlessly, so that we can fight side by side.
20. As a delver, I want the delve to continue after I fall or escape until my companions are done, so that one of us leaving does not end it for everyone.
21. As a fallen or escaped delver, I want to be told that the delve continues without me, so that I am not left wondering why nothing has ended.
22. As a delver, I want a slain monster to fall and stay a moment, so that the kill reads clearly.
23. As a delver, I want the hub to stay free of monsters, so that it remains a safe place.
24. As a delver, I want the server, not my client, to decide cooldowns and damage, so that nobody can cheat their way through a delve.
25. As the developer, I want one CombatSystem to own all damage, so that combat is testable and lives in one place instead of three.
26. As the developer, I want player-versus-player damage behind a switch rather than deleted, so that I can bring PvP back later without rewriting it.
27. As the developer, I want every slain monster to produce exactly one kill record with its killer, level, archetype and flags, so that experience (FS-BDA7X) and drops (FS-4R9M9) can be built on it.
28. As the developer, I want spawn rates in one place, so that I can force an elite or a demon locally to check how they look.
29. As the developer, I want the demon to be fully real on the server before its art exists, so that art and code ship independently.
30. As the art owner, I want the ghoul and troll I already baked to finally appear in game, so that the creature pipeline pays off.

## Acceptance Criteria

**Combat**
- [ ] No code outside the `CombatSystem` reduces `Health`. The damage in `MovementSystem`, `ProjectileSystem` and `handleCastSkill` is gone, and `DamageCalculator` no longer exists as a separate formula.
- [ ] Table-driven tests cover the damage function: power from class plus weapon `attack_power`, stat scaling per attack type, physical vs magic mitigation from defense or magic resistance (class plus armor columns), the crit chance including weapon `critical_rate` and its cap, the crit multiplier, the minimum of 1, and the no-weapon and no-armor cases.
- [ ] Equipping or unequipping a weapon or armor changes the next hit's damage or mitigation without anything else changing.
- [ ] A level-1 unequipped delver's slash, arrow and fireball land within ±20% of today's 25 / 20 / 25 against an unarmored target.
- [ ] A request inside its cooldown has no effect and spends no MP. A targeted `attack` out of range does not start the cooldown.
- [ ] A projectile fired by a delver who dies before impact still damages and credits that delver.

**Co-op**
- [ ] With player damage off (the default): a delver's arrow, fireball, slash and targeted `attack` never damage another delver, and projectiles pass through delvers.
- [ ] With player damage switched on in a test: the same actions damage delvers through the `CombatSystem` formula.
- [ ] Delvers still collide with each other.
- [ ] A two-delver run continues after one escapes or dies, and ends when the second resolves. A one-delver run ends when that delver resolves.
- [ ] The run's end is signalled exactly once. A test covers several ticks after the end condition becomes true.
- [ ] A dead or escaped delver cannot be targeted or damaged by monsters, and its gameplay actions are refused.

**Monsters**
- [ ] A new run contains 8–14 standard monsters (+ a demon when rolled), none in a wall, building, container, door, switch or escape door, none overlapping, all ≥ 350 px from every delver.
- [ ] The hub never contains a monster, before or after a run.
- [ ] Monster levels equal highest party level + floor offset ± 1 (≥ 1). The demon's equals party level + offset + 2. Tests cover a mixed-level party and floor > 1 via the input.
- [ ] HP and damage follow the level curve. Elites have ×2.5 HP and ×1.5 damage and carry a prefixed name.
- [ ] Over many seeded populations, troll share, elite rate and demon rate match the configured probabilities for floors 1 and 3. A top-floor population always has exactly one demon.
- [ ] A monster wanders while no delver is in aggro radius, chases the nearest in-play delver inside it, winds up and strikes in range, whiffs if the delver leaves range × 1.25 during the wind-up, and drops aggro beyond the leash radius or when its target dies or escapes.
- [ ] A monster hit from outside its aggro radius acquires its attacker.
- [ ] Monsters move through `MovementSystem` and collide with walls, doors, delvers and each other.
- [ ] A monster killed by any damage source produces exactly one kill record carrying entity id, archetype, level, elite, boss, killer member id, position and floor. Its corpse is broadcast as `dead` for ~4 s, then removed.
- [ ] Monsters never damage monsters.
- [ ] A benchmark ticks a full run (2 delvers, 14 monsters + demon, projectiles in flight) and records its duration in the PR. The tick stays well inside the 33 ms budget. If it does not, FS-QG1HR's parked wall/door spatial index is pulled in before shipping.

**Client**
- [ ] Ghouls and trolls render from their baked sheets in 8 directions, with idle, walk, attack and death driven by server `facing` and `action`, at their size tier.
- [ ] Every living monster shows `Name · Lv N` and an HP bar as hostile markers meeting the 3:1 marker-contrast test. Elites show a hostile-accent prefix and a hostile-family tint or aura.
- [ ] A rolled demon renders as the tinted, ≥ 1.8× troll placeholder with its nameplate.
- [ ] Clicking a living monster sends `attack` with its entity id. A hit flashes it. A dead monster is not targetable.
- [ ] Other delvers show no strike-mark and cannot be click-attacked, and their markers use the ally channel.
- [ ] An escaped or dead delver whose party is still in the run sees the "delve continues" notice until `end_game`.
- [ ] The token fence passes: no raw colour literals were added.

## Edge States

- **Empty roster at population:** a run with no delvers placed is not populated. The disconnect
  cleanup already tears an empty run down.
- **Placement exhausted:** on a crowded map or with an unlucky roll, a monster that cannot find a
  valid spot within the bounded attempts is skipped and a warning is logged. A run with fewer
  monsters is valid. A run where the demon is guaranteed (top floor) relaxes the delver
  exclusion before it gives up. It never skips a guaranteed demon silently.
- **Mixed-level party:** the highest level is the base, so a low-level delver beside a
  high-level one faces monsters above their level. That is accepted by design and visible on the
  nameplates. FS-BDA7X decides how experience treats it.
- **Party level 1 everywhere (before FS-BDA7X):** monster levels are 1–2 on floor 1. The demon
  is level 3.
- **Single floor (before FS-F6F88):** floor = 1 and top floor = false. The demon appears only on
  its 1% roll.
- **Concurrent kills:** two hits land on the same monster in one tick. The hit that takes it to 0
  is the killing blow, in the `CombatSystem`'s resolution order. The second hit is discarded
  against a dead target. Exactly one kill record is produced.
- **Delver dies mid-chase:** monsters targeting them drop the target that tick and return to
  wandering, or acquire another in-play delver in aggro radius.
- **Delver escapes mid-chase:** same as dying. The escape door does not protect anyone else
  nearby.
- **Delver disconnects:** while the entity remains in the run (the reconnect grace), it is still
  in play and still targetable, so there is no safe logout mid-delve **[OD]**. Once disconnect
  cleanup removes it, monsters drop it and the co-op rule counts the delver as gone.
- **Reconnect:** the reconnecting client receives full state including every live monster and
  every corpse. Nothing monster-related is client-held.
- **Monster wedged on a wall while chasing:** it stays wedged until the target leashes away, then
  wanders with the stall-abandon rule. No pathfinding in v1.
- **Monster leash vs hub transition:** a run is torn down at its end, and every monster with it.
  Nothing carries over between runs.
- **Damage to a dead or out-of-play target:** discarded. The projectile passes on.
- **Spatial-hash freezes (FS-QG1HR D4):** monsters swarming a delver share hash cells, which
  triggers D4's freeze-and-jitter defect more often than delvers alone ever did. Attack
  resolution no longer lives in `MovementSystem`, so D4 no longer stalls strikes. Movement
  jitter remains until D4 is fixed. Fixing D4 before or alongside the AI slice is strongly
  recommended. It is not absorbed here.
- **Hub:** `attack` and `cast_skill` stay refused (`combatAllowed`). Monster AI and monster death
  do not run. A broadcast carries no `monsters`.

## WebSocket message surface

This feature changes no HTTP endpoint. It changes the WebSocket contract `game-service` owns
directly (ADR-0004), which is outside the generated OpenAPI surface.

**Inbound (client → server)**

| Action | Change |
|---|---|
| `attack {enemy_entity_id}` | Target may be a monster. A delver target is ignored while player damage is off. Server cooldown enforced |
| `cast_skill {skill_id, target_x, target_y}` | Damage now resolved on the tick through the `CombatSystem`. Server cooldowns enforced. Payload unchanged |

**Outbound (server → client)**

| Message | Change |
|---|---|
| state broadcast (run) | Gains `monsters[]` (requirement 32) |
| state broadcast (hub) | Unchanged: no `monsters` |
| `end_game` | Unchanged payload. Now sent when the whole party has resolved. `position` keeps its current computation (see Out of Scope) |

## Design decisions carried from scoping

- **This FS owns stat-driven combat** (user), over a separate combat FS or folding it into items.
  FS-4R9M9 owns only "equipped gear contributes to character stats".
- **Roster v1:** ghoul (fodder) and troll (brute), using only already-baked art. The boss is a
  **demon**, whose art is the user's, in development (user).
- **Elites are D2/3/4-style promoted standard monsters**, not a modelled type (user). Low chance,
  rising with floor. Stats-only in v1 **[OD]**.
- **Monster level derives from party level**, rising with floor (user). The party's **highest**
  level is the base **[OD]**.
- **Difficulty is legible, never sneaky** (user): nameplates show the level and an elite tag.
  Harder floors are harder by visible means only.
- **Boss placement:** guaranteed on the top floor only, a very low chance elsewhere (user).
- **AI is old-school simple** (user): wander, chase, attack. No dodging, no complex behaviour.
  Same movement and collision as delvers. All melee in v1 **[OD]**.
- **PvP removed but dormant** (user): a switch, not a deletion. Player–player collision kept.
  Co-op end rule: the run ends when everyone has escaped or died **[OD]**.
- **Spawns randomised every run** (user).
- **The demon is fully real server-side. The client uses a placeholder** **[OD]**.
- **Gear-stat contribution math is FS-4R9M9's.** This FS reads the existing weapon and armor
  columns directly **[OD]**.
- **The kill record carries killer, level, archetype and elite/boss flags.** FS-BDA7X (XP) and
  FS-4R9M9 (drops) consume it later **[OD]**.
- **The draft's proposed numbers are accepted as starting values** **[OD]**: elite ~3% rising
  per floor, ×2.5 HP / ×1.5 damage, demon ~1% off the top floor, 8–14 monsters per floor, the
  level curve.

## Rejected alternatives

- A separate combat FS: it would have meant four-plus specs with a strict build order. Combat
  inside the items FS was rejected too.
- Elites as distinct modelled monsters: the user wants promoted standard monsters.
- An enlarged troll or ghoul as the boss: the user has a demon in development. The enlarged troll
  survives only as the **placeholder**.
- Delve tiers chosen at the Spirewarden, and random level bands per delve: rejected in favour of
  party-level scaling.
- A hidden monster level, or an elite marker only: rejected, because difficulty must be legible.
- Keeping PvP alongside monsters (PvPvE): rejected for now. The code is kept dormant.
- Average party level as the base: the highest was chosen **[OD]**. The average lets one
  high-level delver carry the party through content that is trivial for them.

## Dependencies

- **Demon art (user, in development).** It is not a blocker: the placeholder covers it (41).
  **Flag: [`design-guideline.md`](../../game-client/docs/design-guideline.md) "Enemy design
  language" says *"Undead and barrow-born only … No demons"*.** Before the real demon art lands,
  the guideline needs an amendment by its owner (via [`docs/theming_plan.md`](../theming_plan.md)),
  or the demon is framed as barrow-born. The tinted-troll placeholder conforms as it stands. This
  FS does not edit the guideline.
- **FS-F6F88** supplies `floor` and `is top floor` to population. This FS works single-floor.
- **FS-BDA7X** makes `StatsComponent.Level` real. Until then party level is 1.
- **FS-4R9M9** changes what equipped gear contributes. It consumes the kill record for drops.
- **FS-QG1HR D5** (end-signal latch) is carried by the co-op slice if it has not landed
  (requirement 16). **D4** (spatial hash) and its parked wall/door index are referenced, not
  absorbed (§Edge States, §Acceptance Criteria benchmark).

## Out of Scope

- Experience, levelling, and level requirements on gear (FS-BDA7X).
- Drop tables, item level, affixes, uniques, and how equipped gear contributes to stats beyond
  reading the existing base columns (FS-4R9M9).
- Multiple floors, stairs and floor transitions (FS-F6F88). This FS takes `floor` and
  `is top floor` as inputs only.
- Ranged or magic monster attacks, monster projectiles, and elite enchantment modifiers.
- Pathfinding, line-of-sight aggro, group or pack aggro, and monster-to-monster coordination.
- Per-archetype collision radius. Visual size is presentation only in v1.
- `CombatSystem` use of `AttackSpeed`, damage-over-time, buffs, debuffs, healing skills, and
  `SkillSystem` beyond routing the existing skills' damage.
- Floating damage numbers and a monster health readout beyond the nameplate HP bar.
- Returning one resolved delver to the hub before the run ends.
- Rethinking `end_game`'s `position` ranking (a PvP-era concept) and match-complete statistics.
- Client-side PvP presentation when the switch is on.
- Real demon art, and the design-guideline amendment it needs.
- FS-QG1HR's D1–D5 fixes, except D5's latch where requirement 16 needs it.

## Open questions for implementation

- How in-process consumers subscribe to kill records: a per-run channel, a drained slice on the
  session, or ECS data. The constraint is exactly once per monster, observable in tests, and
  usable by FS-BDA7X and FS-4R9M9 inside the same run.
- Where the attack intent lives as component data: on `PlayerComponent`, replacing
  `AttackActive`/`AttackTargetEntityID`/`HasHit`, or in a dedicated component.
- The exact elite tint versus aura treatment, settled against the 3:1 marker test and the bake
  pipeline's options.
