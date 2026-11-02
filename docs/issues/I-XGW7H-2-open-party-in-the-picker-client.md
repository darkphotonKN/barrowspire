---
id: I-XGW7H-2
status: open
implements: FS-XGW7H
blocked_by: []
labels: [ready-for-agent]
title: "FS-XGW7H slice 2: Party is selectable in the chat picker, never greyed (game-client)"
---
Implements FS-XGW7H §Requirements C18–C21, §D Wire contract

Runs in parallel with I-XGW7H-1 against the wire below.

## What to Build

Open the `party` channel on the client. FS-WJGFJ already drew the Party tab, the arcane colour,
the `%` prefix handling and the picker; only the gate moves.

- `CHAT_OPEN_CHANNELS` (`src/ui/chatInput.ts`) gains `party`: the picker's Party option is
  enabled, picking it writes `%`, typing `%` first picks it, deleting the prefix returns to Area
  (C18). A sent line carries `channel: "party"` and the text without the prefix. Update the set's
  doc comment (party opened with FS-XGW7H).
- Party is pickable whatever the party store holds; no party check anywhere on the client (C19).
- A received party line draws in `palette.chatParty`, hides with the Party tab, keeps its own
  100-line buffer, and is rendered whether or not the party store shows a party; `scope` is carried
  and unused (C20). No change expected beyond tests.
- `no_party` (C21): the client shows `chat_notice` text verbatim and keeps no chat-notice copy
  table, so no copy is added. If one exists by the time this is built, add
  `no_party` → "You are not in a party."
- No new screen.

## Acceptance Criteria

- [ ] `Party` is pickable; `pick("party")` writes `%` at the start of the draft; typing `%hi` picks Party; deleting the `%` returns to Area.
- [ ] Enter on `%on my way` sends `{ channel: "party", text: "on my way" }`.
- [ ] Party stays pickable with no party in the party store.
- [ ] A received party line renders in `palette.chatParty` and is hidden when the Party tab is off.
- [ ] A `chat_notice` `{ code: "no_party", text: "You are not in a party." }` shows as a system line with that text.
- [ ] Whisper and trade stay disabled in the picker and their prefixes stay plain text (update the existing "party, whisper and trade closed" test).
- [ ] Tests pass; typecheck and lint clean.

## Blocked By

None. End-to-end needs I-XGW7H-1; the unit tests drive `ChatInput` with `party` open.

## Spec Reference

FS-XGW7H §Requirements C18 (picker and prefix), C19 (never greyed), C20 (colour, tab, buffer,
no store filter), C21 (`no_party` copy); §D Wire contract; §User Stories 7–11; §Acceptance
Criteria Client.

## Wire (from I-XGW7H-1)

- Send `chat` `{ "channel": "party", "text" }`.
- Receive `chat` `{ message_id, sender_id, sender_name, channel: "party", scope: "<party id>", sent_at, text }`.
- Receive `chat_notice` `{ "code": "no_party", "text": "You are not in a party." }`.

## Files expected to touch (game-client)

- `src/ui/chatInput.ts` (`CHAT_OPEN_CHANNELS` and its comment)
- `src/ui/chatInput.test.ts` (party pickable, `%` both ways, send; whisper and trade still closed)
- `src/ui/chatInputField.ts` (only its comment, if it names the closed channels)
- `src/stores/chatStore.test.ts` and/or `src/ui/ChatWindow.test.ts` (a party line and the `no_party` notice render, only if not already covered)

## TDD Approach

- RED: `chatInput.test.ts`: with the real `CHAT_OPEN_CHANNELS`, `pick("party")` writes `%` and Enter sends on party; the closed-channel test lists only whisper and trade.
- GREEN: add `party` to the set.
