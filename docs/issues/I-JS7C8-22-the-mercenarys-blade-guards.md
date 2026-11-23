---
id: I-JS7C8-22
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 22: the mercenary's blade guards: the sword and the sword arm sampled along mesh edges against the legs, boots, skirts, half-cloak and torso on all three looks, each check with a rejection fixture (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (R104–R106)

**Lane: agent.** Tests only; no carry change and no bake. Written against today's run first, so
the guards exist before I-JS7C8-23 moves the sword behind him (M6: "committed tests sampling
along mesh edges with rejection fixtures"). Can run beside I-JS7C8-21.

## What to Build

In `mercLooks.test.mjs` (it already builds the three figures through `CAST` and
`characterPoses` with the fabric mocks), modelled on the archer's bow guards
(`archerLooks.test.mjs`: `bowSegments` and `along` :266-296, `leastOutside`, `crosses`,
`trianglesOf`; fixtures :557-605). Factor the shared helpers out only if both files read them.

1. **The sword's edges (R104).** Every edge of every drawn mesh of the curved sword (the blade, the
   fuller, the cross, the knuckle-bow, the grip, the pommel; gear.js `curvedSword` :624), as
   posed on each baked run frame, sampled at most 0.005 H apart.
2. **Against the solids.** No sampled point is inside a leg, a boot, or a skirt (the base's coat,
   the Duelist's two robe panels, the Sellsword's coat), read with `clearance.js` `tubeNow` and
   `outside`.
3. **Against the cloth and the body.** No edge crosses the Duelist's half-cloak (skinned as posed,
   segment against triangle) or the torso.
4. **The arm's pieces.** The same for the right arm past the elbow (the hand, the vambrace, the
   Duelist's wide sleeve) against the legs, the skirts and the half-cloak.
5. **Rejection fixtures (R105).** Each check has a fixture that must fail: the same sword moved
   so the blade lies on the right thigh's axis, through the coat's back skirt, through the
   half-cloak's back, and through the torso; the arm's pieces moved into the half-cloak.
6. **No exemption (R106).** Nothing is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.

Parametrise the guards on the clip, so I-JS7C8-23 and I-JS7C8-24 run them on the new run, and
I-JS7C8-24 runs them on the baked frames, unchanged.

If today's run already fails a guard, record where and by how much in this issue. Don't loosen
the guard: I-JS7C8-23's carry replaces today's.

## Acceptance Criteria

- [x] The guards run on all three looks on every frame of today's run; the result (pass, or each
      failure's frame and depth) is recorded here.
- [x] Each of the five fixtures fails its check.
- [x] Sampling is along edges, at most 0.005 H apart; the half-cloak is skinned as posed.
- [x] Nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.
- [x] `npm test`, `npm run lint` in `game-client` pass.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: M6; R104–R106; the Acceptance Criteria's guard and fixture bullets; Edge States "The heel kick
under the blade", "The three looks".

## TDD Approach

- RED: each fixture first (a guard that cannot fail is no guard), then the guard over today's run.
- GREEN: the edge sampling and the solid and triangle checks.

## Files it expects to touch

- `game-client/tools/bake/page/characters/mercLooks.test.mjs`
- possibly a small shared test helper beside `archerLooks.test.mjs` (only if both files read it)

## Built (2026-11-23, agent; review round 1 the same day)

The guards are in `mercLooks.test.mjs`, parametrised on the clip (`GUARDED = ["run"]`). They run
on every baked run frame of `char_mercenary_base`, `char_mercenary_duelist` and
`char_mercenary_sellsword`, posed as the bake poses them (`characterPoses`). The edge helpers
live in `edgeGuards.mjs` and are shared with the archer's bow guards: `edgesOf`, `segmentsOf`,
`along`, `leastOutside`, `crossings`, `trianglesOf` and `legSolids`. Points are sampled along
every edge, at most 0.005 H apart, and skinned meshes are read as posed. Nothing is added to
`KNOWN_CLIPPING` or `MIRRORED_LEGACY`.

**The guards**, with the margins on the current run (I-JS7C8-23's carry; worst over the 8 frames):

| Guard | Base | Duelist | Sellsword |
|---|---|---|---|
| Sword's edges inside no leg, boot or skirt (least outside, H) | 0.154 | 0.137 | 0.154 |
| Sword's edges cross no half-cloak and no body (edges across) | 0 | 0 | 0 |
| Sword's lowest point ≥ 0.06 H over the ground (R99) | 0.217 | 0.217 | 0.217 |
| Arm past the elbow (the fist, the vambrace, the arm's skin, the wide sleeve) inside no leg, boot or skirt (H) | 0.086 | 0.050 | 0.086 |
| Arm past the elbow crosses no half-cloak (edges across) | 0 | 0 | 0 |
| *Review round 1:* sword and arm cross no rigid piece at the hips (edges across; nearest, H) | 0; sword 0.167, arm 0.072 | 0; sword 0.155, arm 0.027 | 0; sword 0.153, arm 0.058 |
| *Review round 1:* right spaulder crosses no head (edges across; nearest, H) | no spaulder | no spaulder | 0; 0.054 |

The rigid pieces at the hips are every drawn, unskinned mesh the hips bone carries. On the base
that is the sash's band, knot and tail on the right hip, and the scabbard (two leathers, three
iron fittings) on the left. The Duelist has his sash wound twice and the scabbard. The Sellsword
has his sash, the scabbard, and the purse at the right hip (two leathers and its brass). Every
nearest hip distance falls on run frame 3.

**Non-vacuity (review round 1).** A test pins what each set holds on each figure, so no guard can
read an empty set: the body meshes (base 1: the torso; Duelist 2: the torso and the wrapped robe;
Sellsword 2: the torso and the buff coat), the hip pieces by cloth, the right spaulder's lames
(0, 0, 3), and a non-empty head.

**Rejection fixtures** (each reads a failure): the blade's middle on the right thigh's axis;
inside the coat's back skirt; on the half-cloak's back; through the chest; the sword lowered to
0.03 H; the fist on the half-cloak's back; the fist on the right thigh's axis. Review round 1
added three more: the blade on the Sellsword's purse, the fist on the base's sash knot, and the
Sellsword's right spaulder on the head bone.

**Against the run as this slice found it** (before I-JS7C8-21), every guard passed but one. The
Duelist's right sleeve mouth lay under the robe's back panel on run frames 1 (0.0107 H in) and 6
(0.0021 H in). The sprint's 20° lean (I-JS7C8-21) cleared it. The lean then swung the old pumping
arm across the half-cloak on run frame 7 (6 edges), and I-JS7C8-23's trailing carry cleared that.
Both were held as must-fail entries until they cleared. Review round 1 removed the empty
`TODAY_FAILS`/`it.fails` mechanism and folded those checks into `it.each(CASES)`.

**Open, escalated in review round 1 (not guarded, look and carry unchanged):** the Sellsword's
right spaulder against the torso. R104's Edge States has the spaulder turning with the arm's
twist. A strict check (no lame edge crosses the body) fails even at rest: the lames overlap the
buff coat by 0.012–0.018 H in the idle (21–28 edges across). A seated check fails on the run: no
deeper than the walk seats it (0.0113 H into the torso, 0.0263 H into the buff coat). The top lame
sinks **0.052 H into the torso and 0.067 H into the buff coat on every run frame**, at the front
of the upper chest, against 0.0035 / 0.0177 H in the idle. The base's left spaulder, on the
pumping free arm, sinks 0.022 H into his torso on run frames 3–4 (0.001 H in the walk). That is
outside R104, which names only the right spaulder.
