# FS-JS7C8: Class run, attack walk, pointer facing, backpedal

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Run and backpedal animations", "Character faces the pointer", "Other players shown facing where they face"; `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Attacking slows the attacker's movement", "Players' facing relayed in the state" → this FS · Stub on the owner it changes: [FS-2325V](2325V-pre-rendered-isometric-art.md) §E.4 (`## Change: Class run, backpedal and pointer facing → FS-JS7C8`) · Tunes: [FS-HF0WW](HF0WW-2x-archer-walk-attack-leg-clearance-trim.md) `WALK_ATTACK_CYCLES` (R11) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (§3: no existing client→server message changes), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored clips, the owner's contact-sheet gate), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming stays off the server), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (2x, trimmed sheets), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (class groups are resident) · Surfaces: game-client (clip choice, pointer facing, bake, class atlases), game-service (attack slow, facing relay)

> Promoted `--from-thread` on 2026-11-12 from the charter "角色小跑步" (owner approved "核准").
> The thread is the charter's locked decisions. Requirements marked **(owner)** are those
> decisions. Those marked **(charter default)** settle what the decisions left open, each with its
> reason. Every number is a starting value. Code citations are against local main `db29561f`.

## Summary

The four playable classes run instead of speed-walking: a new `run` clip, a jog on the shared rig,
plays at about its own pace at the server's 200 px/s. Attacking slows a player to a walk: the server
cuts their move speed for the attack's own short action and the client plays the existing
`walk_attack`. The character faces the mouse pointer, moving or standing, and moving away from it
plays a new `backpedal` clip. Other players see each player's facing, which the server relays in
the state it already sends; facing never changes aim or hits.

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
   are hand-written (`src/types/gameState.ts`). Facing can ride the state with no contract change.
5. No client→server message carries facing. In-game actions are parsed in
   `internal/types/messages.go`, routed by the hub's allowlist (`gameActions`,
   `internal/gameserver/hub.go`), and handled in `internal/game/session.go`; the hub logs every
   incoming message at Info except `chat` and `renew_token`.
6. ADR-0030: the server never learns where an archer faced while holding Shadow Shot, and teammates
   do not see that turn.
7. `CharacterMotion` / `selectAnimation` (`src/render/art/character.ts`, `animationSelect.ts`) take
   the facing from the drawn velocity; an attack faces its aim; a Shadow Shot hold stands the archer
   in idle turned to the held aim; the merc's guard plays the way he is going. Other players never
   play an attack clip today: only the local player's animator is told of a swing.
8. `walk_attack` lasts as long as the attack (14 frames at 24 fps) and walks its legs over
   `WALK_ATTACK_CYCLES` = 2 walk cycles, which fits 200 px/s. One walk cycle covers 74 × 0.8 ≈ 59
   world px; at 90 px/s the 0.583 s swing covers about 52, about one cycle.
9. Class atlases today (2x, trimmed, one page each): knight 3396 × 3532, archer 2924 × 3844,
   wizard 2720 × 3356, mercenary 3460 × 3424, about 177 MB of RGBA together. They are resident
   groups (ADR-0059): loaded at boot, never evicted. Each class has 42 frames × 8 directions = 336
   (mercenary 46 × 8 = 368). `MAX_SIZE` is 4096 (`tools/bake/lib/pack.mjs`).

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
   judged by the owner at the contact sheet.
4. A class that moves at a drawn speed of at least `MOVING_SPEED` plays `run` at
   `speed / RUN_PACE`, capped as the walk is, whenever its sheet carries `run` and §B does not
   apply. A sheet without `run` (hub folk, monsters, a class not yet re-baked) walks as today.
5. **(owner)** `walk` and `walk_attack` stay on every class sheet. No class plays `walk` while
   `run` is on its sheet.
6. **(owner)** Other players run too: §A.4 applies to every class figure a scene draws (town,
   field, run), from its drawn motion.
7. **(owner)** Hub folk and monsters are unchanged.

### §B. The backpedal (game-client)

8. **(owner)** The four classes carry a `backpedal` clip: 8 frames, looping, in the 8 directions,
   hand-keyed on the shared rig: the upper body toward the facing, the feet stepping backward.
9. **(owner)** A moving class figure whose sheet carries `backpedal` plays it when the angle
   between its facing direction (§D) and its drawn movement is **over 90°**; at 90° or less it
   plays `run` (§A.4), turned to its facing, so a sideways move looks like a side-run (accepted for
   v1).
