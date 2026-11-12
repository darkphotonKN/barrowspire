# FS-JS7C8: Class run, attack walk, backward step while attacking

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Run and backpedal animations"; `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Attacking slows the attacker's movement" → this FS · Stub on the owner it changes: [FS-2325V](2325V-pre-rendered-isometric-art.md) §E.4 (`## Change: Class run, backpedal and pointer facing → FS-JS7C8`; the stub's name predates the change of 2026-11-12) · Tunes: [FS-HF0WW](HF0WW-2x-archer-walk-attack-leg-clearance-trim.md) `WALK_ATTACK_CYCLES` (R11) · Baked with: [FS-2325V](2325V-pre-rendered-isometric-art.md) `## Change: The archer's draw stays on the aim line` (R48) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (§3: no existing client→server message changes), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored clips, the owner's contact-sheet gate), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming stays off the server), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (2x, trimmed sheets), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (class groups are resident) · Surfaces: game-client (clip choice, bake, class atlases), game-service (attack slow)

> Promoted `--from-thread` on 2026-11-12 from the charter "角色小跑步" (owner approved "核准").
> The thread is the charter's locked decisions. Requirements marked **(owner)** are those
> decisions. Those marked **(charter default)** settle what the decisions left open, each with its
> reason. Every number is a starting value. Code citations are against local main `db29561f`.
>
> **Edited in place on 2026-11-12 (owner change, still a work-order).** Requirement numbers are
> kept: a requirement the change retires reads *Removed*, and the new ones are R45–R48.

## Owner change, 2026-11-12

After playing slices 1–4 and seeing the archer's slice-5 bake, the owner said:

1. "人物調整成不要跟著滑鼠位置 鍵盤按哪個位置就面向跑哪個位置": the character does not follow the
   mouse; it faces where it runs (the keys pressed).
2. "攻擊時再用走的樣子": attacking still switches to the walk look (decision ② stands:
   `walk_attack`, the server's 0.45 slow for 0.6 s).
3. "走的動畫可以再放慢一些腳步的播放 有點過快": the walk's steps (the `walk_attack` legs while
   attacking) play too fast; slow them.
4. "攻擊時移動反方向會是後退的動作": while attacking, moving opposite to the attack's direction
   plays a backward step.

What changed, as charter defaults (each with its reason at the requirement; the owner can
override any):

- **Facing follows movement, as before this FS** (§D): no pointer facing anywhere.
- **The facing relay goes** (§E): with facing from movement, other clients derive it from
  movement as they always did, so the `face` action and the state's `facing` have no reader.
  Slices 2 and 4 built them on the branch; they are removed before merge so no dead wire stays.
- **The backward step is only while attacking** (§B): `backpedal_attack`, the attack over the
  backpedal's legs, when the movement is more than 90° from the attack's facing; `walk_attack` at
  90° or less. No sheet carries a standalone `backpedal` (it would never play).
- **Slower attack legs** (R21, R10): neither attack-on-the-move clip walks its legs faster than
  the slowed ground.
- **The run stays as baked** in slice 5 (`RUN_PACE` 194), played whenever moving and not attacking.

The owner's finding on the archer's bow draw the same day ("射出弓箭時人物的手臂不自然
拉弓讓手臂過度伸到背後", and the diagnosis "應該是左手拿弓的位置太靠近左側導致右手拉弓時伸到左手破圖")
is a change to the archer's attack clip, which FS-2325V owns: see its
`## Change: The archer's draw stays on the aim line`. This FS only bakes it with the archer (R48).

## Summary

The four playable classes run instead of speed-walking: a new `run` clip, a jog on the shared rig,
plays at about its own pace at the server's 200 px/s, turned the way the character moves. Attacking
slows a player to a walk: the server cuts their move speed for the attack's own short action and
the client plays `walk_attack`, its legs at no more than the slowed pace; moving more than 90°
away from the attack's direction plays a new `backpedal_attack` instead, the attack over legs
stepping backward. The character faces where it moves, as before this FS; the mouse only aims.

The owner's reason: "目前走動的方式有點怪像是在快走 目前的速度應該用跑的".

## Facts this spec rests on

1. The four classes share one `walk`: 8 frames at 10 fps (`ANIMATIONS.walk`,
   `game-client/tools/bake/page/characters/clips.js`). The client plays it at
   `speed / WALK_PACE` = 200 / 74 ≈ 2.7x (`src/render/art/animationSelect.ts`). The server's
   `DefaultSpeed` is 200 world px/s (`game-server/game-service/common/constants/game.go`).
2. **game-service has no "attacking now" state.** The nearest is `CooldownComponent.Remaining[kind]`
   (`internal/components/attack.go`), set in `CombatSystem.resolve`
   (`internal/systems/combat.go`) to the row's cooldown: 0.25 s for `slash`, `cut`, `arrow`,
   `fireball`; 0.4 s `dash` and `triple_fireball`; 1.2 s `shadow_shot`; shortened by worn attack
   speed. None is the attack's action (the client's attack clip runs 7 frames at 12 fps, 0.583 s).
   `DashComponent` is a charge in flight. The attack slow needs a new per-player timer.
