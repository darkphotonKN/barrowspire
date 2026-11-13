---
id: I-7TQN4-1
status: open
implements: FS-7TQN4
blocked_by: [I-3EBCA-14]
labels: [ready-for-agent]
title: "FS-7TQN4 slice 1: one shared knockout renderer, and Menu, Character, Party and the Mailbox drawn as bronze knockouts with redrawn pauldrons, tested, with screenshots for the owner (game-client)"
---
Implements FS-7TQN4 §Requirements R1–R20, §Acceptance Criteria (all but "By eye")

The owner, 2026-11-13, after choosing the bronze knockout rucksack for Inventory (「古銅反白好了」):
「其他icon不是也要反白嗎」 and 「目前反白前的肩胛有點怪在調整一下」.

## What to Build

Build on I-3EBCA-14 as it landed (`5358e873`, `68ec6fa9`). Read FS-7TQN4 § Facts first.

1. **Generalise the knockout first (R1, R2).** Lift the machinery out of `KnockoutRucksack`
   (`game-client/src/ui/knockoutRucksack.ts`) into a **shared knockout renderer** (a new module
   beside it, for example `src/ui/knockout.ts`, with its own test file). It takes, per glyph, the
   silhouette (shapes to fill), the cuts (paths and holes to erase) and the two states' tint and
   alpha. It alone owns:
   - the texture at `k = 2 × renderScale`, on the slot's centre, depth 1000, scroll factor 0,
     scale `1 / k`; the white fill, the erase, one `render()`, its drawing graphics destroyed;
   - **the cuts in texel coordinates**: every point and radius times `k`, on an unscaled graphics,
     at `lineStyle(1.6·k)` (≥ 3.2), so Phaser 4.2.1 joins every corner (it joins only when
     `lineWidth > 2`, measured before scale); holes are discs filled into the erase;
   - the tint and alpha per state (no rebuild on hover);
   - the rebuild on a new render scale, with its own `viewport.onChange` watch (the row's
     Inventory-only watch moves in here);
   - reporting that it cannot draw (no `make.graphics` or `add.renderTexture`, or a throw), so its
     owner draws the line fallback, and never trying again;
   - destroy and unwatch.

   The rucksack keeps only its shapes and `drawRucksackLines`, and draws through the renderer, with
   no visual change but its now-joined cut corners. Fold the two `bend` helpers (and `oval`) in
   `HudCorner.ts` and `knockoutRucksack.ts` into one. I-3EBCA-14's tests must stay green, changed at
   most in their imports and in how the stand-in reads a cut's width. Commit this step on its own
   (`refactor(client): …`) before any new glyph.
2. **The pictures (R3–R9)**, each a silhouette plus cuts for the renderer:
   - **Menu** (R3): today's gear outline filled; a centre hole (radius 2–3.5), a ring cut
     concentric with it (≥ 1.5 px of bronze from the hole), four rivet holes (radius 0.9–1.4) at 45°,
     135°, 225°, 315°, each ≥ 1 px clear of the ring cut and of the root circle. Move the ring and
     rivets' radius out as needed to make room.
   - **Character** (R4, R5): a head disc and a shoulder mass, ≥ 1.6 px apart; the pauldrons drawn
     again as smooth rounded caps flowing into the arms (the upper outline convex, turning one way,
     ≤ 20° per vertex, mirror-symmetric), each with one plate-seam cut 2–4 px inside its edge; the
     baldric cut from inside the left seam's inner end to the foot right of the middle, crossing no
     other cut; the buckle a closed cut about 5 × 4.4 at 0.7 down. No rivets, no collar. Box within
     3 px of today's `drawCharacter` box, centre within 1 px.
   - **Party** (R6): three R4 busts at `PARTY_BUSTS`' places and scales; the front with its two
     seams and its gorget arc as a cut, the back two with neck gaps (seams optional); one fill, a
     ≥ 1.6 px gap cut along the front bust's outline wherever it lies over a back bust.
   - **Envelope** (R7–R9): a solid rounded rect equal to `envelopeRect(f)` (radius 2); the flap
     cut as one path through `envelopeFlapPoint(f)`, and the two foot folds. In `MailboxEnvelope`
     the knockout takes the body graphics' place; place its image under the badge's graphics (and
     so over the glow) in the display list each time it is made, for example
     `scene.children.moveBelow(image, badge)`. The badge, glow, pulse, zone, label, press, toggle and
     store subscription are untouched. The greyed Mailbox in `HudCorner` is the same envelope in
     `palette.hudFaint` at 0.6, idle and hovered alike.
