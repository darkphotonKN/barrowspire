---
id: I-JS7C8-20
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-19]
labels: []
title: "FS-JS7C8 slice 20: the owner's browser check of the archer's sprint and low-ready bow, attacking on the move playing the standing shot (HITL)"
---
Implements FS-JS7C8 §Change: The archer's sprint and low-ready bow (Acceptance Criteria "HITL:
Browser check"; R68, R80)

**Lane: human (HITL).** The owner plays the branch's client against the local game-service (no
server change on this branch). Two browsers, two players. No code unless the check finds
something; a finding becomes a new issue or an escalation.

## Acceptance Criteria

- [ ] In a run and in the town, the archer, the Hunter and the Shadow Ranger run at 200 px/s with
      the sprint's lean and cadence and the low-ready bow, the feet not sliding.
- [ ] Setting off and stopping: the bow's jump between the idle's carry and the low-ready, and
      between the low-ready and the shot, reads acceptably (Edge States; a transition clip is out
      of scope).
- [ ] Attacking while moving: the archer stands in the pin and plays the standing shot. Any slide
      in the latency gap is a tick or two (D7, accepted); no `walk_attack` or `backpedal_attack`
      ever shows for her.
- [ ] A second player sees the same run and the same standing shots for her; the knight, the
      wizard and the mercenary are unchanged.
- [ ] With move-speed gear she still plants her feet.

## Blocked By

I-JS7C8-19

## Spec Reference

FS-JS7C8 §Change: The archer's sprint and low-ready bow: R68, R80; Edge States "Attacking on the
move", "Setting off and stopping", "Running into a shot", "Gear move speed", "Mixed parties",
"Other players"; the Acceptance Criteria's "HITL: Browser check".

## Files it expects to touch

None.
