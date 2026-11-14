---
id: I-TQZ5J-12
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-9, I-TQZ5J-10, I-TQZ5J-11, I-WDM0X-8]
labels: [ready-for-agent]
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

## Where each party sound plays after pass 2

| Sound | Where | When |
|---|---|---|
| `notify_important` | any world | a party invite is received (a new invite in the store), shown now or waiting hidden; once per invite |
| `dialog_open` | the town | the ready check opens (a new check), for the leader and every member, shown now or hidden |
| `dialog_confirm` | invite prompt; ready check | *Accept* |
| `dialog_cancel` | invite prompt; ready check | *Decline* |
| `menu_hover` | party panel; frames | the pointer onto a live *Create party*, *Invite*, *Leave party*, *Kick*, *Transfer*, or *Travel* |
| `menu_click` | party panel; frames | one of those pressed (on its release), beside its command |
| `menu_error` | party panel; frames; invite prompt | a press on a greyed one: the panel's buttons greyed by role or lock (a run's *Invite*), *Travel* greyed (a field, the run, the leader away), the prompt's *Accept* in a run |
| `party_open` / `party_close` | every world | unchanged: T, the Party icon, the panel's ×, Esc, the letter panel or the menu shutting it |

No hover on the prompt's or the ready check's buttons, nor on the panel's × (no sound is named for
them). Enter in the invite field plays nothing (typing, not an option). The invite prompt appearing
plays nothing beyond the invite's `notify_important` (one event, one sound).

## Parity, as run (2026-11-14)

Harness `game-client/tmp/ui-scene-corner/` (`party-build.mjs`, `party.mjs`; git-ignored): before =
ecb92ba9 (the party pieces mounted by the world), after = the branch (the UI scene's), the resident
art loaded so the frames cut real busts, the clock fixed and motion reduced so countdowns and the
skeleton pulse stand still. **186 of 186 shots pixel-equal**: the panel (no party, leader, member,
greyed in the run, the × lit, a button under the pointer), one and two invite prompts, the prompt
stepped aside for the panel, the ready check (member and leader), the frames (leader with a skeleton
row, member with Travel live in the town and faint elsewhere), in the town, a field and the run, at
render scale 1, 1.5 and 2, windowed (1080×720) and fullscreen (1920×1080).

R46's depth cases (before/after pairs under `/private/tmp/claude-501/-Users-nick-projects-barrowspire/e7f028ee-e2d1-4894-9da7-e10f345b4846/scratchpad/ui-scene/p2-party/depth/party-before|party-after/`):

| Case | Result |
|---|---|
| run: the panel and the controls panel (1200) | differs: the panel now over it (`run-dpr1-windowed-leader_panel-under-controls.png`, `run-dpr2-fullscreen-…`) |
| run: the panel and the resolved card (1500) | differs: the panel now over it (`run-dpr1-windowed-leader_panel-under-card.png`, `run-dpr2-fullscreen-…`) |
| field: the panel and a gear item tip (2200) | differs: the panel now over the tip (`field-dpr1-windowed-leader_panel-under-gear-tip.png`, `field-dpr2-fullscreen-…`) |
| town and run: the frames and the gear overlay's character panel (1100) | differs: **the frames now draw over the character panel's top left** (`hub-dpr1-windowed-leader-under-gear-character.png`, `run-dpr1-windowed-…`, both fullscreen) |
| town: the frames and the letter panel (1800) | differs at 1×, windowed only (2700 px at the frames' right edge): the frames over the letter panel's left edge (`hub-dpr1-windowed-leader-under-letter.png`); equal fullscreen |
| two invite prompts and the controls panel, the resolved card, the gear overlay (field, run) | equal: they do not meet |

## Owner answers (2026-11-14)

- The invite plays one sound only, notify_important, with no dialog_open as well: 「1只播一個」.
- Greyed party buttons take their press for menu_error, so a greyed Travel no longer attacks: 「2 ok」.

The look-and-feel and listening check itself is still open.