3. **Colours (R10).** Menu, Character, Party and the town envelope: idle
   `mix(palette.frame, palette.interactable, 0.5)` at 0.85, hovered
   `mix(palette.frame, palette.interactableBright, 0.5)` at 1.
4. **The fallback (R15, R16).** Where the renderer reports it cannot draw, each icon draws exactly
   today's line glyph (`drawGear`, `drawCharacter`, `drawParty`, `drawEnvelopeLines`), unchanged,
   through the stroke-only `Ink`. Keep today's bust code for that path; the redrawn pauldrons are
   the knockout's only. `LetterPanel.test.ts` must pass untouched (its stand-in has `make.graphics`
   but no `add.renderTexture`, so the envelope falls back there).
5. **Tests.** Extend the recording stand-ins in `HudCorner.test.ts` and `MailboxEnvelope.test.ts`
   (the latter needs `make.graphics`, `add.renderTexture` and a recorded display-list order) and
   cover every acceptance criterion below. The FS-J1672 and FS-QHN87 blocks' assertions on Menu,
   Character, Party, the envelope and the greyed Mailbox move to the fallback path and pass
   unchanged there.
6. **Guideline (R19).** Rewrite the **Corner row** paragraph of `game-client/docs/design-guideline.md`
   as R19 says, and add FS-7TQN4 to its "Added by" note.
7. **Screenshots (R20).** Extend the git-ignored harness `game-client/tmp/glyphs/` (`main.ts`,
   `shoot.mjs`, `vite.config.mjs`, `index.html`; real WebGL Phaser in headless Chrome via
   `playwright-core`, Vite on port 5937 with `strictPort`) to hover each icon, show the field row,
   catch a pulse at its brightest and render at 1.5. Save the twenty-six PNGs under
   `game-client/tmp/glyphs/out/` and list their absolute paths under "Screenshots" below:
   - town row idle × render scale 1, 1.5, 2 × light and dark ground (6);
   - town row with Menu, Character, Party or Mailbox hovered × 1, 1.5, 2, dark ground (12);
   - field row idle (greyed Mailbox) × 1, 1.5, 2, light ground (3);
   - 4× nearest-neighbour enlargements of the idle town row, dark ground, one per scale (3);
   - the town row mid-glow at 2, dark ground (1);
   - a render-scale change at run time, 1 → 2 (1).

   Never commit the harness. Read the source or the official docs for any Phaser 4.2.1,
   Playwright or Vite API you are unsure of. Don't guess.

Files expected: `game-client/src/ui/knockoutRucksack.ts`, the new shared renderer module and its
test, `game-client/src/ui/HudCorner.ts`, `game-client/src/ui/HudCorner.test.ts`,
`game-client/src/ui/MailboxEnvelope.ts` (envelope drawing only), `game-client/src/ui/MailboxEnvelope.test.ts`,
and `game-client/docs/design-guideline.md` (the Corner row paragraph only). Not `hudCornerLayout.ts`,
`letterPanelLayout.ts`, `cornerLabel.ts`, `LetterPanel.ts`, `LetterPanel.test.ts`, `mailboxHud.ts`,
`drawWaxSeal`, the mailbox store, `carvedPanel.ts`, `canvasPalette.ts`, `theme.ts`, any scene,
`public/art`, `tools/bake` or `game-client/CONTEXT.md` (FS-7TQN4 § Bounds). A slice that finds one
of these unavoidable stops and escalates.

