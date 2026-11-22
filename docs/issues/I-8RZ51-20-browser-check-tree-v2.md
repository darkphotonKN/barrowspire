---
id: I-8RZ51-20
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-15, I-8RZ51-16, I-8RZ51-17, I-8RZ51-18, I-8RZ51-19]
labels: [blocked]
title: "FS-8RZ51 slice 20: browser check, tree v2 from the refund to a locked side (HITL, on Kranti's integration stack)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §Acceptance Criteria (browser check)

**HITL.** Run on a temporary integration branch off main on Kranti's stack; agents never start the
backends. It needs:

- character-service migrated to `000005`;
- character-service and game-service on the merged code, game-service redeployed;
- the client rebuilt.

## Steps

1. **The refund.** A character that held ranks before the wipe enters town. The tree shows no
   ranks, `earned(level)` points, and no title.
2. **The graph.** At 1280×720, P opens the tree. Check that:
   - it fits, clear of the corner row;
   - the links show, and plates are sized by kind;
   - the pictures are near-white, and a lit node's plate is lit.
3. **The first steps.** Spend `r1` and `r2`. Their link lights, and Max HP rises by 5 at once on
   the character panel. The Passives group shows "+5 max HP" and the class's attribute.
4. **The side ask.** Click `ua1`: "Take Haste? Thick Skin's side is gone for good." (warrior). Then:
   - No sends nothing;
   - Yes takes it, and every `upper:b` node draws locked with the lock mark. Its tooltip reads
     "Locked: you chose Heavy Hand.".
5. **Side taken over the wire.** In devtools → WS, send `spend_passive_point` for `ub1` rank 1: the
   panel shows "Locked: you chose the other side." Resend the `ua1` frame: nothing changes.
6. **Tooltips.** Hover a closed node: it names what it needs. Hover the ability: its line and
   "Cast with 3.". Hover a specialization: what it does with its numbers, and "Your look changes."
   faint and last.
7. **Optional, dev seed.** A level-9 character with the path held: `t3` is closed, "reach level
   10". A level-20 character: the spec asks, then locks the other spec.
8. **Effects.** Delve. The run's Health max includes the Vitality bonus.

## Blocked By

I-8RZ51-15, I-8RZ51-16, I-8RZ51-17, I-8RZ51-18, I-8RZ51-19.

## Spec Reference

FS-8RZ51 §Change: Tree v2 §Acceptance Criteria, §Edge States.
