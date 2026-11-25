---
id: I-KBA4Q-2
status: done
implements: FS-KBA4Q
blocked_by: []
labels: [ready-for-agent]
title: "FS-KBA4Q slice 2: chat opens and keeps its draft while the inventory or the character panel is open"
---
Implements FS-KBA4Q §Requirements C (R18–R23)

**Lane: AFK (game-client).** No server change.

## What to Build

The inventory and the character panel stop keeping chat shut. With either open (stash mode
included) Enter, a press on the chat bar and a name click open the input, the DOM row stays
shown, and a half-typed draft survives a panel opening or closing. While typing, I, B, C, E and Q
go into the field and toggle or wear nothing; Esc closes the input and leaves the panels open.
The menu, the dialogue card, the letter panel, a run's open container and the run's end block
chat exactly as today. No relayout and no re-layering: an open left panel still covers the chat's
lines (R23).

## Expected files

- `game-client/src/ui/uiSceneChat.ts` (`chatWiring.mayOpen` drops `ui.inventory` / `ui.character`;
  the header comment) and `uiSceneChat.test.ts`
- `game-client/src/ui/chatInput.test.ts` (the draft surviving, if a case is missing)
- `game-client/src/scenes/UIScene.ts` / `ui/uiBridge.ts` only if a key guard there reads the
  panels instead of `ui.typing`
- Not expected: `ChatWindow.ts`, `GearOverlay.ts`

## Acceptance Criteria

- [ ] Every criterion of FS-KBA4Q §Acceptance Criteria "Client: chat with a panel open" holds.
- [ ] A wiring test: `mayOpen` is true with `ui.inventory`, `ui.character` and `ui.stash` set and
      nothing else blocking, and false for each remaining blocker.
- [ ] A test that a draft is unchanged across `ui.inventory` and `ui.character` turning on and off.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

None

## Spec Reference

FS-KBA4Q §Requirements C: R18 (chat opens with a panel open), R19 (the draft survives), R20 (the
keys are the field's while typing), R21 (other blockers unchanged), R22 (what the overlay's keys
need), R23 (layering unchanged). Amends FS-TQZ5J R126 and FS-WJGFJ R27. User stories 6, 7.

## TDD Approach

- RED: `chatWiring(bridge).mayOpen()` with `ui.inventory: true` expects true.
- GREEN: remove the two panel terms from `mayOpen`.
- RED: `ChatInput.sync()` across a panel toggle keeps `field.value`.
