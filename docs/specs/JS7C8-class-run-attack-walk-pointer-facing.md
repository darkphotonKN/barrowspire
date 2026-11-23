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

### Decisions (charter defaults, owner-approved 2026-11-23)

- **M1. One sprint, shared.** The archer's sprint legs and rhythm (about 20° lean, 16 fps, a
  stride about 12.4% shorter, knee drive, heel kick, the flight and the bob never reduced) become
  a sprint the archer and the mercenary share. Her run keys stay byte-identical, held by digest
  tests. His pace must stay within the shared `RUN_PACE` tolerance. *Reason:* the owner,
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
  body. Committed tests guard it, sampling along mesh edges, each with a rejection fixture.
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
    trunk varies by **12–26° peak to peak over the cycle** (about ±6° to ±13°), back with the left
    leg forward, as the shared pump's phase has it (clips.js:279, `swing`). It is never frozen.
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
    escalated, never exempted or changed here.

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
- A look change to the base, the Duelist or the Sellsword (escalated if the guards ask for one).
- `RUN_PACE`, the server's move speed (200 px/s), the pin, and any game-server change (the human
  lane).
