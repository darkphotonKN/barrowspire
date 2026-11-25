---
id: I-VPD8Y-8
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-7]
labels: []
title: "FS-VPD8Y § Change: Opening the stash holds the player still, slice 2: the owner's browser check (HITL)"
---
Implements FS-VPD8Y §Change: Opening the stash holds the player still (the owner's check)

**Lane: HITL (Nick).** Restart the client only: no server change. No screenshots needed.

## What to Check

### The hold (R45, R47, R49)

- [ ] Walk at the stash chest holding W and press E: the stash opens, the player stops at once (at most
      a step's drift) and stays still with W, A, S, D or the arrows held or tapped while it is open.
- [ ] Close it by Esc, by I, by B and by a panel's × while still holding W: the player walks on with no fresh
      press.
- [ ] Move items bag ↔ stash with the stash open: the gestures, the busy state and the toasts answer as
      before, and the player stays put (R50, R51).

### The plain overlay (R46)

- [ ] Away from the chest, I or B opens the overlay and the player still walks with it open.

### Leaving (Edge States)

- [ ] Open the stash, then press the Menu icon: the menu takes over, and closing it with W held walks
      on.
- [ ] Join the queue, then open the stash and let the match pop with it open: the run moves as usual,
      and back in town the stash is closed and the keys are free.

## Blocked By

I-VPD8Y-7

## Spec Reference

FS-VPD8Y §Change: Opening the stash holds the player still: R45–R51, Acceptance Criteria, Edge States.