10. **(charter default)** The backpedal is keyed so its measured pace, `BACKPEDAL_PACE`, lies within
    150–220, and plays at `speed / BACKPEDAL_PACE`, capped as the walk is. Reason: decision 4 keeps
    the speed (v1), so it covers 200 px/s like the run.
11. **(charter default)** A sheet that carries `run` but not `backpedal` plays `run` turned to its
    movement when the angle is over 90°. Reason: the classes bake one at a time; a moonwalk is
    worse than today's look.
12. **(owner)** Backpedalling never changes speed in v1: the server knows nothing of it.
13. Run ↔ backpedal: both loop over 8 frames, so a swap keeps the place in the cycle (the frame
    index carries over), as a looping clip turning to a new facing does today.

### §C. Attacking slows to a walk (game-service, game-client)

14. **(owner)** While a player attacks, the server moves them at a slowed speed; the client plays
    `walk_attack` while they move (as today) and only draws the server's positions.
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
21. **Tunes FS-HF0WW `WALK_ATTACK_CYCLES` 2 → 1** for every class sheet that carries `run`.
    Reason: at about 90 px/s one walk cycle fits the swing (Fact 8), so the walk plays near its own
    pace, as decision 2 says. `walk_attack` still lasts exactly as long as `attack`.

### §D. The character faces the pointer (game-client)

22. **(owner)** The local player's character faces the pointer: the nearest of the 8 facings,
    moving or standing, in every world it has a character in (town, field, run).
23. **(charter default)** The facing is taken in world space: the pointer through `screenToWorld`,
    minus the character's world position, snapped by `facingFrom`. Reason: the bake turns models in
    world 45° steps, and attack aim works the same way.
24. **(charter default)** Every clip that took the movement direction takes the pointer facing:
    idle, run, backpedal, the merc's guard. Unchanged: an attack and `walk_attack` face their aim;
    death keeps the facing it fell in; a Shadow Shot hold turns to the held aim (FS-JTNPR R10).
25. **(owner)** Facing is presentation only: no aim, range, target, hit or message other than
    `face` (§E) reads it.
26. **(charter default)** With the pointer off the canvas, the last facing stays. Before the pointer
    first moves in a world, the spawn facing stands, as today.

### §E. Facing on the wire (game-service, game-client)

