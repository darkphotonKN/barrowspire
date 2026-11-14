---
id: I-WDM0X-21
status: open
implements: FS-WDM0X
blocked_by: [I-WDM0X-20]
labels: [ready-for-agent]
title: "FS-WDM0X pass 2 (chat): the owner's listening check of the chat sounds (HITL)"
---
Implements FS-WDM0X §Pass 2: the chat (the owner's listening check)

**Lane: HITL (Nick).** Restart the client only.

## Where each sound plays

| Effect | Plays when | Where | Silent on purpose |
|---|---|---|---|
| `menu_tab` | a channel tab (Area, World, Party, Whisper) is pressed: it shows or hides that channel's lines | town, field, run | — |
| `menu_dropdown_open` | the channel picker at the input row's left is pressed with its list shut | town, field, run | refused while the menu, a window or a dialogue owns the keys |
| `menu_dropdown_close` | the open list is shut by you: the picker pressed again, a press anywhere outside the list, Esc in the list, a row picked (click or Enter) | town, field, run | Tab and typing (they shut it as typing), a window resize, the keys taken by the game, a press on another UI piece (its own sound) |
| `menu_hover` | the pointer comes onto a tab, or onto a row of the open list | town, field, run | the picker itself, the fold button, a name in the lines, the arrow keys, a tab under a window |
| `menu_error` | Enter on a whisper with a name but no message (`@Name`), or no name (`@ hi`): it is not sent, the draft stays | town, field, run | Enter on nothing (it closes); the 200-character cut |

## What to Check

- [ ] Each row above, once per action, never two sounds for one press.
- [ ] Accept C3's silent cases (Tab, typing) or ask for a sound.
- [ ] Sound effects at 0: all silent.
