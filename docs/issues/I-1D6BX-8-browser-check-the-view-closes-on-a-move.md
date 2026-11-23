---
id: I-1D6BX-8
status: open
implements: FS-1D6BX
blocked_by: [I-1D6BX-6, I-1D6BX-7]
labels: []
title: "FS-1D6BX slice 8: the owner's browser check that one step closes the container view (HITL)"
---
Implements FS-1D6BX §Change: The container view closes when its player moves

**Lane: HITL (the owner).** Client only: no server or migration step; agents never start the
backends. One browser.

## Steps

1. **One step closes it.** In a run, open a coffer (and a sack or a drop pile if one is near),
   take a single step: the view closes with no notice.
2. **E opens it again at once.** Press E standing by it: the view opens, no bar, no delay.
3. **Standing still keeps it open.** Take an item or two without moving: the view stays.
4. **The gear overlay stays.** With the bag up beside the view, step: the view closes, the bag
   stays.
5. **Field.** In the Forest, a clearing chest; in a field, a drop pile: one step closes each, E
   opens it again.
6. **Stop and E quickly** (the FS's open question). Walk up, let go and press E at once: say
   whether the view ever closes on its own as you stand. If it does, that is the round-trip edge
   the FS flags, and a decision for you.

## Blocked By

I-1D6BX-6, I-1D6BX-7

## Spec Reference

FS-1D6BX §Change: The container view closes when its player moves: the live check, Edge States
("E pressed within a round trip of letting go of the keys").
