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

- [ ] The guards run on all three looks on every frame of today's run; the result (pass, or each
      failure's frame and depth) is recorded here.
- [ ] Each of the five fixtures fails its check.
- [ ] Sampling is along edges, at most 0.005 H apart; the half-cloak is skinned as posed.
- [ ] Nothing added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`.
- [ ] `npm test`, `npm run lint` in `game-client` pass.

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
