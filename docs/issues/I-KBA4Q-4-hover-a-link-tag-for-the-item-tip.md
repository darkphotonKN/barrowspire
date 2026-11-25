---
id: I-KBA4Q-4
status: done
implements: FS-KBA4Q
blocked_by: [I-KBA4Q-3]
labels: [blocked]
title: "FS-KBA4Q slice 4: hovering a link tag shows the item tip"
---
Implements FS-KBA4Q §Requirements E (R37, R38)

**Lane: AFK (game-client).** No server change.

## What to Build

Hovering a link tag in the chat window shows the bag's item tip (`buildItemTip`) for that
snapshot, above every panel, beside the pointer and inside the view: in the hub, a field and a
run, on every channel, the sender's own echo included, with the input open or closed. It shows
only while the chat window is the top-most thing under the pointer, and goes when the pointer
leaves the tag, the lines scroll or redraw, the window folds or the world changes. The tip shows
the name, rarity, kind, stats, item level, requirement, affixes, unique effect and lore; never a
standing note, never the too-high colour, no "Worn" caption and no compare on Shift.

## Expected files

- `game-client/src/ui/ChatWindow.ts` (**hotspot**: tag hit rects beside `nameHits`, `hoverAt`,
  the tip's lifetime, `destroy`) and its test
- `game-client/src/ui/chatItemLinks.ts` (the snapshot's `ItemView`, with no level and no world
  passed) and its test
- `game-client/src/ui/chatWindowLayout.ts` (tip placement, if it is worked out there)
- Not expected: `itemTip.ts` and `itemView.ts` change nothing; the view is built with no
  character level and no world.

## Acceptance Criteria

- [ ] FS-KBA4Q §Acceptance Criteria "Client: the window": the three tip criteria (what it shows,
      where it shows, when it goes).
- [ ] The view built for a snapshot has `standing` undefined and `requirement.tooHigh` false for
      any snapshot.
- [ ] With another UI piece top-most under the pointer, no tip is made.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

I-KBA4Q-3 (the tags and their rects; the same hotspot file, `ChatWindow.ts`)

## Spec Reference

FS-KBA4Q R37 (hover shows the tip, where and when), R38 (what the tip shows and never shows).
User stories 12, 13, 15, 16.

## TDD Approach

- RED: a move onto a tag's rect with the window free under the pointer builds one tip; a move
  off destroys it.
- GREEN: tag hit rects and the hover path.
- RED: the same move with a cover top-most builds none.
