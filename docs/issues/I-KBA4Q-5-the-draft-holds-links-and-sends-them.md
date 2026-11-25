---
id: I-KBA4Q-5
status: done
implements: FS-KBA4Q
blocked_by: [I-KBA4Q-3]
labels: [blocked]
title: "FS-KBA4Q slice 5: the chat input holds links beside the draft and sends them"
---
Implements FS-KBA4Q §Requirements B (R9–R17), D (R24)

**Lane: AFK (game-client).** No server change. The pod's side is slice 1; this slice is tested
against the send callback.

## What to Build

`ChatInput` gains one way in, a link of an item: it writes `[Name]` at the field's caret
(replacing a selection, the caret landing after `]`), keeps the item's snapshot as a held link in
text order, and opens the input if it was closed and chat may open. Three paired links at most;
a fourth, and a token that would pass the 200 code points (a whisper's message alone), insert
nothing, play `menu_error` and add their client-held system line. An unlinkable name does
nothing. Enter sends `items`: the paired snapshots in text order, left out when none pair. Held
links go with the draft wherever it is dropped and stay wherever it is kept; a recalled sent line
carries none, and the draft that comes back carries its own. The snapshot is built from the
overlay's `ItemState` and carries only the fields of §The item snapshot.

## Expected files

- `game-client/src/ui/chatInput.ts` (held links, `link(item)`, the limits, send, drop, recall;
  `ChatSend.items?`; `ChatInputField` gains a caret insert) and its test
- `game-client/src/ui/chatInputField.ts` (insert at the caret; the caret a blurred field keeps)
- `game-client/src/ui/chatItemLinks.ts` (the snapshot builder from `ItemState`; the linkable-name
  check) and its test
- `game-client/src/ui/chatPiece.ts`, `game-client/src/assets/types/client.ts` (the line sent on
  the socket carries `items`)
- Not expected: `GearOverlay.ts`, `ChatWindow.ts` (slice 6 joins them)

## Acceptance Criteria

- [ ] FS-KBA4Q §Acceptance Criteria "Client: linking": the caret insert, the fourth-link and
      no-room refusals, what a snapshot never carries, the edited and deleted token, the same
      item twice and two items of one name, Esc / world press / recall.
- [ ] A link with the input closed and `mayOpen` false changes nothing (R7).
- [ ] A link while an input method composes is ignored.
- [ ] A line with no paired link is sent exactly as today, with no `items` member.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

I-KBA4Q-3 (the snapshot type and the pairing rule in `chatItemLinks.ts`)

## Spec Reference

FS-KBA4Q R3 (what a link writes, as the input's part), R7, R9 (held links), R10 (pairing), R11
(three), R12 (the limit), R13 (unlinkable names), R14 (sending), R15 (dropping), R16 (recall),
R17 (the snapshot), R24 (the inbound member). User stories 4, 5, 8, 9, 10.

## TDD Approach

- RED: `input.link(sword)` on a closed input with `mayOpen` true gives `field.value === "[Rusty Blade]"` and requests focus.
- GREEN: the caret insert and the held list.
- RED: Enter after a link calls `send` with `items: [snapshot]`; after an edit inside the token,
  with no `items`.
- Then the limits, drop, keep and recall cases.
