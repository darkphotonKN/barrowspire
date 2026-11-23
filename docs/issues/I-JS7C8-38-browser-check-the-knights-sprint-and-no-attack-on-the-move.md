---
id: I-JS7C8-38
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-35]
labels: []
title: "FS-JS7C8 slice 38: the owner's browser check of the knight's sprint and of every class attacking on the move with the standing attack, after the dead code is retired (HITL)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (Acceptance Criteria "HITL: Browser check"; R141, R150, R155)

**Lane: human (HITL).** The owner plays the branch's client against the local game-service, in
two browsers with two players. There is no server change on this branch. No code unless the check
finds something; a finding becomes a new issue or an escalation. This issue is blocked by the
retirement (I-JS7C8-35), so one live check covers both the new art and the deleted code. It is not
blocked by the contact sheet (K6).

## Acceptance Criteria

- [ ] In a run and in the town, the knight, the Guardian and the Berserker run at 200 px/s with the
      sprint's lean and cadence. The feet don't visibly slide, no leg shows through the hauberk,
      the surcoat or the cloak, and the blade is carried raised.
- [ ] Attacking while moving, each class (warrior, mage, archer, mercenary) stands in the pin and
      plays its standing attack turned to the target. Any slide in the latency gap lasts a tick or
      two. No `walk_attack` or `backpedal_attack` ever shows.
- [ ] The warrior's charge (dash) holds its attack pose for its length, as before.
- [ ] The Berserker alternates hands swing by swing, standing or moving.
- [ ] A second player sees the same runs and attacks.
- [ ] With move-speed gear he still plants his feet.

## Blocked By

I-JS7C8-35

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: R141, R150, R155; Edge States "Attacking on the move", "The charge", "The
Berserker's hands", "Gear move speed", "Mixed parties", "Other players"; the Acceptance Criteria's
"HITL: Browser check".

## Files it expects to touch

None.
