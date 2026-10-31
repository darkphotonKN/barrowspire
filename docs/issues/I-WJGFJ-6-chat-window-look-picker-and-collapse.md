---
id: I-WJGFJ-6
status: done
implements: FS-WJGFJ
blocked_by: []
labels: [ready-for-agent]
title: "FS-WJGFJ slice 6: the chat window's look, a channel picker with prefixes, and collapsing (game-client)"
---
Implements FS-WJGFJ §Amendment 2026-10-31 (the window's look, a channel picker, collapsing)

**Done on branch `feat/in-game-chat`.** Shown tabs sit on a ground darker than the panel with a
channel-coloured underline (a lighter fill would pull channel colours under 4.5:1); the input row
is the darkest ramp token. The picker is a native `<select>` beside the text field in the same DOM
element. Not yet checked by eye in a running client.

## What to Build

The user's pass over the window after seeing it run (2026-10-31):

- Lines read `Name: text`, no time (R22 amended). The area label goes (R25 removed).
- The filter toggles look like joined tab segments; behaviour unchanged (R24).
- A divider between the lines and the input row; the input row on a near-black ground; a finer
  panel frame (R19).
- A channel picker at the input row's left, all five listed, only open channels selectable
  (today Area). Prefixes `#` World, `$` Trade, `%` Party, `@` Whisper, none for Area, kept in
  step both ways with the picker; a closed channel's prefix is plain text; a sent line carries the
  channel and the text without its prefix (R28 replaced).
- A button folds the window to its input row and back; the state is kept in this browser; a
  folded window still sends on Enter and is not unfolded by arriving lines.

## Acceptance Criteria

- [ ] A line renders as `Name: text`; no area label is drawn.
- [ ] Five tab segments with separators; a hidden channel's segment dim; toggling unchanged.
- [ ] A divider sits between the message area and the input row; the input row ground is the
      darkest ramp token; no colour literal (fence passes).
- [ ] The picker lists Area, World, Party, Whisper, Trade; only Area is selectable today.
- [ ] Picking an open channel writes its prefix at the start of the input; typing an open
      channel's prefix picks it; deleting the prefix returns to Area; a closed channel's prefix
      stays plain text on Area.
- [ ] Enter sends `{ channel, text }` with the prefix stripped.
- [ ] The fold button folds to the input row and unfolds; the state survives a reload; a folded
      window still sends; a new line does not unfold it; storage failing leaves it unfolded.
- [ ] Tests pass; typecheck and lint clean.

## Blocked By

None

## Spec Reference

FS-WJGFJ §Amendment 2026-10-31 (the window's look, a channel picker, collapsing), amending R19,
R22, R24, R25, R28.
