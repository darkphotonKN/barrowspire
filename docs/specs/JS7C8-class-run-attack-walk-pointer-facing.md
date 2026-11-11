# FS-JS7C8: Class run, attack walk, pointer facing, backpedal

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Run and backpedal animations", "Character faces the pointer", "Other players shown facing where they face"; `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Attacking slows the attacker's movement", "Players' facing relayed in the state" → this FS · Stub on the owner it changes: [FS-2325V](2325V-pre-rendered-isometric-art.md) §E.4 (`## Change: Class run, backpedal and pointer facing → FS-JS7C8`) · Tunes: [FS-HF0WW](HF0WW-2x-archer-walk-attack-leg-clearance-trim.md) `WALK_ATTACK_CYCLES` · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md)

## Scoping notes (raw)

Charter run "角色小跑步", 2026-11-12. The owner's locked decisions (approved "核准") are the
answers; nothing was asked again. Code facts are against local main `db29561f`.

### Why (owner)

"目前走動的方式有點怪像是在快走 目前的速度應該用跑的". The four classes have one `walk` clip
(8 frames at 10 fps, `ANIMATIONS.walk` in `game-client/tools/bake/page/characters/clips.js`). The
server moves a player at `DefaultSpeed` 200 world px/s (`game-server/game-service/common/constants/game.go`).
The client plays the walk at `speed / WALK_PACE` = 200 / 74 ≈ 2.7x
(`game-client/src/render/art/animationSelect.ts`), so the player looks like they are speed-walking.

### Locked decisions (owner, 2026-11-12)

1. **Run.** knight, archer, wizard, mercenary get a new `run` clip: 8 frames, looping, hand-keyed
   on the shared rig, the whole body coordinated ("跑步全身動作協調一些"): arms and legs in
   opposite swing, the upper body turning with the stride, the centre of mass rising and falling,
   the head steady, a brief flight phase. A jog, not a sprint. It plays at about its own pace at
   200 px/s. `walk` and `walk_attack` stay baked and kept ("走路可以保留 之後使用"). Other players
   run too. Hub folk and monsters unchanged.
2. **Attacking slows you to a walk** ("攻擊時換成走路狀態 走速會在攻擊時變慢"). While a player
   attacks, the client plays the existing `walk_attack` (no run-attack clip) and the **server**
   lowers that player's move speed to about 90 px/s (45% of 200, a starting value). "While
   attacking" = the attack's own action, about 0.6 s, restored at once after (charter default: the
   owner was asked and did not choose otherwise). Every class's basic attack and skill casts; the
   mercenary's parry is not an attack. Server-authoritative: the client draws the server's positions.
3. **Facing follows the mouse.** Nearest of the 8 facings, moving or standing. Presentation only:
   attack aim and hit rules unchanged. Other players see it: the server relays each player's facing
   in the state it already sends (game-service WebSocket only; no proto, gateway, OpenAPI or
   database change; escalate if not possible).
4. **Backpedal.** Angle between facing and movement over 90°: a new `backpedal` clip (8 frames,
   looping, upper body toward the mouse, feet stepping back). At 90° or less: the run, turned to the
   mouse (a side-run look accepted for v1). No speed change in v1. Attacking while backpedalling
   follows decision 2.
5. New sheets are baked by the bake tool, never by hand; the owner approves each class's contact
   sheet. Report atlas and VRAM growth; escalate if large.

### What the code says (facts this spec rests on)

- **No "attacking now" state exists in game-service.** The nearest are
  `CooldownComponent.Remaining[kind]` (`internal/components/attack.go`), set in
  `CombatSystem.resolve` (`internal/systems/combat.go`) to the row's cooldown: 0.25 s for slash,
  cut, arrow, fireball; 0.4 s dash and triple fireball; 1.2 s Shadow Shot; shortened by worn attack
  speed. None is the length of the attack's action (the client's attack clip is 7 frames at 12 fps,
  0.583 s). `DashComponent` is a charge in flight; `ParryComponent` the stance. So the slow needs a
  new per-player timer, started where `resolve` succeeds.
- **Speed has two writers today.** `VelocityComponent.Speed` is set at spawn (`factory.go`) and by
  `applyMoveSpeed` (`internal/systems/gear.go`, `DefaultSpeed × (1 + MoveSpeedPercent/100)`).
  `MovementSystem` moves by `VX × Speed × dt` unless a charge is in flight. A slow written into
  `Speed` would be overwritten by gear; it must be a factor applied in movement.
- **The state is JSON from game-service's own types.** `PublicPlayerState`
  (`internal/types/game.go`) is serialized in `internal/serializer/state_serializer.go` and sent
  over gorilla WebSocket straight to the client (ADR-0004: game traffic bypasses the gateway). It
  is not proto and not in OpenAPI; the client's types are hand-written (`src/types/gameState.ts`),
  not generated. So facing can ride the state with no contract change: **possible**.
- **No client→server message carries facing.** `move {vx, vy}` is parsed in
  `internal/types/messages.go`; the hub routes in-game actions by an allowlist
  (`gameActions` in `internal/gameserver/hub.go`) and logs every incoming message at Info.
