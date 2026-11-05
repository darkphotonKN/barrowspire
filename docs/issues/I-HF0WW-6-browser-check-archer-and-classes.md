---
id: I-HF0WW-6
status: open
implements: FS-HF0WW
blocked_by: [I-HF0WW-1, I-HF0WW-2, I-HF0WW-3, I-HF0WW-4, I-HF0WW-5]
labels: []
title: "FS-HF0WW slice 6: Nick's browser check of the 2x archer, walk_attack and the four classes' legs (game-client)"
---
Implements FS-HF0WW §E (Requirement 28), §Acceptance Criteria

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-archer-2x-art` (Phaser 4.2.1).
No code unless the check finds something; a finding becomes a new issue or an escalation.

## What to Check

Compare against local `main` side by side where you can. Evidence from the agent's headless run
(2026-11-06) is in FS-HF0WW § Verification.

## Acceptance Criteria

- [ ] Render scale 2 (Retina or fullscreen): the archer is sharp, the look kept; at render scale 1 he looks as before.
- [ ] The archer stands as large as before; name plate and bars where they were; in a run he collides as before.
- [ ] Main menu hero, roster portrait (idle loop: the window must not shrink), character-creation preview, NPC dialogue bust and party-frame bust all framed as before.
- [ ] Shooting while walking: legs walk, upper body shoots, legs face the aim. Accept or reject the known limits: the moonwalk when kiting, about 8 % foot slide, a stance hitch per shot.
- [ ] Knight, wizard, mercenary and archer: legs stay inside the tunic or robe while walking and attacking.
- [ ] Accept or reject the trimmed archer's sub-px offset at fractional render scales (1.25, 1.5, 1.75) and on the menu hero: up to 0.5 backing px in the world and 0.87 on the menu hero, changing by up to 0.5–0.6 px between frames of a clip (ADR-0058 Consequences). Watch the idle at render scale 1.5 for a shimmer.

## Blocked By

I-HF0WW-1, I-HF0WW-2, I-HF0WW-3, I-HF0WW-4, I-HF0WW-5 (all done)

## Spec Reference

FS-HF0WW §E R28, §Acceptance Criteria, §Edge States.