3. `VelocityComponent.Speed` has two writers: spawn (`internal/game/factory.go`) and
   `applyMoveSpeed` (`internal/systems/gear.go`: `DefaultSpeed × (1 + MoveSpeedPercent/100)`).
   `MovementSystem` (`internal/systems/movement.go`) moves a walker by `VX × Speed × dt` unless a
   charge is in flight.
4. **The state is game-service's own JSON.** `PublicPlayerState` (`internal/types/game.go`) is
   serialized in `internal/serializer/state_serializer.go` and sent over the game WebSocket, which
   bypasses the gateway (ADR-0004). It is neither proto nor OpenAPI, and the client's state types
   are hand-written (`src/types/gameState.ts`).
5. No client→server message on main carries facing. In-game actions are parsed in
   `internal/types/messages.go`, routed by the hub's allowlist (`gameActions`,
   `internal/gameserver/hub.go`), and handled in `internal/game/session.go`; the hub refuses an
   action outside the allowlist with "Unknown action".
6. ADR-0030: the server never learns where an archer faced while holding Shadow Shot, and teammates
   do not see that turn.
7. `CharacterMotion` / `selectAnimation` (`src/render/art/character.ts`, `animationSelect.ts`) take
   the facing from the drawn velocity; an attack faces its aim; a Shadow Shot hold stands the archer
   in idle turned to the held aim; the merc's guard plays the way he is going. Other players never
   play an attack clip today: only the local player's animator is told of a swing.
8. `walk_attack` lasts as long as the attack (14 frames at 24 fps) and walks its legs over
   `WALK_ATTACK_CYCLES` = 2 walk cycles, which fits 200 px/s. One walk cycle covers 74 × 0.8 ≈ 59
   world px; at 90 px/s the 0.583 s swing covers about 52, about one cycle.
9. Class atlases on main (2x, trimmed, one page each): knight 3396 × 3532, archer 2924 × 3844,
   wizard 2720 × 3356, mercenary 3460 × 3424, about 177 MB of RGBA together. They are resident
   groups (ADR-0059): loaded at boot, never evicted. Each class has 42 frames × 8 directions = 336
   (mercenary 46 × 8 = 368). `MAX_SIZE` is 4096 (`tools/bake/lib/pack.mjs`).
