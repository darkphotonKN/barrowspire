# FS-JS7C8: Class run, attack walk, backward step while attacking

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Presentation" → "Run and backpedal animations"; `game-server/game-service/SPECIFICATION.md` "### Gameplay actions" → "Attacking slows the attacker's movement" → this FS · Stub on the owner it changes: [FS-2325V](2325V-pre-rendered-isometric-art.md) §E.4 (`## Change: Class run, backpedal and pointer facing → FS-JS7C8`; the stub's name predates the change of 2026-11-12) · Tunes: [FS-HF0WW](HF0WW-2x-archer-walk-attack-leg-clearance-trim.md) `WALK_ATTACK_CYCLES` (R11) · Baked with: [FS-2325V](2325V-pre-rendered-isometric-art.md) `## Change: The archer's draw stays on the aim line` (R48) · Related ADRs: [ADR-0020](../adr/0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) (§3: no existing client→server message changes), [ADR-0021](../adr/0021-characters-are-authored-in-code-not-sourced.md) (authored clips, the owner's contact-sheet gate), [ADR-0030](../adr/0030-ability-aiming-is-client-presentation-the-server-holds-resolved-casts.md) (aiming stays off the server), [ADR-0058](../adr/0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md) (2x, trimmed sheets), [ADR-0059](../adr/0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md) (class groups are resident) · Surfaces: game-client (clip choice, bake, class atlases), game-service (attack slow)

> Promoted `--from-thread` on 2026-11-12 from the charter "角色小跑步" (owner approved "核准").
> The thread is the charter's locked decisions. Requirements marked **(owner)** are those
> decisions. Those marked **(charter default)** settle what the decisions left open, each with its
> reason. Every number is a starting value. Code citations are against local main `db29561f`.
>
> **Edited in place on 2026-11-12 (owner change, still a work-order).** Requirement numbers are
> kept: a requirement the change retires reads *Removed*, and the new ones are R45–R48.
>
> **Edited in place again on 2026-11-12 (the backward step's legs, still a work-order):** R8, R10,
> R43 and their acceptance criteria now build `backpedal_attack`'s legs from `walk_attack`'s; see
> *Owner change, 2026-11-12: the backward step from the forward walk*.
>
> **Edited in place a third time on 2026-11-12 (the run's upper body, still a work-order):** R2,
> R41, R43 and the run's acceptance criteria now make the run a fast run, leaning forward, its
> arms pumping, its legs as baked; see *Owner change, 2026-11-12: a fast run from the waist up*.
> The class sheets' scale moves to 1.5 (FS-HF0WW `## Change: Class sheets at 1.5x`), so R1's "at
> 2x" and R39's figures read at the class's scale.
>
> **Edited in place a fourth time on 2026-11-12 (the weapon carried low, still a work-order):** R2,
> R43 and the run's acceptance criteria now carry the knight's, the wizard's and the mercenary's
> weapon low, at rest and in the run; see *Owner change, 2026-11-12: the weapon carried low*.
>
> **Edited in place a fifth time on 2026-11-12 (the grip and the sceptre's lean, still a
> work-order):** R2, R43 and the run's acceptance criteria now hold the weapon in a normal grip in
> the run, lean the wizard's sceptre at rest, and ease the class attacks in and out of the lowered
> carry; see *Owner change, 2026-11-12: a normal grip, the sceptre's lean*.
>
> **Edited in place a sixth time on 2026-11-12 (the run's weapon a little higher and swung in, the
> sceptre arm's lower pump, the backward step's cloth, still a work-order):** R2, R10, R43 and the
> run's acceptance criteria; see *Owner change, 2026-11-12: the weapon a little higher, swung in*.
>
> **Edited in place a seventh time on 2026-11-12 (the run blade raised, values only):** R2 and the
> run's acceptance line; see *Owner change, 2026-11-12: the blade raised in the run*.
>
> **Edited in place an eighth time on 2026-11-12 (the run blade raised again, values and the head
> check):** R2 and the run's acceptance line; see *Owner change, 2026-11-12: the blade raised again*.

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

## Owner change, 2026-11-12: the backward step from the forward walk

Slice 12's first bake stepped `backpedal_attack` on legs re-keyed for the owner's earlier word the
same day ("後退的動作感覺不太流暢 後退像是在走路沒有後退的感覺"): a crouched backward gait
(`BACK_STEP`), the knees bent all round (at least 0.3 rad), the pelvis held below the walk's,
toe-first landings behind the body and steps about half the walk's, at 1.25 cycles. After playing
it, the owner said (2026-11-12):

> "後退姿勢重做 攻擊時的往前走動很好 後退不用特別有微蹲的感覺 用往前的這個姿勢做後退"

Redo the backward step. The forward walk while attacking (`walk_attack`) is very good. The
backward step should not have the slight crouch; build it from that same forward posture.

So `backpedal_attack`'s legs are `walk_attack`'s legs run backward in time (R8), at the same leg
pace rule (R10). The crouched gait and its requirements (`BACK_STEP`; knees at least 0.3 rad all
round; the pelvis below the walk's; steps shorter than the walk's; the 1.25 cycles) are retired.

## Owner change, 2026-11-12: a fast run from the waist up

After seeing the archer's run (slice 12's bake), the owner said, in order:

> "跑步時有點生硬 一般跑步應該會稍微前傾"
> "現在的跑步有點像在慢跑 希望可以有快跑的感覺"
> "但快跑沒有到疾跑"
> "目前的腳步速度可以 只是上半身有一些變化"

The run is a bit stiff, and a normal run leans slightly forward. Today it looks like a jog; it
should feel like a fast run. But a fast run, not an all-out sprint. The step speed is fine as it
is; only the upper body changes.

So R2's "a jog and not a sprint" (a charter default) is retired: the run is a fast run between a
jog and a sprint, and it gets there from the waist up only (R2). The legs, the stride, the cadence,
the flight and the pelvis's bob stay as slice 5 keyed them, and `RUN_PACE` stays their measure
(R3). The archer is baked once with this and the move to 1.5x (FS-HF0WW `## Change: Class sheets
at 1.5x`, I-HF0WW-8); the other classes take the same run in their own slices.

## Owner change, 2026-11-12: the weapon carried low

After playing the knight, the wizard and the mercenary at 1.5x with the fast run, the owner said,
in order:

> "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高"
> "站立時武器應該可以放下手微微下垂 跑步時也不用太高"
> "跑步時應該會在胸口附近擺動"

The way they hold their weapons looks odd: the weapon sits too high, and when the arms swing it is
raised too high. Standing, the weapon arm should come down, the hand hanging a little; in the run
the weapon need not be high either. In the run the arms should swing about the chest.

Measured on the baked keys (the weapon's tip, model space, the class's height H = 1): the
**idle** (and the walk, which shares its carry) held the weapon arm bent and forward with the
blade or the sceptre standing 74–85° above level, its tip at 0.93 H on the knight, 1.02 H on the
mercenary (over his crown) and the orb at 0.88 H on the wizard; in the **run** the weapon hand
pumps to chest height (0.70 H, under the shoulder at 0.74) and the wrist kept the weapon up, 22–81°
above level, its tip at 0.96, 1.01 and 0.82 H. The hand's path is what the owner wants ("在胸口附近
擺動"); the weapon standing up from it is what reads high.

So the weapon is carried low (R2): at rest the weapon arm hangs at the side and the weapon points
low; in the run the weapon arm keeps the chest-high pump and the weapon trails low from the hand.
The free arms, the knight's shield, the legs, the lean, the pace and the attacks are unchanged.

## Owner change, 2026-11-12: a normal grip, the sceptre's lean

Shown the held keys of the low carry (unbaked previews), the owner said:

> "跑步時武器是不是拿反了"
> "法師走路時武器可以垂一點 現在手垂下來了 但是武器卻還是拿得很直"

In the run the weapon looks held backwards: the held keys turned the fist over on the forearm
(hand [0.7, π, 0]) so the blade came out of the little-finger side and trailed back, a reverse
grip. In the walk the wizard's hand hangs now, but the sceptre is still held very straight; let it
droop.

So in the run the grip is normal, as at rest and in the attacks (the weapon out of the thumb side
of the fist, the hand never turned over on the forearm), and the low look comes from the wrist: a
blade held forward along the forearm and a little down, its point ahead of the hand; the sceptre up
from the fist with the orb above the hand, both under the shoulder (R2). At rest the sceptre leans
with the relaxed hand about 30–45° off vertical, forward and a little out, the foot of the shaft
back toward the heel, swaying a little with the step (R2). The blades' rest is as held.

With the carry lowered the knight's and the mercenary's blade turned about 150° from the idle into
the attack's first key and 99° from its last key back, a pop; the first key now starts from the
carry and the last two settle back to it, the strike and the timing kept (R2).

## Owner change, 2026-11-12: the weapon a little higher, swung in

Shown the wizard's re-baked run, the owner asked, of her sceptre:

> "只是要合理的位置 但跑步時為什麼手會擺到肩膀"

He only wants the sceptre in a reasonable place, and asks why her hand swings up to the shoulder in
the run. The answer: the shared fast run pumps every hand to chest height (`RUN_ARM`, the hand's
peak about 0.70 H), and on the mage's rig the shoulder sits at about 0.74 H, so the sceptre hand
nearly reached it; with the orb kept under the shoulder (R2 as edited a fifth time) the sceptre then
had to lie almost level at the top of the pump (5° above level, 54-85° off vertical through it).

Then, after looking at all three classes' re-baked runs:

> "目前跑步時 武器擺動位置有點不自然 跑的時候可以高一點 有點過垂 武器可以往內側擺動一些"

The weapons' swing in the run looks a little unnatural: they can be a little higher in the run
(they droop too much now), and they can swing a little inward.

And, of the backward step while attacking (the play branch):

> "騎士後退攻擊 腳會穿過斗篷"
> "弓箭手後退攻擊 腳跟處也會穿過斗篷"

In the knight's `backpedal_attack` his feet pass through his cloak; in the archer's, her heels.

So (R2) the knight's and the mercenary's blade is held about level in the run, 10° below to 20°
above it (was 11-34° below); the wizard's sceptre arm pumps smaller, its hand peaking at the lower
chest (0.61 H) while her tome arm keeps the full pump, and the sceptre stands reasonably upright,
15-40° off vertical (was 54-85°); every weapon hand swings in toward the midline at the front of
the pump, 0.05-0.08 H, across the front of the torso, a blade angled a little across the body
with it, and back out to the side behind. Standing up so near the hand, the sceptre's orb now rises
over the shoulder at the top of the pump, ahead of her face at about her chin: on this rig a hand at
the lower chest cannot hold a sceptre 15-40° off vertical with its orb under the shoulder (the orb
stands 0.23-0.29 H over the fist), and the owner asked for it higher, so the orb's "under the
shoulder" in the run is retired. And (R10) the backward step carries the cloth out behind, as half a
walk would, instead of dragging it back against the legs; the knight's standing attack does the
same for his cloak (FS-HF0WW `## Change: The guard measures a leg through the cloth` R29-R32 holds
every leg and boot inside the cloaks, the archer's quiver over hers, and the mage's scapular over
her gown column for column).

## Owner change, 2026-11-12: the blade raised in the run

Shown the knight's and the mercenary's re-baked runs, the owner said:

> "騎士跟傭兵跑步時劍的角度可以再提起10到20度"

In the run the knight's and the mercenary's sword can be raised by another 10 to 20 degrees.

A tune of R2's values only (Tunes FS-JS7C8 R2 `RUN_BLADE_ELEV`): each blade is raised about 15°,
the middle of his 10-20, by the wrist alone (`RUN_BLADE` 1.2 → 0.95 rad, `MERC_RUN_BLADE` 1.35 →
1.1): the knight's from 5° below to 12° above level to 9-26° above, the mercenary's from 8° below
to 10° above to 7-24° above, and the band to 5° to 35° above level. The grip, the pump, the swing in
(`RUN_CROSS`, `RUN_WRIST`) and every other class and clip are unchanged. Raised from a chest-high
hand, the point now rises over the head bone (about the chin; it rose under it before), so "under
the head" is held as "never over the crown": the point stays under the top of the head (0.90 and
0.91 H against the crown at 0.914), well under the old upright carry's 0.93 and 1.01 H. The blade
then lies 22-23° across the body at the front of the pump (was 18-19°), inside R2's 5-30°.

## Owner change, 2026-11-12: the blade raised again

Shown the knight's and the mercenary's runs re-baked with the blade raised, the owner said:

> "戰士 傭兵 跑步時提劍的角度再提升15度"

In the run, raise the warrior's (the knight's) and the mercenary's blade by another 15 degrees.

A tune of R2's values (Tunes FS-JS7C8 R2 `RUN_BLADE_ELEV`), by the wrist alone as before
(`RUN_BLADE` 0.95 → 0.68 rad, `MERC_RUN_BLADE` 1.1 → 0.82): the knight's blade from 9-26° above
level to 24-41°, the mercenary's from 7-24° to 22-39°, and the band from 5-35° to 20-50° above
level, its top still well short of the old upright carry's 74-85°. The grip, the pump, the swing in
(`RUN_CROSS`, `RUN_WRIST`) and every other class and clip are unchanged; the blade now lies about
28° across the body at the front of the pump (was 22-23°), inside R2's 5-30°.

Raised this far, the point rises past the crown (the top of the head, which the run's bob carries
from 0.90 to 0.95 H), so "never over the crown" is retired for two checks. The point stays under a
named ceiling a little above it, `RUN_TIP_CEIL` 1.03 H: the knight's at most 0.995 H (under his
helm's point at 1.017), the mercenary's 1.022 (over his bare crown by at most 0.08 H). And the blade
never passes through the head or behind it, measured against the meshes the head bone carries (the
head; the knight's coif and nasal helm; the mercenary's hair and beard) in all 8 baked facings: no
segment of the blade crosses them, and wherever the head stands between a point of the blade and
the camera, that point is ahead of the face and the view is from behind him. Only the back view
(nw) has any: there the head hides part of the blade held before his chest, at least 0.19 H ahead of
his face, as it hides the hand that holds it (it did so before the raise too); in the other seven
facings the head hides none of it.

## Summary

The four playable classes run instead of speed-walking: a new `run` clip, a fast run on the shared rig,
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
   the 8 directions, hand-keyed on the shared rig (ADR-0021), baked with the class's sheet at the
   class's scale (1.5 from its re-bake here: FS-HF0WW `## Change: Class sheets at 1.5x`; was 2x)
   and trimmed like its other clips (ADR-0058).
2. **(owner)** The run is the whole body coordinated, **(owner, 2026-11-12: "現在的跑步有點像在慢跑
   希望可以有快跑的感覺", "但快跑沒有到疾跑")** a fast run, between a jog and a sprint:
   - arms and legs swing in opposition (the right arm forward with the left leg);
   - the upper body turns against the hips with the stride;
   - the centre of mass rises and falls once per step;
   - the head stays steady (it does not bob or roll with the chest);
   - each step has a brief flight phase, in which neither foot touches the ground.
   Cloth and other spring bones follow it as they follow the walk.
   **(owner, 2026-11-12: "目前的腳步速度可以 只是上半身有一些變化")** The legs are slice 5's:
   pelvis, thighs, shins, feet, the flight's lift, the stride and the 14 fps cadence are unchanged,
   key for key. The fast run is made from the waist up **(charter defaults, each judged by the
   owner at the contact sheet)**:
   - **(owner, 2026-11-12: "跑步時有點生硬 一般跑步應該會稍微前傾")** the trunk leans forward
     from the hips, `RUN_LEAN` about 10° (the hips-to-neck line, measured on the rig), held
     through the cycle; the neck brings the head back up, so it looks ahead as at rest, not at the
     ground;
   - the arms pump from the shoulder, the elbows bent about 90° (80–100° in every frame), each
     hand forward to about chest height (above the chest bone, below the shoulder) and back past
     the hip;
   - the shoulders counter-rotate against the hips more than the jog's (at least 6.5°, at most
     10°, each way, against the hips' 6.9°);
   - a class's own arm style stays: the archer's bow arm keeps its short swing and near-straight
     elbow, so the bow hangs along the side and never sweeps across the body.
   - **(owner, 2026-11-12: "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高",
     "站立時武器應該可以放下手微微下垂 跑步時也不用太高", "跑步時應該會在胸口附近擺動")** the
     knight's, the wizard's and the mercenary's weapon is carried low **(charter defaults, judged
     by the owner at the contact sheet)**. At rest (the idle, and the walk sharing its carry) the
     weapon arm hangs at the side, the elbow a little bent (5–30°), the hand a little below the
     waist (under the pelvis bone, by no more than 0.12 H); a blade points down and forward, its
     tip toward the ground (15–60° below level); the wizard's sceptre is held up beside the leg
     (at least 45° above level), its head under the shoulder. In the run the weapon arm pumps about
     the chest like a free arm (the elbow and reach bands above), and the weapon is never raised
     from the hand: its tip is level with the hand or below it at every moment of the cycle, a
     blade trailing back and down behind the hand, the sceptre's head forward and down. The free
     arms and the knight's shield are as before.
     **(owner, 2026-11-12: "跑步時武器是不是拿反了", "法師走路時武器可以垂一點 現在手垂下來了
     但是武器卻還是拿得很直"; edited)** The weapon is always held in a normal grip: out of the
     thumb side of the fist, the hand never turned over on the forearm, in every key of the idle,
     the walk and the run. In the run a blade is held forward along the forearm and a little down
     or about level (45° below level to 5° above), its point ahead of the hand, under the shoulder
     and never behind the body; the sceptre stands up from the fist, the orb above the hand, ahead
     of it and under the shoulder (it leans forward as the hand rises to the chest: a sceptre held
     any straighter would bring the orb over the shoulder at the top of the pump). At rest the
     sceptre leans with the relaxed hand 30–45° off vertical (`SCEPTRE_TILT` 40° on average over
     the idle and the walk), the orb forward and a little out, the foot of the shaft behind the
     grip, clear of the robe, swaying a little with the step. *Replaces, for the run: "its tip is
     level with the hand or below it at every moment of the cycle, a blade trailing back and down
     behind the hand, the sceptre's head forward and down"; for the sceptre's rest: "held up beside
     the leg (at least 45° above level)".*
     **(owner, 2026-11-12: "只是要合理的位置 但跑步時為什麼手會擺到肩膀", "目前跑步時 武器擺動位置有點不自然
     跑的時候可以高一點 有點過垂 武器可以往內側擺動一些", then "騎士跟傭兵跑步時劍的角度可以再提起10到20度",
     then "戰士 傭兵 跑步時提劍的角度再提升15度"; edited a seventh and an eighth time)** In the run a
     blade is held raised above level, `RUN_BLADE_ELEV` 20° to 50° above level on every sample (the
     knight's 23-42°, 24-41° on the rig; the mercenary's 21-40°, 22-39° on the rig; raised about 15°
     from 9-26° and 7-24°), its point ahead of the hand and the body and under `RUN_TIP_CEIL` 1.03 H
     (0.995 and 1.022 H on the rigs), the blade never through the head nor behind it in any of the 8
     facings (the head may hide a point of it only from behind him, the point ahead of his face);
     never back up to the old upright carry. *Replaces: "a little above level, `RUN_BLADE_ELEV` 5° to
     35° above level on every sample (the knight's 8-27°, 9-26° on the rig; the mercenary's 6-25°,
     7-24° on the rig), its point ahead of the hand and the body and never over the crown"; and before
     it "about level, `RUN_BLADE_ELEV` 10° below to 20° above level on every sample (the knight's 5°
     below to 12° above, the mercenary's 8° below to 10° above), its point ahead of the hand and the
     body and under the head".* The wizard's sceptre arm
     pumps smaller about a centre drawn back (`SCEPTRE_RUN_ARM` 0.76, `SCEPTRE_RUN_BACK` 0.25 rad),
     its hand peaking at the lower chest (`SCEPTRE_RUN_PEAK` 0.61 H, ±0.01; was 0.70, by the
     shoulder); her tome arm keeps the chest-high pump; the sceptre stands reasonably upright,
     `SCEPTRE_RUN_TILT` 15-40° off vertical on every sample (23-38° on the rig), the orb above the
     fist, ahead of it and of her face, clear of the head and the robe. At the front of the pump
     each weapon arm turns in about its length (`RUN_CROSS` 0.3 rad, clips.js `run.cross`), so the
     weapon hand comes in toward the midline by `RUN_CROSS_REACH` 0.05-0.08 H against the back of the
     pump (0.07 on the rig; was 0.026), before the torso, a blade angled 5-30° across the body (about 28°
     on the rig with the blade raised again; 22-23° before, 18-19° before that), and goes back out to the side behind; the weapon clear of the free arm, and the
     knight's blade never through his shield. The shoulders, the lean, the legs, the bob, the
     cadence, the pace, the free arms, the rest carry and the attacks are unchanged. *Replaces, for
     the run: "a blade ... 45° below level to 5° above, its point ahead of the hand, under the
     shoulder"; "the sceptre stands up from the fist, the orb above the hand, ahead of it and under
     the shoulder"; and, for the sceptre arm, "each hand forward to about chest height".*
   - **(charter default, 2026-11-12)** A class attack starts from the carry and settles back to
     it: coming out of the idle into its first key and on into the wind-up, and from its
     follow-through back to the idle, the weapon turns at most `ATTACK_TURN_LIMIT` (100°) a frame;
     the strike's keys, the weight, 7 keys at 12 fps are kept.
   Reason for the numbers: the coordinator's charter from the owner's words (a slight lean, about
   10°; elbows about 90°; hands to chest height, not chin, for "not a sprint").
   *Retired 2026-11-12: "a jog and not a sprint" (a charter default); the jog's 0.12 rad lean
   split over spine and chest (about 4° on the hips-to-neck line), its 77° elbows and its 4.5°
   shoulder turn.*
3. **(charter default)** The run is keyed so its measured pace, `RUN_PACE` (world px per second the
   run covers at 1x, measured as `WALK_PACE` is), lies within 180–220. Reason: the owner's "plays
   at about its own pace at 200 px/s". Cadence (fps) and stride are the bake's choice inside that,
   judged by the owner at the contact sheet. Slice 5's run (Fact 10) stays as baked (owner change
   2026-11-12), its legs too after the upper body's change ("目前的腳步速度可以"): the lean moves no
   foot, so `RUN_PACE` stays 194, re-measured.
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
   8 directions with the class's sheet. **(owner, 2026-11-12: "用往前的這個姿勢做後退")** The
   backpedal legs are the class's walk leg cycle (`walkCycle`, the legs `walk_attack` steps)
   run backward in time: key k of the backward cycle is walk key −k (mod 8), sampled the same
   way, so the stance, the pelvis height and bob, the knee bend and the stride are the walk's,
   with no crouch; only the direction of travel is reversed (the planted foot slides forward
   under the body). Key 0 is the walk's key 0, so both clips open on the same leg pose and a swap
   at the swing's start shows no jump. *Retired 2026-11-12: slice 5's hand-keyed cycle with a
   short flight, and the crouched re-key that replaced it the same day (`BACK_STEP`).*
   **(charter default)** No class sheet carries a standalone `backpedal` clip.
   Reason: with facing from movement (§D) a figure that is not attacking never moves away from its
   facing, so the clip would never play; dropping it saves its 64 frames per class.
9. **(owner, 2026-11-12)** An attacking class figure that moves, whose sheet carries
   `backpedal_attack`, plays it when the angle between the attack's facing (the 8-way facing the
   swing is turned to: its aim, as `walk_attack` turns today) and its drawn movement is **over
   90°**; at 90° or less it plays `walk_attack`. Either is turned to the attack's facing and plays
   at its authored rate, as `walk_attack` does.
10. **(charter default, 2026-11-12)** `backpedal_attack` walks its legs over
    `BACKPEDAL_ATTACK_CYCLES` = **0.75** backward walk cycles (6 of the cycle's 8 keys, a step and
    a half), the same as `walk_attack` (R21), across the 0.583 s swing. Its legs are the walk's,
    so their measured pace (pace.js) is the walk's backward: about 79.7 world px/s at the walk's
    10 fps, one cycle 0.8 s and about 63.8 px; 0.75 cycles is about 47.8 px, about 82 px/s of leg
    pace (76 by `WALK_PACE`) against the 90 px/s the slowed body moves (0.45 × 200). Reason: the
    owner's "too fast" (R21) as one rule for both attack-on-the-move clips: the legs never outrun
    the ground; 0.75 already meets it, so the start value stands (one whole cycle would be about
    109 px/s). The bake measures the pace and derives the clip's leg pace from it, never guessed.
    **(owner, 2026-11-12: "騎士後退攻擊 腳會穿過斗篷", "弓箭手後退攻擊 腳跟處也會穿過斗篷"; edited)** The
    backward step carries its cloth out behind, as half a walk would (`BACKPEDAL_ATTACK_SPEED`
    +0.5 walk speeds): the heels stepping back under the hem kick it out ahead of them. Dragged back
    at −0.5, the cloak pressed forward against the legs and the knight's calves and boots came out
    through it by 18.8 px, the archer's heels by 10.5 (FS-HF0WW R29's measure); from +0.3 neither
    does. *Replaces: "The cloth's drag on the backward step stays the slice's backward value (−0.5
    walk speeds, `BACKPEDAL_ATTACK_SPEED`), so a cloak presses against the back rather than flinging
    forward through the legs."* The owner tunes the cycle count at the contact sheet. *Retired 2026-11-12:
    0.625 cycles of slice 5's legs, 1.25 of the crouched re-key, and the backpedal legs' own pace
    band (150–220).*
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
    `backpedal_attack` in 8 directions at game scale, beside its `walk` and `attack`. The archer's
    re-bake with the fast run (R2) also shows the old run beside the new one, 8 facings. A class's
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
41. The design guideline's character clip list (the run a fast run, leaning, arms pumping) and the dev contact-sheet notes name `run`,
    `walk_attack`'s legs and `backpedal_attack` for the playable classes; its "Eight facings" says
    a character faces its movement, never the pointer.
