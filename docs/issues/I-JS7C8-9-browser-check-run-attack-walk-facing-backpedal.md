---
id: I-JS7C8-9
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-1, I-JS7C8-4, I-JS7C8-5, I-JS7C8-6, I-JS7C8-7, I-JS7C8-8]
labels: []
title: "FS-JS7C8 slice 9: the owner's two-browser check of the run, the attack walk, pointer facing and the backpedal (game-client, game-service)"
---
Implements FS-JS7C8 §G (R44), §Acceptance Criteria

**Lane: human (HITL).** The owner, two browsers, two players, with game-service and the client
from this branch. No code unless the check finds something; a finding becomes a new issue or an
escalation.

## Acceptance Criteria

- [ ] Each class runs at 200 px/s without looking like speed-walking; feet roughly planted.
- [ ] Attacking while moving: the player slows to a walk for about the swing and is back to a run at once after; the legs walk at the pace the body moves. Each class's basic attack and skill; the merc's parry does not slow.
- [ ] The character faces the mouse standing, running and backpedalling, in the town, a field and a run.
- [ ] Moving away from the mouse plays the backpedal; sideways plays the side-run (accept or reject the v1 look).
- [ ] The other browser sees each player's facing, run and backpedal; an archer's Shadow Shot aim turn is not seen (ADR-0030).
- [ ] Accept or reject: an attacking ally seen as a slowed run (others' attacks are not drawn).
- [ ] Accept or reject the measured VRAM growth of the four classes.

## Blocked By

I-JS7C8-1, I-JS7C8-4, I-JS7C8-5, I-JS7C8-6, I-JS7C8-7, I-JS7C8-8

## Spec Reference

FS-JS7C8 §G R44, §Acceptance Criteria, §Edge States, §Open for the owner.
