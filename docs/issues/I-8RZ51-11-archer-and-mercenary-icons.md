---
id: I-8RZ51-11
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-10]
labels: [blocked]
title: "FS-8RZ51 slice 11: the archer's and mercenary's seven node icons, and the 33-picture contact sheet (game-client)"
---
Implements FS-8RZ51 §G R40

**Author: agent.** As slice 10: built in code, `Knockout` (ADR-0080), line-glyph fallbacks.
Gate: a contact sheet of all 33 tree pictures (4 filler, 28 class, the corner icon), approved.

## Files it expects to touch

- `game-client/src/ui/knockoutPassiveArcher.ts`, `knockoutPassiveMercenary.ts` (new)
- `game-client/src/data/passiveTree.ts` (icon keys)
- their tests; the dev gallery entry for the full sheet

## What to Build

Seven pictures each for the archer (Quick Draw, Fleet Foot, Arrow Rain, Eagle Eye, Hunter's Breath,
Hunter, Shadow Ranger) and the mercenary (Keen Edge, Practiced Guard, Settle the Debt, Bloodied
Riposte, Steady Hand, Duelist, Sellsword), in the language slice 10 set, and one sheet of all 33
side by side so the set reads as one family.

## Acceptance Criteria

- [ ] 14 pictures through `Knockout` with fallbacks; no node of any class draws its fallback glyph
      in a normal render.
- [ ] The 33-picture contact sheet approved.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-10 (the icon language and the filler set the full sheet shows).

## Spec Reference

FS-8RZ51 §G R40, §Acceptance Criteria (33 pictures). User story 26.
