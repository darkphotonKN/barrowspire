---
id: I-TQZ5J-61
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-60]
labels: []
title: "FS-TQZ5J § Change: A conversation holds the player still, slice 2: the owner's browser check (HITL)"
---
Implements FS-TQZ5J §Change: A conversation holds the player still (the owner's check)

**Lane: HITL (Nick).** Restart the client only: no server change. No screenshots needed.

## What to Check

### The hold (R141, R142, R147)

- [ ] Walk at an NPC holding W and press E: the player stops at once (at most a step's drift) and stays
      still with W, A, S, D or the arrows held or tapped while the card is up.
- [ ] The same with a wandering resident, an indoor resident, the Confessor in the chapel and a telling
      turned with Go on.
- [ ] Close it by Esc, by Farewell, and by E on a card with only a cancel row while still holding W: the
      player walks on with no fresh press.
- [ ] A resident walking away mid-talk: its card stays up.

### The door (R143)

- [ ] Walk through the Spire gate: the door's panel opens and the player keeps walking. Walking out of
      the gate closes it, as before.

### Nothing else (R144, R145)

- [ ] Under an NPC's card: the corner icons (Menu, Inventory, Character, Party, Mailbox, Tree) each give
      the refusal sound and open nothing. I, B, C, P, T, M and Enter do nothing. The minimap's mode icon
      does not step.
- [ ] Open the party panel (or the character panel or the passive tree), then talk: the window stays
      open, the icon cannot close it, and Esc closes the card first, then the window.

### The owner's calls (derived defaults, R145, R149)

- [ ] Inside a window already open under the card, its own rows still answer (the party panel's, the
      tree's spends). Keep that, or refuse them too?
- [ ] The invite prompt, the ready check and the queue's Leave still answer under a card. Keep that, or
      refuse them too?

## Blocked By

I-TQZ5J-60

## Spec Reference

FS-TQZ5J §Change: A conversation holds the player still: R141–R150, Acceptance Criteria.
