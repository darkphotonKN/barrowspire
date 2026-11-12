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
