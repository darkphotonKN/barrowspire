---
id: I-7TGZ3-3
status: open
implements: FS-7TGZ3
blocked_by: [I-7TGZ3-1, I-7TGZ3-2]
labels: []
title: "FS-7TGZ3 slice 3: Nick's browser check of the purse line in the hub, a run and a field world (game-client)"
---
Implements FS-7TGZ3 §E (Requirement 14), §Acceptance Criteria

**Lane: human (HITL).** Nick, in a real browser, on `feat/client-gear-gold`. No code unless the
check finds something; a finding becomes a new issue or an escalation.

## Acceptance Criteria

- [x] Hub, `I` or `B`: the coin icon and your total gold sit under the bag grid, left-aligned with it, above the hint; it reads as part of the panel (vellum text, no amber).
- [ ] The total matches the marketplace page's wallet; hovering shows "Available X · Held in bids Y" and the numbers match what you have bid.
- [ ] Stash chest (stash mode): the same line shows.
- [x] Take a letter with gold from the mailbox, then open the overlay: the new total shows at once.
- [ ] In a run and in a field world, the line shows the same total.
- [ ] With the gateway stopped (or wallet-service down), opening the overlay shows "—" and no toast.
- [ ] Accept or reject the look at render scale 2 (fullscreen or Retina): the coin icon is crisp enough at its size.

Checked 2026-11-06 on local main (Nick): the hub line shows, and a 1000-gold test letter (sent with the admin API) raised the total after Take. The rest is still open.

## Blocked By

I-7TGZ3-1, I-7TGZ3-2.

## Spec Reference

FS-7TGZ3 §E R14, §Acceptance Criteria, §Edge States.