10. **Measured on the branch (slice 5, I-JS7C8-5).** `tools/bake/page/characters/pace.js` reads
    the run at 193.7 world px/s at 14 fps (`RUN_PACE` = 194), the backpedal legs at 165.4 at 18 fps
    (8 frames: one cycle 0.444 s, about 73.5 px), and the walk at about 80 against `WALK_PACE`'s
    74. With `run` and `backpedal` (+128 frames) the archer grew 336 → 464 frames, 2924 × 3844 →
    3760 × 4008 on one page, RGBA 45.0 → 60.3 MB (+34.1%), about 0.27% per added frame. On that
    sheet `walk_attack` walks its legs over one walk cycle (`RUN_WALK_ATTACK_CYCLES` = 1): about
    101 px/s of leg pace by `WALK_PACE` (110 by pace.js's walk), against 90 px/s on the ground.
11. A new swing starts its clip from frame 0 (`CharacterAnimator.show`, `swingPending`); starting or
    stopping moving mid-swing swaps `attack` ↔ `walk_attack` at the same point of the shot
    (FS-HF0WW R13). A charge (the warrior's dash) plays `attack` whole, never over the legs
    (`walkAttack && !charging`, FS-3V7GC R6). A Shadow Shot hold stands in idle turned to the held
    aim; its release plays the archer's `attack` (`src/render/combat/playerCombat.ts`).

## Requirements

### §A. The run (game-client: bake and clip choice)

1. **(owner)** knight, archer, wizard and mercenary each carry a `run` clip: 8 frames, looping, in
   the 8 directions, hand-keyed on the shared rig (ADR-0021), baked with the class's sheet at 2x and
   trimmed like its other clips (ADR-0058).
2. **(owner)** The run is the whole body coordinated, a jog and not a sprint:
   - arms and legs swing in opposition (the right arm forward with the left leg);
   - the upper body turns against the hips with the stride;
   - the centre of mass rises and falls once per step;
   - the head stays steady (it does not bob or roll with the chest);
   - each step has a brief flight phase, in which neither foot touches the ground.
   Cloth and other spring bones follow it as they follow the walk.
3. **(charter default)** The run is keyed so its measured pace, `RUN_PACE` (world px per second the
   run covers at 1x, measured as `WALK_PACE` is), lies within 180–220. Reason: the owner's "plays
   at about its own pace at 200 px/s". Cadence (fps) and stride are the bake's choice inside that,
   judged by the owner at the contact sheet. Slice 5's run (Fact 10) stays as baked (owner change
   2026-11-12).
4. A class that moves at a drawn speed of at least `MOVING_SPEED` and is not attacking plays `run`
   at `speed / RUN_PACE`, capped as the walk is, turned to its movement (§D), whenever its sheet
   carries `run`. A sheet without `run` (hub folk, monsters, a class not yet re-baked) walks as
   today.
5. **(owner)** `walk` and `walk_attack` stay on every class sheet. No class plays `walk` while
   `run` is on its sheet.
6. **(owner)** Other players run too: §A.4 applies to every class figure a scene draws (town,
   field, run), from its drawn motion.
7. **(owner)** Hub folk and monsters are unchanged.

### §B. The backward step while attacking (game-client: bake and clip choice)

8. **(owner, 2026-11-12)** The four classes carry a `backpedal_attack` clip: the attack from the
   waist up over the backpedal's legs from the waist down, composed the way `walk_attack` is (the
   same layered blend, `layerPoses`): it lasts exactly as long as `attack` (14 frames at 24 fps,
   each attack key held two frames), plays once, is `boxed` like `walk_attack`, and is baked in the
   8 directions with the class's sheet. The backpedal legs are an 8-frame cycle hand-keyed on the
   shared rig: the feet stepping backward, toe first, a short flight (slice 5's
   `backpedalCycle`). **(charter default)** No class sheet carries a standalone `backpedal` clip.
   Reason: with facing from movement (§D) a figure that is not attacking never moves away from its
   facing, so the clip would never play; dropping it saves its 64 frames per class.
9. **(owner, 2026-11-12)** An attacking class figure that moves, whose sheet carries
   `backpedal_attack`, plays it when the angle between the attack's facing (the 8-way facing the
   swing is turned to: its aim, as `walk_attack` turns today) and its drawn movement is **over
   90°**; at 90° or less it plays `walk_attack`. Either is turned to the attack's facing and plays
   at its authored rate, as `walk_attack` does.
