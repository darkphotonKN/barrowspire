---
id: I-8RZ51-12
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-4, I-8RZ51-5, I-8RZ51-6, I-8RZ51-8, I-8RZ51-9, I-8RZ51-11]
labels: [blocked]
title: "FS-8RZ51 slice 12: browser check, a point earned, spent in town and felt in a run (HITL, on Kranti's integration stack)"
---
Implements FS-8RZ51 §Acceptance Criteria (browser check)

**HITL.** Run on a temporary integration branch off main on Kranti's stack; agents never start
the backends. Needs character-service migrated (000004), character-service and game-service on the
merged code, the client rebuilt.

## Steps

1. A level-1 character in town: P opens the tree; every tier-1 node greyed, "Reach level 2 for your
   first point."; no marker on the corner icon. P again closes it.
2. Delve and reach level 2 or more. In the run the marker shows, the header counts the points, a
   click on a node does nothing and the footer says "Points are spent in town."
3. Back in town: spend `t1a` rank 1. The node reads 1 / 2, the header one lower, the character
   panel's Health max and its Passives group rise at once; the marker clears at 0.
4. In devtools → Network → WS, resend the same `spend_passive_point` frame: nothing changes.
   A refused spend (step 7 or 8) shows its words in the panel and never logs you out.
5. Hover every node of the class: each tooltip shows its ranks, the R3 kicker and, when locked,
   why.
6. Delve again: the run's Health max includes the bonus.
7. Queue for a delve and try a spend: "Leave the queue to spend points."
8. Stop character-service and spend: "Could not save the point. Try again."; start it and retry.
9. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)* **The UI scene.** With the tree open in a run, click on the panel over a monster: no
   attack, no hold. Open chat and type a word with a P in it: the tree does not toggle. Open the tree
   while aiming Shadow Shot: the aim ends. Walk from town into a field with the tree open: it is the
   same overlay, the corner icon and its marker stay, nothing is drawn twice.
10. Optional, a level-20 character (dev seed): the tier-6 click asks once; Yes takes it and closes
   the other node.

## Blocked By

I-8RZ51-4, I-8RZ51-5, I-8RZ51-6, I-8RZ51-8, I-8RZ51-9, I-8RZ51-11.

## Spec Reference

FS-8RZ51 §Acceptance Criteria, §Edge States.
