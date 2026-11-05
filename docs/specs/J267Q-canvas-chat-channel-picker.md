# FS-J267Q: Canvas chat channel picker

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Chat" → "Canvas chat channel picker" → this FS · Supersedes in part: [FS-WJGFJ](WJGFJ-in-game-chat.md) (shipped), its "Amendment 2026-10-31" R28 picker note (as amended 2026-11-03) for how the picker is drawn and worked, and its R26 idle-row note ("the input row is one browser element") · Related ADRs: [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md) (tokens only, the fence), [ADR-0025](../adr/0025-the-web-ui-and-the-game-canvas-have-separate-palettes.md) (canvas chrome on the game palette), [ADR-0056](../adr/0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md) (the window in logical units at the render scale) · Builds on: [FS-ZAJMH](ZAJMH-hd-canvas-and-fullscreen.md) R5, R13, R15 · Vocabulary: [`game-client/CONTEXT.md`](../../game-client/CONTEXT.md) § Chat terms · Surface: game-client only · Asked by Nick 2026-11-06 after FS-WJGFJ shipped; charter approved the same day. **[charter default]** marks a choice the charter proposed and Nick approved without objection.

## Summary

The chat window's channel picker was a native `<select>`: pressing it opened the browser's own
list, in the operating system's look, over the game. It becomes a dropdown drawn on the canvas in
the chat window's own style, opening upward over the chat lines, and Tab cycles the channel
without opening it. The text field beside it stays a browser field, because only a browser field
lets an input method (Chinese, Japanese, Korean) reach the game.

The channel rules do not change, and this spec does not restate them as new: which channels are
listed (FS-WJGFJ R24 as amended 2026-11-03: Area, World, Party, Whisper; Trade hidden), which can
be picked (`CHAT_OPEN_CHANNELS`), Area as the default, the prefixes, and what a sent line carries
(FS-WJGFJ R28 as replaced 2026-10-31). This spec changes only how the picker is drawn and worked.

## Requirements