48. The archer's re-bake carries FS-2325V `## Change: The archer's draw stays on the aim line`, so
    the archer is baked once with both changes; its contact sheet shows main's `attack` beside the
    new `attack`, `walk_attack` and `backpedal_attack`.

### §G. Verification

42. Unit: clip choice (§A.4, §B.9, R11, R13, R45), facing from movement (§D.22, R24), the server's
    slow (§C.15–20), each with its own tests; the removal (R47) shown absence-first: `face` is
    refused as an unknown action and no player entry in the state carries `facing`.
43. Bake: clip tests on the rig for the run's flight phase, opposite swing and pace band, its
    forward lean, elbow bend, hand reach and shoulder counter-turn (R2), the weapon carried low at
    rest and held about level in the run, swung in at the front of the pump, the wizard's sceptre
    hand peaking at the lower chest (R2), and its legs unchanged; the
    backpedal legs being the walk's run backward (the same poses in reverse order, the same pelvis
    height and stride, the pace the walk's negated); `walk_attack` and `backpedal_attack` each
    lasting exactly as long as `attack`, their legs' pace at most 90 px/s.
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
      swinging opposite its legs, and its pace within 180–220; the fast run's trunk leaning
      9–11° (8–12° in every sample), its pumping elbows at 80–100° in every frame, each hand
      above the chest bone and below the shoulder at the front of its swing (the wizard's sceptre
      hand peaking at 0.61 ± 0.01 H, the lower chest, instead) and at least 0.06 H
      behind the hip at the back, the shoulders turning 6.5–10° against the hips, the head looking
      ahead, its legs key for key slice 5's; the knight's, the wizard's and the mercenary's weapon
      in a normal grip on every key of the idle, the walk and the run (the fist never turned over on
      the forearm); in the run a blade 20° to 50° above level (the knight's 23-42°, the mercenary's
      21-40°) with its tip ahead of the hand, ahead of the body and under 1.03 H, the blade never through the head nor behind it in any facing, the sceptre 15-40° off vertical, its orb above the hand,
      ahead of it and clear of the robe, each weapon hand 0.05-0.08 H in toward the midline at the
      front of the pump against the back, before the torso, a blade 5-30° across the body there,
      the weapon clear of the free arm and the knight's blade never through his shield; at rest the weapon arm hanging (elbow 5–30°, hand under the pelvis bone
      by at most 0.12 H) with a blade pointing 15–60° below level and forward, the sceptre leaning
      30–45° off vertical on every key of the idle and the walk (40° ± 3° on average), forward and
      out, its head under the shoulder, clear of the robe; the knight's and the mercenary's attack
      turning the blade at most 100° a frame out of the carry and back into it; the backpedal legs are the walk's
      run backward: the same leg poses in reverse order, the same pelvis height and stride (no
      crouch), the walk's pace negated.
- [ ] `walk_attack` and `backpedal_attack` each last exactly as long as `attack`; on a sheet with
      `run`, `walk_attack`'s legs walk 0.75 walk cycles and `backpedal_attack`'s 0.75 backward walk
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
  cycle the legs ended where they began; at 0.75 cycles (both clips) a swing thrown the moment
  the last ends jumps the legs back by a quarter of a cycle. Accepted for v1; judged at the
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
2. *Settled 2026-11-12: the class sheets move to 1.5x (ADR-0076, FS-HF0WW `## Change: Class
   sheets at 1.5x`; the owner, after the spike's side-by-side: 「感覺可以」).* **VRAM:** about +83 MB resident (+47% of class art, R39), more than slice 5's +34% for the
   archer. Options: accept; bake `run` and `backpedal_attack` at 1x (about a quarter of that);
   `backpedal_attack` at 7 frames (one per attack key, 56 frames fewer a class, about 27 MB less in all, coarser legs);
   load class groups per class present (an ADR-0059 change).
3. **Others' attacks:** should an ally's attack be relayed so others see them slow to
   `walk_attack` or step back in `backpedal_attack`, rather than a slow-motion run?
4. **The attack legs' cycles** (R21: `walk_attack` 0.75, R10: `backpedal_attack` 0.75) are
   charter defaults; the owner tunes them at the archer's contact sheet, and judges the leg jump on
   a repeated swing (Edge States).

## Change: Attacking pins the attacker
Status: shipped
Date: 2026-11-21

Promoted `--from-thread` on 2026-11-22 from the owner-approved charter of 2026-11-21. The thread
is the charter's locked decisions, so no interview was held; every decision below is a **charter
default approved by the owner**, given with its reason. It lands here because it replaces §C (the
attack slow), which this FS owns through `game-server/game-service/SPECIFICATION.md` "Attacking
slows the attacker's movement". No new thin line, no new FS. Code citations are against main
`d713329d`.

**Why (owner).** Today a player can walk away while shooting or swinging, so kiting is trivial and
ranged classes are over-favoured. Attacking must pin the attacker in place for a short time. The
owner: this stays "just the animations and pinning".

**What it changes in §C.** R14's slowed walk becomes no walk at all. R15 (the 0.45 factor) is
retired. R16's window keeps its length and its end on the first tick after, now shortened by worn
attack speed. R17 keeps its rule (only a resolved cast) and loses `dash`. R18 (a cast restarts the
window) is replaced by a refusal. R19 (the walk after a charge is slowed) is replaced. R20 (runs,
fields, the dev test room; nothing on the wire) is kept. R21 (the attack legs' pace) is untouched.

### Decisions (charter defaults, owner-approved 2026-11-21)

- **D1. The pin replaces the slow.** It reuses the built per-player timer
  (`internal/components/attack_slow.go`, `AttackSlowDuration` in `internal/systems/combat.go`) and
  the kinds that slowed, less `dash` (D6). `AttackSlowFactor` 0.45 is retired. *Reason:* the
  smallest change, one mechanism.
- **D2. One pin length, 0.6 s, for every kind,** divided by worn attack speed the way a cooldown
  is (`/ (1 + AttackSpeedPercent/100)`, the capped total). *Reason:* one number, and gear still
  matters; 0.6 s is about the attack clip's 0.583 s. Per-attack lengths wait for a later retune.
- **D3. While pinned, the movement system ignores velocity:** `walkFactor` returns 0 for a pinned
  entity. Moves keep updating the stored velocity; `handleMove` (`internal/game/session.go`) is
  not changed and nothing is zeroed when a pin starts. When the pin ends the body walks in
  whatever direction is held then, or stands if nothing is held. This is not a queue: velocity is
  only the direction currently held, and nothing replays. *Reason:* `FieldScene` (which also
  draws the dev test room) sends a move only when the held keys change, so dropping moves would
  leave a key held through a pin stuck until a key changed; ignoring velocity works in every scene
  with no client change and behaves the same in runs (the run scene sends every frame). The
  server never moves a pinned body, and the client only eases toward server positions, so it
  shows the body standing: kiting during the pin is refused by the server.
- **D4. A cast tried during a pin is refused exactly like a cast on cooldown** (FS-8AY7S R10: it
  does nothing) and does not restart the pin. *Reason:* the owner's "clicks to kite away are
  rejected too". Accepted effect: today's 0.25 s-cooldown attacks fire at most once per pin
  length until a later pace retune.
- **D5. The parry is exempt:** it never pins and works while pinned (FS-MAMHR R13's no-root kept).
  *Reason:* it is a defence, not an attack, and has no attack-table row.
- **D6. The dash never pins** (its row drops the flag) **and is refused while pinned.** *Reason:*
  nobody cancels a pin for 25 stamina, and the dash is movement, not an attack.
- **D7. Shadow Shot's pin starts on release,** when the released cast resolves, never when the
  hold begins. *Reason:* the hold is client presentation (ADR-0030); the server never sees it.
- **D8. The pin applies in runs, field worlds and the dev test room.** *Reason:* wherever the
  combat system resolves a player's cast, as R20 had it for the slow.
- **D9. Nothing new on the wire.** The client mirrors the pin locally from its own casts.
  *Reason:* ADR-0020 §3, and the client already mirrors cooldowns this way.
- **D10. The client ignores attack clicks during its tracked pin, except the parry.** *Reason:* it
  must not show a swing the server refuses. Not an absolute guarantee (jitter can let a click
  reach the server at the edge); the server's refusal (D4) is the authority.
- **D11. Clip choice is unchanged.** `selectAnimation` (`src/render/art/animationSelect.ts`)
  already plays `attack` for an attacking body that is not moving, which a pinned body is.
  *Reason:* nothing to build; `walk_attack` and `backpedal_attack` now show only in the latency
  gap.
- **D12. The latency gap is accepted.** The client's pin starts on the click, the server's on the
  resolved tick. *Reason:* §C accepted the same gap for the slow.
- **D13. A monster's hit neither interrupts nor extends a pin.** *Reason:* one rule, the pin is
  the attacker's own cost.
- **D14. Vocabulary is "pin"** (already in `game-server/game-service/CONTEXT.md`); in code
  `AttackSlow*` becomes `AttackPin*`. *Reason:* code and vocabulary agree.
- **D15. Built on branch `feat/attack-pin`, off main.**
- **D16. An archer's Shadow Shot hold may begin during a pin; the pin gates the release the way
  the cooldown does.** *Reason:* it matches today's cooldown handling ("a hold may begin at any
  time; its release is what the cooldown gates"), no new hold rule.
- **D17. The client's tracked pin is a fixed 600 ms and ignores worn attack speed,** like the
  client's cooldown mirror. *Reason:* it can only err long, never let the client think it is free
  before the server does; the state carries no worn attack-speed total.

**Rejected:** a client-only pin (a modified client could ignore it, and it is the rule that
balances ranged play); a server-held wind-up with the hit at its end (supersedes ADR-0030, needs
deferred casts); keeping the 0.45 slow; zeroing velocity and dropping moves during the pin (D3's
first form, which strands a held key in field worlds).

**Facts checked in code (main `d713329d`):**

- Tick order (`Session.step`): `applyIntents` (moves and casts queued) → gear → potions →
  resources → monster AI → `MovementSystem` → projectiles → `CombatSystem`. A cast's own tick
  still walks at full speed; the pin holds from the next tick's movement. `tickAttackSlow` runs
  for an entity ahead of its `resolve`, so a pin ends before a cast on the same tick is judged.
- `resolve` refuses on cooldown, then cost (after `armCut`), then (targeted) no target; it then
  stops any charge (`endCharge`), starts a dash's charge, spends, starts the cooldown, and starts
  the slow when the row `slows`. Every player row carries `slows: true` today, the dash's included.
  The parry has no row; `stepStance` opens it.
- `walkFactor` scales the walk only; a charge in flight moves at its own speed and never reads it.
- `GameFrameRate` is 30 Hz: 0.6 s is 18 ticks; at the 50% attack-speed cap 0.4 s is 12 ticks.
- The run scene (`BarrowspireScene`) sends the held stride every frame; `FieldScene` and
  `HubScene` send velocity only when it changes. Neither changes here (D3).
- The client's cooldown mirror is `PlayerCombat` (`src/render/combat/playerCombat.ts`), shared by
  the run and the field (`src/scenes/fieldCombat.ts` composes it), with fixed constants
  (`PRIMARY_COOLDOWN_MS` 250, `SPECIAL_COOLDOWN_MS` 400, `STRIKE_COOLDOWN_MS` 500). The Shadow Shot
  hold is `ShadowShotAim` (`src/scenes/shadowShotAim.ts`): a release that is not `ready` (held too
  briefly, on cooldown, unaffordable) answers "cancel" and sends nothing.
- The state's `direction` carries `vx`, `vy` and `speed` from `VelocityComponent`; `FieldScene`
  turns a figure still on a placeholder texture by `vx`, `vy`.

### Requirements

#### game-service

49. **The pin (D1, D3).** A player whose cast of a pinning kind resolves is **pinned** from that
    tick for the pin length. While pinned, `MovementSystem` does not walk them: `walkFactor`
    returns 0 for an entity carrying the pin. Replaces R14's slowed walk; R15's
    `AttackSlowFactor` is deleted.
50. **Its length (D2).** `AttackPinDuration` = 0.6 s, divided by `1 + AttackSpeedPercent/100` of
    the caster's worn total (already capped) on the tick the cast resolves, as the cooldown is.
    Unequipped: 18 ticks at 30 Hz. The pin is lifted on the first tick after its window, before
    that tick's casts are judged (R16's timing kept), so the body walks again on the tick after
    that.
51. **The pinning kinds (D1, D5, D6).** The rows that pin are `attack`, `slash`, `cut` and the
    riposte it becomes, `arrow`, `fireball`, `shadow_shot`, `triple_fireball`. Not `dash`, whose
    row drops the flag; not `parry`, which has no row; no monster row. Only a resolved cast pins
    (R17's rule kept): one refused for cooldown, cost, target or the pin starts nothing.
52. **The held direction is kept (D3).** `handleMove` is unchanged: a move during the pin sets the
    stored velocity as it does today, and nothing zeroes it when a pin starts. On the first tick
    the body may walk again, it walks the velocity it has then, at full move speed, or stands if
    that is zero. Nothing is queued or replayed. `Speed` is never written by the pin.
53. **Refused while pinned (D4, D6).** While pinned, `resolve` refuses every intent on an
    attack-table row, the dash included, exactly as it refuses one on cooldown, and at the same
    point (before the cost): no damage or projectile, nothing spent (parry charges included, for
    a cut armed as the riposte), no cooldown started, no charge started or stopped, the pin not
    restarted. Replaces R18.
54. **The parry (D5).** While pinned, a `parry` opens the stance exactly as it does unpinned. A
    parry never starts or changes a pin.
55. **The dash (D6).** A resolved dash starts no pin, so the walk after its charge is at full
    speed. A pinning cast that resolves while a charge is in flight stops the charge where the body
    stands (`endCharge`, as today) and starts the pin. Replaces R19.
56. **Shadow Shot (D7).** Its pin starts on the tick the released `shadow_shot` cast resolves.
57. **Monsters (D13).** A hit taken neither ends nor extends a pin. No monster ever carries one.
58. **Everywhere (D8).** The pin holds in runs, field worlds and the dev test room, wherever
    `CombatSystem` resolves a player's cast (R20 kept). It is per-body state: a new body (a world
    switch, a new run, a reconnect's new body) starts unpinned.
59. **Names (D14).** `AttackSlowComponent` → `AttackPinComponent`, `ComponentTypeAttackSlow` →
    `ComponentTypeAttackPin`, `AttackSlowDuration` → `AttackPinDuration`, `attackSlowEpsilon` →
    `attackPinEpsilon`, `startAttackSlow` / `tickAttackSlow` → `startAttackPin` / `tickAttackPin`,
    the row's `slows` → `pins`; the files and tests named to match. No other attack-table value
    changes.
60. **Nothing on the wire (D9).** No message, state field, `.proto` or OpenAPI change.
    `direction.speed` reports the move speed as before; `direction.vx`, `vy` report the held
    direction, pinned or not.

#### game-client

61. **The tracked pin (D9, D17).** `PlayerCombat` starts a tracked pin of a fixed
    `ATTACK_PIN_MS` = 600 on every send of a pinning kind: the targeted strike (`attack`), the
    primary casts (`slash`, `arrow`, `cut`, whether or not it is drawn as the riposte, `fireball`),
    `triple_fireball`, and a fired `shadow_shot` release. Not on a `dash` or a `parry` send. It
    ignores worn attack speed.
62. **Clicks ignored while it runs (D10, D5, D6).** While the tracked pin runs, `strike` and
    `cast` (primary or special, the warrior's dash included) send nothing and play nothing: no
    effect, no attack clip, no `castSent`, no `abilityCast`, no cooldown or lockout started.
    The Mercenary's right-click is exempt and sends `parry` as today, gated by `parryRefused`
    alone.
63. **The archer's hold (D16).** A right-press during the tracked pin begins the hold as today.
    The pin gates the release as the cooldown does: while it runs the hold is not `ready` (the aim
    line reads not ready) and a release ends the hold with nothing sent or played, as a release on
    cooldown does. A release once the pin is over (and off cooldown, held long enough, affordable)
    fires as today.
64. **A new start.** `reset()` (a new world or a new run) clears the tracked pin, as it clears the
    cooldowns.
65. **Nothing else changes (D3, D11, D12).** `selectAnimation`, the scenes' movement sends
    (`BarrowspireScene`, `FieldScene`, `HubScene`) and the ability card are not changed. The
    client's pin starts on the click and the server's on the resolved tick; the gap is accepted.

### Acceptance Criteria

game-service (`make test` in `game-server/game-service`), through the systems and through a
session:

- [ ] For each pinning kind, a caster walking a held direction whose cast resolves walks at full
      speed on the cast's tick, then stands for exactly 18 ticks, its velocity still the held
      direction, then walks it at full speed on the next tick.
- [ ] Worn attack speed shortens the pin as it shortens a cooldown: +50% (the cap) pins for 12
      ticks, +20% for 15.
- [ ] A move sent during the pin changes the stored velocity and not the position; after the pin
      the body walks the latest direction sent. A stop sent during the pin leaves it standing
      after the pin.
- [ ] While pinned, each pinning kind and the dash is refused: no damage, the resource unchanged,
      no cooldown started, no charge, and the pin ends on the tick it would have.
- [ ] Two casts queued on one tick: the first resolves and pins, the second is refused.
- [ ] A cast refused for cooldown, cost or target starts no pin.
- [ ] A parry while pinned opens the stance; a parry never pins.
- [ ] A resolved dash starts no pin, and the walk right after its charge is at full speed; a
      pinning cast resolving during a charge stops the charge and pins.
- [ ] A monster's strike on a pinned delver leaves the pin's remaining time as it would have
      been; no monster ever carries the pin, its own strike included.
- [ ] `direction.speed` is unchanged by the pin.
- [ ] Through a session, in a run and in the dev test room: walk, slash, stand 18 ticks, walk on,
      the key never re-sent.
- [ ] No `AttackSlow`, `attackSlow` or `AttackSlowFactor` remains in game-service Go (a grep in
      review). `internal/game/session.go` is unchanged.
- [ ] No file under `game-server/common/api/proto`, `game-server/api-gateway`,
      `game-client/src/api/generated` or any migration changes.

game-client (`npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in
`game-client`), through `PlayerCombat` on its port's clock:

- [ ] After each pinning send (strike, slash, arrow, cut, riposte, fireball, triple_fireball,
      a fired Shadow Shot), `strike` and `cast` send and play nothing until 600 ms have passed,
      and work once they have.
- [ ] A dash send starts no tracked pin; a dash click during the pin sends nothing.
- [ ] A Mercenary's right-click during the pin sends `parry` and raises the stance tell.
- [ ] An archer's right-press during the pin begins the hold; a release during the pin sends
      nothing and ends the hold; one after it fires.
- [ ] `reset()` clears the tracked pin.
- [ ] The tracked pin is 600 ms whatever gear is worn.
- [ ] `animationSelect.ts`, `BarrowspireScene.ts`, `FieldScene.ts` and `HubScene.ts` are not
      changed by the pin.

Live check (at the browser check, see Out of Scope): in a run and in a field, a player holding a
direction who attacks stands in `attack` for about 0.6 s, then walks on in the held direction with
no key pressed again; a click during the stand does nothing; the Mercenary's parry still raises.

### Edge States

- **A key held through the pin.** Run and field alike: the body walks on the first tick it may,
  with no key re-sent (D3).
- **A key released during the pin.** The stop sets velocity to zero; the body stays standing.
- **A key changed during the pin.** The last direction sent is the one walked; nothing earlier
  replays.
- **Two casts queued on one tick.** The first resolves and pins; the second is refused (R53).
- **A charge in flight when an attack resolves.** The charge stops where the body stands and the
  pin starts (R55). A charge can never start while pinned.
- **Worn attack speed.** The server's pin is shorter than the client's fixed 600 ms, so the client
  ignores some clicks the server would take. Errs safe (D17).
- **Jitter.** A cast sent the moment the client's pin ends can reach the server a tick inside its
  pin and be refused after the client drew the swing. The cooldown mirror has the same race; D12
  accepts it. The swing is drawn with no hit.
- **Attacks paced by the pin.** A 0.25 s-cooldown attack fires about once per 0.6 s while the
  button is clicked repeatedly; the cooldown never binds before the pin does (D4, accepted).
- **Pinned and pushed.** A pinned body is a standing body: collision resolution treats it as it
  treats any body that is not walking, as today.
- **Death, escape, floor change, world switch mid-pin.** The pin is the body's own state; it runs
  out on its own timer or goes with the body. A dead or resolved body does not act anyway.
- **Others' view.** An ally who attacks is seen standing for the pin; a figure still on a
  placeholder texture in `FieldScene` may turn toward the held direction while standing, since
  `direction.vx`, `vy` carry it. Accepted.
- **The attack-on-the-move clips.** `walk_attack` and `backpedal_attack` show only in the latency
  gap at the pin's edges (D11). The §C edge state "Kiting" (stepping back at the slowed speed) no
  longer happens: the kiter stands.
- **A Shadow Shot hold across the pin's end.** A hold begun during the pin and released after it
  fires, if it is otherwise ready.

### Out of Scope

- Engagement, rooms waking together, cleave falloff, slower swings and monster retunes, drinking
  time, monster counts, XP and drop rescale.
- Retiring the attack-on-the-move clips (`walk_attack`, `backpedal_attack`) and their leg-pace
  rules R10, R21.
- Any HUD sign of the pin: the ability card does not grey for it, and no cursor or bar shows it.
- Per-attack pin lengths, and reading worn attack speed on the client.
- Any change to the wire, the attack table's values, the baked art, `internal/matchmaker`,
  `internal/match_queue`, or another service.

**Follow-ups (outside this change):**

- The thin line "Attacking slows the attacker's movement" (`game-server/game-service/
  SPECIFICATION.md`) reads loosely now; a reword with the pointer unchanged, via `spec-update`.
- Open issue I-JS7C8-9 (the browser check) still tests "the slowed walk while attacking"; it needs
  rewording to carry this change's live check.

## Change: The archer's sprint and low-ready bow
Status: work-order
Date: 2026-11-23

Promoted `--from-thread` on 2026-11-23 from the owner-approved charter "弓箭手衝刺跑" (the owner:
「核准」). The thread is the charter's locked decisions, so no interview was held; every decision
below is a **charter default approved by the owner**, given with its reason. It lands here because
it changes the run (§A) and the attack-on-the-move clips (§B, R5) this FS owns through
`game-client/SPECIFICATION.md` "Run and backpedal animations". No new thin line, no new FS. It
also takes `walk_attack` off the archer's sheets, which FS-HF0WW's "Walk-and-attack animation"
built, so FS-HF0WW carries a pointer stub to this section. Code citations are against main
`970f2dc7`; measures marked *measured* were read on the archer's own rig and style
(`cast.js` `archer`, posed and grounded as the bake poses her, 32 samples over the cycle).

**Why (owner).**

> 「我想調整遊戲中人物的跑步動作 跑步時可以更有衝刺感 先調整弓箭手就好 我看完覺得可以再往下做其他角色
> 目前的跑步方式有點太輕鬆的感覺 想要有快一點的跑步感 然後拿弓的動作要有一種隨時備戰的感覺要雙手拿著弓放在身體前方
> 但不用抬太高 然後目前沒有移動攻擊 所以可以把攻擊往前或往後移動的動畫移除」
> 「跑更快的話身體可能會更加前傾」

The run should feel like a dash, not the easy run it is now; the archer first, the others after the
owner has seen her. The bow is held ready: both hands, in front of the body, not raised high. And
since attacking no longer moves (the pin, `## Change: Attacking pins the attacker`), the clips that
attack while stepping forward or back can go. A faster run leans further forward.

**What it changes, for the archer's three sheets only** (`char_archer_base`,
`char_archer_hunter`, `char_archer_shadow_ranger`):

- R2: the lean (about 10° → about 20°), the arms (the pump → the two-handed low-ready bow), the
  bow arm's "short swing, the bow hanging along the side", and "the legs are slice 5's ... the 14
  fps cadence unchanged, key for key".
- R3: the cadence and the stride become hers (16 fps, a shorter stride); `RUN_PACE` stays the
  measure, held as it is today.
- R5: "`walk_attack` stays on every class sheet" no longer holds for them; `walk` still does.
- R8–R11, R13, R21: `backpedal_attack` and `walk_attack` leave her sheets, so their leg rules and
  the swaps between them no longer apply to her.
- R37, R41, R48: her contact sheet and the guideline lose those two clips; her `attack` keeps
  FS-2325V's aim line.
- `## Change: Attacking pins the attacker`, Out of Scope: "Retiring the attack-on-the-move clips"
  is done for her sheets. The other classes and their leg-pace rules R10, R21 stay out of scope.

The knight, the wizard and the mercenary (and their looks) are untouched: their runs key for key,
their `walk_attack` and `backpedal_attack`, `RUN_ANIMATIONS.run` at 14 fps.

> **Edited in place on 2026-11-23 (owner change after the first bake, still a work-order).**
> Requirement numbers are kept: R74, R75 and R76 read *Removed*, and the new ones are R87–R91. D4
> and D5 are restated, D6 stands. See *Owner change, 2026-11-23: the bow canted left-high across
> the front, an arrow nocked*. One default of that change could not be honoured with the others on
> the Hunter (R90); it is escalated there, not routed around.

### Owner change, 2026-11-23: the bow canted left-high across the front, an arrow nocked

After seeing the first bake's contact sheet and playing it (`7e508fe8`, I-JS7C8-18), the owner
said, in order:

> 「跑步動作看起來可以 但拉弓的動作好像不太對 左手拿弓 右手拿箭的預備動作 放在身前 弓傾斜在身前」
> 「弓好像要向左傾斜 現在是不是相反了 感覺是左手拿弓右手拿箭」
> 「左高右低」
> 「預備動作最好可以看到一根弓箭在上面預備」
> 「輕輕靠在上面」
> 「箭尾右手輕輕扣著就好」

The run looks right. The bow carry does not: the ready position is the left hand holding the bow
and the right hand holding an arrow, in front of the body, the bow tilted across the front. The bow
should lean to her left, the opposite of the first bake (whose upper limb swung toward her right
shoulder). Left high, right low. One arrow should be seen sitting on the bow, ready. It rests
lightly on the bow. The right hand only lightly hooks the arrow's nock end.

So the sprint itself (R66–R71: the lean, 16 fps, the legs, the pace, the bob) is **approved and
kept key for key**. The carry is redone, read as an archer's low ready (coordinator's reading,
charter defaults, each kept inside the charter):

