---
id: I-WJGFJ-4
status: open
implements: FS-WJGFJ
blocked_by: [I-WJGFJ-3]
labels: [blocked]
title: "FS-WJGFJ slice 4: the chat input and who owns Enter and Esc (game-client)"
---
Implements FS-WJGFJ §Requirements C26–C28

## What to Build

The sending half: an input line under the message area of the chat window (I-WJGFJ-3), and the
rule that exactly one thing owns the keys at a time.

- **Open** (R26): with nothing else owning Enter, pressing **Enter** opens the input and
  focuses it; clicking the input line opens it too. While open, the scene's keyboard input is
  disabled the way the end-of-run overlay does it (`this.input.keyboard.enabled = false`,
  BarrowspireScene precedent), so W/A/S/D, E and ESC reach the input only and the character
  does not move.
- **Send** (R26, R28): **Enter** sends `chat {channel: "area", text}` through the SocketManager
  (which injects `player_id` and `session_id` as for every action) and closes the input;
  Enter on an empty input closes it and sends nothing. The input stops accepting characters at
  **200 code points** (count code points, not UTF-16 units, so the client and the server agree
  on emoji). An `@` prefix is sent as plain text in this slice (whisper is FS-5SH4G).
- **Cancel** (R26): **Esc** closes the input and discards the draft.
- **Close** re-enables the scene's keyboard.
- **Key ownership** (R27): when NPC dialogue, the gear overlay, a container view, the end-of-run
  overlay or any other owner of Enter/Esc is open, Enter does not open chat; when chat is open,
  those owners do not react to Enter or Esc. When the run ends while the input is open, the
  overlay takes over: the input closes and the draft is discarded. Model this as one
  "key owner" the scene consults, rather than per-feature flags, if the existing code allows.
- The input is canvas chrome: tokens only, the guideline's "Panels in the world" styling. A DOM
  `<input>` (Phaser DOM element or an overlay positioned over the canvas) is acceptable for
  text entry; a Phaser-drawn text field is acceptable too. Whichever is used, the input never
  injects text into the page as HTML.

## Acceptance Criteria

- [ ] With nothing else open, Enter opens the input; pressing W types `w` and the character
      does not move; Enter sends `chat {channel:"area", text:"w"}` and closes; the scene's
      keyboard is enabled again.
- [ ] Clicking the input line opens it.
- [ ] Esc with a draft closes the input and sends nothing; Enter on an empty input closes it
      and sends nothing.
- [ ] The 201st character is refused; a 200-code-point string of CJK is accepted.
- [ ] With NPC dialogue open, Enter advances the dialogue and does not open chat.
- [ ] With chat open, E does not interact, Esc does not dismiss dialogue, and the gear overlay
      does not open.
- [ ] With the gear overlay or a container view open, Enter does not open chat.
- [ ] The run ending while the input is open closes it and discards the draft; the end-of-run
      overlay behaves as before.
- [ ] Unit tests cover the key-ownership rules and the send payload; tests pass.

## Blocked By

I-WJGFJ-3

## Spec Reference

FS-WJGFJ §Requirements C26 (input), C27 (key ownership), C28 (channel of a sent message);
§User Stories 4–6; §Edge States (NPC dialogue / overlays open, chat input open when the run
ends, forged payload, markup in text).

## TDD Approach

- RED: a key-owner test: `enter` with no owner opens chat; with dialogue open it does not;
  with chat open, `e` and `esc` reach nothing else.
- GREEN: the owner rule and the input open/close.
- RED: send test: Enter with `"hi"` emits one `chat` with `channel:"area"`; empty emits none;
  201 characters are cut to 200 at entry.
- GREEN: the send path through the SocketManager.
