---
id: I-JS7C8-17
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-16]
labels: []
title: "FS-JS7C8 slice 17: the archer's two-handed low-ready bow in the run: hands at the belly to lower chest, the right on the string, the bow about 45° and clear of the legs, no pump (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The archer's sprint and low-ready bow (R72–R78)

**Lane: agent.** Keys and their tests only; no bake in this slice (I-JS7C8-18). Blocked by
I-JS7C8-16 because the 20° lean moves the chest frame the hands ride in.

## What to Build

The run's carry for the archer, `ARCHER_STYLE.run.hold` plus her run's arm settings (`arms`,
`elbow`; the shared `runCycle` mechanism, `clips.js:361`). Her idle and walk `hold` are unchanged
(R72, R78).

1. **No pump (R77).** Her arms stop swinging. Each hand moves no more than 0.02 H in the chest
   bone's frame over the cycle and only rides the trunk's turn, lean and bob. The shoulders'
   counter-turn from I-JS7C8-16 stays.
2. **Both hands in front (R72, R73).** The left hand on the grip, the right on the string. Each is
   ahead of the chest bone by more than 0.094 × `torsoD` H and inside the shoulders' width. Each
   sits at least 0.05 H above the hips bone, no higher than the chest bone, and under 0.70 H.
3. **The right hand on the string, no arrow (R74).** The right hand's grip point is within 0.02 H of
   the string's middle. The string stays undrawn (braced straight; no `fx.draw`, no `fx.arrow` on
   any run key). Today `bowInHand` (`cast.js:177`) moves the string only on `fx.draw`, so the hand
   has to be posed (or solved) onto the braced string, not the string onto the hand. If a solve
   helps, the draw's IK in `draw.js` is the existing seam; keep the attack's draw unchanged.
4. **The bow's angle (R75).** The tip-to-tip line is 35–55° off vertical on every sample. The upper
   tip is above the grip and ahead of it along the facing, and stays under the crown (the top of
   the meshes the head bone carries) in all three looks, the Hunter's horn nock caps included. The
   lower tip is below and behind the grip.
5. **Clear of the legs (R76).** A new test: no point of the bow's stave passes through a leg, a
   boot or the tunic on any sample of the run, posed and grounded as the bake poses her. At 45°
   the 0.8 H longbow's lower tip reaches about 0.28 H back (an estimate), so expect to cant the bow
   across the body with the lower limb outside a leg. The side and the cant are yours, within the
   test and the guards; the owner judges them at the contact sheet.

If the low-ready under the 20° lean cannot pass the leg, cloak or quiver guards (`clearance.js`;
`clearance.test.mjs`, `archerLooks.test.mjs`) without changing the look, stop and report back (the
charter's escalation). Never add an exemption.

## Acceptance Criteria

- [ ] RED first, against I-JS7C8-16's run (the figures are main's, measured; the lean shifts them a
      little): the right hand pumps to 0.707 H (needs under 0.70 and
      no higher than the chest bone); the bow hand hangs at 0.40–0.47 H at the side (needs in
      front at the belly to lower chest); the hands move in the chest frame (needs ≤ 0.02 H); the
      bow stands 7–39° off vertical (needs 35–55°).
- [ ] On every sample of her run: both hands ahead of the chest bone by more than 0.094 × `torsoD`
      H and inside the shoulders' width; each at least 0.05 H above the hips bone, no higher than
      the chest bone, under 0.70 H; the right hand within 0.02 H of the string's middle.
- [ ] No run key carries `fx.draw` or `fx.arrow`.
- [ ] Each hand moves at most 0.02 H in the chest bone's frame over the cycle.
- [ ] The bow 35–55° off vertical; the upper tip above and ahead of the grip and under the crown
      in the base, the Hunter (nock caps included) and the Shadow Ranger; the lower tip below and
      behind the grip.
- [ ] No point of the bow through a leg, a boot or the tunic on any sample (the new test).
- [ ] The leg, cloak and quiver guards pass her run in all three looks with no exemption
      (`clearance.test.mjs`, `archerLooks.test.mjs`).
- [ ] Her idle, walk, attack and death keys, and I-JS7C8-16's lean, pace, legs and shoulder
      tests, are unchanged and green.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

I-JS7C8-16

## Spec Reference

FS-JS7C8 §Change: The archer's sprint and low-ready bow: D4–D6; R72–R78; the Acceptance Criteria's
bake bullets on the hands, the bow and the chest-frame stillness; Edge States "The three looks",
"The cloak and the quiver under a 20° lean".

## TDD Approach

- RED: her run on her full rig (`cast.js` `archer`, posed as `poses.js` poses it, the bow read
  off the left hand's mount): hand heights and depths, the string distance, the bow's angle and
  tips, the stave against the legs.
- GREEN: `ARCHER_STYLE.run` (`arms`, `elbow`, `hold`, or `runExtra`) and, if needed, the right
  hand posed onto the braced string.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`ARCHER_STYLE.run`)
- `game-client/tools/bake/page/characters/cast.js` (`bowInHand`, only if the right hand needs a
  solve onto the braced string) and possibly `draw.js`
- `game-client/tools/bake/page/characters/clips.test.mjs`, `archerLooks.test.mjs`,
  `clearance.test.mjs` (the new bow-clearance test and her low-ready checks)
