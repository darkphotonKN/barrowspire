---
id: I-PQ2TW-5
status: done
implements: FS-PQ2TW
blocked_by: [I-PQ2TW-1]
labels: [ready-for-agent]
title: "FS-PQ2TW slice 5: the card leaves as dust off its letters, with its gallery card (game-client)"
---
Implements FS-PQ2TW §D (R24–R36), §F (R40); Content: FS-1819Q

**Author: agent.** game-client only. No new colour, no new baked art.

**Two stops, both the owner's:**

- **If the letters' pixels cannot be read in a real browser** (the HD canvas, a tainted or empty
  read), stop and report. Do **not** build particles from the text's bounding box: the owner wants
  to be told first (R35). The built behaviour for a failed read is the plain fade.
- **This effect is the one exception to FS-KYPQ9 §B.6** (more than 12 particles, drifting outward;
  FS-PQ2TW R33, Open O3). Do not loosen `table.test.ts` or `sourceScan.test.ts` for anything else,
  and do not call `explode(`.

## What to Build

1. A dust module in `src/render/effects/` (suggested `cardDust.ts`). Its numbers are one typed
   record (R34): 1000 ms, at most 600 particles, start speed at most 60 px/s, the upward lean,
   `hudText` → `hudLabel`, the easing. Whether that record is an `EFFECTS` entry or stands beside
   the table is yours, so long as the table's entry list and rule tests stay true to FS-KYPQ9.
2. Seeding from the strokes (R25): read each text's own canvas once (`Text.canvas` /
   `Text.context`, or its `CanvasTexture`'s `getPixels`), keep the drawn pixels, divide by the
   text's resolution to get view px, and pick start points among them in proportion to ink; add
   points along the rule. Emit with `emitParticleAt` or a random zone whose source has
   `getRandomPoint`. Read the installed engine source before choosing
   (`node_modules/phaser/src/gameobjects/text/Text.js`, `…/particles/ParticleEmitter.js`).
3. The shared piece's leave: at the end of the hold the text is hidden and the dust plays in its
   place, over the veil and under the HUD; the climb's card leaves the same way (R30).
4. `prefersReducedMotion()` true, a failed read, or a missing fx sheet: today's 600 ms fade, no
   particle (R31, R35).
5. Teardown on end, on a new card, on a resize and on scene end (R36).
6. A gallery card in `src/dev/gallery/effects.ts` that shows a heading, a rule and a subtitle and
   breaks them to dust on each play (R40).

## Acceptance Criteria

- [ ] Heading, rule and subtitle break up together at the end of the hold; the text is gone as the dust appears.
- [ ] Every start point is a pixel the text drew or a point on the rule (tested on a stub canvas with known ink); none in the gaps.
- [ ] Particles move away from the card's centre with an upward lean, none starts above 60 px/s, all are gone at 1000 ms.
- [ ] Particles start `hudText` and end `hudLabel`; no raw hex; the token fence passes.
- [ ] At most 600 particles, one emitter, no `explode(` in source.
- [ ] Reduced motion: no particle is made; the card fades over 600 ms.
- [ ] A read that throws or returns no ink: the fade, one log line, nothing emitted from the bounds.
- [ ] Stopping the scene mid-dust leaves no particle, emitter or tween; a new card removes the old dust.
- [ ] `table.test.ts` and `sourceScan.test.ts` pass unchanged for every other effect.
- [ ] `/dev/gallery` shows the card and replays it; `effects.test.ts` passes.
- [ ] Tests and lint green (`npx vitest run --maxWorkers=4 --minWorkers=1`).

## Blocked By

I-PQ2TW-1 (the shared piece whose leave this replaces)

## Spec Reference

FS-PQ2TW §D R24–R36, §F R40; Facts 9–12; Edge States (reduced motion turned on while a card is
up, a resize while the dust is in the air, the fx sheet is missing). FS-KYPQ9 §B. FS-1819Q R2,
R10–R13.

## Files it expects to touch

`game-client/src/render/effects/cardDust.ts` (+ test, new), `src/ui/arrivalCard.ts` (+ test),
`src/dev/gallery/effects.ts`, and `src/render/effects/table.ts` (+ test) only if the record is
made an entry.

## TDD Approach

- RED: from a stub canvas with a known glyph, every seeded point lies on ink.
- GREEN: the sampler; then the record's rule test; then the piece's leave and the reduced-motion branch.
