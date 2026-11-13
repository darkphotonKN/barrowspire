---
id: I-QHN87-1
status: done
implements: FS-QHN87
blocked_by: []
labels: [ready-for-agent]
title: "FS-QHN87 slice 1: richer corner glyphs in one 2.25 px line, with screenshots for the owner (game-client)"
---
Implements FS-QHN87 §Requirements (R1–R14), §Acceptance Criteria (all but "By eye")

The owner, 2026-11-13: 「icon感覺有點空 不是指背包是所有icon」. He chose richer glyphs, not backings or
plates. The haversack keeps its `f779a9b0` design and size, and changes only by the line width.

## What to Build

- **One width (R1, R2).** Export `GLYPH_LINE_W = 2.25` once from `MailboxEnvelope.ts`. Import it
  into `HudCorner.ts` as its `LINE_W`, so the cover margins follow. Drop the gear's `lineStyle(3, …)`
  and the envelope's literal `1.5`. Every angled corner of a glyph is a vertex inside one path, never
  two `lineBetween`s meeting end to end. (Phaser 4.2.1 joins a path's segments only when
  `lineWidth > 2`; see FS § Facts, `StrokePath.js`.)
- **Menu (R3).** Eight bevelled (trapezoid) teeth and the rim in one closed outline. An inner ring
  at the hub. 4–6 rivets as small stroked circles centred on that ring's line. Drop to 4 if 5 or 6
  merge at render scale 1, and say so here.
- **Character (R4).** A hooded, cloaked head-and-shoulders figure: a peaked hood, its opening a deep
  inner curve, no face, at most two short shadow strokes inside it, and a cloak with a curved hem and
  one or two folds. Its box is within 3 px of today's bust's in each dimension, centred within 1 px.
- **Party (R5).** Two R4 figures at today's scales and offsets. The back one is cut where the front
  one's shape (line width included) covers it. Replace `bustShape`/`onBust` with the hooded shape's
  own cover test. Nothing is filled.
- **Envelope (R6, R8, R11).** In `drawEnvelopeLines`, inside today's `envelopeRect`:
  - the edge as today;
  - the flap as one path through `envelopeFlapPoint`;
  - a short crease inside each flap line near its top corner;
  - the foot folds;
  - a bottom corner folded over;
  - a diagonal tie cord edge to edge, at least 3 px from the flap point, with a knot of crossing
    strokes and two loose ends (never a circle or a closed loop), at least 8 px from the flap point
    and the rect's centre. The other lines are broken under the cord.

  Keep the cord, the knot and the fold out of the "99" badge's box (from `drawBadge`'s own
  geometry). Call only the stroke methods R11 lists, so `LetterPanel.test.ts` stays untouched. The
  greyed Mailbox uses the same function in `hudFaint` at 0.6.
- **Haversack (R9).** No change but the width. If a part mushes at render scale 1, report it here;
  don't redraw it.
- **Tests.**
  - `HudCorner.test.ts`: the widths set becomes `{GLYPH_LINE_W}`; new blocks for R2, R3, R4, R5;
    the greyed Mailbox's flap test reads the one-path V.
  - `MailboxEnvelope.test.ts`: the flap test reads the one-path V; new tests for the creases, the
    folded corner, the cord's gap, the knot's distance and the badge keep-out. `SEAL_PARTS` still
    holds.

  Keep every zone, label, badge, glow and pulse test green unchanged.
- **Guideline (R13).** Update the **Corner row** paragraph of `game-client/docs/design-guideline.md`
  and add FS-QHN87 to its "Added by" note.
- **Screenshots (R14).** Save twelve PNGs under `game-client/tmp/glyphs/out/` and list their
  absolute paths under "Screenshots" below:
  - eight of the town row (the four icons plus `MailboxEnvelope` with a count of 3): idle and
    hovered × render scale 1 and 2 × light and dark ground. "Hovered" means every zone's
    `pointerover` emitted in turn;
  - two of the field row with the greyed Mailbox, idle, dark, render scale 1 and 2;
  - two nearest-neighbour enlargements of the idle dark town row: 8× at render scale 1, 4× at 2.

  The backpack's harness can be copied from
  `/Users/nick/projects/barrowspire-backpack-inked/game-client/tmp/backpack/` (`main.ts`,
  `shoot.mjs`, `vite.config.mjs`, `index.html`) into this worktree's git-ignored `game-client/tmp/`.
  It mounts only `HudCorner`, so add a `MailboxEnvelope` over a `createMailboxStore` whose summary
  says 3 waiting. Its Vite port 5931 is hard-coded with `strictPort`, so pick another if it is
  taken. Read the source or the official docs for any Phaser 4.2.1, Playwright or Vite API you are
  unsure of. Don't guess. Never commit the harness.