- **T1. The left hand holds the bow at the grip in front of the body, one arrow nocked on the
  braced string and lying on the bow by the left fist; the right hand lightly at the nock, the
  string not drawn.** The bow's own nocked arrow is reused (gear.js `longbow` `update(nock,
  showArrow)`: the arrow from the string's rest point through the grip; cast.js `bowInHand` shows
  it on `fx.arrow`). No new mesh, no draw. *Replaces* D5's "no arrow is nocked" and R74.
- **T2. The bow canted across the front, left high and right low:** the upper limb and tip on her
  own left and high, the lower limb and tip on her own right and low, crossing in front of her
  toward the right leg and clear of it, in every facing (her left, not the screen's). Much more
  inclined than the first bake's 44–52°: roughly 55–70° off vertical. The arrow points forward and
  down toward the ground ahead, roughly 20–40° below level. *Replaces* D5's "about 45°, upper
  limb forward and up, lower limb back and down" and R75, R76's cant.
- **T3. The hands stay low,** the grip and the nock between the belly and the lower chest (D4),
  and inside the shoulders; **the tip never draws above the head on screen in any facing** (the
  first bake's Hunter tip drew above her hair in w/nw/sw); no arm pump (D6); the legs, lean, fps,
  pace and bob unchanged.
- **Clearances.** The bow, its string and the arrow clear the legs, the tunic, the boots, the
  cloak and the quiver on all three looks, and the bow-and-arrow-against-cloak-and-quiver check is
  a committed test (the first round's was an uncommitted script). The frame box does not grow
  against main (R84): the forward-pointing arrow is the risk.

**Escalated 2026-11-23 (R90, not routed around).** On the Hunter, whose hair tops out about 0.035
H under the cowl of the base and the Shadow Ranger, the 0.8 H longbow canted left-high cannot keep
its upper tip under her head on screen in the n and ne facings (where her own left points away
from the camera) while it also stands roughly 55–70° off vertical (T2) and both hands stay inside
the shoulders at the belly to the lower chest (T3, R72, R73). Measured on her posed run (32
samples of each candidate, the bow following the chest's counter-turn, so its angle rocks about
±6.5° over the cycle):

- the bow 61–74° (about 68° on average), hands inside the shoulders at the belly: the base and the
  Shadow Ranger keep the tip under the head by at least 0.003 H; the Hunter's tip draws up to
  0.036 H (about 2.8 px at game scale) over her hair in n and ne;
- the bow 72–85° (nearly level): every look clear;
- the left hand carried past the right shoulder's line (the grip about 0.12 H right of her centre,
  the left arm near straight), the bow 64–77°: every look clear;
- the hands at the hips bone (under D4's belly), the bow 60–73°: every look clear, by 0.002 H.

The owner picks one (or another rule for the Hunter's tip); until then R88's band and R90 hold
the first option's numbers as written below and the change stays a work-order.

**Seen on the first option's bake (2026-11-23, for the owner's judgment at the contact sheet).**
The cant is her own left-high in the model, but the camera looks down 30° from her front-left in
some facings and her back-right in others, so on screen a nearly level bow's depth outweighs its
height: in s and se the bow reads about level, its screen-left end (her right, further from the
camera) a little higher; in ne (her left away from the camera) it stands near upright in front of
her; in e, n and nw it reads as a diagonal. A bow stood up nearer 45–55° would read left-high in
more facings, and would put its tip over the head on screen in more of them (R90). The arrow reads
as a bright line at game scale in every facing (R91).


### Decisions (charter defaults, owner-approved 2026-11-23)

- **D1. The trunk leans about 20° (was about 10°)** on the hips-to-neck line. `steadyNeck` brings
  the head back so it still looks ahead. *Reason:* the owner, "跑更快的話身體可能會更加前傾".
- **D2. Cadence 14 → 16 fps (about 15% faster), the stride about 12% shorter.** The measured pace
  stays where it is, so the feet don't slide and the shared `RUN_PACE` (194) is untouched.
  *Reason:* the server fixes the ground speed (200 px/s, unchanged), so a faster look has to be a
  faster cadence over a shorter stride. *Fallback, named for the owner:* if 16 fps reads as
  shuffling, keep today's cadence and stride and change the posture only (D1, D4–D6).
- **D3. More knee drive and more heel kick. The flight and the bob are never reduced (at least
  today's).** *Reason:* a softer bob was tried and reverted on 2026-11-12 ("像浮在上面").
- **D4. The two-handed low-ready bow in the run:** both hands hold the bow in front of the body,
  the left on the grip and the right at the nock of the nocked arrow (owner change 2026-11-23: was
  "on the string"), between the belly and the lower chest, under today's pump peak (0.70 H).
  *Reason:* the owner, "雙手拿著弓放在身體前方 但不用抬太高", and 2026-11-23 "左手拿弓 右手拿箭的預備動作
  放在身前", "箭尾右手輕輕扣著就好".
- **D5. (restated by the owner change of 2026-11-23)** The bow canted across the front of the body,
  left high and right low, roughly 55–70° off vertical, one arrow nocked on the braced string and
  resting on the bow, pointing forward and down; clear of the legs, the tunic, the boots, the
  cloak and the quiver; the tip never above the head on screen. *Reason:* the owner, "弓傾斜在身前",
  "左高右低", "預備動作最好可以看到一根弓箭在上面預備", "輕輕靠在上面". *Was (first bake):* about 45°,
  upper limb forward and up, lower limb back and down, no arrow nocked, "the smallest v1".
- **D6. No arm pump.** The hands only ride the trunk's turn and bob; the shoulders' counter-turn
  stays.
- **D7. `walk_attack` and `backpedal_attack` leave the three archer sheets only.** The client
  already plays `attack` on a sheet without them, so no code changes. The tick or two of latency
  gap at the pin's edges shows the standing attack sliding: accepted. The other classes drop
  theirs when their own run is redone, and the `animationSelect.ts` branches go then.
- **D8. The `walk` clip stays on the sheet** (every sheet must carry it, FS-2325V §E.2).
- **D9. The owner approves the contact sheet** (ADR-0021 §5). Tune rounds after it stay inside the
  charter.
- **D10. Built on branch `feat/run-archer-sprint`, from main `970f2dc7`.**

**Escalate (report back, don't route around):** the lean and the low-ready carry cannot pass the
cloak, quiver or leg guards without changing the look; the archer's pace cannot be held within the
shared `RUN_PACE` tolerance without client code; a default that cannot be honoured.

**Facts checked in code (main `970f2dc7`):**

- The three sheets share one clip set. `cast.js` `CLASS_ROWS.archer` (cast.js:596) is
  `{ build: archer, sheet: ARCHER_SHEET }`, and `specRow` (cast.js:629) spreads `c.sheet` into the
  Hunter's and the Shadow Ranger's rows (cast.js:657-658). `ARCHER_SHEET`
  (classStyles.js:160) is `{ animations: RUNNING_CLASS_ANIMATIONS, scale: 1.5 }`. The wizard's
  sheet uses the same `RUNNING_CLASS_ANIMATIONS` (classStyles.js:199), so the archer needs a clip set
  of her own; the shared object must not change.
- `RUNNING_CLASS_ANIMATIONS` = `withWalkAttack({ ...ANIMATIONS, ...RUN_ANIMATIONS })`
  (clips.js:106). `withWalkAttack` (clips.js:76) adds `walk_attack` (and `backpedal_attack` on a
  sheet with `run`). `RUN_ANIMATIONS.run` is `{ frames: 8, fps: 14, loop: true, speed: 2.5 }`
  (clips.js:91-93), where `speed` is the cloth's carry in rig heights per second.
- `runCycle(style)` (clips.js:361) reads `style.run`: `stride` scales every thigh key, `knee` every
  shin key, `arms` and `elbow` the pump per arm, `lean` the trunk (default `RUN_LEAN`), `hold` the
  run's carry in place of `style.hold`, plus `style.runExtra(i)`. `RUN_LEAN` 0.24 rad
  (clips.js:309), four fifths at the spine. `RUN_ELBOW` −1.57 (clips.js:312), `RUN_ARM` 0.85
  (clips.js:318), `RUN_COUNTER` 0.14 (clips.js:324). The legs are `RUN_STEP` (clips.js:289-299),
  shared by every class: the swing thigh at most 0.52 rad forward, the swing shin folded at most
  1.45 rad, the flight's lift 0.045 H. `stride` alone shortens the swing thigh too, so D2 and D3
  pull against each other on a shared scale: the archer needs leg keys of her own.
- `ARCHER_STYLE.run` is `{ arms: [0.3, 1], elbow: [0.215, 1] }` (classStyles.js:177): the bow arm
  (left) swings short and near straight, the right arm pumps. `ARCHER_STYLE.speed` is 1.05.
- *Measured on her run today:* the hips-to-neck lean 9.96–10.26°; the pelvis 0.484–0.540 H, a bob
  of 0.056 H; the right hand 0.49–0.71 H (peak 0.707); the bow hand 0.40–0.47 H; the chest bone
  0.61–0.67 H; the shoulder 0.70–0.76 H; the knee's peak height 0.236–0.311 H; the crown (the top of
  the meshes the head bone carries) 0.944–0.999 H on the base and the Shadow Ranger's cowl, 0.909–0.964
  on the Hunter's hair. Pace (`pace.js` `measurePace`, pace.js:90): 193.72 world px/s at 14 fps; the
  same keys at 16 fps read 221.39; the walk reads 79.70 at 10 fps.
- `RUN_PACE` = 194 (animationSelect.ts:56) is one constant for every class.
  `clips.test.mjs` holds the shared run to it within 1 px/s (clips.test.mjs:689), on a plain style
  over the archer's legs (clips.test.mjs:447). The client plays `run` at `speed / RUN_PACE`
  (animationSelect.ts:170) and takes each clip's fps from the manifest
  (`frameRate: anim.fps`, phaser.ts:548), so 16 fps needs no client code.
- The longbow is 0.8 H tip to tip, gripped at its middle (`gear.js` `longbow`: `L = 0.4 * H`, the
  tips at ±L, gear.js:284-291). The string runs between the tips, braced 0.075 H off the stave
  (gear.js:285). `bowInHand` (cast.js:177) redraws the string to the right hand only while a clip
  draws (`fx.draw`), and shows an arrow only on `fx.arrow` (cast.js:193). *Estimate:* at 45° each
  tip stands about 0.28 H from the grip both up and across. A grip at 0.55–0.62 H puts the upper
  tip at about 0.83–0.90 H, under the crown, and the lower tip at about knee height, about 0.28 H
  back from the grip. Tilted fore and aft alone, the lower limb comes back through the legs' swing,
  since today's hands reach only 0.15–0.25 H ahead of the hips. So "clear of the legs" (D5) means
  the bow is also canted across the body, its lower limb passing outside a leg (R76).
- A sheet without `walk_attack` plays `attack` while attacking, moving or not:
  `if (!moving || !walkAttack) return swing("attack")` (animationSelect.ts:157). `walkAttack` and
  `backpedalAttack` come from what the sheet carries (character.ts:251-253, `carries`
  character.ts:381). The manifest check reads `walk_attack` only when it is there
  (manifest.ts:363).
- The tests that name the archer's attack-on-the-move clips read the committed manifest or her sheet
  options: `animationSelect.test.ts` ("should give %s walk_attack", the archer among the four);
  `manifest.test.ts` (`OWN_CLIPS.char_archer_base`, the `RUNNING` list's `backpedal_attack` test);
  `clearance.test.mjs:331` (`SHEETS.archer` is `RUNNING_CLASS_ANIMATIONS`, and its clip lists);
  `archerLooks.test.mjs:112`; `clips.test.mjs:412-421` (the aim line on her `walk_attack` and
  `backpedal_attack`). `character.test.ts` uses its own fixture manifest, not the shipped one.
- Atlases on main: `archer-0` 2532 × 4060 (41.1 MB RGBA), `archer_hunter-0` 2636 × 3924 (41.4 MB),
  `archer_shadow_ranger-0` 2532 × 4060 (41.1 MB), one page each. Each sheet bakes 64 frames a
  facing: idle 6, walk 8, attack 7, death 7, run 8, `walk_attack` 14, `backpedal_attack` 14.

### Requirements

#### The archer's sprint (D1–D3)

66. **Scope (D7, D10).** Everything below applies to the archer's sheet options alone, so to her
    three sheets (the Hunter and the Shadow Ranger take her clips through `specRow`). She gets a
    clip set of her own in place of `RUNNING_CLASS_ANIMATIONS`, and her departures from the shared
    run live in her style (`ARCHER_STYLE.run`, `runExtra`) or her own leg keys. `RUN_STEP`,
    `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`, `RUN_ANIMATIONS` and
    `RUNNING_CLASS_ANIMATIONS` keep their values. The knight's, the wizard's and the mercenary's
    runs and clip sets are unchanged key for key (the shared run's tests at clips.test.mjs:447 and
    after, and classMotion.test.mjs, stay green as they are).
67. **The lean (D1).** The archer's hips-to-neck line leans forward 19–21° on average over the
    cycle, and 18–22° on every one of 32 samples, measured from her rest pose as the shared run's
    lean is measured (clips.test.mjs:726). Today it is 9.96–10.26° (measured). Her head looks
    ahead: its pitch within 3° of rest on every sample (as clips.test.mjs:744), its turn and roll
    as steady as the shared run holds them (clips.test.mjs:680). *Estimate:* `run.lean` about 0.48
    rad, twice the 0.24 that gives 10° on her rig. The bake measures it; the number is not guessed.
68. **The cadence and the stride (D2).** Her `run` is 8 frames, looping, at **16 fps** (was 14),
    its cloth carried at the shared run's `speed` 2.5 (the ground speed is unchanged). Her stride
    is shortened so her run, measured by `measurePace` at 16 fps on her rig and style, lies **within
    1 world px/s of `RUN_PACE` (194)**, the tolerance the shared run is held to today
    (clips.test.mjs:689). `RUN_PACE`, `animationSelect.ts` and the server's 200 px/s do not change.
    *Measured:* her keys read 221.39 at 16 fps, so the stride per cycle comes down from about 110.7
    px to about 97, about 12.4% shorter (an estimate from the ratio; the bake holds the measure).
    At 200 px/s she plays at about 1.03x: about 4.1 steps a second, against 3.6 today.
69. **The knee drive and the heel kick (D3).** The swing leg drives its knee higher: the knee's
    peak height over the cycle is above today's 0.311 H on her rig (measured). The heel kicks up
    further behind: the swing shin's peak fold is more than `RUN_STEP`'s 1.45 rad. The shortened
    stride never lowers either (R66: her own keys, not `stride` scaling the swing thigh). Each step
    keeps a flight frame with both soles at least 0.02 H off the ground and a foot planted in at
    least 4 of the 8 keys (as clips.test.mjs:617-619). The flight's lift is at least `RUN_STEP`'s
    0.045 H. The pelvis rises and falls once a step, its bob at least today's 0.056 H (measured)
    and under 0.07 H, the shared run's "never a hop" (clips.test.mjs:661-662). The amounts are the
    bake's, judged by the owner at the contact sheet.
70. **The shoulders (D6).** The shoulders keep turning against the hips with the stride: the
    shoulder line's yaw anti-correlated with the hips' (below −0.8), peaking at 6.5–10° each way,
    as the shared run's (clips.test.mjs:781-783). The pelvis turns with the stride as today.
71. **Retired for the archer:** R2's "arms and legs swing in opposition", the pump's elbow (80–100°)
    and reach (the hand to chest height, back past the hip) bands, the bow arm's "short swing and
    near-straight elbow, so the bow hangs along the side" (the test at clips.test.mjs:635), and
    "the legs are slice 5's ... the 14 fps cadence ... unchanged, key for key". They stay the
    shared run's rules for the other classes.

#### The low-ready bow (D4–D6)

72. **Both hands in front (D4).** On every sample of the run the left hand holds the bow's grip and
    the right hand is at the nock (R87), both in front of the trunk: each hand ahead of the chest bone
    by more than the torso's half depth (0.094 × the rig's `torsoD` H, the measure
    clips.test.mjs:267 uses for the back) and inside the shoulders' width. The run's carry is
    `ARCHER_STYLE.run.hold` (the shared mechanism, clips.js:361). Her `hold` for the idle and the
    walk is unchanged.
73. **Not raised high (D4).** On every sample each hand sits at least 0.05 H above the hips bone
    and no higher than the chest bone (the belly to the lower chest), and always under 0.70 H
    (today's pump peak, 0.707 H measured). *On her rig today* (measured) that is about 0.53–0.67 H
    for the bones, so about 0.55–0.62 H for the hands; the lean (R67) lowers the chest bone, and
    the bake reads the bands off the posed rig.
74. *Removed 2026-11-23 (the right hand on the braced string's middle with no arrow): an arrow is
    nocked now and the right hand sits at its nock (R87).*
75. *Removed 2026-11-23 (the bow 35–55° off vertical, the upper limb forward and up, the lower
    limb back and down): the bow is canted left-high across the front (R88), the tip held under
    the head on screen (R90).*
76. *Removed 2026-11-23 (the bow clear of the legs, its lower limb canted out past a leg): the
    clearances are R89's, which add the string's whole length, the arrow, the cloak and the
    quiver.*
77. **No pump (D6).** Each hand's position in the chest bone's frame moves no more than 0.02 H over
    the cycle: the hands ride the trunk's turn, lean and bob, and the arms do not swing.
78. **The rest is unchanged.** Her idle, walk, attack and death keys are unchanged (her `attack`
    keeps FS-2325V `## Change: The archer's draw stays on the aim line`). The low-ready is the run's
    carry only.

#### The attack-on-the-move clips leave her sheets (D7, D8)

79. **Her clip set (D7, D8).** The archer's three sheets carry `idle`, `walk`, `attack`, `death`
    and `run`, in that order, and **no `walk_attack` and no `backpedal_attack`**. Her clip set is
    built without `withWalkAttack`. `walk` stays (R5's "`walk` on every class sheet" holds; it
    never plays while `run` is there). For these sheets this replaces R5's "`walk_attack` stays on
    every class sheet" and R8's `backpedal_attack`. The other classes' sheets and their looks keep
    both clips.
80. **Clip choice unchanged (D7).** `animationSelect.ts` and `character.ts` are not changed. On her
    sheets `carries` finds no `walk_attack` or `backpedal_attack`, so an attacking archer plays
    `attack` turned to her aim, moving or not (animationSelect.ts:157); not attacking, she runs
    turned to her movement (R4). A pinned archer stands (R49) and her `attack` shows standing. In
    the latency gap at the pin's edges the client may draw her moving while she attacks, and the
    standing `attack` slides with the drawn movement for a tick or two: accepted.
81. **Nothing else plays them.** A Shadow Shot release plays her `attack` as before. No path asks
    her sheet for `walk_attack` or `backpedal_attack`, and the off-hand clips are the Berserker's
    alone.

#### Bake, review and budget (D9)

82. **One bake.** The three archer sheets are re-baked once with R66–R79 by the bake tool
    (`npm run bake`), never drawn or edited by hand. `npm run bake -- --check` is clean afterwards.
    The leg-clearance, cloak and quiver guards (`clearance.js`, run at bake by the page's
    `main.js` and by `clearance.test.mjs`, `archerLooks.test.mjs`) pass all three with no
    exemption: nothing is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. The bow passes through
    neither the cloak nor the quiver (judged on the contact sheet at ×2).
83. **The contact sheet (D9).** For each of the three sheets, the new run beside main `970f2dc7`'s
    run, 8 facings, at game scale and at ×2, with an animated preview playing each at its own fps
    times its `speed / RUN_PACE` at 200 px/s. The regular contact sheet and the looks' sheet
    (`contact-looks-archer`) show her clips without `walk_attack` and `backpedal_attack`. The
    re-baked sheets merge only after the owner approves (ADR-0021 §5). Tune rounds after that
    approval stay inside this change.
84. **The report.** From the bake, for each of the three sheets: atlas pages and dimensions before
    and after, RGBA bytes before and after, and the change in per cent. Before (main): `archer-0`
    2532 × 4060 (41.1 MB), `archer_hunter-0` 2636 × 3924 (41.4 MB), `archer_shadow_ranger-0` 2532 ×
    4060 (41.1 MB). *Estimate:* 64 → 36 frames a facing (−44%), so about 23–25 MB each if the frame
    box holds, about −50 MB resident over the three. The bow across the body may widen the run's
    box. A sheet that grows against main is escalated before merge.
85. **Docs.** `game-client/docs/design-guideline.md`'s character clip list says the archer's run is
    a sprint (the trunk about 20° forward, a quicker, shorter stride with knee drive and heel kick,
    the bow held two-handed low in front, canted left-high across the front with an arrow nocked:
    owner change 2026-11-23) and that her sheets carry no
    attack-on-the-move clips. The `tools/bake/lib/contact.mjs` header notes say the same.
86. **The fallback (D2), named for the owner.** If at the contact sheet the owner reads 16 fps as
    shuffling, her cadence and stride go back to today's (14 fps and `RUN_STEP`'s leg keys, R69's
    knee drive and heel kick going with them), and the change is the posture alone: R67, R72–R77. R79
    holds either way. The owner chooses; it stays inside the charter.

#### The low ready, as the owner changed it on 2026-11-23 (T1–T3)

87. **An arrow nocked, the right hand lightly at its nock (T1).** Every run key carries
    `fx.arrow` 1 and no `fx.draw` and no `fx.ik`, so the bow's own arrow (gear.js `longbow`) shows
    on the braced, undrawn string, from the string's rest point through the grip, lying on the bow
    by the left fist. The right hand's grip point (draw.js `drawGrip`) sits on the nock, within
    0.02 H, on every sample: it hooks the nock end and does not pull. Her idle, walk, attack and
    death keys are unchanged (R78), so the arrow shows in the run only. No mesh is added or
    thickened.
88. **The bow canted left-high across the front (T2).** On every sample the upper tip is on her
    own left of the grip and above it, the lower tip on her own right and below it (her left is
    the rig's +x, in every facing). The tip-to-tip line stands **about 68° off vertical on average
    over the cycle (62–72°), 58–76° on every sample**: the hands ride the chest's counter-turn
    (R77), so the bow rocks about ±6.5° with it. The arrow points forward and down, **20–40° below
    level on every sample, its heading within 15° of the facing**. (The band is the escalated
    first option; see *Escalated 2026-11-23*.)
89. **Clear of everything it passes (T2, clearances).** On every baked run frame of the three
    looks: no point along any edge of the bow, its string's two strands or the arrow (sampled at
    most 0.005 H apart) lies inside a leg, a boot or the tunic; and no such edge crosses the cloak
    or the quiver (segment against triangle, the cloak skinned as posed). Each check carries a
    rejection fixture that must fail (the same bow moved into a thigh, onto the cloak's back,
    onto the quiver's case). Nothing is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.
90. **The tip never above the head on screen (T3).** In every one of the 8 facings, on every baked
    run frame, no point of the bow or the arrow projects (projection.js: 30° elevation, 45°
    azimuth) higher on screen than the highest point of the meshes the head bone carries.
    **Escalated:** with R72, R73 and R88's band this holds on the base and the Shadow Ranger
    (by at least 0.003 H) and not on the Hunter, whose tip draws up to 0.036 H over her hair in n
    and ne. Until the owner chooses, the Hunter is held to "no more than 0.04 H over her head on
    screen, in n and ne only", the others to R90 as written.
91. **The arrow reads at game scale (T1, the owner: "預備動作最好可以看到一根弓箭在上面預備").** Judged
    on the contact sheet at 1x: the facings in which the arrow is hidden behind the body or too
    thin to read are named in the report, and a thicker arrow is proposed, not made.

### Acceptance Criteria

Bake (`npm test` in `game-client`: `clips.test.mjs`, `classMotion.test.mjs`,
`clearance.test.mjs`, `archerLooks.test.mjs`, on the archer's rig and style as cast.js builds her):

- [ ] The archer's sheet options carry exactly `idle`, `walk`, `attack`, `death`, `run`. `run` is
      8 frames, looping, at 16 fps, `speed` 2.5. The Hunter's and the Shadow Ranger's rows carry
      the same. The knight's, the wizard's and the mercenary's sheet options are deep-equal to
      main's.
- [ ] Her run's lean 19–21° on average, 18–22° on every sample; her head's pitch within 3° of rest
      and as steady as the shared run's.
- [ ] Her run's measured pace at 16 fps is within 1 px/s of `RUN_PACE` (194); `RUN_PACE` is still
      194.
- [ ] Her swing knee peaks above 0.311 H and her swing shin folds past 1.45 rad. A flight frame in
      each step (both soles over 0.02 H), a foot planted in at least 4 keys, a lift of at least
      0.045 H, a bob of at least 0.056 H and under 0.07 H.
- [ ] Her shoulders counter-turn against the hips (correlation below −0.8, 6.5–10°).
- [ ] On every sample: both hands ahead of the chest bone by more than 0.094 × `torsoD` H and
      inside the shoulders' width; each at least 0.05 H above the hips bone, no higher than the
      chest bone and under 0.70 H; the right hand within 0.02 H of the nock; `fx.arrow` 1 and no
      `fx.draw` or `fx.ik` on any run key (R87).
- [ ] On every sample: the upper tip on her left of the grip and above it, the lower tip on her
      right and below it; the bow 58–76° off vertical, 62–72° on average; the arrow 20–40° below
      level, heading within 15° of the facing (R88).
- [ ] On every baked run frame of the three looks: no sampled point of the bow, string or arrow
      inside a leg, a boot or the tunic, and no edge of them across the cloak or the quiver; each
      check's rejection fixture fails (R89).
- [ ] In every facing on every baked run frame, no point of the bow or arrow above the head on
      screen, on the base and the Shadow Ranger; the Hunter as R90's escalation holds her.
- [ ] Each hand moves no more than 0.02 H in the chest bone's frame over the cycle.
- [ ] The shared run's tests (plain style, `RUN_STEP` key for key, the 10° lean, the pump bands,
      `RUN_PACE` within 1 at 14 fps) and the other classes' run tests pass unchanged.
- [ ] Her idle, walk, attack and death keys are deep-equal to main's.
- [ ] The leg, cloak and quiver guards pass all three archer sheets on every clip they now carry,
      with no exemption added.

Manifest and client (`npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in
`game-client`):

- [ ] In `public/art/manifest.json` the three archer sheets carry `idle`, `walk`, `attack`,
      `death`, `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and no
      `walk_attack`, `backpedal_attack` or `backpedal`. Every other class sheet and look is as on
      main.
- [ ] The shipped-sheet tests in `animationSelect.test.ts` and `manifest.test.ts` name the archer
      without `walk_attack` and `backpedal_attack`, and the other three classes with them.
- [ ] `animationSelect.ts` and `character.ts` are unchanged. `selectAnimation` on a sheet with
      `run` and no `walk_attack` plays `attack` turned to the aim while attacking on the move, and
      `run` at `speed / RUN_PACE` when not attacking (a test exists, or is added).
- [ ] `npm run bake -- --check` is clean.
- [ ] The bake's report gives each archer atlas's dimensions and RGBA bytes before and after, and
      the change in per cent; none grows against main.
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

HITL:

- [ ] **The owner approves** the three archer sheets' new run beside main's on the contact sheet
      (ADR-0021 §5), or names the fallback (R86) or a tune round.
- [ ] **The owner chooses** how the Hunter's tip is held (R90's escalation), and whether the arrow
      reads at game scale in enough facings (R91).
- [ ] **Browser check:** in a run and in the town, the archer, the Hunter and the Shadow Ranger run
      at 200 px/s with the sprint's lean and cadence and the low-ready bow, the feet not sliding.
      Attacking on the move plays the standing shot, and a second player sees the same.

### Edge States

- **Attacking on the move.** The pin stands her (R49), so `attack` shows standing. In the latency
  gap at the pin's edges the standing shot may slide a tick or two with the drawn movement
  (D7, accepted). A sheet still carrying `walk_attack` (any other class) behaves as today.
- **Setting off and stopping.** The bow goes from the idle's carry at the side to the low-ready on
  the run's first frame, and back on stopping, with no blend: clips swap as every carry does today.
  Judged at the contact sheet and the browser check; a transition clip is out of scope.
- **Running into a shot.** The shot starts from `attack`'s own first key (out of the idle carry),
  so the bow jumps from the low-ready to the draw, and the run's nocked arrow goes until the
  attack nocks its own. As above, judged in play.
- **Setting off and stopping, the arrow.** The arrow appears on the run's first frame and goes on
  stopping, with the carry (no blend, as above).
- **A Shadow Shot hold while moving.** She stands in idle turned to the held aim, as before; the
  release plays `attack`.
- **Gear move speed.** At +20% (240 px/s) her run plays at about 1.24x (about 19.8 fps), capped by
  `MAX_WALK_SCALE` as today. The pace match holds at any speed because playback scales with it.
- **Mixed parties.** Until the other classes are redone, the knight, the wizard and the mercenary
  run at 14 fps on the shared keys and keep `walk_attack`, while the archer sprints and has
  neither attack-on-the-move clip. Expected.
- **Other players.** Others draw her from the same sheet, so they see the sprint and the low-ready
  bow; they never get her attack clips (Out of Scope of §A–§G, unchanged).
- **The three looks.** The Hunter's pelt and jerkin and the Shadow Ranger's soot cloth ride the same
  keys; the Hunter's horn nock caps lengthen the tips and count toward the on-screen head check
  (R90; was R75's crown check).
- **The cloak and the quiver under a 20° lean.** The cloak hangs further off a leaning back, and
  the quiver tilts with the chest. If the guards then fail, or the bow passes through the cloak,
  and only a different look would fix it, that is escalated (see *Escalate*), never exempted.
- **The fallback (R86).** If the owner picks it, the pace is today's measure at 14 fps (193.7) and
  R68's 16 fps no longer applies.
- **The dark-room strip.** `contact-darkroom-archer` is regenerated with the new run; the owner
  sees her back-facing frames there as today.

### Out of Scope

- The knight's, the wizard's and the mercenary's runs and their looks' runs, and dropping their
  `walk_attack` and `backpedal_attack` (each when its own run is redone, after the owner has seen
  the archer).
- The `walk_attack` and `backpedal_attack` branches in `animationSelect.ts` and `character.ts`, and
  `BACKPEDAL_PACE`: they go when the last class drops the clips.
- The creature archers (the Bone, Ashen and Wight Archers): they have no `run` clip.
- The archer's idle, walk, attack (the draw) and death.
- A drawn string in the run, a thicker arrow, or a transition clip between the carries. (A nocked
  arrow in the run was out of scope until the owner change of 2026-11-23: R87.)
- `RUN_PACE`, the server's move speed (200 px/s), the pin, and any game-server change (the human
  lane).
- Rewording the open browser check I-JS7C8-9, which still names every class's `walk_attack`.

## Change: The mercenary's sprint and trailing sword
Status: work-order
Date: 2026-11-23

Promoted `--from-thread` on 2026-11-23 from the owner-approved charter "傭兵衝刺跑". The thread is
the charter's locked decisions, so no interview was held; every decision below is a **charter
default approved by the owner**, given with its reason. It lands here for the reason the archer's
did (`## Change: The archer's sprint and low-ready bow`): it changes the run (§A) and the
attack-on-the-move clips (§B, R5) this FS owns through `game-client/SPECIFICATION.md` "Run and
backpedal animations", and takes `walk_attack` off sheets FS-HF0WW's "Walk-and-attack animation"
built, so FS-HF0WW carries a pointer stub to this section. No new thin line, no new FS. Code
citations are against `2018f786` (`feat/run-archer-sprint`, the archer's sprint approved,
I-JS7C8-19). Measures marked *measured* were read on his own rig and style (`cast.js`
`mercenary`, each look's row in `CAST`, posed and grounded as the bake poses him, 32 samples
over the cycle) by a throwaway script that is not committed.

**Why (owner).**

> 「換傭兵的動作 一樣拿掉攻擊時移動的部分 移動時也要像弓箭手跑的感覺 右手拿劍時把劍往身體後擺 像常見的rpg比較酷的動作」
> 「不用抬高 可以往下垂 但不要拖地」

Redo the mercenary next. As with the archer, the attack-on-the-move clips go. His run should feel
like hers. With the sword in his right hand, he swings it back behind his body, the cooler move
common RPGs use. Of the sword: it need not be raised; it can hang down, but it must not drag on
the ground.

**What it changes, for the mercenary's three sheets only** (`char_mercenary_base`,
`char_mercenary_duelist`, `char_mercenary_sellsword`):

