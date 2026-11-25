---
id: I-KBA4Q-7
status: done
implements: FS-KBA4Q
blocked_by: [I-KBA4Q-1, I-KBA4Q-4, I-KBA4Q-6]
labels: [blocked]
title: "FS-KBA4Q slice 7: the owner's browser check (HITL)"
---
Implements FS-KBA4Q §Acceptance Criteria (Owner's check)

**Lane: HITL (the owner, in a browser).** Nothing to build. Needs game-service restarted with
slice 1 and two signed-in browsers; a second pod for the cross-pod lines where one is to hand.

## What to Check

- [ ] **Mac, Control+Option+left-click** on a bag item, a worn item and a stash item: it links,
      it does **not** wear, take off or move the item, and no browser context menu shows. Note
      the browser and its version.
- [ ] **Mac, Cmd+Option+left-click**: it links.
- [ ] If a browser reads Control+click as a right-click so that Control+Option cannot link
      (Firefox on a Mac is the known risk, FS-KBA4Q §Facts), or anything is worn by a link press:
      **escalate to the owner**. No agent picks another key.
- [ ] Ctrl+Alt+left-click on Windows or Linux, if one is to hand.
- [ ] The link press with chat closed opens it with the item in it; with a draft, the name lands
      at the caret; typing before and after it works; three links fit and a fourth is refused
      with its line.
- [ ] Opening and closing the inventory and the character panel keeps a half-typed line; I, B and
      C type letters while typing; Esc closes the input first and the panels second.
- [ ] Typing with the character panel or the stash open: the input row is usable under the panel;
      say whether the covered lines are acceptable (FS-KBA4Q R23) or the window should move.
- [ ] The tag reads as an item at a glance in each rarity and with none, idle and typing, over a
      bright field and a dark one. Tune the constants of R34 (`Tunes FS-KBA4Q`) or accept them.
- [ ] A long name near a row's end moves whole to the next row.
- [ ] Hovering a tag shows the tip, with no standing note, in the hub and in a run; it goes when
      the pointer leaves.
- [ ] Two browsers: a link sent on area, world, party and whisper shows its tag and tip on the
      other side, and on the sender's own line.
- [ ] Clicking a sender's name on a line with links still starts a whisper.
- [ ] Both hint lines read well and overlap nothing.

## Acceptance Criteria

- [ ] Every box above ticked, or its finding written here and escalated.
- [ ] The escalation candidates of FS-KBA4Q § V1 picks seen by the owner: each accepted or raised
      as a `## Change:`.

## Blocked By

I-KBA4Q-1, I-KBA4Q-4, I-KBA4Q-6

## Spec Reference

FS-KBA4Q §Acceptance Criteria "Owner's check (HITL)", R6, R23, R34, § V1 picks.
