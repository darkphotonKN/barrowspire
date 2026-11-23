---
id: I-JS7C8-32
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-30]
labels: []
title: "FS-JS7C8 slice 32: the owner's browser check of the wizard's sprint and pointed cast, casting on the move playing the standing cast (HITL)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (Acceptance Criteria "HITL: Browser check"; R119, R125, R132)

**Lane: human (HITL).** The owner plays the branch's client against the local game-service. There
is no server change on this branch. Two browsers, two players. No code unless the check finds
something; a finding becomes a new issue or an escalation. Blocked only by the bake (I-JS7C8-30),
not by the contact sheet (W6).

## Acceptance Criteria

- [ ] In a run and in the town, the wizard, the Spellwarden and the Pyromancer run at 200 px/s with
      the sprint's lean and cadence. The feet don't visibly slide, and no leg shows through the gown.
- [ ] A click (fireball) and a right-click (triple fireball) cast point the staff or focus at the
      target, in the facing nearest it, never over her head. Any offset of up to 22.5° from the
      true aim, and the fireball not starting at the orb, are as the FS expects (Edge States).
- [ ] Casting while moving: she stands in the pin and plays the standing cast. Any slide in the
      latency gap lasts a tick or two. No `walk_attack` or `backpedal_attack` ever shows for her.
- [ ] A second player sees the same run and casts for her. The archer and the mercenary are
      unchanged; the knight still has his attacks on the move until his item.
- [ ] With move-speed gear she still plants her feet.

## Blocked By

I-JS7C8-30

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: R119, R125, R132; Edge States "Casting on
the move", "An aim between two facings", "The fireball's start", "Gear move speed", "Mixed
parties", "Other players"; the Acceptance Criteria's "HITL: Browser check".

## Files it expects to touch

None.