## Acceptance Criteria

- [ ] The shared renderer is the only code that calls `add.renderTexture`, `erase` or
      `viewport.onChange` for the row's knockouts and the envelope's. The rucksack uses it.
      I-3EBCA-14's tests pass, changed at most in imports and in reading a cut's width. One `bend`.
- [ ] Textures: four for a town row, five for a field row, one for the town envelope; each depth
      1000, scroll factor 0, on its slot's centre, `round(f.width·k) × round(f.height·k)`,
      scale `1 / k`. The icons' own graphics and the envelope's body record no op.
- [ ] Into each: `TINT_IDENTITY` fills at 1, then an erase of strokes and filled discs only, then
      `render()`; drawing graphics destroyed. Every cut on an unscaled graphics at
      `lineStyle(1.6·k)`; no `lineBetween`; no other colour, no gradient.
- [ ] Menu, Character, Party and envelope geometry as FS-7TQN4's Acceptance Criteria state them
      (hole, ring, rivet holes; neck gap, convex ≤ 20° caps, seams, baldric, buckle, box; three busts,
      front gap, gorget; rounded rect, flap, folds).
- [ ] Tints: bronze 0.85 idle, lifted bronze 1 hovered; greyed Mailbox `hudFaint` 0.6 always. Hover
      and leave build nothing.
- [ ] The envelope's image is under the badge's graphics and count text and over the glow after
      building, after a render-scale rebuild and after the count goes 0 → 3.
- [ ] `relayout` to 1280 moves every image, builds nothing. Render scale 1 → 2 rebuilds each
      knockout at `k = 4`, the envelope's included with no scene relayout, and destroys the old;
      a width change alone builds nothing.
- [ ] `HudCorner.destroy` and `MailboxEnvelope.destroy` destroy their images and unwatch.
- [ ] Fallback (no `make`/`add.renderTexture`, and a throwing `add.renderTexture`): today's line
      glyphs exactly; the FS-J1672 and FS-QHN87 assertions pass there; no slot empty.
      `LetterPanel.test.ts` passes untouched.
- [ ] Zones, cursors, `covers`, presses, labels, the toggle and the badge unchanged.
- [ ] `Ink` has no fill method. No raw colour literal. `npx vitest run --maxWorkers=4
      --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint` pass in `game-client`.
- [ ] The guideline's Corner row paragraph reads as R19 and cites FS-7TQN4.
- [ ] The twenty-six PNGs exist, their absolute paths listed under "Screenshots". No harness file
      is committed.

## Screenshots

(Filled in by the slice: twenty-six absolute paths, each named for its state, render scale and
ground.)

## Blocked By

I-3EBCA-14: this slice generalises the knockout it built and edits the same files
(`HudCorner.ts`, `HudCorner.test.ts`, `knockoutRucksack.ts`, the guideline's Corner row paragraph).
Start once it is done, and its owner's tweak round (I-3EBCA-15), if one is running, is not
mid-edit in those files.

## Spec Reference

FS-7TQN4 §Requirements R1–R20, § What this changes in its owners, §Edge States; user stories 1–21,
23–25; charter N1–N9, and N10's render scales for the screenshots.

## TDD Approach

- RED (refactor): a test of the shared renderer on a recording stand-in: given a silhouette and
  cuts, one texture at `k`, white fills, cuts on an unscaled graphics at `1.6·k`, tint per state,
  rebuild on a render-scale change, destroy and unwatch, and "cannot draw" on the plain and the
  throwing stand-ins. The rucksack's tests stay green through the lift.
- RED (pictures): per icon, the texture count, the silhouette and cut geometry, the tints, the
  envelope's draw order, the rebuild and the fallback; then the four's FS-J1672 and FS-QHN87 blocks
  on the fallback path.
- GREEN: the renderer, then each icon's shapes, then the guideline and the screenshots.
