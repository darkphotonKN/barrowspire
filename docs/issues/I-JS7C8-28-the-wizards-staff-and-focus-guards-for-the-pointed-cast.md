---
id: I-JS7C8-28
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 28: the wizard's staff and focus guards for the cast on all three looks: out of the torso, head and robe, the focus clear of her right forearm, hand and flared sleeve, sampled along mesh edges with a rejection fixture (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (R128, R129)

**Lane: agent.** Tests only; no key change and no bake. Written against today's cast first, so the
guards exist before I-JS7C8-29 points the staff along the aim (W4: "the staff/focus clear of the
body/robe/head"). Can run beside I-JS7C8-27.

## What to Build

1. **Out of the torso and the head on every cast key.** `classMotion.test.mjs`'s carry-out-of-body
   test already covers `attack` (`CARRIED`, :631; `deepestCarry`). Extend its wizard `GEAR` points
   (:111-114) to sample the haft every 0.05 H at most. Add a focus-length variant (the grip frame
   from `FOCUS_BUTT` −0.2 to the head, about 0.30 H; gear.js :514-515) so the looks' longer haft is
   read on the base rig too.
2. **Outside the robe.** Every staff or focus point that passes below the waist on a cast key lies
   outside the robe (`outsideRobe`, classMotion.test.mjs:598).
3. **The sleeve guard (new).** In `mageLooks.test.mjs` (it builds all three looks through `CAST` and
   `characterPoses` with the fabric mocks): on every baked `attack` frame of the three looks, no
   point along any edge of the meshes the right hand's mount carries (the haft, the butt knob, the
   collar, the ring or cage, the stone or flame) lies inside her right forearm, her right hand or
   the gown's flared right sleeve (cast.js:243). Sample at most 0.005 H apart (`edgeGuards.mjs`
   `edgesOf`, `along`), and test inside-ness as the mercenary's blade guards do (`mercLooks.test.mjs`
   with `edgeGuards.mjs` `leastOutside` / `clearance.js` `tubeNow`, `outside`). Exclude the fist's own
   grip, where the hand closes on the haft (the grip wrap, about ±0.035 H about the grip point).
4. **Rejection fixture.** The same focus moved so its haft lies along the right forearm's axis
   must fail item 3. Use a fixture for each solid if more than one kind of check is used.
5. **The head and the ground.** `mageLooks.test.mjs` "each focus clears her head and the ground in
   every clip" (≥ 1.3 skull radii, above the ground) stays and covers the base's sceptre too, if it
   does not already.

Parametrise the guards on the clip and its keys, so I-JS7C8-29 runs them on the new cast and
I-JS7C8-30 on the baked frames, unchanged. If today's cast already fails a guard, record where and
by how much in this issue. Don't loosen it.

## Acceptance Criteria

- [x] The guards run on all three looks on every key of today's `attack`; the result (pass, or
      each failure's key and depth) is recorded here.
- [x] The sleeve guard's rejection fixture fails it.
- [x] Sampling is along edges, at most 0.005 H apart; the sleeve is skinned as posed.
- [x] Nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.
- [x] `npm test`, `npm run lint` in `game-client` pass.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: W4; R128, R129; the Acceptance Criteria's
bullet on the staff or focus out of the torso, head, robe and sleeve; Edge States "The three looks".

## TDD Approach

- RED: the fixture first (a guard that cannot fail is no guard), then the guards over today's cast.
- GREEN: the edge sampling and the solid checks.

## Files it expects to touch

- `game-client/tools/bake/page/characters/mageLooks.test.mjs`
- `game-client/tools/bake/page/characters/classMotion.test.mjs` (`GEAR.wizard`, the focus-length points)
- possibly `game-client/tools/bake/page/characters/edgeGuards.mjs` (only if a shared helper is missing)

## Built (2026-11-23, agent)

The guards are in `f85d1980`, written against today's cast (`22cabd3a`). Each takes the clip and
its keys as parameters, so I-JS7C8-29 and -30 run them unchanged.

- **Out of the torso and the head** (`classMotion.test.mjs` `STAFFS`: the sceptre and a
  focus-length haft, points every 0.05 H at most). On today's cast the nearest point was key 1:
  0.049 H out of the torso and 0.068 H out of the head.
- **Outside the robe** (`outsideRobe`). Every point below the waist is outside it, by at least
  0.161 H on today's cast.
- **The sleeve guard (new, `mageLooks.test.mjs`).** It samples every edge of the right hand's
  mount at most 0.005 H apart. The fist's own grip (±0.035 H about the grip point) is left out.
  Each point is checked against her right forearm, her right hand and the flared right sleeve,
  skinned as posed. On today's cast the edges were 0.087 H outside the arm and sleeve (key 1) and
  0.0053–0.0066 H outside the hand. Each solid has a fixture that must fail: the focus moved so
  its haft lies along the forearm's axis fails it.
- **The head and the ground.** The 1.3-skull-radii head guard now covers the base's sceptre too.
- **Pre-existing, recorded, out of this change.** The base's **death** clip puts its sceptre
  **0.20 H under the ground** on key 6. The ground check skips that one clip and sheet
  (`mageLooks.test.mjs` `overGround`: `char_wizard_base` `death`). This is a follow-up, not
  something this change caused (her death keys are held by digest, R115).
- **On the pointed cast (I-JS7C8-29, `b0e03f10`)**, on all three looks with no exemption: out of
  the torso by 0.141 H and the head by 0.26 H on the pointed keys. The focus's haft clears the
  flared right sleeve by **0.0019 H** (the Spellwarden and the Pyromancer, keys 3–4, beside the
  fist), and the sceptre by 0.0059 H. The cage sits 1.691 skull radii from her skull in the cast.
- Nothing was added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.
