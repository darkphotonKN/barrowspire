---
id: I-TQZ5J-12
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-9, I-TQZ5J-10, I-TQZ5J-11, I-WDM0X-8]
labels: [blocked]
title: "FS-TQZ5J phase 2, slice 4: the owner's look-and-feel and listening check of the party pieces (HITL)"
---
Implements FS-TQZ5J §Change: Phase 2: the party (the owner's look-and-feel check, R45, R46); FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1), § Pass 2: the party (the listening check)

**Lane: HITL (Nick).** Restart the client only. No server change.

## What to Check

In the town, a field and the run, windowed and fullscreen, at render scale 1 and 1.5/2:

- [ ] The party panel looks, greys and answers as before: Create party, Invite (the field typing with
      an input method), Kick, Transfer, Leave, its ×; T and the Party icon open and close it; Esc
      closes it before the gear overlay; a click on it never attacks or lights a gear slot under it.
- [ ] Clicking the panel keeps the invite field typing; clicking anywhere else lets it go.
- [ ] Invite prompts (one, several, a run's greyed Accept) and the ready check look and answer as
      before, hide under the town's gear overlay, letter panel and menu, and stay clear of the chat.
- [ ] The frames, their bars and Travel look as before; a click on a frame still attacks in the run.
- [ ] R46's depth cases (shots listed in the run's report): the panel and the prompts over the run's
      controls panel, resolved card and the gear overlay's tips; the prompts over the gear overlay in
      a field and the run; the frames over the character panel and the letter panel. Accept or ask.
- [ ] The party sounds (FS-WDM0X pass 2): an invite chimes `notify_important`; the ready check
      `dialog_open`; Accept `dialog_confirm`, Decline `dialog_cancel`; the panel's buttons and Travel
      hover and click; a greyed one `menu_error`; the panel's open and close unchanged.

## Blocked By

Every party slice.

## Spec Reference

FS-TQZ5J §Change: Phase 2: the party; FS-WDM0X § Pass 2: the party.