- **ADR-0030** keeps where an archer faces *while holding* Shadow Shot off the server ("It never
  learns ... where the archer faced while aiming"; "Teammates do not see another archer turning
  while they aim"). A general facing relay is not that, but sending facing during the hold would be.
- **ADR-0020 §3 / FS-2325V §0.2**: no existing client→server message changes shape or meaning. A
  new action leaves `move` alone; adding a member to `move` would not.
- `CharacterMotion` / `selectAnimation` (`src/render/art/character.ts`, `animationSelect.ts`)
  take the facing from the drawn velocity; attacks face their aim; Shadow Shot's hold stands the
  archer in idle turned to the held aim; the merc's guard plays "whichever way he is going". Other
  players get no attack clip today (only the local player's `attack()` is called).
- `walk_attack` lasts as long as the attack (14 frames at 24 fps) and walks its legs over
  `WALK_ATTACK_CYCLES` = 2 walk cycles, which fits 200 px/s. One walk cycle covers 74 × 0.8 = 59 px;
  at 90 px/s the 0.583 s swing covers 52 px, about one cycle. With 2 the legs scurry at about 2.2x
  the ground they cover. FS-HF0WW R11 names the tunable.
- **Atlas budget.** Class atlases today (one page each, 2x, trimmed): knight 3396 × 3532, archer
  2924 × 3844, wizard 2720 × 3356, mercenary 3460 × 3424, about 177 MB of RGBA in all. They are
  resident groups (ADR-0059): loaded at boot and kept. Frames per class today 42 × 8 = 336
  (mercenary 46 × 8 = 368). Run + backpedal add 16 × 8 = 128: about +38% (mercenary +35%),
  about +66 MB, about 243 MB. `MAX_SIZE` 4096 (`tools/bake/lib/pack.mjs`): each class will likely
  spill onto a second page.

### Charter defaults taken here (each with its reason)

- **Facing goes up as a new `face {facing}` action**, not a member of `move`. Reason: leaves `move`
  unchanged (ADR-0020 §3, FS-2325V §0.2); a standing turn need not resend velocity.
- **Facing on the wire is the world-compass name** (`n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`,
  the client's `Facing8`). Reason: the 8 baked directions; nothing finer is drawn.
- **The pointer's facing is taken in world space** (`screenToWorld` of the pointer, minus the
  character's world position, snapped by `facingFrom`). Reason: the bake turns models in world 45°
  steps, and attack aim already works this way.
- **Facing is sent only on change, at most once per 100 ms, the latest wins**, and once on the first
  state in a world. Reason: 8 discrete values; bounded traffic; the hub logs incoming messages.
- **No facing is sent while a Shadow Shot hold is up**: teammates see the facing from before the
  hold. Reason: ADR-0030 (the server never learns where the archer faced while aiming). Deviates
  from decision 3 for that one case; escalated.
- **The slow is a factor (0.45) of the player's own move speed**, not a fixed 90. Reason: gear's
  move speed keeps counting and `Speed` keeps one writer; 0.45 × 200 = 90.
- **The slow window is 0.6 s from the tick the cast resolves; a new resolved cast restarts it.**
  Only a cast that resolves (passes cooldown, cost and target) slows. It slows the walk, never a
  charge in flight. `direction.speed` on the wire is unchanged (the slow shows only in positions).
- **Kinds that slow:** `attack`, `slash`, `cut` (and the riposte it becomes), `arrow`, `fireball`,
  `shadow_shot`, `triple_fireball`, `dash`. Not `parry`, not monster kinds.
- **`WALK_ATTACK_CYCLES` 2 → 1** for a class that carries `run` (Tunes FS-HF0WW). Reason: decision
  2's "the walk plays near its own pace" at about 90 px/s.
- **Run pace:** the run is keyed so its measured pace (`RUN_PACE`, as `WALK_PACE` is measured) is
  within 180–220 world px/s; the client plays it at `speed / RUN_PACE`. Backpedal likewise
  (`BACKPEDAL_PACE`). Cadence and stride are the bake's; the owner judges at the contact sheet.
- **Every clip that took the movement direction takes the pointer facing**: idle, run, backpedal,
  the guard. Attacks still face their aim; death keeps its facing; the Shadow Shot hold still
  turns to the held aim.
- **A sheet without `run` walks as today; one without `backpedal` turns to its movement** (today's
  look). Reason: classes bake one at a time; folk and monsters never carry them.
- **Pointer facing in every world the player has a character in** (town, field, run). The pointer
  off the canvas keeps the last facing.
- **Other players:** their facing from the wire; absent, from their movement as today.

### Edge cases raised

- Run ↔ backpedal at the 90° line: both loop over 8 frames, so a swap keeps the place in the cycle
  rather than restarting the stride (the turn rule `show` already has).
- Attacking while backpedalling: `walk_attack` facing the aim; legs walk toward the aim while the
  body goes back. Accepted by decision 4.
- Client predicts its swing on click; the server slows from the resolved tick (latency later). The
  run may show for that latency at the slowed speed; a refused cast shows a swing at full speed.
- Other players' attacks are not drawn today, so an attacking ally is seen running at 45% of the
  run's pace. Escalated.
- A dash: the charge is unchanged; walking after it inside 0.6 s of the cast is slowed.
- Gear move speed +X%: slowed speed is 0.45 × the geared speed.
- World switch, reconnect: the facing starts absent and is sent on the first state.

### Open questions (escalated, not decided)

- ADR worth recording: facing is client-chosen presentation the server stores and relays but never
  reads for a rule; it amends ADR-0030's consequence only if the owner wants the Shadow Shot aim
  turn seen by teammates.
- VRAM: about +66 MB resident (+37% of class art). Options: accept; bake run/backpedal at 1x;
  make class groups load per class present (ADR-0059 change); fewer frames.
- Should an ally's attack be relayed so others see `walk_attack` too (today they see none)?
