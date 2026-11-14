---
id: I-84N1G-6
status: open
implements: FS-84N1G
blocked_by: [I-84N1G-2, I-84N1G-4, I-84N1G-5]
labels: [ready-for-agent]
title: "FS-84N1G slice 6: the owner's look and listening check (HITL)"
---
Implements FS-84N1G §Acceptance Criteria (the owner's check)

**Lane: HITL (Nick).** No parity shots (FS-84N1G Amendment A2).

## What to Check

- [ ] The book above the ability card: its look (book D, the owner's pick), its label
      "Controls (H)", `menu_hover`, a press opening (`dialog_open`) and closing (`dialog_cancel`) the
      panel; gone at death, escape and the end.
- [ ] The panel's frame and ×; H, the ×, Q and Esc close it with `dialog_cancel`.
- [ ] I, B, C, T, the corner icons, Esc's menu, a chest and SETTLEMENT each close the panel, with only
      their own sound.
- [ ] The invite field hides under the panel and under the record where they meet it.
- [ ] At the door (escaped, a teammate still in), the party panel closes.

## Blocked By

Every FS-84N1G slice.

## Spec Reference

FS-84N1G Acceptance Criteria; Amendments A1, A2.
