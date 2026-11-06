---
id: I-3V7GC-4
status: open
implements: FS-3V7GC
blocked_by: [I-3V7GC-1, I-3V7GC-2, I-3V7GC-3]
labels: []
title: "FS-3V7GC slice 4: Nick's browser check of the 2x knight, wizard and mercenary and their walk-attack (game-client)"
---
Implements FS-3V7GC §E (Requirement 15), §Acceptance Criteria

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-classes-2x`. No code unless the
check finds something; a finding becomes a new issue or an escalation.

## What to Check

Compare against local `main` side by side where you can. The agent's headless evidence is in
FS-3V7GC § Verification.

## Acceptance Criteria

- [ ] Render scale 2 (Retina or fullscreen): knight, wizard and mercenary are sharp, the look kept; at render scale 1 they look as before.
- [ ] Each stands as large as before; name plate and bars where they were; in a run each collides as before.
- [ ] Main menu hero, roster portrait (idle loop: the window must not shrink), character-creation preview, NPC dialogue bust and party-frame bust all framed as before for the three.
- [ ] Attacking while walking, each class: legs walk, upper body attacks, legs face the target. The knight's charge holds its pose; the mercenary's parry while moving slides as before. Accept or reject the known limits (moonwalk when attacking away from the motion, foot slide, stance hitch).
- [ ] All four classes: legs stay inside tunic, hauberk, coat or robe while walking and attacking; the thighs, now drawn further in under the garments (UNDER_CLEAR 0.04), look as before, the archer's too.
- [ ] Accept or reject the trimmed frames' sub-px offset at fractional render scales and on the menu hero, now on all four classes (ADR-0058 Consequences).

## Blocked By

I-3V7GC-1, I-3V7GC-2, I-3V7GC-3

## Spec Reference

FS-3V7GC §E R15, §Acceptance Criteria, §Edge States.
