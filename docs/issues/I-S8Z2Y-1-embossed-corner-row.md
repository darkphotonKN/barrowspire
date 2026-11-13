---
id: I-S8Z2Y-1
status: open
implements: FS-S8Z2Y
blocked_by: [I-7TQN4-1]
labels: [ready-for-agent]
title: "FS-S8Z2Y slice 1: every knockout of the corner row on a drop shadow, its bronze lit from above, the greyed Mailbox flat, tested, with plain and emboss screenshots for the owner (game-client)"
---
Implements FS-S8Z2Y §Requirements R1–R11, §Acceptance Criteria (all but "By eye")

The owner, 2026-11-13: 「icon可以加一點浮凸的陰影或漸層嗎」, then 「加上浮凸漸層」.

## What to Build

Build on FS-7TQN4's agent slice as it landed (`73bcac1d`). Read FS-S8Z2Y § Facts first.

1. **The shadow (R1–R3), in the shared renderer** (`game-client/src/ui/knockout.ts`, `Knockout`).
   On each build, after the owner's `built`, make the shadow: `scene.add.image` on the knockout's
   own texture, depth and scroll factor as the image, scale `1 / k`, tint `palette.ink` in tint mode
   `FILL` (Phaser 4's `TintModes.FILL`, 1), alpha 0.5, at the image's place plus (1, 1) logical px;
   then `scene.children.moveBelow(shadow, image)`. `show` moves it with the slot and never changes
   its tint or alpha; the rebuild and `destroy` take it down with the image. The renderer can draw
   only where the scene also has `add.image` and `children.moveBelow`; elsewhere it falls back as
   today.
2. **The gradient (R4–R6).** `show` lays the state's tint as corner tints,
   `setTint(top, top, foot, foot)`: `mix(tint, palette.interactableBright, 0.25)` at the
   silhouette's top edge, `shade(tint, 0.2)` at its foot, straight between, carried out to the
   texture's top and foot (channels rounded, held to 0–255). The silhouette's top and foot come
   from the picture's own points. A `KnockoutInk` that is flat (the row's `GREYED`) takes its one
   tint on all four corners. Alpha as today.
3. **No rims (R7).** The engraved-cut trial is done (see "Engraved cuts trial" below); nothing of
   it is built.
4. **Tests.** Extend the recording stand-ins in `knockout.test.ts`, `HudCorner.test.ts` and
   `MailboxEnvelope.test.ts` with `add.image` (recording texture, place, depth, scroll factor,
   scale, tint, tint mode, alpha, destroy) and record all four corner tints of `setTint`; the
   envelope's stand-in already keeps a display list. Cover every acceptance criterion below.
   FS-7TQN4's tint assertions move to the gradient read at the silhouette's top and foot.
5. **Guideline (R10).** Add the emboss to the **Corner row** paragraph of
   `game-client/docs/design-guideline.md` and FS-S8Z2Y to its "Added by" note.
6. **Screenshots (R11).** With the git-ignored harness `game-client/tmp/glyphs/`, shoot each state
   at `73bcac1d` (`…-plain`) and with this slice (`…-emboss`), and list the paths under
   "Screenshots" below.

Files expected: `game-client/src/ui/knockout.ts`, `knockout.test.ts`, `HudCorner.ts` (the greyed
ink only), `HudCorner.test.ts`, `MailboxEnvelope.test.ts`, and the guideline's Corner row paragraph.
`MailboxEnvelope.ts` only if the draw order needs it. Nothing else (FS-S8Z2Y § Bounds).

## Acceptance Criteria

- [ ] One shadow per knockout build: `add.image` on its texture, depth 1000, scroll factor 0,
      scale `1 / k`, `palette.ink` in `FILL`, alpha 0.5, slot centre + (1, 1). Four for a town row,
      five for a field row, one for the town envelope; texture counts unchanged.
- [ ] Each shadow directly under its image; in the town glow, shadow, envelope, badge, count after
      building, after a render-scale rebuild and after the count goes 0 → 3.
- [ ] `relayout` moves the shadows, making none; render scale 1 → 2 makes new ones at `1 / 4` and
      destroys the old; `destroy` destroys them and unwatches.
- [ ] Hover and leave: no shadow moves or changes; nothing is made.
- [ ] Live knockouts: corner tints top two equal, foot two equal; along the height,
      `mix(tint, interactableBright, 0.25)` at the silhouette's top and `shade(tint, 0.2)` at its
      foot, within 1 per channel; bronze at 0.85 idle, lifted bronze at 1 hovered; the rucksack's
      included.
- [ ] Greyed Mailbox: four corners `hudFaint`, alpha 0.6, hovered or not; its shadow present.
- [ ] Into each texture: fill, erase, `render()` and nothing else.
- [ ] Fallback (plain and throwing stand-ins): no image, no shadow, the line glyphs as at
      `73bcac1d`; `LetterPanel.test.ts` passes untouched.
- [ ] No raw colour literal. `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p
      .`, `npm run lint` and `npm run lint:fence` pass in `game-client`.
- [ ] The guideline's Corner row paragraph reads as R10 and cites FS-S8Z2Y.
- [ ] The plain and emboss shots exist, listed below. No harness file is committed.

## Engraved cuts trial

(Filled in by the slice: what was tried, at which render scales it read, and the shots.)

## Screenshots

(Filled in by the slice: absolute paths, each pair named `…-plain` and `…-emboss`.)

## Blocked By

I-7TQN4-1: this slice adds to the renderer it built, in the same files. Its code is on the branch
(`73bcac1d`); its owner check (I-7TQN4-2) may run alongside, since a tweak there changes the
pictures and this the inks.

## Spec Reference

FS-S8Z2Y §Requirements R1–R11, § What this changes in its owners, §Edge States; user stories
1–15, 17–19; charter G1–G7.

## TDD Approach

- RED: on the renderer's stand-in, a build makes one shadow image on the texture with the ink,
  `FILL`, 0.5, (1, 1), just under the image; the corner tints read lift at the top and shade at the
  foot; hover changes only the tints and alpha; a flat ink keeps one tint; rebuild and destroy take
  the shadow too; the fallback makes none. Then the row's and the envelope's order and tints.
- GREEN: the shadow in `build`, the gradient in `show`, `flat` on the row's greyed ink.