27. **(charter default)** The client sends a new game WebSocket action
    `{"action": "face", "payload": {"player_id", "facing"}}`, `facing` one of `n`, `ne`, `e`,
    `se`, `s`, `sw`, `w`, `nw` (world compass, the client's `Facing8`). Reason: a new action leaves
    `move` unchanged (ADR-0020 §3, FS-2325V §0.2), and a standing turn need not resend velocity.
28. **(charter default)** The client sends `face` once on its first state in a world (after a world
    switch, a reconnect, a handoff) and then only when its 8-way facing changes, at most once per
    100 ms, the latest facing winning (a change inside the 100 ms is sent at its end). Reason:
    bounded traffic over 8 discrete values.
29. **(charter default)** While a Shadow Shot hold is up the client sends no `face`; teammates keep
    the facing from before the hold. Reason: ADR-0030 (the server never learns where the archer
    faced while aiming). The next change after the release is sent as usual.
30. The hub routes `face` to the player's world like the other in-game actions, and logs it at
    Debug, not Info.
31. The server keeps each player's last facing on their body. A `face` with a value outside the 8
    names, or from a player with no body in a world, is ignored (logged at Debug); nothing is sent
    back.
32. The state carries it: `PublicPlayerState` gains `facing` (string, omitted until the player has
    sent one), so `current_player` and every `other_players` entry carry it, in the town, a field
    and a run. No other field changes.
33. **(owner)** No proto, api-gateway, OpenAPI, generated client or database change.
34. **(owner)** A class figure for another player faces their `facing` from the state; with none,
    it faces its movement as today. §A.4 and §B.9 apply to it with that facing. Its own client
    ignores the echo of its own facing and keeps the pointer's.
35. Facing is never read by any game-service rule.

### §F. Bake, review and art budget (game-client)

36. **(owner)** The new clips are baked by the bake tool (`npm run bake`), never drawn or edited by
    hand. Each class opts in to `run` and `backpedal` on its own, so one class can be baked,
    reviewed and shipped before the next.
37. **(owner)** The bake's contact sheet shows each class's `run` and `backpedal` in 8 directions at
    game scale, beside its `walk` and `walk_attack`. A class's re-baked sheet ships only after the
    owner approves its contact sheet (ADR-0021 §5).
38. **(owner)** Each class slice reports, from the bake: the class's atlas pages and their
    dimensions before and after, the RGBA bytes before and after, and the growth in per cent. The
    first class's report is checked against the estimate below; growth well past it is escalated
    before the next class is baked.
39. Estimate (Fact 9): run + backpedal add 16 × 8 = 128 frames per class, about +38% (mercenary
    +35%), about +66 MB resident in all (about 177 → 243 MB). Each class will likely spill onto a
    second 4096 page.
40. `npm run bake -- --check` is clean after each class slice: the committed atlases are what the
    bake produces.
41. The design guideline's character clip list and the dev contact-sheet notes name `run` and
    `backpedal` for the playable classes.

### §G. Verification

42. Unit: clip choice (§A.4, §B.9–11, §D.24), pointer facing (§D.23), `face` throttling (§E.28–29),
    the server's slow (§C.15–20) and facing relay (§E.30–32), each with its own tests.
43. Bake: clip tests on the rig for the run's flight phase, opposite swing and pace band, and the
    backpedal's pace band.
44. In the browser, two players in one run and in the town: run, backpedal, the slowed walk while
    attacking, and each seeing the other's facing.

## User Stories

1. As a player, I want my character to run at the speed it moves, so that it no longer looks like
   it is speed-walking.
2. As a player, I want the run to move the whole body, arms against legs, so that it reads as a
   real jog.
3. As a player, I want my character to face my mouse, so that I can see where I am about to strike.
4. As a player, I want my character to face my mouse while I stand still, so that turning does not
   need a step.
5. As a player, I want to step backward while facing my mouse, so that I can retreat and still
   face the threat.
6. As a player, I want sideways movement to keep my character turned to the mouse, so that strafing
   looks deliberate.
7. As a player, I want attacking to slow me to a walk, so that a swing has weight and cannot be
   thrown at a full run.
8. As a player, I want my speed back the moment my attack is done, so that I am not slowed longer
   than my swing.
9. As a player, I want my legs to walk at the pace I move while I attack, so that my feet do not
   scurry under a slow body.
10. As a mercenary, I want raising my parry not to slow me, so that guarding never costs me ground.
11. As a warrior, I want my dash to carry me at its full speed, so that the slow does not blunt it.
12. As an archer, I want my Shadow Shot aim to stay my own, so that teammates see the shot, not the
    draw (ADR-0030).
13. As a player, I want to see which way my teammates face, so that I can read where they aim and
    where they will strike.
14. As a player, I want other players to run and backpedal as I do, so that the world looks
    consistent.
15. As a player in the town, I want other players to face where they look, so that standing
    together reads as people turning to each other.
16. As a player whose mouse leaves the window, I want my character to keep its facing, so that it
    does not snap to a default.
17. As a player with gear that speeds me, I want the slow to scale from my own speed, so that my
    gear still counts while I fight.
18. As a player, I want a refused attack (on cooldown) not to slow me, so that mashing the button
    does not cost me speed.
19. As the owner, I want to approve each class's run and backpedal on a contact sheet before it
    ships, so that the motion is judged by eye.
20. As the owner, I want the texture-memory cost of the new clips reported per class, so that I can
    stop before the budget is blown.
21. As a developer, I want the run's pace measured from the bake, so that `RUN_PACE` is a fact and
    not a guess.
22. As a developer, I want facing to be a message of its own, so that `move` keeps its meaning.
23. As a developer, I want facing ignored by every rule, so that a modified client cannot gain
    anything by lying about it.
24. As a developer, I want a sheet without the new clips to keep today's look, so that classes can
    be baked one at a time.
25. As a teammate on a slow connection, I want facing to be sent only on change, so that it costs
    almost nothing.

## Acceptance Criteria

### Run and backpedal (game-client)

- [ ] Each of the four class sheets in `public/art/manifest.json` carries `run` and `backpedal`:
      8 frames, looping, 8 directions, at the class's scale and trimmed; `walk` and `walk_attack`
      are still there.
- [ ] Bake tests show the run's flight phase (a frame with both feet off the ground), its arms
      swinging opposite its legs, and its pace within 180–220; the backpedal's pace within 150–220.
- [ ] A class figure moving at 200 px/s with its facing within 90° of its movement plays `run` at
      a time scale within 0.9–1.1.
- [ ] At over 90° it plays `backpedal`; at exactly 90° it plays `run`.
- [ ] A swap between `run` and `backpedal` keeps the frame index.
- [ ] A sheet without `run` walks as today; one with `run` but no `backpedal` runs turned to its
      movement when over 90°.
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
- [ ] Every class sheet with `run` has `walk_attack` legs over one walk cycle; `walk_attack` still
      lasts exactly as long as `attack`.

### Facing (game-client, game-service)

- [ ] The local character faces the pointer's 8-way world direction, standing, running and
      backpedalling, in the town, a field and a run.
- [ ] Attacks still face their aim; death keeps its facing; a Shadow Shot hold turns to the held
      aim.
- [ ] With the pointer off the canvas the facing does not change.
- [ ] The client sends `face` on its first state in a world, then only on change, never more than
      once per 100 ms, the last change always sent.
- [ ] No `face` is sent while a Shadow Shot hold is up.
- [ ] The server accepts `face` with the 8 names in the town, a field and a run, ignores any other
      value, and logs it at Debug.
- [ ] `current_player.facing` and each `other_players[].facing` carry the player's last sent
      facing, and are absent until one is sent.
- [ ] Another player's figure faces their `facing`; with none, their movement.
- [ ] No rule in game-service reads facing (a test or a grep in review shows no reader outside the
      serializer).
- [ ] No file under `game-server/common/api/proto`, `game-server/api-gateway`,
      `game-client/src/api/generated` or any migration changes.

## Edge States

- **Pointer at the 90° line.** The run and backpedal may swap back and forth as the pointer
  wavers; the frame index carries over (R13), so the stride never restarts.
- **Attacking while backpedalling.** `walk_attack` faces the aim, its legs walking toward it while
  the body goes back at the slowed speed. Accepted (decision 4).
- **Latency.** The client starts its swing on the click; the server's slow starts on the resolved
  tick. For that gap the run may show at full speed; at the end the run may show for a moment at
  the slowed speed. Accepted.
- **Refused casts.** A swing the client draws that the server refuses (cooldown) plays
  `walk_attack` at full speed. Accepted; the client's own cooldown keeps it rare.
- **Others attacking.** Other players get no attack clip today, so an ally who attacks is seen
  running at 45% of the run's pace for 0.6 s. Escalated (see *Open for the owner*).
- **Dead.** A dead body keeps the facing it fell in; `face` from a player with no body is ignored.
  A dead player spectating still turns nothing.
- **World switch, reconnect, handoff.** The new body has no facing until the client sends one on
  its first state; others see its movement facing until then.
- **Mouse spinning.** At most 10 `face` a second; the last one always arrives.
- **A modified client** may send any of the 8 facings at any time: it changes only what others see.
- **Gear changed mid-slow.** The slow multiplies whatever move speed the player has on that tick.
- **A class re-baked before the others.** Mixed parties show some classes running and some walking
  until every class ships (R36).
- **Atlas spill.** A class that spills onto a second page loads both at boot (resident group).

## Wire

No HTTP or RPC endpoint changes, so this FS has no API surface table. The game WebSocket changes
are R27–R32: one new client action, `face {player_id, facing}`, and one new optional state field,
`facing`, on every player entry. `move`, `attack`, `cast_skill` and every other message keep their
shape and meaning.

## Out of Scope

- A run-attack clip; any change to `attack`, `idle`, `death` or `parry`.
- A slower backpedal, or any speed rule tied to facing.
- Facing affecting aim, range, hits, blocking or monster behaviour.
- Drawing other players' attacks (`attack` / `walk_attack` for others).
- Run or backpedal for hub folk, residents, creatures or the menu figures.
- Mouse facing in the canvas menus (main menu, character creation).
- Sending the Shadow Shot aim turn to teammates (ADR-0030).
- Moving class atlas groups out of the resident set, or any other VRAM measure beyond reporting.
- Using the kept `walk` clip for anything (kept for later, decision 1).
- The WebSocket compression of FS-5QC03.

## Open for the owner

1. **An ADR is worth recording:** a player's facing is client-chosen presentation that the server
   stores and relays but never reads for a rule. R29 keeps ADR-0030 whole by sending no facing
   during a Shadow Shot hold, which is the one place decision 3 ("other players must see where you
   face") is not met. If teammates should see the aim turn, ADR-0030's consequence needs amending.
2. **VRAM:** about +66 MB resident (+37% of class art, Fact 9 and R39). Options: accept; bake
   `run` and `backpedal` at 1x (about a quarter of that); load class groups per class present
   (an ADR-0059 change); fewer frames.
3. **Others' attacks:** should an ally's attack be relayed so others see them slow to
   `walk_attack`, rather than a slow-motion run?
4. **`WALK_ATTACK_CYCLES` 2 → 1** (R21) re-keys the existing `walk_attack` legs; taken as decision
   2's "the walk plays near its own pace". Say if the clip should stay as it is.
