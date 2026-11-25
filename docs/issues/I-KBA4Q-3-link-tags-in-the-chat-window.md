---
id: I-KBA4Q-3
status: done
implements: FS-KBA4Q
blocked_by: []
labels: [ready-for-agent]
title: "FS-KBA4Q slice 3: a received line draws its item links as tags"
---
Implements FS-KBA4Q §Requirements B (R10), D (R31), E (R32–R36, R39–R41), §The item snapshot

**Lane: AFK (game-client).** No server change; built against fixture lines, so it does not wait
for slice 1.

## What to Build

The client knows an item snapshot and the pairing rule, holds a line's `items` in the chat store,
and the chat window draws each paired `[Name]` as a link tag: the name without brackets, in its
rarity colour (the item tip's palette tokens; ordinary text colour with no rarity), on a faint
same-hue ground with a thin border and a little space either side. A tag never splits across
rows. Everything R36 lists still holds: wrapping around tags, bottom-up stacking and clipping,
the sender's name hit area for click-to-whisper, scroll, fold, filter, opacity and shadow, and a
line with no links drawn exactly as before. A tag takes no click. `items` is read tolerantly: a
malformed one, or a snapshot that pairs with nothing, leaves the token as text and drops no line.

Also add the Vocabulary terms (item link, item snapshot, link tag) to `game-client/CONTEXT.md`
§ Chat terms.

## Expected files

- `game-client/src/ui/chatItemLinks.ts` (new, Phaser-free: the snapshot type, the tolerant
  reader, R10's pairing, snapshot → `ItemState`) and its test
- `game-client/src/stores/chatStore.ts` (`ChatLinePayload.items?`; `isChatLine` stays true for a
  line with a bad `items`) and its test
- `game-client/src/ui/chatWindowLayout.ts` (the tag tuning constants of R34; the wrap that keeps
  a tag whole) and its test
- `game-client/src/ui/ChatWindow.ts` (**hotspot**: `drawLines`, `clearLines`, the name hit rects)
  and its test
- `game-client/src/assets/types/client.ts` (`ChatPayload.items?`)
- `game-client/CONTEXT.md`

## Acceptance Criteria

- [ ] FS-KBA4Q §Acceptance Criteria "Client: the window": the tag look, the named constants and
      the fence, the whole-tag wrap, the name click still whispering and a tag click doing
      nothing, the malformed `items` case, and lines surviving world switches and not a reload.
- [ ] Pairing tests cover R10's cases: an edited token, the same item twice, two items of one
      name, a hand-typed token, an unpaired snapshot skipped.
- [ ] A tag wider than a row is drawn on its own row, cut with `…` (R35).
- [ ] A line without `items` produces the same Text content and name hit rect as before this
      slice (a regression test).
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

None

## Spec Reference

FS-KBA4Q R10 (pairing), R31 (tolerant read), R32 (tag in place of the token), R33 (look), R34
(tuning constants and first values), R35 (never split), R36 (what must still hold), R39 (no
click), R40 (the sender's own line), R41 (held like any line); §The item snapshot. User stories
11, 17, 20, 21, 26.

## TDD Approach

- RED: `pairLinks("a [X] b", [x])` returns one span at the token; then each R10 case.
- GREEN: `chatItemLinks.ts`.
- RED: the layout's wrap given segments (text, tag, text) never breaks inside the tag.
- GREEN: the segment wrap in `chatWindowLayout.ts`; then `drawLines` draws from it.