1. **R1 (where it is drawn):** the picker, its `▾`, the divider between it and the text field,
   and the input row's frame are drawn on the canvas with the chat window's own kit (the graphics
   layer and text the tabs use; the menu panel's register for the list). The browser element is
   the text field alone, placed right of the picker. No UI library. Drawing the divider on the
   canvas means a half-pixel offset between the browser layer and the canvas at a fractional
   render scale never shows as a seam. **[charter default]**
2. **R2 (closed look):** the current channel's name in its colour (FS-WJGFJ R30) and a `▾` in the
   same colour, at the window's 14 px body serif; the same face idle and typing, as the row it
   sits in (FS-WJGFJ 2026-10-31 "one look, no jump"). Game palette tokens only (ADR-0013,
   ADR-0025). **[charter default]**
3. **R3 (the list):** pressing the picker opens a list of the shown channels in order,
   **upward** from the input row over the chat lines, left-aligned with the picker; it never lies
   over the text field, which always draws above the canvas. The look is the ESC menu's and the
   tabs' family: the input row's near-black ground, a fine brass frame, each channel's name in its
   own colour, a highlight on the row under the pointer or the keys. A channel the server does not
   relay yet is drawn dim and can be neither highlighted nor picked; a hidden channel (Trade) is
   not listed. The current channel is the highlighted row when the list opens. **[charter
   default]**
4. **R4 (picking with the pointer):** a release on a pickable row picks its channel (as the
   native picker did: its prefix replaces the draft's), the list closes and the text field keeps
   focus, so typing goes on. Pressing the picker opens the input as a press anywhere on the bar
   does (FS-WJGFJ R26), unless something else owns the keys (FS-WJGFJ R27), and toggles the list.
   A press anywhere outside the list and the picker closes the list; a press in the world also
   lets go of the input as before. The list and the picker are the window's (FS-WJGFJ R31): a
   press on them never moves or attacks. **[charter default]**
5. **R5 (keys):** while the text field has focus and no input method is composing, **Tab** picks
   the next pickable channel in the list's order, wrapping, and **Shift+Tab** the previous one;
   the browser's own focus move is prevented, so the field never loses focus to Tab. Tab was free:
   the open field stops every key before the game hears it and the scene's keyboard is off
   (FS-WJGFJ R26), so the run's Tab (the next player to watch, FS-QPDKN) does not fire while
   typing; the hub and the fields bind no Tab. While the list is open, **↑/↓** move the highlight
   over the pickable rows (stopping at either end), **Enter** picks the highlighted row (it does
   not send), and **Esc** closes the list only: the input stays open with its draft, and the
   game's ESC menu does not open. Tab with the list open closes it and picks the next channel.
   While an input method composes, every one of these keys is the input method's. **[charter
   default]**
6. **R6 (closing):** the list also closes when the input closes for any reason (Enter on nothing,
   Esc with the list shut, a press in the world, the keys taken by an overlay), when the player
   types, and when the logical view changes size. **[charter default]**
7. **R7 (accessibility):** a screen reader cannot read the canvas, so the text field's accessible
   name carries the current channel: `Chat — Area`, `Chat — World`, and so on, kept in step with
   every way the channel changes (a pick, Tab, a typed prefix, a recalled line, a clicked name).
   **[charter default]**
8. **R8 (scale and visibility):** the picker's and the list's text is drawn at the render scale
   and crisped again when it changes (FS-ZAJMH R5); they follow the window when it moves
   (FS-WJGFJ R18) and re-lay out when the logical view changes (FS-ZAJMH R13); their hit tests read
   logical units (FS-ZAJMH R15). The picker is hidden whenever the text field is (while something
   else owns the keys), and the list with it. **[charter default]**

## User Stories

1. As a player, I want the channel picker to look like the rest of the chat window, so that the
   operating system's own list never breaks the game's look.
2. As a player, I want the picker to read the channel my next line goes to, in that channel's
   colour, so that I know where I am talking before I press Enter.
3. As a player, I want the picker to look the same whether I am typing or not, so that the row
   never jumps when I open the input.
4. As a player, I want pressing the picker to open the input and the list at once, so that one
   press gets me from playing to choosing a channel.
5. As a player, I want the list to open upward over the chat lines, so that it never hides the
   line I am typing.
6. As a player, I want to see only the channels the window offers, so that the list matches the
   filter tabs and Trade does not show before it exists.
7. As a player, I want a channel the server does not relay yet shown dim and unpickable, so that I
   never pick a channel that cannot carry my line.
8. As a player, I want the row under my pointer highlighted, so that I can see which channel a
   release will pick.
9. As a player, I want releasing on a channel to pick it and keep my draft, its prefix swapped, so
   that I can change channel mid-line without retyping.
10. As a player, I want the field to keep focus after I pick, so that I can go straight on typing.
11. As a player, I want a press anywhere outside the list to close it, so that I can dismiss it
    without picking.
12. As a player, I want a press on the picker or the list never to move or attack, so that using
    the chat does not walk my character into danger.
13. As a player, I want Tab to move to the next channel and Shift+Tab to the previous, so that I
    can switch channel without the mouse.
14. As a player, I want Tab to wrap round from the last channel to the first, so that I can keep
    pressing one key to reach any channel.
15. As a player, I want Tab never to move the browser's focus off the chat field, so that I keep
    typing where I was.
16. As a player in a run, I want Tab while typing to change channel and not switch the delver I
    watch, so that the two uses of Tab never collide.
17. As a player with the list open, I want ↑ and ↓ to move the highlight and Enter to pick, so
    that I can choose from the list by keyboard.
18. As a player with the list open, I want Enter to pick and not send, so that choosing a channel
    never sends a half-written line.
19. As a player with the list open, I want Esc to close only the list, so that I keep my draft and
    the game's menu does not open.
20. As a player typing Chinese, Japanese or Korean, I want Tab, the arrows, Enter and Esc to stay
    my input method's while it composes, so that the picker never steals a key mid-character.
21. As a player, I want the list to close when I start typing, so that it does not hang over the
    chat while I write.
22. As a player, I want the list to close when the input closes or an overlay takes the keys, so
    that it never lingers over a dialogue or the end-of-run card.
23. As a player, I want the picker hidden whenever the chat field is, so that the two halves of
    the row never come apart.
24. As a player using a screen reader, I want the chat field to say which channel it sends to, so
    that I know where my line will go though I cannot see the canvas picker.
25. As a player on a high-density screen, I want the picker and its list as crisp as the rest of
    the window, so that they never read blurred.
26. As a player who resizes the window or goes fullscreen, I want the picker to follow the chat
    window, and an open list to close, so that nothing is left drawn in the wrong place.
27. As a player at a fractional render scale, I want no seam between the picker and the field, so
    that the row reads as one piece.

## Acceptance Criteria

- [ ] The input row's browser element holds the text field only; no `<select>` is made.
- [ ] The picker reads the current channel in its colour with a `▾`; the divider is drawn on the
      canvas.
- [ ] Pressing the picker opens the input and a list above the input row, inside the message
      area, not over the text field; rows are Area, World, Party, Whisper, each in its colour;
      Trade is absent; a channel not in `CHAT_OPEN_CHANNELS` is dim and does nothing when
      released on.
- [ ] Releasing on World with `hi` typed leaves `#hi` in the field, the picker on World, the list
      shut and the field focused.
- [ ] A press outside the list closes it; a press on the picker or the list is covered by the
      window (`covers`), so the scene neither moves nor attacks.
- [ ] Tab in the field picks the next open channel and wraps; Shift+Tab the previous; the
      browser's default is prevented; Tab while composing does nothing.
- [ ] With the list open: ↓/↑ move over pickable rows only, Enter picks and sends nothing, Esc
      closes the list and leaves the input open with its draft.
- [ ] The field's accessible name is `Chat — <Channel>` after every channel change.
- [ ] The picker hides with the field while an overlay owns the keys; the list closes then.
- [ ] Colours are palette tokens; the lint fence passes.

## Edge States

- **Folded window:** pressing the picker opens the input, which unfolds the window (FS-WJGFJ
  2026-10-31), so the list always opens over the lines.
- **Overlay takes the keys with the list open:** the list closes with the input; the picker hides
  with the field.
- **Every channel but the current one closed:** Tab stays on the current channel.
- **Render scale changes with the list open:** the list's text is crisped again; a change of the
  logical view's size closes it.
- **Something else owns the keys when the picker is pressed:** the input does not open and the
  list stays shut (FS-WJGFJ R27); the picker is hidden then in any case (R8).
- **Release on a dim row:** nothing is picked and the list stays open.
- **An input method composing:** Tab, the arrows, Enter and Esc are its own; the list neither
  moves nor closes on them.

## Out of Scope

- Opening the list from the keyboard: Tab cycles without it; the native picker's keyboard opening
  is not carried over.
- Type-to-select in the list.
- A scrolling list: four rows fit.
- Any change to the channel rules: which channels are shown, which are open, the prefixes, what a
  sent line carries (FS-WJGFJ R24, R28).
- Drawing the text field itself on the canvas: it stays a browser field for input methods.