10. **(charter default)** `backpedal_attack` walks its legs over **0.625** backpedal cycles (5 of
    the cycle's 8 keys) across the 0.583 s swing: 0.625 × 73.5 ≈ 46 px, about 79 px/s of leg pace
    against the 90 px/s the slowed body moves (0.45 × 200). Reason: the owner's "too fast" (R21)
    as one rule for both attack-on-the-move clips: the legs never outrun the ground. 0.75 cycles
    (6 keys) would be 94 px/s, faster than the ground; 0.625 is the nearest whole-key count under
    it. The backpedal legs' measured pace (pace.js, Fact 10) stays within 150–220; the bake
    measures it and derives the clip's leg pace from it, never guessed. The owner tunes the cycle
    count at the contact sheet.
11. **(charter default)** A sheet that carries `walk_attack` but not `backpedal_attack` plays
    `walk_attack` at any angle (today's look, FS-HF0WW R15's accepted moonwalk). Reason: the
    classes bake one at a time.
12. **(owner)** The backward step never changes speed: the server knows nothing of it; the attack
    slow (§C) is the only speed rule while attacking.
13. `walk_attack` ↔ `backpedal_attack`: both last 14 frames, so a swap mid-swing (the movement
    crossing the 90° line) carries the frame index over and the shot never restarts, as
    `attack` ↔ `walk_attack` does (FS-HF0WW R13). Stopping mid-swing plays `attack` from the same
    point of the shot. A new swing starts from frame 0.
45. **(owner, 2026-11-12)** Not attacking, a class never steps backward: a moving class runs
    turned to its movement (§A.4).

### §C. Attacking slows to a walk (game-service, game-client)

14. **(owner)** While a player attacks, the server moves them at a slowed speed; the client plays
    `walk_attack` (or `backpedal_attack`, §B) while they move and only draws the server's
    positions.
15. **(charter default)** The **attack slow** is a factor, `AttackSlowFactor` = 0.45, on the
    player's own move speed (gear included): 0.45 × 200 = 90 px/s unequipped. It is applied in
    `MovementSystem`, never written into `VelocityComponent.Speed`. Reason: gear keeps counting and
    `Speed` keeps its one writer per cause.
16. **(owner, charter default for the number)** The slow lasts `AttackSlowDuration` = 0.6 s from the
    tick a cast resolves, and is lifted on the first tick after (no easing). Reason: the attack's
    own action (the clip is 0.583 s), restored at once.
17. **(owner)** A cast slows only if it resolves (passes cooldown, cost and, for a targeted attack,
    its target): a refused cast changes nothing. The kinds: `attack`, `slash`, `cut` (and the
    riposte it becomes), `arrow`, `fireball`, `shadow_shot`, `triple_fireball`, `dash`. **Not**
    `parry`, and no monster kind.
18. A new resolved cast inside the window restarts it at 0.6 s; slows never stack.
19. The slow paces the walk only: a charge in flight (`dash`) moves at its own speed, and the walk
    after it, inside the window, is slowed.
20. The slow applies wherever the combat system resolves a player's cast: runs, field worlds, the
    dev test room. Nothing is sent about it: `direction.speed` keeps reporting the move speed
    without the slow, and the slow is seen only in positions.
21. **Tunes FS-HF0WW `WALK_ATTACK_CYCLES` 2 → 0.75** for every class sheet that carries `run`
    (slice 5 set 1; owner 2026-11-12: "走的動畫可以再放慢一些腳步的播放 有點過快"). **(charter
    default)** At one cycle the legs' pace is about 101 px/s (Fact 10) against 90 on the ground;
    0.75 cycles (6 of the walk's 8 keys, a step and a half) is 25% slower, about 76 px/s by
    `WALK_PACE` (82 by pace.js's walk), under the ground's 90. Reason: the legs never outrun the
    ground (R10's rule), and 0.75 is the nearest whole-key count to the charter's "about 25%
    slower" (0.5, one step, would be 50% slower). The owner tunes it at the contact sheet.
    `walk_attack` still lasts exactly as long as `attack`.

### §D. Facing follows movement (game-client)

22. **(owner, 2026-11-12)** A character faces where it moves: the nearest of the 8 facings to its
    drawn movement, as before this FS, in every world (town, field, run), for the local player and
    for every other figure. Standing keeps the last facing. The pointer never turns a character.
23. *Removed 2026-11-12 (the pointer facing taken through `screenToWorld`).*
24. Unchanged rules: an attack, `walk_attack` and `backpedal_attack` face their aim, and standing
    after a swing keeps that facing; death keeps the facing it fell in; a Shadow Shot hold turns to
    the held aim (FS-JTNPR R10); the merc's guard plays the way he is going.
25. *Removed 2026-11-12 (facing as presentation sent as `face`; nothing is sent now).*
26. *Removed 2026-11-12 (the pointer off the canvas; the pointer no longer turns anything).*

### §E. No facing on the wire (game-service, game-client)

27. *Removed 2026-11-12 (the `face` action).*
28. *Removed 2026-11-12 (when `face` is sent).*
29. *Removed 2026-11-12 (no `face` during a Shadow Shot hold). ADR-0030 holds unchanged: nothing
    about facing is sent at all.*
30. *Removed 2026-11-12 (the hub routing `face`).*
31. *Removed 2026-11-12 (the server keeping a player's facing).*
32. *Removed 2026-11-12 (`PublicPlayerState.facing`).*
33. **(owner)** No proto, api-gateway, OpenAPI, generated client or database change.
34. *Removed 2026-11-12 (another player's figure facing their relayed `facing`): other players
    face their drawn movement (R22).*
35. *Removed 2026-11-12 (no rule reads facing): game-service keeps no facing at all (R47).*
47. **(charter default, 2026-11-12)** No game WebSocket message or state field changes. The
    `face` action (its constant, payload, hub routing and Debug log, the session's handler and the
    stored facing component) and `PublicPlayerState.facing` that slice 2 built, and the client's
    face sender, `facing` on the player entry, the `face` entry in `ActionMap` and the pointer
    facing that slices 3 and 4 built, are removed before merge. Reason: with facing from movement
    nothing reads them, and other clients derive facing from movement as they always did, so the
    wire would carry a value nobody uses.

### §F. Bake, review and art budget (game-client)

36. **(owner)** The new clips are baked by the bake tool (`npm run bake`), never drawn or edited by
    hand. Each class opts in to `run` and `backpedal_attack` on its own, so one class can be baked,
    reviewed and shipped before the next.
37. **(owner)** The bake's contact sheet shows each class's `run`, `walk_attack` and
    `backpedal_attack` in 8 directions at game scale, beside its `walk` and `attack`. A class's
    re-baked sheet ships only after the owner approves its contact sheet (ADR-0021 §5).
38. **(owner)** Each class slice reports, from the bake: the class's atlas pages and their
    dimensions before and after, the RGBA bytes before and after, and the growth in per cent. The
    first class's report is checked against the estimate below; growth well past it is escalated
    before the next class is baked.
39. Estimate (Facts 9, 10): `run` (8 × 8 = 64 frames) and `backpedal_attack` (14 × 8 = 112) add
    176 frames per class against main, about +47% at the archer's measured 0.27% a frame
    (mercenary about +43%), about +83 MB resident in all (about 177 → 260 MB). Against slice 5's
    archer (with `backpedal`) it is +48 frames: dropping `backpedal` saves 64, `backpedal_attack`
    costs 112. A class may spill onto a second 4096 page.
40. `npm run bake -- --check` is clean after each class slice: the committed atlases are what the
    bake produces.
41. The design guideline's character clip list and the dev contact-sheet notes name `run`,
    `walk_attack`'s legs and `backpedal_attack` for the playable classes; its "Eight facings" says
    a character faces its movement, never the pointer.
48. The archer's re-bake carries FS-2325V `## Change: The archer's draw stays on the aim line`, so
    the archer is baked once with both changes; its contact sheet shows main's `attack` beside the
    new `attack`, `walk_attack` and `backpedal_attack`.

### §G. Verification

42. Unit: clip choice (§A.4, §B.9, R11, R13, R45), facing from movement (§D.22, R24), the server's
    slow (§C.15–20), each with its own tests; the removal (R47) shown absence-first: `face` is
    refused as an unknown action and no player entry in the state carries `facing`.
43. Bake: clip tests on the rig for the run's flight phase, opposite swing and pace band; the
    backpedal legs' pace band; `walk_attack` and `backpedal_attack` each lasting exactly as long as
    `attack`, their legs' pace at most 90 px/s.
44. In the browser, two players in one run and in the town: the run, the slowed walk while
    attacking, the backward step while attacking away from the aim, and each seeing the other
    turned to their movement.

## User Stories

1. As a player, I want my character to run at the speed it moves, so that it no longer looks like
   it is speed-walking.
2. As a player, I want the run to move the whole body, arms against legs, so that it reads as a
   real jog.
3. As a player, I want my character to face where I run, so that the keys I press turn it and the
   mouse only aims.
4. As a player, I want my character to keep its facing when I stop, so that it does not snap to a
   default.
5. As a player, I want to step backward when I attack while moving away from my target, so that
   kiting reads as a retreat, not a moonwalk.
6. As a player, I want a sideways move while attacking to keep the walk, so that strafing while I
   fight reads as deliberate.
7. As a player, I want attacking to slow me to a walk, so that a swing has weight and cannot be
   thrown at a full run.
8. As a player, I want my speed back the moment my attack is done, so that I am not slowed longer
   than my swing.
9. As a player, I want my legs to step no faster than I move while I attack, so that my feet do not
   scurry under a slow body.
10. As a mercenary, I want raising my parry not to slow me, so that guarding never costs me ground.
11. As a warrior, I want my dash to carry me at its full speed, so that the slow does not blunt it.
12. As an archer, I want my Shadow Shot aim to stay my own, so that teammates see the shot, not the
    draw (ADR-0030).
13. As a player, I want my teammates to face where they move, as they always have, so that I read
    where they are going.
14. As a player, I want other players to run as I do, so that the world looks consistent.
15. As a player in the town, I want other players to face where they walk, so that the town reads
    as it did before.
16. As a player, I want moving the mouse never to turn my standing character, so that looking
    around does not twist the figure.
17. As a player with gear that speeds me, I want the slow to scale from my own speed, so that my
    gear still counts while I fight.
18. As a player, I want a refused attack (on cooldown) not to slow me, so that mashing the button
    does not cost me speed.
19. As the owner, I want to approve each class's run, attack walk and backward step on a contact
    sheet before it ships, so that the motion is judged by eye.
20. As the owner, I want the texture-memory cost of the new clips reported per class, so that I can
    stop before the budget is blown.
21. As a developer, I want the run's and the attack legs' paces derived from the bake's
    measurements, so that they are facts and not guesses.
22. As a developer, I want no `face` action and no `facing` field left on the wire, so that no
    dead wire stays.
23. As a developer, I want game-service to keep no facing at all, so that a modified client has
    nothing to lie about.
24. As a developer, I want a sheet without the new clips to keep today's look, so that classes can
    be baked one at a time.
25. As a teammate on a slow connection, I want facing to cost no traffic, so that it is drawn from
    the movement I already receive.
26. As the owner, I want the attack legs' pace to be one named number per clip, so that I can tune
    it at the contact sheet.

## Acceptance Criteria

### Run and the backward step (game-client)

- [ ] Each of the four class sheets in `public/art/manifest.json` carries `run` (8 frames, looping)
      and `backpedal_attack` (14 frames at 24 fps, once), 8 directions, at the class's scale and
      trimmed; `walk` and `walk_attack` are still there; no class sheet carries `backpedal`.
- [ ] Bake tests show the run's flight phase (a frame with both feet off the ground), its arms
      swinging opposite its legs, and its pace within 180–220; the backpedal legs' pace within
      150–220.
- [ ] `walk_attack` and `backpedal_attack` each last exactly as long as `attack`; on a sheet with
      `run`, `walk_attack`'s legs walk 0.75 walk cycles and `backpedal_attack`'s 0.625 backpedal
      cycles, each a leg pace of at most 90 px/s.
- [ ] A class figure moving at 200 px/s and not attacking plays `run` turned to its movement at a
      time scale within 0.9–1.1.
- [ ] Attacking while moving: over 90° between the attack's facing and the movement plays
      `backpedal_attack`; at exactly 90° and below, `walk_attack`; both turned to the aim.
- [ ] A swap between `walk_attack` and `backpedal_attack` mid-swing keeps the frame index; a new
      swing starts at frame 0.
- [ ] Not attacking, no class figure ever plays a backward step.
- [ ] A sheet without `run` walks as today; one with `walk_attack` but no `backpedal_attack` plays
      `walk_attack` at any angle.
- [ ] Hub folk and monsters play exactly the clips they play today.
- [ ] Each class's contact sheet is approved by the owner before its sheet is merged.
- [ ] Each class slice records its atlas and RGBA growth; `npm run bake -- --check` is clean.

### Attack slow (game-service, game-client)

- [ ] A player whose cast of any slowing kind resolves moves at 0.45 × their move speed for the
      next 0.6 s, and at their full move speed on the first tick after.
- [ ] A cast refused for cooldown, cost or target does not slow.
- [ ] `parry` never slows; no monster is ever slowed by this rule.
- [ ] A second resolved cast inside the window restarts it; the speed is never below 0.45 ×.
- [ ] A dash's charge travels at its own speed; walking after it inside the window is slowed.
- [ ] Worn move speed still counts: +20% gear walks at 0.45 × 240 = 108 px/s while slowed.
- [ ] `direction.speed` on the wire is unchanged by the slow.

### Facing (game-client, game-service)

- [ ] The local character faces the 8-way direction of its movement, and keeps it standing, in the
      town, a field and a run; moving the pointer never turns it.
- [ ] Attacks still face their aim; death keeps its facing; a Shadow Shot hold turns to the held
      aim.
- [ ] Another player's figure faces their movement, as before this FS.
- [ ] game-service refuses `{"action":"face", …}` as an unknown action; no `current_player` or
      `other_players` entry carries `facing`.
- [ ] The client sends no `face`; no pointer-facing or face-sender module remains, and the player
      entry type has no `facing`.
- [ ] No facing component, constant, payload or serializer field remains in game-service (a grep
      in review).
- [ ] No file under `game-server/common/api/proto`, `game-server/api-gateway`,
      `game-client/src/api/generated` or any migration changes.

## Edge States

- **Moving across the 90° line mid-swing.** `walk_attack` and `backpedal_attack` may swap back and
  forth; the frame index carries over (R13), so the shot never restarts.
- **Kiting.** Shooting while moving away from the aim plays `backpedal_attack`: the legs step back
  under a body turned to the target, at the slowed speed (owner 2026-11-12; replaces FS-HF0WW
  R15's accepted moonwalk on a sheet that carries it).
- **Repeated swings.** Each new swing starts its clip, legs included, at frame 0. At one whole walk
  cycle the legs ended where they began; at 0.75 (0.625) cycles a swing thrown the moment the last
  ends jumps the legs back by a quarter (three eighths) of a cycle. Accepted for v1; judged at the
  browser check (R10, R21 are the tunables).
- **Latency.** The client starts its swing on the click; the server's slow starts on the resolved
  tick. For that gap the legs may show slower than the ground; at the end the run may show for a
  moment at the slowed speed. Accepted.
- **Refused casts.** A swing the client draws that the server refuses (cooldown) plays
  `walk_attack` or `backpedal_attack` at full speed, its legs slower than the ground for 0.6 s.
  Accepted; the client's own cooldown keeps it rare.
- **Others attacking.** Other players get no attack clip today, so an ally who attacks is seen
  running, turned to their movement, at 45% of the run's pace for 0.6 s, never stepping backward.
  Escalated (see *Open for the owner*).
- **A charge (the warrior's dash).** Plays `attack` whole as before (Fact 11), never `walk_attack`
  or `backpedal_attack`, whichever way the body is carried.
- **A Shadow Shot hold while moving.** Stands in idle turned to the held aim, as before; its
  release is a swing like any other, so moving away from the aim plays `backpedal_attack`.
- **Dead.** A dead body keeps the facing it fell in.
- **World switch, reconnect, handoff.** The new body faces its spawn facing until it moves.
- **Strafing without attacking.** The figure turns to its movement and runs; there is no side-run.
- **Gear changed mid-slow.** The slow multiplies whatever move speed the player has on that tick.
- **A class re-baked before the others.** Mixed parties show some classes running and some walking
  until every class ships (R36); a class with `run` but not yet `backpedal_attack` keeps
  `walk_attack` when kiting (R11).
- **A client built from slices 3–4 against a server without `face`** (branch only): its `face`
  messages are refused as unknown actions. The client stops sending before the server stops
  accepting (I-JS7C8-11 before I-JS7C8-10), and neither reaches main.
- **Atlas spill.** A class that spills onto a second page loads both at boot (resident group).

## Wire

No HTTP, RPC or game WebSocket change, so this FS has no API surface table. The `face` action
and the state's `facing` field that R27–R32 once specified are removed by the change of
2026-11-12 (R47); slices 2 and 4 built them on the branch, and they never reach main.

## Out of Scope

- A run-attack clip; any change to `idle`, `death` or `parry`. (The archer's `attack` draw is
  FS-2325V's change, only baked here: R48.)
- A standalone backward step: stepping back without attacking.
- Any speed rule tied to facing or the backward step.
- Facing toward the pointer, anywhere (the canvas menus included): removed 2026-11-12.
- Facing on the wire, or any facing kept by game-service: removed 2026-11-12.
- Facing affecting aim, range, hits, blocking or monster behaviour.
- Drawing other players' attacks (`attack`, `walk_attack`, `backpedal_attack` for others).
- Run or the backward step for hub folk, residents, creatures or the menu figures.
- Sending the Shadow Shot aim turn to teammates (ADR-0030).
- Moving class atlas groups out of the resident set, or any other VRAM measure beyond reporting.
- Using the kept `walk` clip for anything (kept for later, decision 1).
- The WebSocket compression of FS-5QC03.

## Open for the owner

1. *Settled 2026-11-12: no facing is stored or relayed, so no ADR on a client-chosen facing is
   needed, and ADR-0030 holds unchanged.*
2. **VRAM:** about +83 MB resident (+47% of class art, R39), more than slice 5's +34% for the
   archer. Options: accept; bake `run` and `backpedal_attack` at 1x (about a quarter of that);
   `backpedal_attack` at 7 frames (one per attack key, 56 frames fewer a class, about 27 MB less in all, coarser legs);
   load class groups per class present (an ADR-0059 change).
3. **Others' attacks:** should an ally's attack be relayed so others see them slow to
   `walk_attack` or step back in `backpedal_attack`, rather than a slow-motion run?
4. **The attack legs' cycles** (R21: `walk_attack` 0.75, R10: `backpedal_attack` 0.625) are
   charter defaults; the owner tunes them at the archer's contact sheet, and judges the leg jump on
   a repeated swing (Edge States).