Files expected: `game-client/src/ui/HudCorner.ts`, `game-client/src/ui/HudCorner.test.ts`,
`game-client/src/ui/MailboxEnvelope.ts` (the lines and the width constant only),
`game-client/src/ui/MailboxEnvelope.test.ts`, `game-client/docs/design-guideline.md` (the Corner
row paragraph only). Not `LetterPanel.ts`, `LetterPanel.test.ts`, `hudCornerLayout.ts`,
`letterPanelLayout.ts`, `cornerLabel.ts`, `carvedPanel.ts`, `canvasPalette.ts`, `theme.ts`,
`CONTEXT.md`, any scene, `public/art` or `tools/bake` (FS § Bounds). A slice that finds one of these
unavoidable stops and escalates.

## Acceptance Criteria

- [ ] `GLYPH_LINE_W` (2.25) is declared once in `MailboxEnvelope.ts` and is the only width in every
      glyph's `lineStyle` (the four row icons, the town envelope's lines, the greyed Mailbox). The
      badge's rim is still 1 px.
- [ ] No angled corner of any glyph is two `lineBetween`s meeting end to end.
- [ ] Menu: eight tapered teeth in one closed outline, an inner ring, 4–6 rivets centred on it.
- [ ] Character: a hooded figure with no head circle and no face. Its box is within 3 px of
      today's bust's, centred within 1 px.
- [ ] Party: two hooded figures. No back-figure point lies inside the front figure, and the front
      one is whole. Its box is within 3 px of today's, centred within 1 px.
- [ ] Envelope (town and greyed):
  - [ ] no `strokeCircle`, no `fillCircle` and no closed `arc`;
  - [ ] the flap is one path through the flap point, and two creases are drawn;
  - [ ] a bottom corner is folded;
  - [ ] the cord is ≥ 3 px from the flap point, and the knot ≥ 8 px from it and from the centre;
  - [ ] the lines are broken under the cord;
  - [ ] none of it is in the "99" badge's box;
  - [ ] only R11's methods are called.
- [ ] No glyph fills anything. Idle is `interactable` at 0.85, hovered `interactableBright` at 1,
      and the greyed Mailbox `hudFaint` at 0.6, unchanged on hover.
- [ ] The haversack's ops are unchanged but for the width. Its box is 32–36 tall, ≤ 44 wide,
      centred on (969, 681) within 1 px.
- [ ] Zones, cursors, `covers`, presses, labels, the badge, the glow and the pulse pass unchanged.
      Every glyph follows `relayout` to 1280.
- [ ] The guideline's Corner row paragraph reads as R13 and cites FS-QHN87.
- [ ] The twelve PNGs exist, and their absolute paths are listed below. No harness file is
      committed.
- [ ] `LetterPanel.test.ts` is unchanged. No raw colour literal.
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass in `game-client`.

## Screenshots

(Filled in by the slice: twelve absolute paths, each named for its state, render scale, ground and
town/field.)

## Blocked By

None.

## Spec Reference

FS-QHN87 §Requirements R1–R14, § What this changes in its owners, §Edge States; user stories 1–16,
19 and 20; charter G1–G6 and G7's screenshots. Narrows, without editing them, FS-3EBCA R3, its
§ Change: The inventory icon is an inked backpack (width only), FS-1GZGD R33 and FS-J1672 R2.

## TDD Approach

- RED: `HudCorner.test.ts` asserts every glyph width is `GLYPH_LINE_W` (fails on the gear's 3 and
  on 1.5). `MailboxEnvelope.test.ts` asserts the flap is one path through the flap point and a knot
  stands ≥ 8 px from it (fails on two `lineBetween`s and no cord).
- GREEN: the constant, then the envelope, the gear, the hooded figure and Party. Then the
  guideline, then the screenshots.
