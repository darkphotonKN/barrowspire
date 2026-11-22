---
id: I-1J1CB-11
status: open
implements: FS-1J1CB
blocked_by: [I-1J1CB-2, I-1J1CB-4, I-1J1CB-5, I-1J1CB-6, I-1J1CB-7, I-1J1CB-8, I-1J1CB-9, I-1J1CB-10]
labels: [blocked]
title: "FS-1J1CB slice 11: browser check, every spec look in town and a run, with the memory measured (HITL, on Kranti's integration stack)"
---
Implements FS-1J1CB §Acceptance Criteria (browser check), §C (Requirement 27)

**HITL.** Run on a temporary integration branch off main on Kranti's stack; agents never start the
backends. Needs FS-E1ZDG's wire (I-E1ZDG-1, I-E1ZDG-2) and FS-8RZ51's spend merged, and level-20
characters with each specialization (dev seed or the tier-6 pick).

## Steps

1. Town, two browsers: a Guardian and a Berserker. Each sees its own look from arrival and the
   other's after its fetch; the other is the knight meanwhile, never a placeholder. DevTools →
   Network shows one fetch of each look group.
2. The Berserker attacks three times: right, left, right. Each axe's edge leads.
3. A Spellwarden and a Shadow Ranger join: the ward and the gloom show on both screens, quiet;
   a potion's heal shimmer plays over the ward.
4. A Hunter and the Shadow Ranger each fire the right-click: Heavy Shot with a vellum aim line for
   the Hunter, the Shadow Shot for the Shadow Ranger, as each sees it and as the other sees it.
5. A party of a Pyromancer, a Duelist, a Sellsword and the Shadow Ranger delves: every look and
   aura in the run; the Shadow Ranger's back reads on the darkest floor; the Pyromancer's embers
   swing with her hem.
6. A character with no spec in the same scenes: the base figure, no aura, Heavy Shot for an archer.
7. Memory (R27): with the GPU memory read as FS-C4JWH § Verification does, record the town with all
   eight looks fetched and the run with the party of four; write the figures into the hand-back
   for the ADR's Consequences.
8. Reduced motion on: the auras hold still.

## Acceptance Criteria

- [ ] Steps 1–8 behave as written.
- [ ] The measured memory figures are recorded in the hand-back.

## Blocked By

I-1J1CB-2, I-1J1CB-4, I-1J1CB-5, I-1J1CB-6, I-1J1CB-7, I-1J1CB-8, I-1J1CB-9, I-1J1CB-10. Also the
FS-E1ZDG and FS-8RZ51 wire and spend on the integration branch.

## Spec Reference

FS-1J1CB §Acceptance Criteria (all groups); §C R27; User Stories 1–25.

## Files expected to touch

None (a check). Findings become fix issues on this FS.