- R2: his lean (about 10° → about 20°), his sword arm (the pump with the blade raised forward,
  22–39° above level, crossing in at the front → the trailing sword), and "the legs are slice 5's
  ... the 14 fps cadence unchanged, key for key". His free arm keeps R2's pump.
- R3: his cadence and stride become the shared sprint's (16 fps, the archer's legs).
- R5: "`walk_attack` stays on every class sheet" no longer holds for him; `walk` and `parry` do.
- R8–R11, R13, R21: `backpedal_attack` and `walk_attack` leave his sheets, so their leg rules no
  longer apply to him.
- R37, R41, R48: his contact sheet and the guideline lose those two clips.
- The archer's change: R66 ("the mercenary's run and clip set are unchanged key for key") and
  its acceptance line "the mercenary's sheet options are deep-equal to main's" no longer hold;
  her sprint's legs, lean and fps become a sprint the two classes share, her keys unchanged.
- `## Change: Attacking pins the attacker`, Out of Scope: "Retiring the attack-on-the-move clips"
  is done for his sheets too. The knight and the wizard stay out of scope.

The knight and the wizard (and their looks) are untouched: their runs key for key, their
`walk_attack` and `backpedal_attack`, `RUN_ANIMATIONS.run` at 14 fps. The archer's three sheets are
untouched byte for byte.

> **Edited in place on 2026-11-23 (owner change during I-JS7C8-21, still a work-order).**
> Requirement numbers are kept. M1, M6 and R106 are restated, R114 is added, and the Out of Scope
> line on look changes makes one exception. See *Owner change, 2026-11-23: the Duelist's robe
> carried out behind over the heel kick*.

### Owner change, 2026-11-23: the Duelist's robe carried out behind over the heel kick

