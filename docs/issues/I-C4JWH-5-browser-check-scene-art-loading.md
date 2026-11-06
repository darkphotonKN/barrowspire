---
id: I-C4JWH-5
status: open
implements: FS-C4JWH
blocked_by: [I-C4JWH-1, I-C4JWH-2, I-C4JWH-3, I-C4JWH-4]
labels: []
title: "FS-C4JWH slice 5: Nick's browser check of per-scene art loading, eviction and the torch bar (game-client)"
---
Implements FS-C4JWH §F (Requirement 24), §Acceptance Criteria

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-scene-art-loading`. No code unless
the check finds something; a finding becomes a new issue or an escalation.

## What to Check

The agent's headless figures and round trip are in FS-C4JWH § Verification. Compare with local
`main` where you can. Chrome's task manager ("GPU memory") or `about:gpu` gives a rough figure.

## Acceptance Criteria

- [ ] Boot and the main menu: the torch bar as before, then the menu's class figures as before; the menu comes up no later than on main.
- [ ] Hub: townsfolk, NPC dialogue busts and party busts drawn as before; the bar shows only when the folk had to download.
- [ ] Gentle Meadows: boars and elite boars from the first frame; Forlorn Forest: zombies and ghosts from the first frame.
- [ ] A run: ghouls, trolls and, on the top floor, the demon drawn, none as a grey box; climbing shows no bar and no wait.
- [ ] hub → meadows → hub → forest → hub → run → hub: every entry looks as the first did, no grey boxes, no freeze, nothing in the console.
- [ ] Switch character from the hub to the main menu and back: the hub's folk come back.
- [ ] Accept or reject the bar's look on a world entry (the boot screen's bar over a blank canvas) and how long it shows on a re-entry.
- [ ] GPU memory in a run and in the hub is visibly below main's.

## Blocked By

I-C4JWH-1, I-C4JWH-2, I-C4JWH-3, I-C4JWH-4

## Spec Reference

FS-C4JWH §F R24, §Acceptance Criteria, §Edge States.
