---
id: I-JS7C8-9
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-1, I-JS7C8-10, I-JS7C8-11, I-JS7C8-12, I-JS7C8-6, I-JS7C8-7, I-JS7C8-8, I-2325V-8]
labels: []
title: "FS-JS7C8 slice 9: the owner's two-browser check of the run, the attack walk, the backward step while attacking and facing from movement (game-client, game-service)"
---
Implements FS-JS7C8 §G (R44), §Acceptance Criteria

*Reworked 2026-11-12 (owner change to FS-JS7C8): facing from movement, no pointer facing and no
facing relay; the backward step only while attacking. The file name keeps its old slug.*

**Lane: human (HITL).** The owner, two browsers, two players, with game-service and the client
from this branch. No code unless the check finds something; a finding becomes a new issue or an
escalation.

## Acceptance Criteria

- [ ] Each class runs at 200 px/s without looking like speed-walking, turned the way it moves; feet
      roughly planted.
- [ ] The character faces where it runs (the keys pressed) and keeps that facing standing; moving
      the mouse never turns it. In the town, a field and a run.
- [ ] Attacking while moving: the player slows to a walk for about the swing and is back to a run
      at once after; the legs step no faster than the body moves. Each class's basic attack and
      skill; the merc's parry does not slow.
- [ ] Attacking while moving away from the aim (more than 90°) plays the backward step; sideways or
      toward it plays `walk_attack`; crossing the line mid-swing does not restart the shot.
- [ ] Repeated swings while moving: accept or reject the legs' jump at each new swing (FS-JS7C8
      Edge States), and the attack legs' pace (R10, R21: tune at will).
- [ ] The archer's draw: the bow hand forward on the aim line, the draw straight back to the jaw,
      never across the body, in every facing (FS-2325V §Change: The archer's draw stays on the aim
      line).
- [ ] The other browser sees each player run and turn the way they move.
- [ ] Accept or reject: an attacking ally seen as a slowed run (others' attacks are not drawn).
- [ ] Accept or reject the measured VRAM growth of the four classes.

## Blocked By

I-JS7C8-1, I-JS7C8-10, I-JS7C8-11, I-JS7C8-12, I-JS7C8-6, I-JS7C8-7, I-JS7C8-8, I-2325V-8

## Spec Reference

FS-JS7C8 §G R44, §Acceptance Criteria, §Edge States, §Open for the owner; FS-2325V §Change: The
archer's draw stays on the aim line.
