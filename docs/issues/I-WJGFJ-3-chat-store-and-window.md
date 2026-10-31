---
id: I-WJGFJ-3
status: done
implements: FS-WJGFJ
blocked_by: []
labels: [ready-for-agent]
title: "FS-WJGFJ slice 3: chat store and the chat window in every world scene (game-client)"
---
Implements FS-WJGFJ §Requirements C17–C23, C29–C31, D32

**Done on branch `feat/in-game-chat`.** Chat colours are tinted from existing tokens (world
necrotic +0.2, party arcane +0.15, whisper umbraLight +0.3, trade ember +0.25) to clear 4.5:1 on
the HUD panel; no new hex. The window's mask fill uses a palette token so the file stays inside
the token fence. Checked locally by the user on 2026-10-31: two clients saw each other's lines. The look was reworked the same day in I-WJGFJ-6.

## What to Build

The receiving half of chat on the client: a store that holds the stream, and a window that
draws it in HubScene, FieldScene and BarrowspireScene. Nothing is sent yet (slice 4) and there
is no filter row yet (slice 5); build the window so both slot in without reshaping it.

- **Types** (R32): `ChatChannel` as the closed union `'area' | 'world' | 'party' | 'whisper' |
  'trade'`; a `ChatLine` with `messageId`, `channel`, `senderId`, `senderName`, `text`, `sentAt`;
  a `ChatNotice` line with `code` and `text`. The inbound `chat` and `chat_notice` payload
  shapes as FS-WJGFJ R3 and R7 define them.
- **Store** (R20, R23): a Zustand `chatStore` outside any scene. Holds the newest **100 lines**
  across every channel, notices included; the 101st drops the oldest. A line whose `messageId`
  was already seen is ignored. A scene change never clears it; only a page reload does. The
  SocketManager routes `chat` and `chat_notice` into the store.
- **Window** (R17–R19, R21–R22, R29, R31), a `ui/ChatWindow` the three world scenes mount:
  - camera-fixed, depth 1000, below overlays and popups (2000); absent from the menu scenes;
  - bottom-left; where the scene has a `ResourceHud`, the window's bottom edge is the
    ResourceHud's top edge, else the canvas bottom; the ResourceHud does not move;
  - 360 px wide, 8 lines visible, newest at the bottom, lines wrapping within the width; a
    dark-vellum carved-stone panel per the guideline's "Panels in the world"; space reserved
    above the lines for the filter row (slice 5) and below for the input (slice 4);
  - mouse wheel over the message area scrolls; while scrolled up, new lines do not move the
    view; at the bottom they appear at once;
  - line format `HH:MM  Name: text`, `HH:MM` from `sentAt` in local time, name and text in the
    channel's colour; text rendered as characters (Phaser text objects), never markup;
  - notices render as `— text` in the system colour with no name and no time;
  - the panel claims pointer events only inside itself; the world beside it keeps its clicks.
- **Colours** (R30): tokens only, from `BARROW_HEX` / `BARROW` (ADR-0013, ADR-0025): area
  `vellum`, world `necrotic`, party `arcane`, whisper `umbraLight`, trade `ember`, system
  `vellumDark`. Check each against the panel for 4.5:1; where one fails, add a lifted token
  (`necroticLight`, `emberLight`, …) to `theme.ts`, never a literal. The guideline's umbra
  widening is slice 5's job; this slice only consumes the token.

## Acceptance Criteria

- [ ] The window renders in HubScene, FieldScene and BarrowspireScene and not in
      MainMenuScene, CharacterCreationScene or GameOverScene.
- [ ] In a run with a ResourceHud the window's bottom edge equals the ResourceHud's top edge; in
      the hub and fields the window's bottom edge is the canvas bottom.
- [ ] The window is 360 px wide and shows 8 lines; the lint fence passes with no colour literal.
- [ ] 101 `chat` payloads leave 100 lines in the store, the oldest gone.
- [ ] A second `chat` with a seen `message_id` adds no line.
- [ ] Hub → field → run → hub keeps the buffer; a reload empties it.
- [ ] A line reads `HH:MM  Name: text` with the local time of `sent_at`; text `<b>x</b>` shows
      those characters.
- [ ] Scrolled up one line, a new message does not move the view; at the bottom it does.
- [ ] `chat_notice` renders `— text` in `vellumDark` with no name and no time.
- [ ] A click beside the window produces the scene's normal click behaviour.
- [ ] Every channel colour resolves to a `BARROW_HEX` token and clears 4.5:1 on the panel.
- [ ] Unit tests cover the store (cap, dedupe, routing of both actions) and the window's
      placement rule; tests pass.

## Blocked By

None. End-to-end against a live pod needs I-WJGFJ-1; the store and window are built against
the payload shapes in FS-WJGFJ R3 and R7 and can be driven by tests before that lands.

## Spec Reference

FS-WJGFJ §Requirements C17 (where it appears), C18 (position), C19 (shape), C20 (buffer), C21
(scrolling), C22 (line format), C23 (dedupe), C29 (notices), C30 (colours), C31 (pointer
events), D32 (client types); §User Stories 2, 7–9, 13, 15; §Edge States (reconnect, world
switch, handoff, markup in text, narrow canvas).

## TDD Approach

- RED: `chatStore` tests: 101 lines → 100, duplicate id ignored, `chat_notice` becomes a system
  line.
- GREEN: the store and the SocketManager routing.
- RED: `ChatWindow` placement test: given a ResourceHud top edge, the window bottom equals it;
  given none, the canvas bottom.
- GREEN: the window, mounted by the three scenes.