I-JS7C8-21 put the shared sprint under him (its legs, lean and 16 fps, his sword arm left as it
was). The leg guard (`clearance.js` `legClearance`, `mercLooks.test.mjs` "keeps its legs inside its
skirts on every clip") then failed on the Duelist alone: on the run's second key (`down`) his left
lower leg, near the ankle (0.217 H up, 0.136 H behind the hips bone, near the centre line), came
out through the robe's back panel by **3.62 px** at 1x (the limit 0.667). The base's coat and the
Sellsword's read 0. *Measured:* it is the sprint's heel kick (`SPRINT_STEP.shinL` 1.4 at contact,
1.8 in the down), not the lean (the shared legs under the sprint's lean read 0) and not the fps
(14 fps reads 3.66). Shortening the kick cleared it only at about `shinL` ≤ 1.3 at contact and ≤ 1.6
in the down (0.47 px), which moves the shared keys and so the archer's (M1). Asked to choose
between his own smaller heel kick, smaller shared keys, or a change to the robe, the owner said:

> 「改 Duelist 長袍」

Change the Duelist's robe. So:

- **The shared sprint is kept key for key** (M1): `SPRINT_STEP`, `SPRINT_LEAN`, `SPRINT_RUN`, the
  archer's keys and sheet as their digests hold them.
- **The Duelist's robe is changed, the least that clears the heel kick** (R114). In order of
  preference: (i) the back panel carried out behind further in the run, the robe at rest as it was;
  (ii) more flare to the back panel's cut; (iii) the back hem a little shorter. (i) is taken. It is
  a look change on the Duelist only (FS-1J1CB R7's robe: its cut, its split, its length and its
  rest are unchanged). The base's coat and the Sellsword's are untouched.
- *Measured, the options* (the Duelist on the sprint, the leg guard's worst run frame, 1x px; the
  back panel's hem, the centre of its last ring, H above the ground and behind the hips bone):
  - as I-JS7C8-21 left it: run 3.62 px (key 1); hem at rest 0.171 H up, 0.118 H behind; in the run
    0.156–0.254 H up, 0.133–0.189 H behind; in the walk 0.176–0.193 H up, 0.128–0.165 behind.
  - (i) the back panel's spring (`skirtB`) drags further with his speed and may swing further:
    `drag` 0.2 → 0.4, `limit` 0.8 → 1.1 rad. Run **0.23 px** (key 2), every other clip 0. Hem at rest
    unchanged (0.171 H, 0.118 H behind); in the run 0.224–0.316 H up (about 0.06 H higher, about 5
    world px at 1x), 0.172–0.219 H behind (about 0.03 H further back); in the walk 0.191–0.198 H up,
    0.153–0.165 behind. Standing clips (idle, attack, death, parry) carry no speed, so they are as
    before. Its neighbours (`drag` 0.38–0.5, `limit` 1.0–1.4) pass too; `drag` alone saturates at
    the old limit (0.3–0.8 all read about 1.8 px), and `limit` 0.9 fails (0.71 px).
  - (ii) the back panel's depth at the hem 0.132 → 0.145 or 0.16 H: 3.06 and 2.41 px, and the robe
    at rest stands further out behind. The ring centres trailed back 0.04 or 0.06 H: 2.65 and 1.63
    px, the hem at rest higher and further back.
  - (iii) the back hem shortened to 0.18 or 0.20 H off the ground: 5.54 and 3.08 px.
- *Measured, once it is under him:* the sprint's 20° lean also moves his sword arm (today's carry,
  kept in I-JS7C8-21). The Duelist's right sleeve no longer lies inside the robe's back panel on the
  run (it clears it by 0.004 H; I-JS7C8-22's must-fail entry for it went). The pumping arm swung
  back on the run's last key (key 7) now crosses the Duelist's half-cloak (6 edges of the arm past
  the elbow). It is held as a must-fail entry against today's carry (`mercLooks.test.mjs`
  `TODAY_FAILS`), which I-JS7C8-23's trailing carry replaces and must clear (R102, R104). Never an
  exemption, and not baked: the one bake (R109) comes after I-JS7C8-23.

### Decisions (charter defaults, owner-approved 2026-11-23)

- **M1. One sprint, shared.** The archer's sprint legs and rhythm (about 20° lean, 16 fps, a
  stride about 12.4% shorter, knee drive, heel kick, the flight and the bob never reduced) become
  a sprint the archer and the mercenary share. Her run keys stay byte-identical, held by digest
  tests, and so do the shared sprint's keys once he runs them: a guard the sprint fails on one of
  his looks is answered by that look, not by the shared keys (the owner, 2026-11-23, 「改 Duelist
  長袍」). His pace must stay within the shared `RUN_PACE` tolerance. *Reason:* the owner,
  「移動時也要像弓箭手跑的感覺」. *See Escalated below:* on his rig the shared keys at 16 fps do not
  fall within the archer's 1 px/s.
- **M2. (owner override) The sword trails behind.** The right arm nearly straight, swung back about
  30–45° behind the body, the hand at about hip height. The curved blade lies behind him with its
  point hanging DOWN (not raised, not level or up) and its edge down. The point never touches the
  ground or passes below it: a clear margin above the ground in every frame. *Reason:* the owner,
  「右手拿劍時把劍往身體後擺 像常見的rpg比較酷的動作」, then 「不用抬高 可以往下垂 但不要拖地」. This is the
  trailing-sword run common in action RPGs.
- **M3. The trailing arm sways a little with the stride** (about ±10°). It is not frozen.
- **M4. The free left arm pumps as today's run does.**
- **M5. `walk_attack` and `backpedal_attack` leave the three sheets; `parry` stays.** Attacking on
  the move plays the standing `cut` (the client's fallback, no code change). The slide in the
  latency gap is accepted.
- **M6. Blade, hilt and arm clear of everything they pass,** on all three looks: the legs, the
  boots, the skirts (the coat's, the Duelist's robe panels), the Duelist's half-cloak and the
  body. Committed tests guard it, sampling along mesh edges, each with a rejection fixture. The
  legs, under the sprint, stay inside the skirts as before (R106); where the shared sprint's heel
  kick would come through the Duelist's robe, the robe is changed (R114), never the shared keys
  (the owner, 2026-11-23, 「改 Duelist 長袍」).
- **M7. The frame box does not grow** against today's mercenary sheets. If it would, stop and
  escalate.
- **M8. The owner approves the contact sheet** (ADR-0021 §5). Tune rounds after it stay inside the
  charter.
- **M9. Built on branch `feat/run-merc-sprint`, from `feat/run-archer-sprint` `2018f786`.**

**Escalate (report back, don't route around):** the guards force a look change; the pace leaves
the `RUN_PACE` tolerance; the frame box would grow; a default that cannot be honoured.

**Escalated 2026-11-23 (R95, not routed around).** M1's "the archer's sprint legs and rhythm,
shared" and "his pace within the shared `RUN_PACE` tolerance" do not both hold if that tolerance is
the 1 px/s the archer's run is held to (R68, classMotion.test.mjs:904-907). *Measured:* the
shared keys (`ARCHER_SPRINT_STEP`, `ARCHER_SPRINT_LEAN`) on his rig read **196.58 world px/s at 16
fps**, 2.58 over `RUN_PACE` 194 (+1.3%). Her rig reads 194.09. His legs are a little longer
(build 1.98 against her 1.96). Today his own run already reads 195.46 at 14 fps, 1.46 over, held
only to the class band 180–220 (classMotion.test.mjs:492-495). The options:

- **(a) Default, kept until the owner chooses:** the shared keys and 16 fps unchanged; his pace is
  held to the class band 180–220 the code holds every class's own run to today, and within 3 px/s
  of `RUN_PACE`. At 200 px/s the client plays his run at 200/194 ≈ 1.031x, so his planted feet
  slide about 2.7 px/s (about 1.3%), against about 1.5 px/s today. Judged at the contact sheet and
  the browser check.
- (b) His run alone at about 15.79 fps (16 × 194 / 196.58), the legs still shared. The manifest
  takes a fractional fps (manifest.ts:389-390, 454). He then steps about 1.3% slower than the
  archer.
- (c) His own stride scale (`run.stride` ≈ 0.987). That scales every thigh key, so his keys are no
  longer hers and his knee drive drops a little; M1's "shared" holds only in name.

### Facts checked in code (`2018f786`)

- **His sheets share one clip set.** `CLASS_ROWS.mercenary` (cast.js:598) is `{ build: mercenary,
  sheet: MERCENARY_SHEET }`, and `specRow` (cast.js:622) spreads it into the Duelist's and the
  Sellsword's rows (cast.js:660-661). `MERCENARY_SHEET` (classStyles.js:318) is `{ animations:
  RUNNING_MERC_ANIMATIONS, scale: 1.5 }`. `RUNNING_MERC_ANIMATIONS` = `withWalkAttack({
  ...ANIMATIONS, parry, ...RUN_ANIMATIONS })` (clips.js:119). No other sheet uses it.
  `MERC_ANIMATIONS` (clips.js:113, no run) is used only by tests (clips.test.mjs:48-90,
  classMotion.test.mjs:50).
- **The archer's sprint lives in her style today.** `ARCHER_SPRINT_LEAN` 0.48 (classStyles.js:165),
  `ARCHER_SPRINT_STEP` (classStyles.js:182-190: her own `thighR`…`footL` and `lift` rows; `hipsZ`
  and `chestZ` from `RUN_STEP`), and her run spec `{ ...RUN_ANIMATIONS.run, fps: 16 }` inside
  `ARCHER_SHEET` (classStyles.js:233). `ARCHER_STYLE.run` (classStyles.js:248) passes them as
  `lean` and `legs`. `runCycle` reads `style.run.legs` row by row over `RUN_STEP`
  (clips.js:366-367). So the seam to share the sprint already exists; nothing in `clips.js` needs a
  new parameter. The tests hold her run's lean, pace, knee, bob and shoulders
  (classMotion.test.mjs:838-980) and her other clips by digest (:1000-1003), but **not her run
  keys or her sheet options by digest**: R92 adds that guard before anything moves.
- **His run today** (`MERCENARY_STYLE.run`, classStyles.js:334): `{ wrist: RUN_WRIST, cross: [0,
  RUN_CROSS], hold: pose({ upperArmR: [0, 0, -0.1], handR: MERC_RUN_BLADE }) }`. Both arms pump at
  `RUN_ARM` 0.85 with `RUN_ELBOW` −1.57 (clips.js:312, 318). The wrist takes back 0.85 of the
  sword arm's pump (`RUN_WRIST`, classStyles.js:54), the arm turns in 0.3 at the front
  (`RUN_CROSS`, :60), and `MERC_RUN_BLADE` [0.82, 0, 0] (:53) raises the blade. `RUN_BLADE_ELEV`
  [20, 50] and `RUN_TIP_CEIL` 1.03 (:56, :58) are shared with the knight and stay. The
  mercenary's test band is `runBlade: [21, 40]` (classMotion.test.mjs:248-256).
- *Measured, his run today (14 fps):* the hips-to-neck lean 9.96–10.26° (10.11 mean); pace 195.46
  world px/s; the same keys at 16 fps 223.38; the pelvis 0.485–0.540 H (a bob of 0.055 H); the
  knee's peak 0.311 H; the chest bone 0.613–0.668 H; the right shoulder 0.696–0.763 H; the
  sword hand 0.477–0.700 H, the free hand 0.476–0.695 H; the blade 22.5–39.1° above level, its
  point 0.699–1.023 H high and 0.40–0.62 H ahead of the hips; the lowest point of the sword 0.402
  H.
- *Measured, the shared sprint on his rig* (`ARCHER_SPRINT_STEP` and `ARCHER_SPRINT_LEAN` under his
  arms as they are, 16 fps): lean 20.20–20.50° (20.35 mean); pace **196.58**; bob 0.062 H; knee
  peak 0.335 H; the pelvis 0.475–0.537 H; the chest bone 0.599–0.661 H; the right shoulder
  0.672–0.756 H; the free hand 0.457–0.632 H.
- *Measured, his idle* (the point down and forward, REST_BLADE, classStyles.js:46): the sword hand
  0.430–0.438 H; the blade 30–35° below level; the point 0.131–0.179 H off the ground.
- **His arm and sword** (bind, *measured*): the shoulder 0.740 H, the elbow 0.569, the wrist 0.420,
  the hips bone 0.520; the upper arm 0.172 H, the forearm 0.150 H. `curvedSword` (gear.js:624): the
  blade 0.46 H (`L`, gear.js:627) from 0.045 H past the grip point, the point 0.055 H off straight
  toward the back, the pommel 0.046 H behind the grip. *Measured:* the point 0.515 H from the hand
  bone; the whole sword 0.564 H along its axis (about 0.55 H pommel to point). H is 1.98 model
  units, so 79.2 world px at 1x (pace.js:17, 40 world px a unit), and the sword is about 44 world
  px.
- **The edge.** The edge runs along the grip frame's −y (gear.js:619-621). With the hand turned only
  in the swing plane (`handR` x, as every carry is keyed today), a blade swung down and back
  past the vertical has its edge facing **up**. *Measured* on a trial carry (arm back about 0.6
  rad, blade 26–30° below level): the edge's direction 62° above level. To bring the edge down,
  the arm turns about its own length. *Measured:* about 2.6 rad of upper-arm and forearm twist
  between them puts the edge 30–40° below level; about 3.0 rad puts it 26–63° below, less the
  further the blade hangs. The fist is
  not rolled on the forearm, so the normal-grip test (classMotion.test.mjs:592-605) still passes.
  *Estimate:* a human shoulder turns in about 70° and a forearm pronates about 80–90°, so 2.6 rad
  (about 150°) is near the end of a real arm's range. The forearm's skin tube and the Duelist's
  wide sleeve twist with it.
- *Estimate, from trial carries* (not committed; for the bake to settle): the upper arm swung back
  about 0.55–0.65 rad in the leaning chest's frame puts it about 30–45° behind the trunk line and
  the hand at 0.47–0.58 H, about the hips bone (0.475–0.537 H); twisted (R98) the hand sits lower,
  0.47–0.51 H. The blade 25–45° below level then puts the point 0.12–0.35 H off the ground, about
  0.5–0.67 H behind the hips and 0.05–0.4 H out to his right (less with the arm twisted). Hung straighter (55–60° below level), the point comes to 0.03–0.07 H: close to
  dragging.
- **What he wears where the sword goes** (mercLooks.js, cast.js): the base's coat skirts to
  mid-thigh, split at the front, the sash knotted on the right (cast.js:334) and an empty scabbard
  on the left (:339); the Duelist's half-cloak from the left shoulder across the back to right of
  centre, down to the hip, on cloak bones (mercLooks.js:21-24, 49-89), his robe split at both sides
  to mid-calf (:134) and wide sleeves flared at the forearm (:102); the Sellsword's spaulder on
  the right shoulder riding the upper arm (:247) and a purse at the right hip (:220, :248). The
  run's heel kick (`ARCHER_SPRINT_STEP` `shinL` up to 1.8 rad) folds the right heel up behind
  his seat on the other step, under a trailing blade.
- **Clip choice needs no client change.** A sheet without `walk_attack` plays `attack` moving or
  not: `if (!moving || !walkAttack) return swing("attack")` (animationSelect.ts:157). `walkAttack`
  and `backpedalAttack` come from what the sheet carries (character.ts:251-253, `carries`
  character.ts:381). The parry is chosen on `guarding` (animationSelect.ts:164), apart from both.
  `parryClip` raises from the idle's carry into `style.guard` (clips.js:826-841), so the run's
  carry does not touch it.
- **The tests that name his attack-on-the-move clips:** `animationSelect.test.ts:470`
  (`WALK_ATTACKERS` includes `mercenary`); `manifest.test.ts:1281` (`OWN_CLIPS.char_mercenary_base`)
  and :1284 (`RUNNING`, the `backpedal_attack` test); `clearance.test.mjs:332` (`SHEETS.mercenary`),
  :399 and :466 (the mercenary through "both attacks on the move"), :538-544 (the cloakless control
  reads his `backpedal_attack`); `mercLooks.test.mjs:86-95` and :115 (the clip list);
  `classMotion.test.mjs:267-277` (the CLASSES sheet test), :279-500 (the shared fast run as he
  carries it, including the raised blade, the head check, the cross-in and "attacks on the move walk
  the legs at most 90"), :608-628 (the carry on `walk_attack` and `backpedal_attack`), and :996 (his
  sheet and clips held by digest as "unchanged").
- **His sheets today** (`public/art/manifest.json`, each one page, 1.5x, trimmed): frame box
  **297 × 261** on all three, anchor (0.394, 0.770), crown 75. Clips per facing: idle 6, walk 8,
  attack 7, death 7, parry 4, run 8, `walk_attack` 14, `backpedal_attack` 14: 68 frames. The run's
  extent in the frame is x 30–270, y 39–246. The box is set by the attack (x 3–291, y 3–258), the
  death (y to 261) and the attacks on the move (y from 0). Atlases: `mercenary-0` 3428 × 3280
  (45.0 MB RGBA, PNG 5,992,571 B), `mercenary_duelist-0` 3508 × 3300 (46.3 MB, 6,291,293 B),
  `mercenary_sellsword-0` 3032 × 3724 (45.2 MB, 5,976,696 B).

### Requirements

#### One sprint, shared (M1)

92. **Her keys held first (M1).** Before anything moves, a test holds the archer's run keys
    (`clipsFor(ARCHER_STYLE, ARCHER_SHEET.animations).run`) and `ARCHER_SHEET` by digest as they
    are at `2018f786`, beside the digest her other clips already have (classMotion.test.mjs:1000).
    It stays green through every slice of this change. The knight's and the wizard's digests
    (classMotion.test.mjs:996) stay as they are.
93. **The sprint in one place (M1).** The sprint's legs (`ARCHER_SPRINT_STEP`'s rows), its lean
    (`ARCHER_SPRINT_LEAN`, 0.48) and its run spec (8 frames, looping, 16 fps, `speed` 2.5) are
    defined once, named for the sprint rather than the archer, and read by both classes.
    `ARCHER_STYLE.run` and `ARCHER_SHEET` read them, so her keys and sheet options are unchanged
    (R92). `RUN_STEP`, `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`, `RUN_ANIMATIONS` and
    `RUNNING_CLASS_ANIMATIONS` keep their values, and the shared run's digest
    (classMotion.test.mjs:995) holds. No new parameter goes into `runCycle`: `run.legs` and
    `run.lean` carry it (clips.js:366-367).
94. **His run is the sprint (M1).** The mercenary's run takes the sprint's legs, lean and 16 fps
    run spec. Measured on his rig as the archer's are (classMotion.test.mjs:870-980): the lean
    19–21° on average, 18–22° on every sample (*measured* 20.20–20.50); the head's pitch within 3°
    of rest, its yaw range under 0.08 rad and its roll under 0.06; the swing knee's peak above
    0.32 H (*measured* 0.335); the swing shin folded past 1.45 rad; a flight frame with both soles
    over 0.02 H in each step, a foot planted in at least 4 of the 8 keys, a lift of at least 0.045
    H; a bob of at least 0.056 H and under 0.07 H (*measured* 0.062); the pelvis rising and falling
    once a step, highest at or next to each flight key; the shoulders against the hips
    (correlation below −0.8, peaking at 6.5–10°).
95. **His pace (M1; escalated).** Measured by `measurePace` at 16 fps on his rig and style, his run
    lies within 180–220 world px/s (the band every class's own run is held to,
    classMotion.test.mjs:492-495) and **within 3 px/s of `RUN_PACE` (194)**. *Measured:* 196.58.
    `RUN_PACE`, `animationSelect.ts` and the server's 200 px/s do not change. **Escalated:** the
    archer's tighter 1 px/s (R68) cannot hold on his rig with her keys and fps unchanged; option
    (a) holds until the owner chooses, and (b) or (c) replaces this band if he picks one (see
    *Escalated 2026-11-23*).
96. **Retired for the mercenary:** R2's "the legs are slice 5's ... the 14 fps cadence unchanged, key
    for key", the 10° lean, and his rows of the shared fast-run tests (classMotion.test.mjs:279-500:
    the lean, the sword arm's pump bands, the raised blade and `runBlade`, the blade against the
    head, the sword hand's cross-in, "the shared legs key for key", the 14 fps pace and the attacks
    on the move). The knight and the wizard keep them. His free arm keeps its pump bands (R101).

#### The trailing sword (M2, M3)

97. **The arm back (M2).** On every sample of the run the right upper arm points down and behind
    the trunk, its line (shoulder to elbow) **30–45° behind the hips-to-neck line on average over
    the cycle, 25–50° on every sample**, measured in his sagittal plane. The elbow is nearly
    straight: bent 0–20° on every sample. The hand sits at about hip height: **within 0.06 H of
    the hips bone's height** on every sample, and behind the hips bone. *Estimate:* the upper arm
    swung back about 0.55–0.65 rad in the chest's frame (`run.hold`), the pump's scale on that arm
    small (R99). The bake measures it.
98. **The blade behind, its point down, its edge down (M2).** On every sample: the line from the
    hand to the point runs **15–45° below level** and back, the point behind the hips bone by at
    least 0.3 H, never ahead of the hand; the edge (the grip frame's −y, gear.js `curvedSword`)
    faces down, **its direction at least 30° below level**. The fist keeps its thumb side where the
    forearm has it (the normal-grip test, classMotion.test.mjs:592-605, holds on his run): the
    edge is brought down by turning the arm about its own length (the upper arm, the forearm, or
    both), never by rolling the fist on the forearm. *Measured:* about 2.6 rad of turn between
    the two gives 30–40° (see *The edge*). *Estimate:* split so that the forearm's own turn stays
    within about 90° (1.6 rad), a forearm's pronation, with the rest at the shoulder.
99. **Never on the ground (M2).** On every sample, and on every baked run frame of the three
    looks, the lowest point of every mesh the sword carries (the blade, the cross, the knuckle-bow,
    the grip, the pommel) stands **at least 0.06 H (about 4.8 world px at 1x) above the ground**.
    That is the sprint's own flight lift (0.06 H, `ARCHER_SPRINT_STEP.lift`), under his idle's
    0.131 H (*measured*). *Reason:* the owner, 「不要拖地」, and a margin that reads at game scale.
100. **The sway (M3).** The trailing arm swings with the stride: the upper arm's angle behind the
    trunk varies by **12–26° peak to peak over the cycle** (about ±6° to ±13°), in the shared
    pump's phase (clips.js:279, `swing`): the natural opposite-arm-and-leg swing, the sword arm
    furthest back where the free arm swings furthest forward and his right knee leads (about frame
    7.5). It is never frozen.
    The blade's angle may sway with it, inside R98's band. *Estimate:* the sword arm's `run.arms`
    about 0.2 of the shared pump (`RUN_ARM` 0.85 × 0.2 ≈ 0.17 rad ≈ 10° each way), its
    `run.elbow` near 0, its `run.cross` 0.
101. **The free arm pumps (M4).** The left arm keeps today's run settings: `run.arms[0]` 1,
    `run.elbow[0]` 1, `run.cross[0]` 0, `run.wrist[0]` 0, under `RUN_ARM` and `RUN_ELBOW`. On every
    key its elbow bends 80–100°, and the hand swings back past the hip by at least 0.06 H. At the
    front its height against the chest bone is measured and reported: the 20° lean lowers the
    chest bone (*measured* 0.599–0.661 H against today's 0.613–0.668) and the hand (*measured* to
    0.632 H). If the lean takes the hand under the chest bone at the front, that is reported for
    the owner's contact sheet, not tuned away.
102. **Out of the body and the head.** On every sample the sword (pommel to point) stays out of the
    torso and the head, as the carry test measures it (classMotion.test.mjs:608-628, `inside`),
    and clear of the free arm by more than 0.06 × `armR` H (:443-457). The run's carry is
    `MERCENARY_STYLE.run.hold` plus the arm settings; his idle and walk `hold` are unchanged.
103. **The rest is unchanged.** His idle, walk, attack (`cut`), death and parry keys are unchanged,
    held by digest at `2018f786` (as R92 holds the archer's). `MERC_RUN_BLADE`, `RUN_WRIST` and
    `RUN_CROSS` are no longer read by his run. `MERC_RUN_BLADE` goes if nothing else reads it;
    `RUN_WRIST`, `RUN_CROSS`, `RUN_BLADE_ELEV`, `RUN_TIP_CEIL` and `RUN_CROSS_REACH` stay for the
    knight. The classStyles.js header comment (:7-40) no longer describes the mercenary's run blade.

#### Clear of everything it passes (M6)

104. **The blade guard (M6).** On every baked run frame of the three looks, posed as the bake poses
    them (`poses.js` `characterPoses`, the cloth skinned as posed): no point along any edge of the
    sword's meshes (the blade, the fuller, the cross, the knuckle-bow, the grip, the pommel; sampled
    at most 0.005 H apart, as archerLooks.test.mjs's bow guard samples, :266-296) lies inside a
    leg, a boot, or a skirt (the base's coat, the Duelist's robe panels, the Sellsword's coat); and
    no edge of them crosses the Duelist's half-cloak or the torso (segment against triangle,
    skinned as posed). The same holds for the right arm's own pieces past the elbow (the hand, the
    vambrace, the Duelist's sleeve) against the legs, the skirts and the half-cloak.
105. **Rejection fixtures (M6).** Each check carries a fixture that must fail: the same sword moved
    so its blade lies on the right thigh's axis, through the coat's back skirt, through the
    half-cloak's back, and through the torso; the arm's pieces moved into the half-cloak. They are
    built as archerLooks.test.mjs's are (:557-605).
106. **No exemption.** The leg-clearance and cloak guards (`clearance.js`, run at bake by the page's
    `main.js` and by `clearance.test.mjs`, `mercLooks.test.mjs`) pass all three sheets on every clip
    they carry, with nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. If a guard can only
    pass with a different look (a shorter cloak, a sleeve cut back, the spaulder moved), that is
    escalated, never exempted or changed here. *Escalated and decided 2026-11-23:* the leg guard on
    the Duelist's robe against the sprint's heel kick, answered by R114 (the owner, 「改 Duelist
    長袍」). Any other look change is still escalated.

#### The attack-on-the-move clips leave his sheets (M5)

107. **His clip set (M5).** The three mercenary sheets carry `idle`, `walk`, `attack`, `death`,
    `parry` and `run`, in that order, and **no `walk_attack` and no `backpedal_attack`**. His clip
    set is built without `withWalkAttack`. `walk` stays (FS-2325V §E.2). `parry` stays as it is: 4
    frames at 24 fps, not looping. `RUNNING_MERC_ANIMATIONS` goes if nothing reads it; a test
    control that needs his old clips builds them explicitly, as the archer's cloak control does
    (`before`, clearance.test.mjs:529-536). The knight's and the wizard's sheets keep both clips.
108. **Clip choice unchanged (M5).** `animationSelect.ts` and `character.ts` are not changed. On his
    sheets `carries` finds no `walk_attack` or `backpedal_attack`, so an attacking mercenary plays
    `cut` turned to his aim, moving or not (animationSelect.ts:157). Not attacking, he runs turned
    to his movement (R4). Guarding, he plays `parry` (:164) as today. A pinned mercenary stands
    (R49). In the latency gap at the pin's edges the standing `cut` may slide with the drawn
    movement for a tick or two: accepted.

#### Bake, review and budget (M7, M8)

109. **One bake.** The three mercenary sheets are re-baked once with R92–R108 by the bake tool
    (`npm run bake`), never drawn or edited by hand. `npm run bake -- --check` is clean afterwards.
    Only `mercenary-0.png`, `mercenary_duelist-0.png`, `mercenary_sellsword-0.png` and their
    manifest entries change. **The archer's, the knight's and the wizard's manifest entries and
    atlases are byte-identical** (their sheets' `animations`, frame boxes, anchors, crowns and the
    atlases' `sha256`).
110. **The frame box (M7).** Each mercenary sheet's frame box is no larger than today's 297 × 261 in
    either dimension. The trailing blade reaches further behind him than today's run (*estimate:*
    about 0.55–0.8 H from the hips, about 65–95 sheet px at 1.5x (118.8 px an H), against the
    anchor's 117 px from the frame's left and 180 px from its right), and the attacks on the move that leave set the box's top row. If the box
    would grow, the bake stops and it is escalated, never routed around.
111. **The contact sheet (M8).** For each of the three sheets, the new run beside `2018f786`'s run, 8
    facings, at game scale and at ×2, with an animated preview playing each at its own fps times
    its `speed / RUN_PACE` at 200 px/s. Also a ×4 detail of the sword and the right leg at the
    frames where the blade sits lowest and nearest the heel kick. The regular contact sheet, the
    looks' sheet and the dark-room strip show his clips without `walk_attack` and
    `backpedal_attack`. The re-baked sheets merge only after the owner approves (ADR-0021 §5).
    Tune rounds after that approval stay inside this change.
112. **The report.** From the bake, for each of the three sheets: atlas pages and dimensions before
    and after, RGBA bytes and PNG bytes before and after, the change in per cent, and the frame box
    before and after. Before (`2018f786`): `mercenary-0` 3428 × 3280 (45.0 MB),
    `mercenary_duelist-0` 3508 × 3300 (46.3 MB), `mercenary_sellsword-0` 3032 × 3724 (45.2 MB),
    each 297 × 261. *Estimate:* 68 → 40 frames a facing (−41%), so about 25–27 MB each if the box
    holds, about −55 MB resident over the three.
113. **Docs.** `game-client/docs/design-guideline.md`'s character clip list (:284-310) says the
     mercenary's run is the sprint the archer runs (about 20° forward, the quicker, shorter stride),
     with the sword trailing behind him, the point down and off the ground, and that his sheets
     carry no attack-on-the-move clips. The `tools/bake/lib/contact.mjs` header notes (:1-10) say
     the same.
114. **The Duelist's robe over the heel kick (owner change 2026-11-23, 「改 Duelist 長袍」).** The
     robe's back panel is carried out behind further in the run, so the sprint's heel kick stays
     inside it: its spring (`skirtB`, anatomy.js `skirtBones`) drags back further with his speed
     and may swing further than the shared skirt springs (`mercLooks.js` `ROBE_BACK_CARRY`;
     *measured* `drag` 0.4, `limit` 1.1 rad, against the shared 0.2 and 0.8). The robe's cut (its
     rings, its hem at 0.16 H, its split, its panels' weights) is unchanged, and so it hangs at rest
     as it did: the back hem's centre 0.171 H up and 0.118 H behind the hips bone in the idle.
     The leg guard passes every clip of the Duelist, the run at 0.23 px at worst (the limit
     0.667 px at 1.5x) and the rest at 0. Only the Duelist's back panel changes: his front and
     side panels, the base's coat and the Sellsword's keep the shared springs. *Measured,* the back
     hem in the run 0.224–0.316 H up and 0.172–0.219 H behind (was 0.156–0.254 and 0.133–0.189), in
     the walk 0.191–0.198 H up (was 0.176–0.193). Judged at the contact sheet (R111).

### Acceptance Criteria

Bake (`npm test` in `game-client`: `classMotion.test.mjs`, `clips.test.mjs`, `clearance.test.mjs`,
`mercLooks.test.mjs`, `archerLooks.test.mjs`, on his rig and style as cast.js builds him):

- [ ] The archer's run keys and `ARCHER_SHEET` match their `2018f786` digests. Her other clips'
      digest, the shared run's digest, and the knight's and the wizard's sheet-and-clips digests
      are unchanged (R92, R93).
- [ ] The sprint's legs, lean and 16 fps run spec are defined once and read by both classes
      (R93).
- [ ] His sheet options carry exactly `idle`, `walk`, `attack`, `death`, `parry`, `run`. `run` is
      8 frames, looping, at 16 fps, `speed` 2.5. The Duelist's and the Sellsword's rows carry the
      same (R107).
- [ ] His run: the lean 19–21° on average and 18–22° on every sample; the head steady; the knee
      above 0.32 H; the shin past 1.45 rad; a flight frame each step; 4 planted keys; a lift of at
      least 0.045 H; a bob of 0.056–0.07 H; the pelvis once a step; the shoulders
      counter-turning at 6.5–10° (R94).
- [ ] His pace at 16 fps lies within 180–220 and within 3 px/s of `RUN_PACE`, which is still 194;
      the measured value is recorded (R95; replaced by the owner's pick if he makes one).
- [ ] On every sample: the upper arm 25–50° behind the trunk line (30–45° on average), the elbow
      bent 0–20°, the hand within 0.06 H of the hips bone's height and behind it (R97).
- [ ] On every sample: the blade 15–45° below level and back, the point at least 0.3 H behind
      the hips bone; the edge at least 30° below level; the normal-grip test passes on his run
      (R98).
- [ ] On every sample and every baked run frame of the three looks: every sword mesh's lowest
      point at least 0.06 H above the ground (R99).
- [ ] The trailing arm's angle varies 12–26° peak to peak over the cycle (R100).
- [ ] The free arm: `arms[0]`, `elbow[0]` 1, elbow 80–100° on every key, the hand back past the
      hip by at least 0.06 H; its front height against the chest bone is recorded (R101).
- [ ] The sword is out of the torso and the head, and clear of the free arm, on every sample
      (R102).
- [ ] His idle, walk, attack, death and parry keys match their `2018f786` digests (R103).
- [ ] On every baked run frame of the three looks: no sampled point of the sword inside a leg, a
      boot or a skirt; no sword edge across the half-cloak or the torso; the arm's pieces past the
      elbow clear of the legs, the skirts and the half-cloak. Each check's rejection fixture
      fails (R104, R105).
- [ ] The leg and cloak guards pass the three mercenary sheets on every clip they carry, with no
      exemption added (R106).
- [ ] The shared sprint's keys are unchanged under him (M1). The Duelist's robe back panel is carried
      out behind in the run (`ROBE_BACK_CARRY`), its cut and its rest unchanged, and its leg guard
      passes every clip (R114).
- [ ] The knight's and the wizard's run tests, and the shared run's tests (plain style, `RUN_STEP`
      key for key, the 10° lean, the pump bands, `RUN_PACE` within 1 at 14 fps), pass unchanged.

Manifest and client (`npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in
`game-client`):

- [ ] In `public/art/manifest.json` the three mercenary sheets carry `idle`, `walk`, `attack`,
      `death`, `parry`, `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and
      no `walk_attack`, `backpedal_attack` or `backpedal` (R107).
- [ ] The archer's, the knight's and the wizard's manifest entries and atlases are byte-identical
      to `2018f786`'s (R109).
- [ ] The shipped-sheet tests in `animationSelect.test.ts` and `manifest.test.ts` name the
      mercenary without `walk_attack` and `backpedal_attack`, with `parry` and `run`; the knight
      and the wizard keep both clips.
- [ ] `animationSelect.ts` and `character.ts` are unchanged. On a sheet with `parry` and `run` and
      no `walk_attack`, `selectAnimation` plays `attack` turned to the aim while attacking on the
      move, `parry` while guarding, and `run` at `speed / RUN_PACE` otherwise (a test exists or is
      added) (R108).
- [ ] `npm run bake -- --check` is clean.
- [ ] Each mercenary frame box is at most 297 × 261. The report gives each atlas's dimensions, RGBA
      and PNG bytes before and after, and the change in per cent; none grows (R110, R112).
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

HITL:

- [ ] **The owner approves** the three mercenary sheets' new run beside `2018f786`'s on the contact
      sheet (ADR-0021 §5), or names a tune round. He also picks how the pace is held (R95: (a),
      (b) or (c)).
- [ ] **Browser check:** in a run and in the town, the mercenary, the Duelist and the Sellsword run
      at 200 px/s with the sprint's lean and cadence and the trailing sword, the feet not visibly
      sliding and the point never on the ground. Attacking on the move plays the standing `cut`,
      the parry still raises, and a second player sees the same.

### Edge States

- **Attacking on the move.** The pin stands him (R49), so `cut` shows standing. In the latency gap
  at the pin's edges the standing cut may slide a tick or two with the drawn movement (M5,
  accepted).
- **Setting off and stopping.** The sword goes from the idle's point-down-forward carry to the
  trailing carry on the run's first frame, and back on stopping, with no blend: about a 100–135°
  turn of the blade in one frame (*estimate*: the idle's blade 30–35° below level ahead against
  the run's 15–45° below level behind). Judged at the contact sheet and the browser check. A
  transition clip is out of scope.
- **Running into a cut.** The cut starts from `attack`'s own first key (out of the idle carry), so
  the sword jumps from behind him to the wind-up. As above, judged in play.
- **Guarding while running.** The parry raises from the idle's carry (clips.js:827), not from the
  run's, so a parry started mid-run jumps from the trailing sword into the guard's first key.
  This is the same kind of jump as running into a cut.
- **Gear move speed.** At +20% (240 px/s) his run plays at about 1.24x (about 19.8 fps), capped by
  `MAX_WALK_SCALE` as today. The foot slide under option (a) scales with it, about 1.3% of the
  ground speed.
- **The lowest frames.** The point is lowest where the pelvis is lowest in the bob and the arm
  sways furthest back. R99 holds there on the baked frames, not only on the 32 samples.
- **The heel kick under the blade.** On the other step the right heel folds up behind his seat
  (the shin to 1.8 rad) as the trailing blade passes over it. R104's leg guard holds it. If only a
  shorter heel kick would clear it, that changes the shared sprint, and so the archer: escalated.
  The same kick against the Duelist's robe was escalated on 2026-11-23 and answered by the robe
  (R114), never the keys.
- **The three looks.** The Duelist's half-cloak flies back in the run's drag (`drag` 0.34,
  mercLooks.js:173) toward a blade trailing on his right. The Sellsword's right spaulder rides
  the upper arm and turns with its twist (R98), toward the chest or the back. The Duelist's wide
  right sleeve flares at the forearm and turns with it. R104 guards each; a fix that would need a
  look change is escalated.
- **The arm's twist.** About 150° between the shoulder and the forearm is near the end of a real
  arm's range (*estimate*). The forearm's skin tube may wrap visibly at the elbow or the wrist.
  This is judged at the contact sheet at ×4. *Fallback, named for the owner:* the edge left
  facing up (the hand turned only in the swing plane, no arm twist), the curve's back then down.
- **Mixed parties.** Until the knight and the wizard are redone, they run at 14 fps on the shared
  keys with `walk_attack`, while the archer and the mercenary sprint with neither
  attack-on-the-move clip. Expected.
- **Other players.** Others draw him from the same sheet, so they see the sprint and the trailing
  sword.
- **The dark-room strip.** `contact-darkroom-mercenary` is regenerated with the new run, if the
  bake writes one for him, as the archer's was.

### Out of Scope

- The knight's and the wizard's runs and their looks' runs, and dropping their `walk_attack` and
  `backpedal_attack`. Each comes when its own run is redone, after the owner has seen the
  mercenary.
- The `walk_attack` and `backpedal_attack` branches in `animationSelect.ts` and `character.ts`, and
  `BACKPEDAL_PACE`. They go when the last class drops the clips.
- The mercenary's idle, walk, attack (`cut`), death and parry; a parry or cut that starts from the
  trailing carry; a transition clip between the carries.
- Any change to the archer's sprint values, her carry or her sheets (R92). A change to the shared
  sprint that would move her keys is escalated, not made.
- A look change to the base, the Duelist or the Sellsword (escalated if the guards ask for one),
  except the Duelist's robe back panel carried out behind in the run (R114, the owner 2026-11-23).
- `RUN_PACE`, the server's move speed (200 px/s), the pin, and any game-server change (the human
  lane).

## Change: The wizard's sprint and pointed cast
Status: work-order
Date: 2026-11-23

Promoted `--from-thread` on 2026-11-23 from the owner-approved charter "法師與戰士衝刺跑", its wizard
item. The thread is the charter's locked decisions, so no interview was held; every decision
below is a **charter default approved by the owner** ("做好就接著做不用問我"), given with its
reason. It lands here for the reason the archer's and the mercenary's did: it changes the run
(§A) and the attack-on-the-move clips (§B, R5) this FS owns through `game-client/SPECIFICATION.md`
"Run and backpedal animations", and takes `walk_attack` off sheets FS-HF0WW's "Walk-and-attack
animation" built, so FS-HF0WW carries a pointer stub to this section. It also re-keys the
wizard's cast, which FS-2325V `## Change: The class attacks move with weight and cut deep` owns
(R4: "the strike thrusts the sceptre toward the aim"), and so the focus looks' cast, which
FS-1J1CB R3 and R4 hold "thrust as the sceptre is" at "today's frame size": both carry a pointer
stub. No new thin line, no new FS. Code citations are against `22cabd3a` (`feat/run-merc-sprint`,
the mercenary's sheets re-baked, I-JS7C8-24). Measures marked *measured* were read on her own rig
and style (each look's `CAST` row built and posed as the bake poses it, `poses.js`
`characterPoses`, or `rigOf(WIZARD_BUILD)` as classMotion.test.mjs builds her; 32 samples over the
run's cycle) by a throwaway script that is not committed. Frame boxes marked *measured* were read
by that script replaying the bake's first pass (baker.js `bakeCharacter` :254-296: every sizing
pose, its vertices and their ground shadows in the 8 facings, then frameBox.js `frameBox`, pad
0.06); it reproduces today's three manifest boxes and anchors exactly.

**Why (owner).**

> 「做完後就接著做法師跟戰士的跑步 法師攻擊時法杖要伸直指向怪物像施法一樣 戰士暫時只要調跑步就好 一樣移除攻擊時前後走動的部分 做好就接著做不用問我」

Once the mercenary is done, do the mage's and the warrior's runs. When the mage attacks, her staff
should stretch straight out and point at the monster, as if casting a spell. For the warrior,
only the run for now. As before, remove the attack clips that step forward and back. When it is
done, carry on without asking. For the archer, earlier: 「跑步時可以更有衝刺感…想要有快一點的跑步感」,
「跑更快的話身體可能會更加前傾」; for the mercenary: 「移動時也要像弓箭手跑的感覺」.

**What it changes, for the wizard's three sheets only** (`char_wizard_base`,
`char_wizard_spellwarden`, `char_wizard_pyromancer`):

- R2: her lean (about 10° → about 20°) and "the legs are slice 5's ... the 14 fps cadence
  unchanged, key for key". Her sceptre (or focus) arm and tome arm keep R2's carry.
- R3: her cadence becomes the sprint's (16 fps) over a shorter stride (*escalated*, below: not the
  sprint's own legs).
- R5: "`walk_attack` stays on every class sheet" no longer holds for her; `walk` does.
- R8–R11, R13, R21: `backpedal_attack` and `walk_attack` leave her sheets, so their leg rules no
  longer apply to her.
- R37, R41, R48: her contact sheet and the guideline lose those two clips.
- FS-2325V `## Change: The class attacks move with weight and cut deep` R4: at the strike the
  sceptre no longer stands up out of the fist; it points along the aim. R1's anticipation,
  weight, arcs and follow-through, and R5's 7 keys at 12 fps with the strike at key 3, stand.
- `## Change: Attacking pins the attacker`, Out of Scope: "Retiring the attack-on-the-move clips"
  is done for her sheets too. The knight stays out of scope (the charter's next item).

The knight (and his looks) is untouched: his run key for key, his `walk_attack` and
`backpedal_attack`, `RUN_ANIMATIONS.run` at 14 fps. The archer's and the mercenary's sheets are
untouched byte for byte.

> **Edited in place on 2026-11-23 (the coordinator's picks on E1 and E2, still a work-order).**
> Requirement numbers are kept. W1, W3 and W4 carry the picks; R117 and R130 are restated, and the
> frame-box acceptance line with R130. See *Decided 2026-11-23: E1 (a), E2 (b)*, after the
> escalations. Edited again the same day (I-JS7C8-27, the lean broke a guard of her kept carry): W2
> carries the change, R122 and R123 and their acceptance lines are restated. See *Decided
> 2026-11-23: the carry changed under W2*. Edited again the same day (review round 1 of
> I-JS7C8-27..30): R123 (i) catches up with the code (`SCEPTRE_RUN_PEAK` deleted, not kept), and
> *Follow-ups (outside this change)* records the base's death, after Out of Scope.

### Decisions (charter defaults, owner-approved 2026-11-23)

- **W1. The shared sprint** (`SPRINT_STEP`, `SPRINT_LEAN` about 20°, `SPRINT_RUN` 16 fps); the
  archer's and the mercenary's keys and sheets unchanged, held by digest. Her pace within the
  shared tolerance used for the mercenary (option (a): within 3 px/s of `RUN_PACE` 194), measured
  on her rig. *Reason:* the owner's 「一樣」 (as with the others). ***Escalated:** the shared legs
  fail her robe's guards and her pace. See Escalated 2026-11-23, E1.* ***Decided 2026-11-23,
  E1 (a):** her run takes the sprint's lean and 16 fps by reference over her own `RUN_STEP` legs at
  stride 0.88, her pace within 1 px/s of `RUN_PACE` (R117, R119).*
- **W2. Her run keeps today's carry**, the sceptre or focus arm's smaller pump and the tome arm's
  full pump, re-measured under the 20° lean. The carry changes only if the lean breaks a guard or
  puts the orb or her head over a ceiling, and that is said. ***Said 2026-11-23 (I-JS7C8-27):** the
  lean broke the sceptre-out-of-the-robe guard and tipped the sceptre past its band, so the carry
  changed, the least that keeps her look: the arm a little further out, the wrist held back
  (R122, R123).*
- **W3. The robe.** The robe and leg guards pass in the run on all three looks with no exemption.
  If the sprint's heel kick or knee drive pokes through, the first fix is the robe's back carried
  out in the run (as the Duelist's `ROBE_BACK_CARRY`), the robe at rest unchanged. The shared legs
  never change. *Reason:* her robe has a clipping history (FS-HF0WW § Change: The guard measures a
  leg through the cloth: the knee through the gown, the waist, the black dots behind the knee).
  ***Escalated:** the poke is the knee drive at the front, which the back carry cannot reach (E1).*
  ***Decided 2026-11-23, E1 (a):** she is not on the shared legs, so the gown is unchanged and the
  guards pass with no exemption (R120).*
- **W4. The pointed cast.** The cast is re-keyed: the sceptre (or focus) arm extends straight,
  the elbow nearly straight, toward the target, and the staff points along the aim like a spell
  being cast, at about chest-to-shoulder height, never over her head. The free hand may open or
  brace naturally. The same frames and fps as today, so the client's attack window times it
  unchanged. The clip already faces the aim (animationSelect.ts:155-157), so "points at the
  monster" means it points straight ahead along the facing in each of the 8 facings. The
  Spellwarden's and the Pyromancer's focuses point the same way. The staff and the focus stay
  clear of her body, robe and head. The frame box does not grow; if it would, escalate.
  *Reason:* the owner, 「法師攻擊時法杖要伸直指向怪物像施法一樣」. ***Escalated:** a straight arm along
  the aim grows the box (E2).* ***Decided 2026-11-23, E2 (b):** the cast points as written and the
  box may grow in width by what the pointed cast needs, no more (R130).*
- **W5. `walk_attack` and `backpedal_attack` leave her three sheets.** Idle, walk and death are
  unchanged. A sheet without them plays the standing cast (the client's fallback, no code change).
- **W6. The owner sees the contact sheet** (ADR-0021 §5), but later slices and the charter's next
  item do not wait on it.

**Escalate (report back, don't route around):** a default the code contradicts; a guard that
needs a look change beyond W3's robe carry; the frame box growing; the pace leaving its tolerance.

### Escalated 2026-11-23 (to the coordinator, not routed around)

**E1. The shared sprint's legs under her robe (W1, W3), and her pace.** On her rig, the shared
sprint's legs fail her robe's guards, and her pace leaves W1's tolerance. *Measured,* on all
three looks (the shared legs, lean and 16 fps, her carry as it is):

- The leg guard (`clearance.js` `legClearance`) reads **3.20 px** at 1.5x on the run's keys 2 and 6
  (the limit is 0.667). It is the swing thigh at the front, just above the knee (bind 0.353 H up),
  raised by the sprint's knee drive (`SPRINT_STEP.thighL` −0.85 at key 2) to 0.43 H off the ground
  and 0.144 H ahead of the hips bone. It comes out through the gown's front. Keys 3 and 7 read
  0.66 px and keys 1 and 5 read 0.12–0.14 px, at the knee. The camera sees a thigh or knee through
  the cloth (`seenThroughCloth`) on keys 1, 2, 3, 5, 6 and 7 (12–59 vertex-facings a key). It is
  neither the heel kick nor the lean: the 20° lean over today's legs reads 0 px and 0 seen, and
  the shared legs at 14 fps read the same 3.20.
- W3's fix does not reach it. With the back panel carried out (`skirtB` `drag` 0.28 → 0.4–0.8,
  `limit` 0.8 → 1.1–1.4) the guard still reads 3.20 px; the back hem in the run rises from 0.11–0.24 H to
  0.20–0.46 H. The front panel already swings as far as the thigh (`pushPanels`: `skirtF` to
  −0.85 rad in the run), and a wider `limit` changes nothing. The gown's own weighting does not
  clear it either: `legFollow` 0.5 → 0.6, 0.7, 0.9 reads 2.89, 2.49, 1.97 px; `panelWeight` 0.35 →
  0.5, 0.65 reads 2.79, 2.21 px (and lets the knee through today's run, 0.19 px); `kneeCover` 0.05
  → 0.08 reads 3.20 px and 0.12 reads 6.35; a fuller front cut (depth 0.08 → 0.09 at the top,
  0.138 → 0.15 at the hem) reads 3.18 px and shows the waist in the walk. Each of these is also a
  look change in every clip, which W3 does not allow.
- Her own lower knee drive, which would put her off the shared sprint, does not clear it until it
  is about the shared fast run's (−0.52). At `thighL` key 2 −0.75, −0.7, −0.65, −0.6 and −0.55 it reads
  1.92, 1.34, 0.91, 0.67 and 0.67 px, and a knee is still seen on 4–6 keys.
- Her pace on the shared legs at 16 fps is **190.65** world px/s: 3.35 under `RUN_PACE`, outside
  W1's 3 px/s. Her legs are shorter than the others' (build 1.92 against the archer's 1.96 and the
  mercenary's 1.98). Today her own run reads 190.22 at 14 fps, held only to the class band
  180–220 (classMotion.test.mjs:510-517).

The options:

- **(a) Default, picked 2026-11-23 (see Decided below):** the sprint's lean (`SPRINT_LEAN`) and its
  clip (`SPRINT_RUN`: 16 fps, `speed` 2.5, both read by reference) over the shared fast run's legs
  (`RUN_STEP`) at a stride of **0.88** (`run.stride`, clips.js:363), so the stride is 12% shorter,
  as the sprint's is. *Measured* on all three looks: the leg guard 0 px and nothing seen through
  the cloth on every run key; pace **194.21** (within 1 px/s of `RUN_PACE`, the archer's own
  tolerance); bob 0.062 H (the sprint's); knee peak 0.311 H (today's, under the sprint's 0.335).
  The robe is unchanged and needs no exemption. What it gives up is the sprint's higher knee and
  heel kick, mostly hidden by an ankle-length gown. It is the smallest look change: the robe as it
  is, the lean and the cadence the archer's and the mercenary's. `SPRINT_STEP` is not changed, and
  her run is not on it.
- (b) The shared sprint's legs, with a robe change beyond W3: the gown's front carried up by the
  driven knee in the run. No existing cloth setting does it (above). It needs new rig work, such as a
  front panel bone pushed by the thigh at knee height or a run-only weighting, and it shows the
  gown's front lifting with each stride. Not measured. Her pace there is 190.65, outside 3 px/s; it
  would also need her own fps (16 × 194 / 190.65 ≈ 16.28) or a wider tolerance.
- (c) The 20° lean over today's legs and cadence (14 fps). *Measured:* 0 px, nothing seen, pace
  190.22 (today's). No quicker cadence.

**E2. The pointed cast grows the frame box (W4).** *Measured* (the bake's first pass replayed):
today's boxes are set by the cast's strike (key 3: the right edge in `ne`, the top in `nw`, the
sceptre standing up there with the orb at 0.95 H) and the death (key 4: the left edge in `sw`, the
bottom in `se`). With keys 3 and 4 keyed as W4 says (the elbow straight, the staff along the
facing 8° below level, the hand at 0.68 H, today's lunge), the width grows and the height does not:

| Sheet | Today | W4 as written (8° below) | Without the cast |
|---|---|---|---|
| `char_wizard_base` | 222 × 192 | **240** × 189 | 201 × 180 |
| `char_wizard_spellwarden` | 225 × 195 | **243** × 192 | 201 × 186 |
| `char_wizard_pyromancer` | 225 × 198 | **240** × 195 | 201 × 186 |

The new width comes from key 4 in `ne` and `sw`, where her facing runs across the screen. On the
base, the same point reads 249 wide at level, 231 at 15° below, and 231 without the forward lunge
(`body.z` 0 at keys 3–4). It fits (at most 222) only with the staff about 25° below level (213 × 183:
the orb at 0.44 H, about her hips, aimed at the ground a body length ahead) or the elbow bent about
45° (213 × 183; 29° reads 228, 63° reads 204). The options:

- (a) Default until the pick: W4 as written, and the bake (R133) stops
  before it commits a box wider than today's. The coordinator picks before then.
- **(b) Picked 2026-11-23 (see Decided below):** accept the wider box: about +18 px (1.5x) of
  width each, about +8%; the height holds. The
  frames are trimmed (lib/trim.mjs), so the atlas pays only for the pixels drawn; dropping the
  attacks on the move (R131) takes 28 of 64 frames a facing off.
- (c) Hold the box with the elbow bent about 45°: the staff still along the aim, the hand nearer
  the chest. It is not "伸直".
- (d) Hold the box with the staff about 25° below level: the arm straight, the orb about at her hips.
  It is not "chest to shoulder".

### Decided 2026-11-23: E1 (a), E2 (b)

The coordinator picked on both escalations under the owner's standing word for this charter,

> 「做好就接著做不用問我」

(when it is done, carry on without asking). The owner was not asked again.

- **E1 → (a).** Her run takes `SPRINT_LEAN` and `SPRINT_RUN` (16 fps) by reference over her own
  `RUN_STEP` legs at a stride of 0.88 (*measured:* pace about 194.21, the robe guards 0 px, nothing
  seen through the cloth on all three looks). She gives up the sprint's higher knee drive and heel
  kick, which the ankle-length gown mostly hides. *Reason:* the shared legs push the knee 3.2 px
  through the gown's front, and no robe setting cleared it (E1's measures). (b) would need new rig
  work and her own fps; (c) gives no quicker cadence. W1's pace tolerance tightens to the archer's
  1 px/s (R119). `SPRINT_STEP`, `SPRINT_LEAN`, `SPRINT_RUN` and `RUN_STEP` are unchanged.
- **E2 → (b).** The pointed cast as the owner asked it (the arm straight, the staff along the
  facing, 0–15° below level, R125 unchanged), and the wider frame box is accepted (*measured:*
  about +18 px of width at 1.5x; the frames are trimmed). The bake reports the new boxes and atlas
  sizes (R135). The box may grow in width only by what the pointed cast needs, and that growth is
  reported; any other growth (in height, or in width past the pointed cast's own need) escalates.
  *Reason:* the owner's 「法杖要伸直指向怪物像施法一樣」: an elbow bent about 45° (c) or the staff
  dropped about 25° (d) would not read as pointing at the monster.

### Decided 2026-11-23: the carry changed under W2

Built (I-JS7C8-27), her kept carry failed two of R122's and R123's checks under the sprint's lean.
The 20° lean under her carry (*Facts checked in code*) had been measured wrong on both:

- *Measured,* the kept carry over option (a)'s legs: the sceptre 36.7–48.5° off vertical by the
  test's sampling (not 30–40.3°; 23.4–37.8° on the 10° lean), past R123's 45; and the shaft's foot
  0.0006 H inside the robe (`outsideRobe`) on the run's key 1 (0.0033 H clear on the 10° lean).
  The lean broke a guard, so W2 changes the carry, and says so.

The coordinator, on the owner's standing word 「做好就接著做不用問我」, asked for the least change that
restores her approved look: the wrist held back to keep today's sceptre lean, the arm out to clear
the robe, first `RUN_SCEPTRE` x −0.28 with the arm out to `upperArmR` z −0.14, else z −0.13. So:

- **The arm out:** her run's `hold` `upperArmR` z −0.12 → **−0.14** (`SCEPTRE_RUN_OUT`). *Measured:*
  the robe 0.0027–0.0028 H clear (−0.13 read 0.0011), the peak unchanged.
- **The wrist held back:** `RUN_SCEPTRE` x −0.1 → **−0.3**, about the 10° the trunk now leans
  further taken back at the wrist. −0.28, the coordinator's first pick, put the Pyromancer's cage
  1.294 skull radii from her skull on the run's key 0, under the 1.3 the focus guard asks
  (`mageLooks.test.mjs` "each focus clears her head and the ground"); −0.13 with −0.28 read 1.293.
  *Measured* by the wrist at z −0.14 (base, Spellwarden, Pyromancer, skull radii in the run): −0.2
  1.365 / 1.394 / 1.272; −0.28 1.415 / 1.409 / 1.294; −0.29 1.428 / 1.416 / 1.301; **−0.3 1.442 /
  1.425 / 1.311**; −0.32 1.474 / 1.441 / 1.336; the kept −0.1 1.453 / 1.457 / 1.351. −0.3 is the
  least that clears it by more than a hair. The sceptre then leans **26.0–37.3°** off vertical,
  today's on the 10° lean being 23.4–37.8°.
- Nothing else in the carry moves: `arms`, `wrist`, `cross`, the tome arm's `hold`, her idle and
  walk. The looks take it through `FOCUS_STYLE`.
- The camera check (`seenThroughCloth`) now also runs, committed, on her own figure and each look
  as the bake poses them (`mageLooks.test.mjs`): 0 vertex-facings at rest and on every moving clip.

### Facts checked in code (`22cabd3a`)

- **Her sheets share one clip set and one style.** `CLASS_ROWS.wizard` (cast.js:597) is `{ build:
  wizard, sheet: WIZARD_SHEET }`; `specRow` (cast.js:622) spreads it into the Spellwarden's and the
  Pyromancer's rows (cast.js:656-657). `WIZARD_SHEET` (classStyles.js:280) is `{ animations:
  RUNNING_CLASS_ANIMATIONS, scale: 1.5 }`, and `RUNNING_CLASS_ANIMATIONS` = `withWalkAttack({
  ...ANIMATIONS, ...RUN_ANIMATIONS })` (clips.js:106), which the knight's sheet also reads
  (classStyles.js:92). `wizard()` returns `WIZARD_STYLE` (cast.js:281); both looks return
  `FOCUS_STYLE` (mageLooks.js), which is `{ ...WIZARD_STYLE, deathExtra }` (classStyles.js:320). So
  her run, her carry and her cast reach the looks with no change of their own. `ARCHER_SHEET` (:243)
  and `MERCENARY_SHEET` (:360) are built without `withWalkAttack`.
- **The sprint is shared already.** `SPRINT_LEAN` 0.48 (classStyles.js:171), `SPRINT_STEP`
  (:189-197), `SPRINT_RUN` `{ ...RUN_ANIMATIONS.run, fps: 16 }` (:200); `ARCHER_STYLE.run` (:258) and
  `MERCENARY_STYLE.run` (:378) read them by reference, and the shared-sprint describe holds that
  (classMotion.test.mjs:902-913). `runCycle` (clips.js:362-409) takes `run.lean`, `run.legs` and
  `run.stride` (scaling every thigh key, the foot keeping its world angle). No new parameter is
  needed.
- **Her run today** (`WIZARD_STYLE.run`, classStyles.js:296-301): `{ arms: [1, SCEPTRE_RUN_ARM],
  wrist: RUN_SCEPTRE_WRIST, cross: [0, RUN_CROSS], hold: pose({ upperArmL: [0, 0, 0.14], upperArmR:
  [SCEPTRE_RUN_BACK, 0, -0.12], handR: RUN_SCEPTRE }) }`: `SCEPTRE_RUN_ARM` 0.76 (:65),
  `SCEPTRE_RUN_BACK` 0.25 (:66), `RUN_SCEPTRE` [−0.1, 0, 0] (:62), `RUN_SCEPTRE_WRIST` [0, 1.2] (:63),
  `RUN_CROSS` 0.3 (:59); tested against `SCEPTRE_RUN_PEAK` 0.61 (:68) and `SCEPTRE_RUN_TILT` [15, 40]
  (:70) in the shared fast run's describe (classMotion.test.mjs:285-517, rows `SHARED_RUNNERS`
  :283).
- *Measured, her run today (14 fps, on her rig):* the hips-to-neck lean 9.96–10.26°; pace 190.22
  world px/s; the pelvis 0.484–0.540 H (a bob of 0.056 H); the knee's peak 0.311 H; the chest bone
  0.613–0.668 H; the right shoulder 0.697–0.760 H; the head bone 0.784–0.840 H; the sceptre hand
  0.474–0.612 H, from 0.08 H behind to 0.22 H ahead of the hips bone; the tome hand 0.479–0.699 H;
  the sceptre 17–31° off vertical (mean 24°, from the hand to the top of the mount's meshes), its top 0.74–0.85
  H off the ground; the sceptre's lowest point 0.40 H, a focus's 0.27 H.
- *Measured, the 20° lean under her carry* (the same keys of the arms, `SPRINT_LEAN`, at 16 fps;
  the arms do not read the legs): lean 20.20–20.50°; the chest bone 0.599–0.661 H; the right
  shoulder 0.674–0.752 H; the head bone 0.760–0.822 H; the sceptre hand 0.458–0.571 H (peak 0.571,
  0.574 over option (a)'s legs, against `SCEPTRE_RUN_PEAK` 0.61 ± 0.01); the tome hand 0.459–0.637 H,
  at the front of its pump 0.022 H under the chest bone (today's test asks it above,
  classMotion.test.mjs:323-342); the sceptre 30–40.3° off vertical by the test's own sampling (:360-392;
  30–42° by the mount's meshes), its top 0.67–0.81 H. Copies of classMotion.test.mjs with her run
  on the lean (and on option (a)'s legs) pass the carry out of the torso and the head, the hand
  crossing in (`RUN_CROSS_REACH`), the weapon clear of the free arm, and the normal grip. They fail
  only those three bands, besides the rows the sprint retires (the 10° lean, the shared legs, the
  14 fps pace). The tilt test stops at its first failing sample, so its orb-ahead and out-of-robe
  checks were not read past it.
- **Her cast today** (`ATTACKS.cast`, clips.js:663-672, over `CAST_STANCE` :478): 7 keys at 12 fps
  (`ANIMATIONS.attack`, clips.js:20), the glow peaking at key 3 (`fx.glow` 5), not looping. No hold
  is added: `clipsFor` makes `attack` from `ATTACKS[style.attack]()` plus `style.attackExtra`
  (clips.js:870), and neither style has an `attackExtra`. *Measured* on her rig (the arm is the
  same on all three looks; yaw + toward her left; the staff from the mount's butt to its top):

  | Key | Shoulder→hand, from level / yaw | Elbow bent | Hand (H) | Staff from level / yaw | Staff off the facing | Top (H) |
  |---|---|---|---|---|---|---|
  | 0 | −35° / −39° | 86° | 0.59 | +71° / +75° | 85° | 0.88 |
  | 1 | −33° / −79° | 109° | 0.62 | +37° / +64° | 70° | 0.80 |
  | 2 | −8° / −54° | 89° | 0.70 | +44° / +76° | 80° | 0.92 |
  | 3 (strike) | −10° / +12° | 11° | 0.67 | +77° / +16° | 78° | 0.95 |
  | 4 | −17° / +31° | 14° | 0.63 | +74° / +40° | 78° | 0.91 |
  | 5 | −21° / −3° | 57° | 0.63 | +78° / +138° | 99° | 0.93 |
  | 6 | −39° / −20° | 66° | 0.56 | +80° / +89° | 90° | 0.86 |

  Over the clip the shoulder stands at 0.72–0.73 H, the chest bone at 0.64 H, the head bone at
  0.81–0.82 H. At the strike the arm already reaches forward nearly straight and a little below
  level, the hand 0.37 H ahead of the hips. But the sceptre stands nearly upright out of the fist
  (77° above level, 78° off the facing), the orb at 0.95 H, over her crown (*estimate:* about 0.92 H, the skull of classMotion.test.mjs `inside` standing about 0.11 H over the head bone), the top 0.47 H
  ahead of the hips. The Spellwarden's ring stands at 0.97 H, the Pyromancer's cage at 0.96 H.
  In the grip frame (gear.js) the sceptre runs from −0.073 to 0.291 H (`sceptre` :487), and each focus from
  −0.214 to about 0.30 H (`FOCUS_BUTT` −0.2 and `FOCUS_TOP` 0.2, :514-515, the ring or cage above):
  the fist holds a focus 0.21 H up its haft, so, pointed along the arm, its butt reaches back toward the
  forearm. Her gown's sleeves flare to 2.35 times their width at the wrist (cast.js:243, `sleeve`).
- **The wrist.** A carry today cocks the hand in the swing plane at most `CLEAVE_CARRY` 1.3 rad
  (clips.js:545); the mercenary's trailing sword 1.0 (classStyles.js:341), the rest blade 0.95 (:47).
  The trial point above needed 1.57–1.72 rad to lay the staff along a straight arm. *Estimate:* a
  human wrist deviates toward the little finger about 30–40° and flexes about 80°, so a staff
  along the forearm comes from the arm's angle as much as from the wrist.
- **How the client aims her cast.** A click sends `fireball` (playerCombat.ts:457), a right-click
  `triple_fireball` (:470); either calls `attackClip(aim)` with `aim` the world vector from her to
  the click (:231, :236, :242). `selectAnimation` turns the attack to `facingFrom(aim)`
  (animationSelect.ts:155), the nearest of the 8 facings (facing.ts:23-31, 45° sectors), and plays
  `attack` whenever the sheet carries no `walk_attack` (:157). The fireball flies along the exact
  aim from 15 screen px along it at 42 screen px above her feet (`HAND_REACH`, `HAND_LIFT`,
  fireball.ts:24, :27). At 1x her height is 1.92 units, 75 screen px of height (projection.js
  `VPX` 39.19), so 42 px is about 0.56 H. A pointed staff therefore points within 22.5° of the
  true aim, and the fireball does not start at the orb.
- **Clip choice needs no client change.** `walkAttack` and `backpedalAttack` come from what the
  sheet carries (character.ts:111-113); without them `attack` plays moving or not
  (animationSelect.ts:157).
- **The tests that name her attack-on-the-move clips:** `animationSelect.test.ts:486`
  (`WALK_ATTACKERS` includes `mage`); `manifest.test.ts:1280` (`OWN_CLIPS.char_wizard_base`),
  :1384-1386 (`BACKPEDALLING`); `clearance.test.mjs:404` (`MOVING.wizard`) and :501 (the scapular
  over the gown through both attacks on the move); `classMotion.test.mjs:285-295` (the
  `SHARED_RUNNERS` sheet test), :631 (`CARRIED`), :741-745 (the cast is what the attacks on the
  move draw), and :1055-1056 (her sheet and clips held by digest as "unchanged");
  `mageLooks.test.mjs:115` (the looks carry every wizard clip, which follows her sheet).
- **Her sheets today** (`public/art/manifest.json`, each one page, 1.5x, trimmed, crown 74):
  `char_wizard_base` 222 × 192, anchor (87, 147) px; `char_wizard_spellwarden` 225 × 195, (87,
  147); `char_wizard_pyromancer` 225 × 198, (87, 153). Frames per facing: idle 6, walk 8, attack
  7, death 7, run 8, `walk_attack` 14, `backpedal_attack` 14: 64. Atlases: `wizard-0` 2056 × 4000
  (32.9 MB RGBA, PNG 4,906,841 B), `wizard_spellwarden-0` 3116 × 2700 (33.7 MB, 5,261,079 B),
  `wizard_pyromancer-0` 2224 × 3764 (33.5 MB, 5,148,652 B).

### Requirements

#### Her run: the sprint's lean and cadence (W1, W3; E1)

115. **The others' keys held first (W1).** Before anything moves, tests hold by digest, as they
     are at `22cabd3a`: the mercenary's run keys (`clipsFor(MERCENARY_STYLE,
     MERCENARY_SHEET.animations).run`) and `MERCENARY_SHEET`, beside the archer's run keys and
     `ARCHER_SHEET` (classMotion.test.mjs:1059-1062) and the mercenary's other clips (:1095-1104);
     the knight's sheet and clips (:1055); and her own idle, walk and death keys. The shared run's
     digest (:1054) holds. They stay green through every slice of this change.
116. **The sprint read, not changed (W1).** `SPRINT_LEAN`, `SPRINT_STEP`, `SPRINT_RUN`, `RUN_STEP`,
     `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`, `RUN_ANIMATIONS` and
     `RUNNING_CLASS_ANIMATIONS` keep their values. Her run reads `SPRINT_LEAN` and her sheet's run
     is `SPRINT_RUN`, by reference.
117. **Her legs (E1, default (a)).** Her run is the shared fast run's legs (`RUN_STEP`, no
     `run.legs`) at a stride of 0.88 (`run.stride`, a named constant beside the sprint's, e.g.
     `WIZARD_SPRINT_STRIDE`), the knee and the flight at 1. *Decided 2026-11-23:* E1 (a) is the
     pick, so this requirement and R118–R120 stand as written.
118. **Her run, measured as the sprinters' are** (classMotion.test.mjs:916-1020, on her rig): the
     lean 19–21° on average and 18–22° on every sample (*measured* 20.20–20.50); the head's pitch
     within 3° of rest, its yaw range under 0.08 rad and its roll under 0.06; a flight frame with
     both soles over 0.02 H in each step, a foot planted in at least 4 of the 8 keys, a lift of at
     least 0.045 H; a bob of at least 0.056 H and under 0.07 H (*measured* 0.062); the pelvis rising
     and falling once a step, highest at or next to each flight key; the shoulders against the
     hips (correlation below −0.8, peaking at 6.5–10°). Her knee is held to today's (at least 0.30 H,
     *measured* 0.311), not to the sprint's 0.32 (E1).
119. **Her pace (W1; E1).** Measured by `measurePace` at 16 fps on her rig and style, her run lies
     within 1 px/s of `RUN_PACE` (194) (*measured* 194.21). `RUN_PACE`, `animationSelect.ts` and the
     server's 200 px/s do not change.
120. **The robe passes, no exemption (W3).** On all three looks, on every clip their sheets carry:
     the leg guard (`legClearance`, run at bake by `main.js` and by `clearance.test.mjs` and
     `mageLooks.test.mjs`) reads at most the 1.5x limit; the camera sees no hip, thigh or knee
     through the cloth (`seenThroughCloth`, `clearance.test.mjs` "no leg is seen through the
     cloth"); the black gown never comes out through the teal scapular by a baked px
     (`clearance.test.mjs` `overGarment`, "the mage's scapular stays over her gown"). Nothing is
     added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. The gown, the scapular and their springs
     (`skirtBones` stiffness 38, drag 0.28, cast.js:211) are unchanged. *Measured* under option (a):
     0 px and nothing seen on every run key of the three looks. The scapular check was not
     measured. A look change these guards would ask for is escalated (W3, E1).
121. **Retired for the wizard:** R2's "the legs are slice 5's ... the 14 fps cadence unchanged,
     key for key", the 10° lean, and her rows of the shared fast run's tests
     (classMotion.test.mjs:285-517: the sheet test, the 10° lean, "the shared legs key for key",
     the 14 fps pace and "its attacks on the move walk the legs at most 90"), and her "unchanged"
     digest (:1055-1056). The knight keeps them.

#### Her carry under the lean (W2)

122. **The carry is kept, but for two keys (restated 2026-11-23, W2).** `WIZARD_STYLE.run`'s `arms`,
     `wrist` and `cross`, and her idle and walk `hold`, are unchanged; in the run's `hold` the
     sceptre arm stands out to `upperArmR` z −0.14 (`SCEPTRE_RUN_OUT`, was −0.12) and the wrist
     holds the sceptre back to `RUN_SCEPTRE` x −0.3 (was −0.1), the least that clears the robe and
     the Pyromancer's cage from her skull and keeps today's sceptre lean (see *Decided 2026-11-23:
     the carry changed under W2*). The looks take them through `FOCUS_STYLE`. Her run's
     describe holds, on every sample: the sceptre-arm and tome-arm elbows bent 80–100° on every
     key; each hand back past the hip by at least 0.06 H; the sceptre hand crossing in at the front
     (`RUN_CROSS_REACH`, before the torso); the weapon clear of the free arm by more than 0.06 ×
     `armR` H; the orb above the hand and ahead of it; every sceptre point outside the robe
     (`outsideRobe`); the carry out of the torso and the head (`deepestCarry`); the normal grip.
123. **The bands the lean moves, restated, not tuned away (W2).** The 20° lean lowers her chest, so:
     (i) the sceptre hand peaks at 0.56–0.59 H (*measured* 0.574; `WIZARD_SPRINT_PEAK`), under her
     chest bone's height and never at the shoulder, in place of `SCEPTRE_RUN_PEAK` 0.61 ± 0.01,
     which is deleted (*restated 2026-11-23,* built under I-JS7C8-27: the wizard was its only
     reader, and the knight carries no sceptre); (ii) *restated 2026-11-23:* the sceptre leans
     24–40° off vertical on every sample (*measured* 26.0–37.3° by the test's sampling, the wrist taking back the trunk's
     further 10°; 23.4–37.8° on the 10° lean), inside the owner-approved 15–45°, in place of
     `SCEPTRE_RUN_TILT` 15–40° (`WIZARD_SPRINT_TILT`; the kept carry read 36.7–48.5°); (iii) the tome hand's front height against the chest bone is
     recorded (*measured* 0.022 H under it), not tuned away, as the mercenary's free hand was (R101).
     As written this said no guard broke and the carry was unchanged; built, the kept carry broke the
     sceptre-out-of-the-robe guard and the band in (ii), so W2 changed it (R122). Nothing goes into
     her head, and each focus stays 1.3 skull radii from her skull. Each band is judged at the
     contact sheet (R134).

#### The pointed cast (W4; E2)

124. **The same clip.** `ATTACKS.cast` keeps 7 keys at 12 fps, not looping, the strike and the
     glow's peak (`fx.glow` 5) at key 3, over `CAST_STANCE`. The attack id (`cast`), the clip name
     (`attack`) and the client's attack window are unchanged. The knight's, the archer's and the
     mercenary's attacks are not touched.
125. **The point (W4).** On key 3, and on key 4 as it carries through, posed and grounded as the bake
     poses her:
     - the staff (the grip frame's +z, from the butt to the top of the mount) lies within 10° of the
       facing in plan, and 0–15° below level. The orb leads; she points it along the aim, at a
       monster on the same ground (*estimate:* about 5–10° below level reads as at the monster);
     - the arm reaches toward the aim: the shoulder-to-hand line within 25° of the staff's line,
       the elbow bent at most 20°;
     - the hand stands between the chest bone's height and the shoulder's (today 0.64–0.73 H), and
       the orb is never above the shoulder.
     On every key of the cast, the orb (or the focus's head) is never above her crown (the top of the skull as classMotion.test.mjs `inside` models it).
     Not over her head: today's strike holds it at 0.95 H. The model faces +z and each facing is
     baked by turning it (facing.js `yawFor`), so the point holds in all 8 facings by construction.
     The 8 facings' contact sheet shows it (R134).
126. **A hand that could hold it.** On every key of the cast the fist keeps its thumb side where the
     forearm has it: the normal-grip test (classMotion.test.mjs:609-623), extended from idle, walk
     and run to `attack`. The wrist cocks the hand in the swing plane at most 1.3 rad
     (`CLEAVE_CARRY`, the most any carry cocks today). The arm's angle lays the staff along the aim
     as much as the wrist does (see *The wrist*).
127. **Weight and arcs kept** (FS-2325V § Change: The class attacks move with weight and cut deep
     R1, R4; classMotion.test.mjs:688-739). The wind-up draws the orb back against the facing by at
     least 0.04 H with the weight back; the thrust carries it forward at least 0.2 H from the
     wind-up to the strike, onto the front foot by at least 0.03; the pelvis turns into it (at least
     0.15 rad) before the chest. The orb's path is curved, with no step carrying more than 40% of
     it and the strike's steps faster than the first and the last. The free hand opens out to the
     side at the strike by at least 0.08 H (W4's "may open": the open hand kept). The weapon
     turns at most `ATTACK_TURN_LIMIT` (100°) a frame from the carry into key 0, key 0 into key 1,
     through keys 4–6 and back to the carry. Only the right arm's keys and the wrist change.
     *Estimate:* keys 2–5. The stance, the trunk's turns, the weight and the glow stay as they are
     unless R125–R128 need them moved.
128. **Clear of her body (W4).** On every key of the cast, on all three looks: the staff or focus
     stays out of the torso and the head (`deepestCarry`, its points every 0.05 H along the haft);
     wherever it passes below the waist it stays outside the robe (`outsideRobe`); its head stays
     at least 1.3 skull radii from her skull and above the ground (`mageLooks.test.mjs` "each focus
     clears her head and the ground in every clip"). No edge of the focus's haft, butt knob or head
     (sampled along mesh edges at most 0.005 H apart, as `edgeGuards.mjs` `along`) lies inside her
     right forearm, her right hand or the gown's flared right sleeve. That last guard is new, with a
     rejection fixture: the same focus moved so its haft lies along the forearm's axis must fail it.
129. **The looks point the same (W4).** The Spellwarden's ward focus and the Pyromancer's fire
     focus take the same keys (`FOCUS_STYLE` spreads `WIZARD_STYLE`), and R125–R128 hold for each on
     its own row. The fire focus's flame stays upright in the world (gear.js `fireFocus`, its hook),
     so pointed, the flame stands up out of a level cage. That is judged at the contact sheet
     (R134), not re-keyed.
130. **The frame box (W4; E2).** Each wizard sheet's frame box is no larger than today's (222 × 192,
     225 × 195, 225 × 198) in either dimension. *Restated 2026-11-23 (E2 (b), see Decided):* the
     box keeps today's height or less, and may grow in width only by what the pointed cast needs
     (*measured* about +18 px at 1.5x: 240, 243, 240 at 8° below level; at most 249 at level).
     The bake reports each sheet's box before and after, and which pose and facing sets its width
     (R135). A box that grows in height, or whose width is set by anything but the pointed cast
     (without the cast the clips *measured* 201 wide, so a wider edge from another clip, the new
     run among them, is growth the pick did not take), stops the bake before it commits and is
     reported, never routed around.

#### The attack-on-the-move clips leave her sheets (W5)

131. **Her clip set (W5).** The three wizard sheets carry `idle`, `walk`, `attack`, `death` and
     `run`, in that order, and **no `walk_attack` and no `backpedal_attack`**. `WIZARD_SHEET` is
     built without `withWalkAttack`, its run `SPRINT_RUN`. The looks take it through `specRow`.
     `RUNNING_CLASS_ANIMATIONS` stays for the knight. A test control that needs her old clips builds
     them explicitly, as the archer's cloak control does (clearance.test.mjs:537-547). Her idle, walk
     and death keys match their `22cabd3a` digests (R115).
132. **Clip choice unchanged (W5).** `animationSelect.ts` and `character.ts` are not changed. On her
     sheets `carries` finds no `walk_attack` or `backpedal_attack`, so an attacking wizard plays the
     cast turned to her aim, moving or not (animationSelect.ts:157). Not attacking, she runs turned
     to her movement (R4). A pinned wizard stands (R49). In the latency gap at the pin's edges the
     standing cast may slide a tick or two with the drawn movement: accepted, as for the others.

#### Bake, review and budget (W6)

133. **One bake.** The three wizard sheets are re-baked once with R115–R132 by the bake tool (`npm
     run bake`), never drawn or edited by hand. `npm run bake -- --check` is clean afterwards. Only
     `wizard-0.png`, `wizard_spellwarden-0.png`, `wizard_pyromancer-0.png` and their manifest
     entries change. **The archer's, the knight's and the mercenary's manifest entries and atlases
     are byte-identical** (their sheets' `animations`, frame boxes, anchors, crowns, and the
     atlases' `sha256`).
134. **The contact sheet (W6).** For each of the three sheets: the new run beside `22cabd3a`'s and
     the new cast beside `22cabd3a`'s, 8 facings, at game scale and at ×2, with an animated preview
     playing the run at its fps × `200 / RUN_PACE` and the cast at 12 fps. Also a ×4 detail of the
     staff or focus at the strike (key 3) in `e`, `ne` and `n`, and of the gown's front over the
     knee on the run's keys 2 and 6. The regular contact sheet, the looks' sheet and the dark-room
     strip show her clips without `walk_attack` and `backpedal_attack`. The owner approves
     (ADR-0021 §5). Later slices and the charter's next item do not wait on it. Tune rounds after
     it stay inside this change.
135. **The report.** From the bake, for each sheet: the atlas pages and dimensions before and after,
     RGBA and PNG bytes before and after, the change in per cent, and the frame box before and after.
     Before (`22cabd3a`): `wizard-0` 2056 × 4000 (32.9 MB, PNG 4,906,841 B), `wizard_spellwarden-0`
     3116 × 2700 (33.7 MB, 5,261,079 B), `wizard_pyromancer-0` 2224 × 3764 (33.5 MB, 5,148,652 B).
     *Estimate:* 64 → 36 frames a facing (−44%), about 18–20 MB RGBA each if the box holds.
136. **Docs.** `game-client/docs/design-guideline.md`'s character clip list says that the wizard
     runs with the sprint's lean and cadence, her sceptre carried as before, that her cast points
     the staff along the aim, and that her sheets carry no attack-on-the-move clips. The
     `tools/bake/lib/contact.mjs` header notes say the same.

### Acceptance Criteria

Bake (`npm test` in `game-client`: `classMotion.test.mjs`, `clips.test.mjs`, `clearance.test.mjs`,
`mageLooks.test.mjs`, `castLooks.test.mjs`, on her rig and style as cast.js builds her):

- [ ] The archer's and the mercenary's run keys and sheets, the mercenary's other clips, the
      knight's sheet and clips, and the shared run match their `22cabd3a` digests (R115, R116).
- [ ] Her sheet options carry exactly `idle`, `walk`, `attack`, `death`, `run`; `run` is
      `SPRINT_RUN` by reference (8 frames, looping, 16 fps, `speed` 2.5); her run reads
      `SPRINT_LEAN` by reference and `RUN_STEP`'s legs at the named stride 0.88; the two looks'
      rows carry the same (R116, R117, R131).
- [ ] Her run: the lean 19–21° on average and 18–22° on every sample; the head steady; a flight
      frame each step; 4 planted keys; a lift of at least 0.045 H; a bob of 0.056–0.07 H; the
      pelvis once a step; the shoulders counter-turning at 6.5–10°; the knee at least 0.30 H (R118).
- [ ] Her pace at 16 fps within 1 px/s of `RUN_PACE`, which is still 194; the value recorded (R119).
- [ ] The leg guard, the seen-through-the-cloth check and the scapular-over-gown check pass the
      three looks on every clip they carry, with nothing added to `KNOWN_CLIPPING` or
      `MIRRORED_LEGACY`, the gown and its springs unchanged (R120).
- [ ] Her carry's keys are unchanged but the run's `upperArmR` z −0.14 and `RUN_SCEPTRE` x −0.3
      (W2); the elbows, the hands back past the hip, the cross-in, the
      free-arm clearance, the orb ahead of the hand, the sceptre outside the robe, the carry out
      of the body and the head, and the normal grip pass on her run (R122).
- [ ] The sceptre hand peaks at 0.56–0.59 H; the sceptre 24–40° off vertical on every sample; the
      tome hand's front height recorded (R123).
- [ ] The cast keeps 7 keys at 12 fps with the strike and the glow peak at key 3 (R124).
- [ ] On keys 3 and 4: the staff within 10° of the facing in plan and 0–15° below level; the
      shoulder-to-hand line within 25° of it; the elbow bent at most 20°; the hand between the
      chest bone and the shoulder; the orb not above the shoulder. On every cast key the orb is not
      above her crown. Seen red against today's cast: the staff 77° above level, 78°
      off the facing, the orb at 0.95 H (R125).
- [ ] The normal grip holds on every key of `attack`, and the wrist cocks at most 1.3 rad (R126).
- [ ] The wind-up, the weight, the pelvis before the chest, the curved path, the open free hand and
      `ATTACK_TURN_LIMIT` hold on the new cast (R127).
- [ ] On all three looks, the staff or focus is out of the torso, the head and the robe, its head is
      at least 1.3 skull radii from the skull and above the ground on every clip (but the base's
      death, bounded at −0.21 H: see Follow-ups), and the focus is clear of her right forearm, hand
      and sleeve. The sleeve guard's rejection fixture fails
      (R128, R129).
- [ ] The knight's run tests and sheet test (the shared run's plain style, `RUN_STEP` key for key,
      the 10° lean, the pump bands, the 14 fps pace) pass unchanged (R121).

Manifest and client (`npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in
`game-client`):

- [ ] In `public/art/manifest.json` the three wizard sheets carry `idle`, `walk`, `attack`,
      `death`, `run` (8 frames at 16 fps, looping, 8 facings), at 1.5x and trimmed, and no
      `walk_attack`, `backpedal_attack` or `backpedal` (R131).
- [ ] The archer's, the knight's and the mercenary's manifest entries and atlases are
      byte-identical to `22cabd3a`'s (R133).
- [ ] The shipped-sheet tests in `animationSelect.test.ts` and `manifest.test.ts` name the wizard
      without `walk_attack` and `backpedal_attack`, with `run`; the knight keeps both clips.
- [ ] `animationSelect.ts` and `character.ts` are unchanged (R132).
- [ ] `npm run bake -- --check` is clean.
- [ ] Each wizard frame box is at most today's height (192, 195, 198), and wider than today's
      (222, 225, 225) only by what the pointed cast needs, the growth reported with the pose and
      facing that sets it (E2 (b), R130). The report gives each atlas's dimensions, RGBA and PNG
      bytes before and after, and the change in per cent (R130, R135).
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

HITL:

- [ ] **The owner approves** the three wizard sheets' new run and cast beside `22cabd3a`'s on the
      contact sheet (ADR-0021 §5), or names a tune round (R134). Nothing else waits on it (W6).
- [ ] **Browser check:** in a run and in the town, the wizard, the Spellwarden and the Pyromancer
      run at 200 px/s with the sprint's lean and cadence, the feet not visibly sliding and no leg
      through the gown. A click and a right-click cast point the staff or focus at the target, in
      the facing nearest it, standing still or moving (she stands in the pin). No `walk_attack` or
      `backpedal_attack` ever shows for her, and a second player sees the same.

### Edge States

- **Casting on the move.** The pin stands her (R49), so the cast shows standing, turned to the
  aim. In the latency gap at the pin's edges the standing cast may slide a tick or two (W5,
  accepted).
- **An aim between two facings.** The clip is baked in 8 facings and the client turns it to the
  nearest (facing.ts:23-31), so the staff points up to 22.5° off the true aim; the fireball
  flies the true aim. Expected; a finer facing is out of scope.
- **The fireball's start.** It starts at 42 screen px over her feet and 15 px along the aim
  (fireball.ts), not at the orb. *Estimate:* a staff pointed 5–10° below level from the hand at
  about 0.65 H puts the orb near 0.6 H, about 45 screen px up at 1x, close to the fireball's 42.
  Moving the effect to the orb is out of scope.
- **Running into a cast.** The cast starts from its own key 0 (out of the idle carry), so a cast
  started mid-run jumps from the run's carry to the wind-up, as today.
- **Setting off and stopping.** Her carry is the same in the run as today, so setting off and
  stopping look as they do now, under a trunk that leans 10° further.
- **The three looks.** A focus is 1.5x the sceptre and held 0.21 H up its haft, so pointed its butt
  reaches back toward her forearm and the flared sleeve (R128 guards it). The fire focus's flame
  stands upright out of the level cage (R129). The Spellwarden's spaulders ride the extended arm.
- **Gear move speed.** At +20% (240 px/s) her run plays at about 1.24x (about 19.8 fps), capped by
  `MAX_WALK_SCALE` as today.
- **Mixed parties.** Until the knight is redone he runs at 14 fps with `walk_attack`, while the
  archer, the mercenary and the wizard carry no attack on the move. Expected.
- **Other players.** Others draw her from the same sheet, so they see the run and the pointed cast.
- **The dark-room strip.** `contact-darkroom-wizard` is regenerated with the new run, if the bake
  writes one for her, as the others' were.

### Out of Scope

- The knight's run and his looks' runs, and dropping his `walk_attack` and `backpedal_attack`
  (the charter's next item). `RUNNING_CLASS_ANIMATIONS` stays for him.
- The `walk_attack` and `backpedal_attack` branches in `animationSelect.ts` and `character.ts`, and
  `BACKPEDAL_PACE`. They go when the last class drops the clips.
- Her idle, walk and death keys; her carry's keys (W2); a transition clip.
- Any change to the archer's or the mercenary's keys, carries or sheets, or to the shared sprint's
  keys (R115, R116). Changing them is escalated, not done.
- A look change to the gown, the scapular, the sleeves or the focuses (W3, E1), unless the
  coordinator picks one.
- The fireball's start point and the 8-facing aim (Edge States).
- `RUN_PACE`, the server's move speed (200 px/s), the pin, and any game-server change (the human
  lane).

**Follow-ups (outside this change):**

- The base wizard's death puts her sceptre 0.20 H under the ground on key 6 (*measured* 0.201 H,
  `char_wizard_base` `death` @6): the sceptre's death has no wrist key (`FOCUS_DEATH` is the looks'
  alone), so as she lies down the haft goes through the floor. It predates this change; her death
  keys are held by digest and out of it (R115, Out of Scope). `mageLooks.test.mjs` "each focus
  clears her head and the ground" bounds it at −0.21 H (`groundFloor`) rather than skipping the
  clip, so it cannot sink further unseen; every other clip, and the looks' deaths, stay held at
  the ground. A fix (a wrist key on her death, as the looks' `FOCUS_DEATH`, re-baked) is the
  owner's to decide; once fixed, the bound goes back to the ground.

## Change: The knight's sprint, and the attack-on-the-move clips retired
Status: work-order
Date: 2026-11-23

Promoted `--from-thread` on 2026-11-23 from the owner-approved charter "法師與戰士衝刺跑", its knight
item (戰士, the knight class). The thread is the charter's locked decisions, so no interview was
held. Every decision below is a **charter default approved by the owner** ("做好就接著做不用問我"),
given with its reason. It lands here for the same reason the archer's, the mercenary's and the
wizard's did: it changes the run (§A) and the attack-on-the-move clips (§B, R5), which this FS owns
through `game-client/SPECIFICATION.md` "Run and backpedal animations". It also takes the last
`walk_attack` off the sheets that FS-HF0WW's "Walk-and-attack animation" and FS-3V7GC R4–R6 built,
and retires the clip for every class. FS-HF0WW, FS-3V7GC and FS-2325V (§ Change: The class attacks
move with weight and cut deep, R3, R6, which name `walk_attack` and `backpedal_attack`) each carry a
pointer stub to this section. So does FS-1J1CB (R9, R28: the Berserker's `walk_attack_offhand` and
`backpedal_attack_offhand` go; `attack_offhand` stays). No new thin line and no new FS. Two thin
lines change through `spec-update` (R156), never here.

Code citations are against `23717cbb` (`feat/run-wizard-sprint`, the wizard's sheets re-baked and
her slices recorded, I-JS7C8-27..30). Measures marked *measured* were read on his own rig and style
(`rigOf(KNIGHT_BUILD)` as classMotion.test.mjs builds him, and each look's `CAST` row built and
posed as the bake poses it, `poses.js` `characterPoses`; 32 samples over the run's cycle) by a
throwaway script that is not committed. Frame boxes marked *measured* were read by that script
replaying the bake's first pass (baker.js `bakeCharacter` :254-296, then frameBox.js `frameBox`,
pad 0.06). It reproduces today's three manifest boxes and anchors exactly. Copies of
classMotion.test.mjs, axe.test.mjs, warriorLooks.test.mjs, clearance.test.mjs, clips.test.mjs and
castLooks.test.mjs were run with his style re-keyed as option (a) and the carry change below. Only
the rows this change retires or restates failed (*Facts checked in code*).

**Why (owner).**

> 「做完後就接著做法師跟戰士的跑步 法師攻擊時法杖要伸直指向怪物像施法一樣 戰士暫時只要調跑步就好 一樣移除攻擊時前後走動的部分 做好就接著做不用問我」

Once the mercenary is done, do the mage's and the warrior's runs. (The mage's staff points at the
monster when she casts.) For the warrior, only the run for now. As before, remove the attack clips
that step forward and back. When it is done, carry on without asking. For the archer, earlier:
「跑步時可以更有衝刺感…想要有快一點的跑步感」, 「跑更快的話身體可能會更加前傾」; for the mercenary:
「移動時也要像弓箭手跑的感覺」.

**What it changes, for the knight's three sheets** (`char_knight_base`, `char_knight_guardian`,
`char_knight_berserker`):

- R2: his lean (about 10° → about 20°) and "the legs are slice 5's ... the 14 fps cadence
  unchanged, key for key". After this no class runs the shared fast run's lean and cadence.
- R3: his cadence becomes the sprint's (16 fps) over a shorter stride (*escalated*, E1 below: not
  the sprint's own legs).
- R2's blade carry: the wrist holds the blade back further under the lean (K2, said below). The
  owner-tuned band (`RUN_BLADE_ELEV`, his 23–42°) is kept.
- R5: "`walk_attack` stays on every class sheet" no longer holds for any class.
- R8–R11, R13, R21: `backpedal_attack` and `walk_attack` leave his sheets, so their leg rules no
  longer apply to any sheet.
- R37, R41, R48: his contact sheet and the guideline lose those two clips.
- FS-1J1CB R9, R28: the Berserker's sheet carries `attack_offhand` alone among the off-hand
  twins.
- `## Change: Attacking pins the attacker`, Out of Scope: "Retiring the attack-on-the-move clips
  (`walk_attack`, `backpedal_attack`) and their leg-pace rules R10, R21" is done: the clips leave
  the last sheets (K3), then their code goes (K4).
- `## Change: The wizard's sprint and pointed cast`, Out of Scope: "The `walk_attack` and
  `backpedal_attack` branches in `animationSelect.ts` and `character.ts`, and `BACKPEDAL_PACE`.
  They go when the last class drops the clips": the knight is the last, so they go (K4).

His idle, walk, attack and death keys are untouched. So are his attack's cloth (`KNIGHT_ATTACK_CLOTH`),
his hauberk, surcoat, cloak and their springs. The archer's, the mercenary's and the wizard's sheets
are untouched byte for byte.

### Decisions (charter defaults, owner-approved 2026-11-23)

- **K1. The shared sprint** (`SPRINT_STEP` legs, `SPRINT_LEAN` about 20°, `SPRINT_RUN` 16 fps),
  his pace within 3 px/s of `RUN_PACE` 194, measured on his rig. If his cloak or leg guards fail on
  the shared legs, the wizard's precedent applies: the sprint's lean and 16 fps over `RUN_STEP` at a
  shorter stride that holds the pace. A garment carry like the Duelist's robe is taken instead if
  that is the smaller change. Either way, it is escalated with numbers. *Reason:* the owner's 「一樣」
  (as with the others). ***Escalated:** the shared legs push his calf out through the hauberk's back
  by 4.86 px, and his pace there is 198.84 (E1).*
- **K2. His run keeps today's carry**: the raised blade (`RUN_BLADE`, `RUN_WRIST`, `RUN_CROSS`, the
  owner-tuned `RUN_BLADE_ELEV`, `RUN_TIP_CEIL`), the shield arm's hold, and the Berserker's two-axe
  carry. Each is re-measured under the lean. A key changes only if the lean breaks a guard or a
  band or a ceiling, and that is said. ***Said:** the lean drops the blade to 10.4–28.7° above
  level, under `RUN_BLADE_ELEV`'s 20° and his own 23°. So the wrist holds it back: `RUN_BLADE` x
  0.68 → 0.45, the least that puts it back inside his band (R146). The sword hand's front height
  falls under the chest bone (0.021 H). That height is recorded, not tuned away, as the wizard's
  tome hand was (R147).*
- **K3. `walk_attack` and `backpedal_attack` leave his three sheets**, and the Berserker's
  `walk_attack_offhand` and `backpedal_attack_offhand` go with them. `attack_offhand` stays. Idle,
  walk, attack and death are unchanged. A sheet without them plays the standing attack (the
  client's fallback, no code change).
- **K4. Once no sheet carries them, the dead code is retired**: in the client, the attack-on-the-move
  branches, types and flags and `BACKPEDAL_PACE`; in the bake tool, `withWalkAttack`, the
  walk-attack and backpedal clip builders, their cycle and cloth constants, the `poses.js`
  branches and the `OFFHAND_OF` entries. The tests that only tested them go too. Behaviour is
  unchanged, because every sheet already lacks the clips. It is a separate slice, after the bake.
- **K5. The frame box must not grow.** The attack-on-the-move clips leaving can only shrink it.
  Any growth is escalated.
- **K6. The owner sees the contact sheet** (ADR-0021 §5). Nothing waits on it.

**Escalate (report back, don't route around):** a default the code contradicts; a guard that needs
a look change; the frame box growing; the pace leaving its tolerance.

### Escalated 2026-11-23 (to the coordinator, not routed around)

**E1. The shared sprint's legs under his hauberk (K1), and his pace.** On his rig the shared
sprint's legs fail the leg guard on all three looks, and his pace leaves K1's tolerance. *Measured*
(the shared legs, lean and 16 fps, his carry as it is):

- The leg guard (`clearance.js` `legClearance`) reads **4.86 px** at 1x on the run's key 1 (`down`;
  4.83 on key 5), against the 1.5x limit of 0.667. It is the swing leg's lower calf (bind 0.073 H
  up), folded up behind by the sprint's heel kick (`SPRINT_STEP.shinL` 1.8 at key 1) to 0.23 H off
  the ground, 0.11 H behind the hips bone and 0.04 H off the centre line. It comes out through the
  hauberk's back panel, which hangs to the knee (cast.js `knight`, `hauberk.bottom` `ky + 0.02`).
  Key 0 (key 4) reads 1.50 (1.42) px, mid-shin (bind 0.146 H). The base, the Guardian (whose
  surcoat lies over the hauberk) and the Berserker read the same. The cloak guard (`cloakClearance`)
  reads 0 in the run on all three. The camera check (`seenThroughCloth`) sees nothing through the
  cloth on any run key.
- The hauberk's back panel is pushed back by the thigh alone (anatomy.js `pushPanels`: for a hem at
  or above the knee, `swing` takes the thigh's angle and never the calf's), so nothing in the cut
  follows a calf folded up under it. `legFollow` 0.75 → 0.85, 0.95 reads 5.53, 5.74 px.
  `panelWeight` 0.3 → 0.45, 0.6 reads 2.29, 0.78 px. Each of these is also a look change in every
  clip.
- His pace on the shared legs at 16 fps is **198.84** world px/s, 4.84 over `RUN_PACE`, outside
  K1's 3 px/s. His legs are longer than the others' (build 2.0, against the archer's 1.96 and the
  mercenary's 1.98). Today he reads 197.67 at 14 fps, held only to the class band 180–220.

The options:

- **(a) Default (K1's first fallback, the wizard's precedent):** the sprint's lean (`SPRINT_LEAN`)
  and clip (`SPRINT_RUN`: 16 fps, `speed` 2.5, both by reference) over the shared fast run's legs
  (`RUN_STEP`) at a stride of **0.84** (`run.stride`), 16% shorter. The sprint's own stride is 12%
  shorter. His legs need the extra 4% to hold the pace at 16 fps. *Measured* on all three looks: the
  leg guard 0 px, the cloak guard 0 px, and nothing seen through the cloth on every run key. Pace
  **193.61** (within 1 px/s of `RUN_PACE`, the archer's and the wizard's tolerance). Bob 0.064 H
  (in the sprint's band). Knee peak 0.310 H (today's 0.311, under the sprint's 0.335). The frame box
  is unchanged (R151). What it gives up is the sprint's higher knee drive and its heel kick. The
  hauberk to the knee and the cloak to the calf hide part of both. It is the smallest change: no
  garment, spring or other clip moves. `SPRINT_STEP` is not changed, and his run is not on it.
  *Measured* by stride (16 fps): 0.82 → 189.51, 0.83 → 191.56, 0.84 → 193.61, 0.845 → 194.63,
  0.85 → 195.65, 0.88 → 201.76 (the wizard's stride, 7.76 over), 1 → 225.91.
- (b) The shared sprint's legs, with the hauberk's back carried out (the Duelist's precedent,
  mercLooks.js `ROBE_BACK_CARRY`): the back panel's spring (`skirtB`) at `drag` 0.2 → 0.4 and
  `limit` 0.8 → 1.1 reads 0.24 px (base, Berserker) and 0.22 (Guardian), under the limit. `drag` 0.6
  and `limit` 1.2 read 0. But the knight's spring drags in every clip that moves. His attack carries
  cloth (`KNIGHT_ATTACK_CLOTH` 0.5) and his death settles, unlike the Duelist's standing clips. So
  the back panel swings further in the walk (*measured* `skirtB` 0.20 → 0.40 rad on every key), in
  the attack (peak 0.24 → 0.35) and in the death (peak 0.26 → 0.58): a look change in clips this
  item keeps out of scope. A run-only carry would need new spring code. His pace stays 198.84, so it
  would also need his own fps (15.6 reads 193.87, not `SPRINT_RUN` by reference) or `SPRINT_STEP`
  at his own stride (0.975 reads 194.38, the shared legs no longer key for key).
- (c) The 20° lean over today's legs and cadence (14 fps). *Measured:* the guards 0 px, pace 197.67
  (today's). No quicker cadence.

### Facts checked in code (`23717cbb`)

- **His sheets share one clip set and two styles.** `CLASS_ROWS.knight` (cast.js:596) is `{ build:
  knight, sheet: KNIGHT_SHEET }`. `specRow` (cast.js:623) spreads it into the Guardian's row
  (:655), and into the Berserker's with `animations: BERSERKER_SHEET.animations` (:656).
  `KNIGHT_SHEET` (classStyles.js:122-125) is `{ animations: { ...RUNNING_CLASS_ANIMATIONS, attack:
  { ...RUNNING_CLASS_ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH } }, scale: 1.5 }`.
  `RUNNING_CLASS_ANIMATIONS` = `withWalkAttack({ ...ANIMATIONS, ...RUN_ANIMATIONS })`
  (clips.js:106), and no other sheet reads it now. `BERSERKER_SHEET` (classStyles.js:155) =
  `withOffhand(KNIGHT_SHEET.animations)`: `OFFHAND_OF` (clips.js:119) twins `attack`,
  `walk_attack` and `backpedal_attack`, each only if the sheet has it (`withOffhand` :127-131).
  `knight(look)` returns `d.finish(rig, KNIGHT_STYLE)` (cast.js:129), and look.js `finish` returns
  `L.style ?? style` (look.js:76). So the Guardian (warriorLooks.js:65, no style) runs
  `KNIGHT_STYLE`, and the Berserker (:109) runs `BERSERKER_STYLE` (classStyles.js:167-185), whose
  run is its own two-axe carry (`arms` 0.6, `elbow` 0.45, `wrist` 0.6, both hands `CLEAVE_CARRY`,
  :179-184) on the same legs and lean. `ARCHER_SHEET` (:275), `WIZARD_SHEET` (:327) and
  `MERCENARY_SHEET` (:436) are built without `withWalkAttack`.
- **His run today** (`KNIGHT_STYLE.run`, classStyles.js:142-148): `{ arms: [0.3, 1], elbow: [0.2,
  1], wrist: RUN_WRIST, cross: [0, RUN_CROSS], hold: pose({ upperArmL: [-0.38, -0.85, 0.12],
  foreArmL: [-1.25, 0, 0], upperArmR: [0, 0, -0.06], handR: RUN_BLADE }) }`, with no `lean`, `legs`
  or `stride`, so it is `RUN_STEP` (clips.js:286-298) at `RUN_LEAN` 0.24 (:306). `RUN_BLADE` [0.68,
  0, 0] (classStyles.js:59; only the knight reads it), `RUN_WRIST` [0, 0.85] (:60), `RUN_BLADE_ELEV`
  [20, 50] (:62), `RUN_TIP_CEIL` 1.03 (:64), `RUN_CROSS` 0.3 (:66; the wizard reads it too),
  `RUN_CROSS_REACH` [0.05, 0.08] (:68). His sheet's run is `RUN_ANIMATIONS.run`, 14 fps (clips.js:91-93).
  It is tested in `CLASSES` (classMotion.test.mjs:258, his `runBlade` [23, 42] :267),
  `SHARED_RUNNERS` (:298) and `RUN_CARRIERS` (:305): the sheet test (:307-317), the carry describe
  (:319-522) and the fast-run describe (:524-578). The knight's sheet-and-clips digest is at
  :1317, beside the shared run's (:1316).
- **The sprint is shared already.** `SPRINT_LEAN` 0.48 (classStyles.js:203), `SPRINT_STEP`
  (:221-229), `SPRINT_RUN` `{ ...RUN_ANIMATIONS.run, fps: 16 }` (:232), and `WIZARD_SPRINT_STRIDE`
  0.88 (:317) over `RUN_STEP`. `runCycle` (clips.js:362-409) takes `run.lean`, `run.legs` and
  `run.stride`. No new parameter is needed.
- *Measured, his run today (14 fps, on his rig):* the hips-to-neck lean 9.96–10.26°; pace 197.67
  world px/s; the pelvis 0.484–0.540 H (a bob of 0.055 H); 6 planted keys, flights on keys 3 and 7;
  the knee's peak 0.311 H; the chest bone 0.613–0.668 H; the right shoulder 0.696–0.762 H; the head
  bone 0.784–0.840 H. The blade is 24.1–40.5° above level, its tip 0.69–0.995 H off the ground and
  0.34–0.57 H ahead of the hips bone. The sword hand is at 0.476–0.699 H, from 0.08 H behind to
  0.26 H ahead of the hips bone, and crosses in 0.070 H, the blade 28.5° across the body. At the
  front of the pump the hand stands 0.040 H over the chest bone and 0.040 H under the shoulder.
- *Measured, the 20° lean under his kept carry* (the arms do not read the legs, so the same on (a),
  (b) and (c)): lean 20.20–20.50°; the chest bone 0.607–0.670 H; the right shoulder 0.680–0.764 H;
  the head bone 0.768–0.831 H (on (a)'s legs). The blade is **10.4–28.7°** above level, under
  `RUN_BLADE_ELEV`'s 20 and his 23; its tip 0.59–0.86 H. The front hand is 0.021 H *under* the
  chest bone. Copies of the tests fail on those two and on the rows this change retires. They pass
  the tip ahead of the hand and the body, under `RUN_TIP_CEIL`, the blade off the shield (also at
  the Guardian's 1.15x shield), clear of the free arm, never through or behind the head in the 8
  facings, the cross-in (0.070 H) and the normal grip.
- *Measured, the wrist held back* (`RUN_BLADE` x, on (a)'s legs; the blade above level by the
  test's sampling): 0.5 → 20.6–38.9°; **0.45 → 23.4–41.7°**; 0.44 → 24.0–42.3°; 0.42 → 25.1–43.4°;
  0.40 → 26.2–44.5°. At 0.45 the tip reaches 0.946 H (under 1.03) and stays 0.33–0.58 H ahead of the
  hips. The blade lies 26.6° across the body at the front. Every carry test above passes but the
  front hand's height. 0.45 is the largest x that keeps his whole band (23–42°). It takes the blade
  back about 13°, against the trunk's further 10°, because the lean widens the pump's range.
- **The Berserker under the lean.** axe.test.mjs (the edges forward and never turned up past 30° in
  the run, the off-hand twins) passes with `BERSERKER_STYLE.run` re-keyed as (a). His axes'
  guards are the leg and cloak guards above (warriorLooks.test.mjs), which read 0 in the run.
- **His garments.** `knight()` (cast.js:96-130): the cloak to the calf (`cloakBones` length 0.64,
  drag 0.34), the hauberk to the knee and open at the front (`legFollow` 0.75, `panels`,
  `panelWeight` 0.3), the skirt springs at `stiffness` 55. The Guardian's surcoat lies over the
  hauberk (warriorLooks.js `surcoat`). The Berserker's cloak is torn to 0.52 (`TORN`, :75). Today
  every guard reads 0 on every clip of the three looks except the cloak in the walk: 0.21 px (base,
  Guardian) and 0.56 px (Berserker) on key 5, under the 0.667 limit. That is unchanged by (a). His
  cloak history: hanging still in the attack, his calf and boot came through by 7.6 px
  (`KNIGHT_ATTACK_CLOTH`, classStyles.js:111-116). Dragged back at half a walk on the backward
  step, his heels came through by 18.8 px (`BACKPEDAL_ATTACK_SPEED`, clips.js:53-61).
- **His frame boxes** (`public/art/manifest.json`, 1.5x, trimmed). *Measured* by the replay, which
  reproduces each:

  | Sheet | Box (anchor) | Set by | Today's run alone | (a)'s run alone |
  |---|---|---|---|---|
  | `char_knight_base` | 276 × 228 (114, 168) | `attack` key 3 (`sw`, `ne`, `se`), key 2 (`s`) | 234 × 207 | 234 × 201 |
  | `char_knight_guardian` | 276 × 228 (114, 168) | the same | 234 × 207 | 234 × 201 |
  | `char_knight_berserker` | 267 × 240 (108, 183) | `attack` key 3 (`sw`, `se`), key 1 (`w`, `s`) | 192 × 168 | 174 × 168 |

  `walk_attack` and `backpedal_attack` are `boxed` (clips.js:78) and never size the frame (poses.js
  :46, baker.js:265). So dropping them cannot change a box, and (a)'s run sits inside the attack's.
  (b)'s run alone is 243 × 201, inside too.
- **His atlases today:** `knight-0` 3716 × 3056 (45.4 MB RGBA, PNG 7,352,196 B),
  `knight_guardian-0` 2900 × 3968 (46.0 MB, 7,709,743 B), `knight_berserker-0` 4096 × 3840 (62.9 MB,
  8,191,437 B) and `knight_berserker-1` 4096 × 1792 (29.4 MB, 4,055,125 B). Frames per facing: idle
  6, walk 8, attack 7, death 7, run 8, `walk_attack` 14, `backpedal_attack` 14: 64. The Berserker
  adds `attack_offhand` 7, `walk_attack_offhand` 14 and `backpedal_attack_offhand` 14: 99.
- **No other sheet carries the clips.** In `public/art/manifest.json` only `char_knight_base`,
  `char_knight_guardian` and `char_knight_berserker` carry `walk_attack` or `backpedal_attack`,
  and only the Berserker carries their off-hand twins. No creature, boss or resident does. Once his
  sheets drop them, nothing in the manifest does.
- **Clip choice needs no client change for the drop.** `walkAttack` and `backpedalAttack` come from
  what the sheet carries (character.ts:250-253). Without them `attack` (or `attack_offhand`) plays,
  moving or not (animationSelect.ts:157). The warrior's charge already plays `attack`
  (character.ts:198, `walkAttack && !charging`).
- **The dead code once no sheet carries them** (K4):
  - Client: `animationSelect.ts` `CharacterAnimation`'s `"walk_attack"` and `"backpedal_attack"`
    (:28-36), `SwingClip` (:39), `OffhandSwing` (:41), `BACKPEDAL_PACE` (:57-63), whose comment
    says clips.test.mjs imports it, though nothing does. Also `CharacterState.walkAttack`
    (:96-101) and `.backpedalAttack` (:104-108), the moving-swing branch (:157-160), and the
    `movesAwayFrom` import (:11; facing.ts:44-52, read nowhere else). In `character.ts`:
    `SheetClips.walkAttack` and `.backpedalAttack` (:62-68), `Swing.charge` and the `charging`
    field (:71-73, :90, :134, :173, :198), whose only effect is to gate `walkAttack`. The
    constructor's and the animator's flags (:108-116, :250-255), `SWINGS`' four retired entries
    (:408-415), and the mid-swing swap between swing clips in `show` (:365-370, `swingClips`
    :376-378). Once `attack` and `attack_offhand` are the only swing clips, a new swing always
    replays from key 0 (`swingPending`), so that branch is never reached. The one caller of
    `charge` is `playerCombat.ts:242`. `manifest.ts`: `checkWalkAttack` (:363-364, :396-411).
  - Bake tool: clips.js `WALK_ATTACK_CYCLES` (:32), `RUN_WALK_ATTACK_CYCLES` (:41),
    `BACKPEDAL_ATTACK_CYCLES` (:50), `BACKPEDAL_ATTACK_SPEED` (:61), `withWalkAttack` (:76-84),
    `CLASS_ANIMATIONS` (:99, read only by clips.test.mjs), `RUNNING_CLASS_ANIMATIONS` (:106),
    `MERC_ANIMATIONS`'s `withWalkAttack` (:113-116; `MERCENARY_SHEET` reads only its `parry`),
    `OFFHAND_OF`'s two retired entries (:119), `backpedalCycle` (:419-422), `attackOverLegs`
    (:770-783), `walkAttackClip` (:788-790), `backpedalAttackClip` (:797-799), `offhandPoses`'
    two retired entries (:818-820) and `clipsFor`'s (:883-884). `layerPoses`, `LOWER_BODY`,
    `offhandPose`, `handless` and `RUN_ANIMATIONS` stay: `attack_offhand` and `SPRINT_RUN` read
    them. Also poses.js' `walk_attack`/`backpedal_attack` cloth and calm branches (:20-31) and
    `sizing: !spec.boxed` (:45-46); baker.js' `sizing` option and its `fit` check (:254-298);
    main.js' `sizing` argument (:135); and the header notes of pace.js (:1-4) and contact.mjs
    (:1-20).
  - Tests that test only them: clips.test.mjs "attacking on the move" (:71-167) and "the run and the
    backpedal" (:413-583, its walk_attack/backpedal rows); classMotion.test.mjs' knight's slash
    under the attacks on the move (:937-959) and the shield's `walk_attack`/`backpedal_attack` keys
    (:1006-1020); `CARRIED`'s two entries (:688); clearance.test.mjs `MOVING.knight` (:405),
    `CLOAKED.knight` (:535) and the cloak controls built on `backpedal_attack` (:551-566);
    axe.test.mjs' twins (:67-70, :131-151); warriorLooks.test.mjs (:41-46);
    `animationSelect.test.ts` (`WALK_ATTACKERS` :504 and the moving-swing cases); `manifest.test.ts`
    (`OWN_CLIPS.char_knight_base` :1280, `BACKPEDALLING` :1380-1392, the `walk_attack` duration
    check :279-302); and `character.test.ts`'s walk-attack, backpedal and mid-swing swap cases.
- *Estimate:* the cloak guard's must-fail controls (clearance.test.mjs:551-566) are built on
  `backpedal_attack` with its old cloth. Once that clip goes, the guard needs a fixture of its own
  to stay seen red. `KNIGHT_ATTACK_CLOTH`'s note gives one: the knight's attack with the cloak
  hanging still (speed 0) read 7.6 px. Not re-measured at this tip.

### Requirements

#### His run: the sprint's lean and cadence (K1; E1)

137. **The others' keys held first (K1).** Before anything moves, tests hold by digest, as they are
     at `23717cbb`: the knight's idle, walk, attack and death keys (`clipsFor(KNIGHT_STYLE,
     KNIGHT_SHEET.animations)`), the Berserker's idle, walk, attack, death and `attack_offhand` keys
     (`clipsFor(BERSERKER_STYLE, BERSERKER_SHEET.animations)`), and `KNIGHT_ATTACK_CLOTH`. They sit
     beside the archer's, the mercenary's and the wizard's digests (classMotion.test.mjs:1273-1281,
     :1320-1329, :1356-1379) and the shared run's (:1316), which hold unchanged. The knight's sheet-and-clips digest
     (:1317) goes, replaced by these. They stay green through every slice of this change.
138. **The sprint read, not changed (K1).** `SPRINT_LEAN`, `SPRINT_STEP`, `SPRINT_RUN`, `RUN_STEP`,
     `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`, `RUN_ANIMATIONS` and `WIZARD_SPRINT_STRIDE`
     keep their values. His run (`KNIGHT_STYLE.run`) and the Berserker's (`BERSERKER_STYLE.run`)
     read `SPRINT_LEAN`, and his sheet's run is `SPRINT_RUN`, by reference. The Guardian takes them
     through `KNIGHT_STYLE` and the Berserker's sheet through `withOffhand(KNIGHT_SHEET.animations)`.
139. **His legs (E1, default (a)).** Both styles run the shared fast run's legs (`RUN_STEP`, no
     `run.legs`) at a stride of 0.84 (`run.stride`), a named constant beside the wizard's (e.g.
     `KNIGHT_SPRINT_STRIDE`), with the knee and the flight at 1. If the coordinator picks (b) or (c)
     before I-JS7C8-33 starts, R139–R143 are restated first through write-a-spec.
140. **His run, measured as the sprinters' are** (classMotion.test.mjs `LEANED_RUNNERS`, :1119-1227,
     on `rigOf(KNIGHT_BUILD)`, under each style): the lean 19–21° on average and 18–22° on every
     sample (*measured* 20.20–20.50); the head's pitch within 3° of rest, its yaw range under 0.08
     rad and its roll under 0.06; a flight frame with both soles over 0.02 H in each step; a foot
     planted in at least 4 of the 8 keys (*measured* 6); a lift of at least 0.045 H; a bob of at
     least 0.056 H and under 0.07 H (*measured* 0.064); the pelvis rising and falling once a step,
     highest at or next to each flight key; the shoulders against the hips (correlation below −0.8,
     peaking at 6.5–10°). His knee is held to the shared run's (at least 0.30 H, *measured* 0.310),
     not to the sprint's 0.32 (E1). *Measured:* a copy of the describe passes on both styles.
141. **His pace (K1; E1).** Measured by `measurePace` at 16 fps on his rig, his run lies within
     1 px/s of `RUN_PACE` (194) (*measured* 193.61). `RUN_PACE`, `animationSelect.ts` and the
     server's 200 px/s do not change.
142. **The garments pass, no exemption (K1).** On all three looks, on every clip their sheets carry:
     the leg guard (`legClearance`, run at bake by `main.js` and by warriorLooks.test.mjs and
     clearance.test.mjs) reads at most the 1.5x limit; the cloak guard (`cloakClearance`) reads at
     most the same; and the camera sees no hip, thigh or knee through the cloth (`seenThroughCloth`).
     Nothing is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. The hauberk, the surcoat, the
     cloaks and their springs (`skirtBones` stiffness 55, `cloakBones` drag 0.34) are unchanged.
     *Measured* under (a): 0 px, 0 px and nothing seen on every run key of the three looks. The
     walk's cloak reads 0.21 px (base, Guardian) and 0.56 px (Berserker) as today. A look change a
     guard would ask for is escalated (E1).
143. **Retired for the knight:** R2's "the legs are slice 5's ... the 14 fps cadence unchanged, key
     for key", the 10° lean, and the shared fast run's tests that name him: the sheet test
     (classMotion.test.mjs:307-317), the fast-run describe (:524-578: the 10° lean, "the shared legs
     key for key", the 14 fps pace and "its attacks on the move walk the legs at most 90") and his
     "unchanged" digest (:1317). No class runs the shared fast run after this. `RUN_STEP` and
     `RUN_LEAN` stay as constants (the wizard and the knight read `RUN_STEP`; `SPRINT_LEAN` is held
     to twice `RUN_LEAN`). The shared run's plain-style digest (:1316) holds them.

#### His carry under the lean (K2)

144. **The carry is kept, but for the wrist (said, K2).** `KNIGHT_STYLE.run`'s `arms`, `elbow`,
     `wrist` (`RUN_WRIST`), `cross` (`RUN_CROSS`), and its `hold`'s shield arm and `upperArmR` are
     unchanged. So are his idle and walk `hold`. The blade's wrist key `RUN_BLADE` goes from [0.68,
     0, 0] to **[0.45, 0, 0]**, the least that puts the blade back inside his band under the lean
     (*Facts checked in code*). `RUN_BLADE` is the knight's alone. `RUN_BLADE_ELEV`, `RUN_TIP_CEIL`
     and `RUN_CROSS_REACH` keep their values. The classStyles.js header (:23-36) says why.
145. **The carry's tests hold on the new run** (the `RUN_CARRIERS` describe, :319-522, his row): the
     sword-arm elbow bent 80–100° on every key; the hand back past the hip by at least 0.06 H; the
     hand crossing in at the front by `RUN_CROSS_REACH` (*measured* 0.070 H), inside the chest's half
     width, the blade 5–30° across the body (*measured* 26.6°); the blade clear of the free arm by
     more than 0.06 × `armR` H; the blade off the shield's face (and off the Guardian's 1.15x shield,
     *measured*); the blade never through the head nor behind it in the 8 facings; the tip ahead of
     the hand and of the body; and the normal grip in the run (:670).
146. **The blade's band, kept (K2).** On every sample the blade stands inside `RUN_BLADE_ELEV`
     (20–50°) and his own 23–42° above level (*measured* 23.4–41.7°; today 24.1–40.5°; the kept
     wrist under the lean 10.4–28.7°), its tip under `RUN_TIP_CEIL` (*measured* 0.946 H). Judged at
     the contact sheet (R153).
147. **The front hand's height, recorded (K2).** The 20° lean lowers his chest, so at the front of
     the pump the sword hand stands 0.01–0.035 H under the chest bone (*measured* 0.021 H under).
     This replaces "between the chest bone and the shoulder" for him (today 0.040 H over the chest
     bone), as the wizard's tome hand (R123 (iii)) and the mercenary's free hand (R101) were: recorded,
     not tuned away. Judged at the contact sheet.
148. **The Berserker's carry, kept (K2).** `BERSERKER_STYLE.run`'s `arms`, `elbow`, `wrist` and
     `hold` are unchanged. Under the lean each edge still faces forward and never turns up past 30°
     in the run (axe.test.mjs, *measured* passing). The off-hand twin's keys still mirror the right
     hand's over the same legs.

#### The attack-on-the-move clips leave his sheets (K3)

149. **His clip set (K3).** `char_knight_base` and `char_knight_guardian` carry `idle`, `walk`,
     `attack`, `death` and `run`, in that order. `char_knight_berserker` carries those and
     `attack_offhand`. **None carries `walk_attack`, `backpedal_attack`, `walk_attack_offhand` or
     `backpedal_attack_offhand`.** `KNIGHT_SHEET` is built without `withWalkAttack` and without
     `RUNNING_CLASS_ANIMATIONS`: `{ animations: { ...ANIMATIONS, attack: { ...ANIMATIONS.attack,
     speed: KNIGHT_ATTACK_CLOTH }, run: SPRINT_RUN }, scale: 1.5 }`. `BERSERKER_SHEET` stays
     `withOffhand(KNIGHT_SHEET.animations)`. A test control that needs his old clips builds them
     explicitly, as the archer's cloak control does (clearance.test.mjs:537-560), until R155
     retires them. His idle, walk, attack and death keys match their `23717cbb` digests (R137).
150. **Clip choice unchanged (K3).** `animationSelect.ts` and `character.ts` are not changed by the
     drop. On his sheets `carries` finds no `walk_attack` or `backpedal_attack`, so an attacking
     knight plays `attack` (the Berserker `attack` or `attack_offhand` by hand, R29) turned to his
     aim, moving or not. The charge plays `attack` as today. Not attacking, he runs turned to his
     movement (R4). A pinned knight stands (R49). In the latency gap at the pin's edges the
     standing attack may slide a tick or two: accepted, as for the others.
151. **The frame box (K5).** Each knight sheet's frame box and anchor is no larger than today's in
     either dimension: 276 × 228 at (114, 168) for the base and the Guardian, and 267 × 240 at (108,
     183) for the Berserker. *Measured* unchanged under (a): the attack sets every edge, and the new
     run alone is 234 × 201 and 174 × 168. A box that would grow stops the bake before it commits
     and is reported, never routed around.

#### Bake, review and budget (K6)

152. **One bake.** The three knight sheets are re-baked once with R137–R151 by the bake tool (`npm
     run bake`), never drawn or edited by hand. `npm run bake -- --check` is clean afterwards. Only
     `knight-0.png`, `knight_guardian-0.png`, the Berserker's page or pages and their manifest
     entries change. **The archer's, the mercenary's and the wizard's manifest entries and atlases
     are byte-identical**: their sheets' `animations`, frame boxes, anchors, crowns, and the
     atlases' `sha256`. So is every creature's, boss's and resident's.
153. **The contact sheet (K6).** For each of the three sheets: the new run beside `23717cbb`'s, 8
     facings, at game scale and at ×2, with an animated preview playing the run at its fps × `200 /
     RUN_PACE`. Also a ×4 detail of the blade at the front and the back of the pump in `e`, `ne` and
     `n`, and of the hauberk's back over the calf on the run's keys 1 and 5. The regular contact
     sheet, the looks' sheet and the dark-room strip show his clips without the attacks on the move.
     The owner approves (ADR-0021 §5). Nothing waits on it. Tune rounds after it stay inside this
     change.
154. **The report.** From the bake, for each sheet: the atlas pages and dimensions before and after,
     RGBA and PNG bytes before and after, the change in per cent, and the frame box before and after.
     Before (`23717cbb`): `knight-0` 3716 × 3056 (45.4 MB, PNG 7,352,196 B), `knight_guardian-0` 2900
     × 3968 (46.0 MB, 7,709,743 B), `knight_berserker-0` 4096 × 3840 (62.9 MB, 8,191,437 B) and `-1`
     4096 × 1792 (29.4 MB, 4,055,125 B). *Estimate:* 64 → 36 frames a facing on the base and the
     Guardian (−44%), about 25–26 MB RGBA each; 99 → 43 on the Berserker (−57%), about 40 MB,
     perhaps on one page. The attacks on the move are wide frames, so the real fall may be larger.

#### The attack-on-the-move code retired (K4)

155. **After the bake, the dead code goes, behaviour unchanged (K4).** Once `public/art/manifest.json`
     has no sheet carrying `walk_attack`, `backpedal_attack`, `walk_attack_offhand` or
     `backpedal_attack_offhand` (R149), the code listed in *Facts checked in code* ("The dead code
     once no sheet carries them") is removed:
     - client: the two clip names and the swing types in `animationSelect.ts` (`SwingClip` goes;
       the off-hand clip is `attack_offhand` alone), `CharacterState.walkAttack` and
       `.backpedalAttack`, the moving-swing branch, `BACKPEDAL_PACE`, and `movesAwayFrom`
       (facing.ts) with its tests if nothing else reads it. In `character.ts`: the two
       `SheetClips` flags, `Swing.charge` and `charging`, the retired `SWINGS` entries, and the
       mid-swing swap branch (and `swingClips`) if no remaining pair of clips reaches it.
       `playerCombat.ts:242` then passes `{ holdMs: CHARGE_MS }` alone. `manifest.ts`'s
       `checkWalkAttack` goes;
     - bake tool: `withWalkAttack`, `CLASS_ANIMATIONS`, `RUNNING_CLASS_ANIMATIONS` (once nothing
       reads it), the cycle and cloth constants, `backpedalCycle`, `attackOverLegs`,
       `walkAttackClip`, `backpedalAttackClip`, the retired `OFFHAND_OF`, `offhandPoses` and
       `clipsFor` entries, the poses.js branches and `boxed`/`sizing` (with baker.js' `sizing`
       option and `fit` check and main.js' argument, once no clip is boxed). `MERC_ANIMATIONS`
       keeps its parry spec without `withWalkAttack`. Comments and header notes that describe the
       retired clips are reworded or dropped;
     - tests that tested only the retired code go. A guard's rejection fixture built on a retired
       clip is rebuilt on a kept clip, so the guard is still seen red (the cloak guard's: *estimate*,
       the knight's attack with the cloak hanging still, *Facts checked in code*). Tests whose
       subject stays (`attack_offhand`, the run, `layerPoses`, the charge's `holdMs`) are kept and
       reworded;
     - absence-shaped tests: no manifest sheet carries the four retired clip names
       (`animationSelect.test.ts`, `manifest.test.ts`); `selectAnimation` with an attack while moving
       returns `attack` (or `attack_offhand`) turned to the aim; the charge holds its pose for
       `holdMs`.
     Every manifest entry and atlas is byte-identical before and after this slice (`npm run bake --
     --check` clean). `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass
     in `game-client`.
156. **The thin lines (via `spec-update`, not written here).** In `game-client/SPECIFICATION.md`
     "### Presentation", at lock: "Walk-and-attack animation → FS-HF0WW" is struck and repointed at
     this change (`- [ ] ~Walk-and-attack animation~ → removed FS-JS7C8`), and deleted, not checked,
     when R155 ships (docs/specs/README.md *Removal: strike, then delete*). "Run and backpedal
     animations → FS-JS7C8" is reworded with its pointer unchanged (e.g. "Class run animation"),
     because the backpedal it names is gone while the run stays. FS-HF0WW's and FS-3V7GC's headers
     still name the struck line. They are not edited (append-only): their pointer stubs lead here.
157. **Docs.** `game-client/docs/design-guideline.md`'s character clip list says that the knight
     runs with the sprint's lean and cadence on his own legs (the shared fast run's stride shortened
     16%, the knee no higher than the shared run's), his blade carried raised as before, the wrist
     held back under the lean. It says that no class carries an attack on the move: every class
     plays its standing attack turned to its aim, moving or not. The dual-wielder line names
     `attack_offhand` alone. The `tools/bake/lib/contact.mjs` header notes say the same. The
     paragraph's "The knight keeps both until his own run is redone" goes.

### Acceptance Criteria

Bake (`npm test` in `game-client`: `classMotion.test.mjs`, `clips.test.mjs`, `clearance.test.mjs`,
`warriorLooks.test.mjs`, `axe.test.mjs`, `castLooks.test.mjs`, on his rig and styles as cast.js
builds him):

- [ ] The archer's, the mercenary's and the wizard's run keys and sheets, the mercenary's and the
      wizard's other clips, the shared run, and the knight's and the Berserker's idle, walk, attack,
      death (and `attack_offhand`) keys match their `23717cbb` digests (R137, R138).
- [ ] His sheet options carry exactly `idle`, `walk`, `attack`, `death`, `run`; the Berserker's add
      `attack_offhand` alone; `run` is `SPRINT_RUN` by reference (8 frames, looping, 16 fps, `speed`
      2.5); both styles read `SPRINT_LEAN` by reference and `RUN_STEP`'s legs at the named stride
      0.84; the Guardian's row carries the same (R138, R139, R149).
- [ ] His run under both styles: the lean 19–21° on average and 18–22° on every sample; the head
      steady; a flight frame each step; 4 planted keys; a lift of at least 0.045 H; a bob of
      0.056–0.07 H; the pelvis once a step; the shoulders counter-turning at 6.5–10°; the knee at
      least 0.30 H (R140).
- [ ] His pace at 16 fps within 1 px/s of `RUN_PACE`, which is still 194; the value recorded (R141).
- [ ] The leg guard, the cloak guard and the seen-through-the-cloth check pass the three looks on
      every clip they carry, with nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`, the
      garments and their springs unchanged (R142).
- [ ] Only `RUN_BLADE` changes in his carry (x 0.68 → 0.45). The elbow, the hand back past the hip,
      the cross-in, the blade across the body, clear of the free arm, off the shield (both
      shields), never through or behind the head, the tip ahead and the normal grip pass on his run
      (R144, R145).
- [ ] The blade 23–42° above level on every sample (inside `RUN_BLADE_ELEV`), the tip under
      `RUN_TIP_CEIL`. Seen red against the kept wrist under the lean (10.4–28.7°) (R146).
- [ ] The front hand's height against the chest bone recorded in its band, 0.01–0.035 H under
      (R147).
- [ ] The Berserker's edges face forward and never turn up past 30° in the run (R148).
- [ ] The shared fast run's knight rows are gone, and no class reads `RUNNING_CLASS_ANIMATIONS` for
      its sheet (R143, R149).

Manifest and client (`npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` in
`game-client`):

- [ ] In `public/art/manifest.json` the three knight sheets carry `idle`, `walk`, `attack`,
      `death`, `run` (8 frames at 16 fps, looping, 8 facings), the Berserker's `attack_offhand`
      too, at 1.5x and trimmed, and no `walk_attack`, `backpedal_attack`, `walk_attack_offhand`,
      `backpedal_attack_offhand` or `backpedal` (R149).
- [ ] The archer's, the mercenary's, the wizard's and every non-class manifest entry and atlas are
      byte-identical to `23717cbb`'s (R152).
- [ ] Each knight frame box and anchor equals today's or is smaller (R151). The report gives each
      atlas's dimensions, RGBA and PNG bytes before and after, and the change in per cent (R154).
- [ ] `npm run bake -- --check` is clean after the bake and again after the retirement.
- [ ] After the retirement: none of the retired code names (R155) is left in `src/` or
      `tools/bake/`; `selectAnimation` plays `attack` (or `attack_offhand`) for a moving attacker,
      turned to the aim; the charge keeps its `holdMs`; every manifest entry and atlas is unchanged
      by the retirement; each guard that lost its fixture has a new one that fails (R155).
- [ ] The two thin lines are struck and reworded through `spec-update`, and the struck line is
      deleted when the retirement ships (R156).
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

HITL:

- [ ] **The owner approves** the three knight sheets' new run beside `23717cbb`'s on the contact
      sheet (ADR-0021 §5), or names a tune round (R153). Nothing else waits on it (K6).
- [ ] **Browser check:** in a run and in the town, the knight, the Guardian and the Berserker run
      at 200 px/s with the sprint's lean and cadence, the feet not visibly sliding, no leg through
      the hauberk, the surcoat or the cloak, the blade carried raised. An attack while moving plays
      the standing attack turned to the target (he stands in the pin); the warrior's charge holds
      its pose as before; the Berserker alternates hands. No class ever shows `walk_attack` or
      `backpedal_attack`, and a second player sees the same.

### Edge States

- **Attacking on the move.** The pin stands him (R49), so the attack shows standing, turned to the
  aim. In the latency gap at the pin's edges the standing attack may slide a tick or two (K3,
  accepted).
- **The charge.** The warrior's dash moves him while his attack plays, as today: it always played
  `attack` with its pose held (`holdMs`), never `walk_attack`. Retiring `charge` (R155) changes
  nothing drawn.
- **The Berserker's hands.** Each swing takes the other hand (FS-1J1CB R29). With only `attack`
  and `attack_offhand` left there is nothing to swap mid-swing, so a swing always starts from
  key 0.
- **Running into an attack.** The attack starts from its own key 0, so an attack started mid-run
  jumps from the run's carry to the wind-up, as today.
- **Setting off and stopping.** His carry is the same in the run but for the wrist, so setting off
  and stopping look as they do now, under a trunk that leans 10° further, the blade a little
  higher in the hand.
- **The hauberk at the back.** Under (a) the calf never folds up past the shared run's 1.45 rad,
  so the hauberk's back hangs as today (R142). The ×4 detail shows it (R153).
- **Gear move speed.** At +20% (240 px/s) his run plays at about 1.24x (about 19.8 fps), capped by
  `MAX_WALK_SCALE` as today.
- **Mixed parties.** After this every class sprints at 16 fps and none attacks on the move.
- **Other players.** Others draw him from the same sheet, so they see the run and the standing
  attack.
- **A sheet from an older bake.** A manifest carrying `walk_attack` no longer plays it once R155
  lands, and nothing checks its length. The baked manifest is committed with the client, so no
  such sheet ships.
- **The dark-room strip.** `contact-darkroom-knight` is regenerated with the new run, if the bake
  writes one for him, as the others' were.

### Out of Scope

- The knight's idle, walk, attack and death keys, his attack's cloth, and any look change to the
  hauberk, the surcoat, the cloaks, the shield or the axes (K1, E1), unless the coordinator picks
  one.
- The sprint's own legs for him (E1 (b)), unless picked; any change to `SPRINT_STEP`,
  `SPRINT_LEAN`, `SPRINT_RUN` or `RUN_STEP` (R138). Changing them is escalated, not done.
- Any change to the archer's, the mercenary's or the wizard's keys, carries or sheets (R137, R152).
- A new attack, a walk-attack of any other shape, a transition clip, or a finer facing.
- `RUN_PACE`, the server's move speed (200 px/s), the pin, the charge's server behaviour, and any
  game-server change (the human lane).
