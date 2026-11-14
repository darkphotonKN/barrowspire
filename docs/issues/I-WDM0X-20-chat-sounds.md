---
id: I-WDM0X-20
status: done
implements: FS-WDM0X
blocked_by: []
labels: [ready-for-agent]
title: "FS-WDM0X pass 2 (chat): the chat window's tab, picker, hover and refusal sounds"
---
Implements FS-WDM0X §Pass 2: the chat (C1–C5)

Numbered 20+ so as not to meet ids the parallel batch-4 run may take on FS-WDM0X.

## What to Build

The chat window plays through its game's UI bridge (`mountChatWindow` reads it): `menu_tab` on a tab
press; `menu_dropdown_open` / `menu_dropdown_close` as the player opens and shuts the picker's list;
`menu_hover` on entering a tab or a pickable row; `menu_error` on Enter refused on a whisper draft.

## Acceptance Criteria

- [ ] C1–C5 as the FS's acceptance criteria (pass 2, the chat) say, by the window's and the input's tests.
- [ ] No world scene changes for it.
- [ ] Full vitest, tsc, lint, lint:fence.

## Blocked By

None

## TDD Approach

- RED: `ChatWindow.test.ts` / `chatInput.test.ts`: a tab press plays `menu_tab`; the picker's open and
  close; the hover once per row; `@Name` + Enter plays `menu_error`.
- GREEN: a `play` dep on the input and the window.
