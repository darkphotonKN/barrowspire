---
id: I-8RZ51-19
status: in-progress
implements: FS-8RZ51
blocked_by: [I-8RZ51-17]
labels: [blocked]
title: "FS-8RZ51 slice 19: tree pictures in vellum ink on lit plates, four traversal pictures and the lock mark, filler pictures retired (game-client, contact-sheet gate)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-E (V29)

**Author: agent; HITL gate:** a contact sheet approved by Kranti before the slice closes. Art is
built in code, never sourced, and the fidelity bar is Ultima Online. The ability bar's icons are
untouched.

## Files it expects to touch

- `game-client/src/ui/knockout.ts`: a tree ink from `palette.hudText` (vellum), beside `BRONZE`, with
  `GREYED` unchanged
- `game-client/src/ui/passiveIcons.ts` and `passiveIcons.test.ts`:
  - `vitality`, `might`, `haste` and `fleetness` pictures with lines, and the padlock lock mark;
  - `health`, `reserve`, `attribute` and `regen` deleted.
- `game-client/src/data/passiveTree.ts` (traversal icon keys)
- `game-client/src/ui/PassiveTreeOverlay.ts` and its test (the tree ink, the lit plate fill, the
  lock mark drawn)
- the dev gallery (FS-1819Q) entry for the contact sheet, as slices 10 and 11 did

## What to Build

- **Ink.** Near-white ink on every tree picture. A greyed picture stays plainly dimmer.
- **Lit plate.** A lit node (available and spendable, held, max) fills its whole plate with its
  edge's token over the ground, starting at a 0.35 mix.
- **Four pictures, distinct from every kicker's:**
  - Vitality: a heart with a pulse line cut across it;
  - Might: a clenched fist, not Steady Hand's open palm;
  - Haste: a gust of three wind strokes, not Practiced Guard's hourglass;
  - Fleetness: a bare foot in stride trailing speed lines, not Fleet Foot's winged boot.
- **The lock mark.** A small padlock.
- **Contact sheet:** the four new pictures and the lock mark, plus every tree picture in the new
  ink, lit and greyed, on a plate of each size.

## Acceptance Criteria

- [ ] FS-8RZ51 §Change "Client" rows 9 and 10.
- [ ] Every new picture draws through `Knockout` with a line fallback; tests prove no fallback in a
      normal render.
- [ ] No tree code names raw hex. The ability bar still draws `BRONZE` (test).
- [ ] The contact sheet is approved by Kranti.
- [ ] `npm test`, lint, `lint:fence` and `tsc` green.

## Blocked By

I-8RZ51-17 (plate sizes and the lock-mark slot).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V29. User stories 11, 12.
