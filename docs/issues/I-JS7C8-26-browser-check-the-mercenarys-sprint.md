---
id: I-JS7C8-26
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-25]
labels: []
title: "FS-JS7C8 slice 26: the owner's browser check of the mercenary's sprint and trailing sword, attacking on the move playing the standing cut, the parry kept (HITL)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (Acceptance Criteria "HITL: Browser check"; R95, R108)

**Lane: human (HITL).** The owner plays the branch's client against the local game-service. There
is no server change on this branch. Two browsers, two players. No code unless the check finds
something; a finding becomes a new issue or an escalation.

## Acceptance Criteria

- [ ] In a run and in the town, the mercenary, the Duelist and the Sellsword run at 200 px/s with
      the sprint's lean and cadence and the trailing sword. The feet don't visibly slide, and the
      point is never on the ground.
- [ ] Setting off and stopping: the sword's jump between the idle's carry and the trailing carry,
      and from the trailing carry into a cut or a parry, reads acceptably (Edge States; a
      transition clip is out of scope).
- [ ] Attacking while moving: he stands in the pin and plays the standing `cut`. Any slide in the
      latency gap lasts a tick or two (M5, accepted). No `walk_attack` or `backpedal_attack` ever
      shows for him.
- [ ] The parry still raises and holds while guarding, standing or moving.
- [ ] A second player sees the same run, cuts and parry for him. The archer, the knight and the
      wizard are unchanged.
- [ ] With move-speed gear he still plants his feet.

## Blocked By

I-JS7C8-25

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: R95, R108; Edge States "Attacking on the move", "Setting off and stopping", "Running into a
cut", "Guarding while running", "Gear move speed", "Mixed parties", "Other players"; the
Acceptance Criteria's "HITL: Browser check".

## Files it expects to touch

None.
