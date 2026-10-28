---
id: I-QPDKN-2
status: open
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 2: resolved-delver card and spectating"
---
Implements FS-QPDKN §Requirements 1, 3–9, 11–12

**Author: agent**

## What to Build

Replace the "delve goes on" notice with a card, and let a resolved delver watch a living
teammate.

**The card** (R1–R6). When the client's state shows the delver resolved while at least one
teammate is still in play (today's `delveNotice` condition in `ui/party.ts`), show a card
instead of the notice:

- Dead: grim copy (the existing "The barrow keeps you" line is acceptable) and a *Watch the
  delve* button. **The leave button is slice 4**; this slice ships the dead card with Watch
  only.
- Escaped: congratulatory copy in the lore register (grim and terse, not triumphant) and
  *Watch the delve*.
- Left behind on a lower floor (FS-F6F88): treated as dead for the card.
- Nothing happens until pressed: the camera stays on the delver's own body.
- State keeps rendering behind the card. On `end_game` the card goes down and the result card
  takes over.

**Spectating** (R7–R9, R11–R12). *Watch the delve* enters spectate mode:

- The camera follows one teammate still in play, the **watched delver**.
- **Tab** cycles the watched delver through teammates still in play, in a stable order. The
  delver's own body is never in the cycle. Tab does nothing while the card is still up.
- HUD, neutral register (vellum on the HUD panel, no amber): "Watching <name>" and
  "Tab: next delver". Shown even with one teammate.
- When the watched delver resolves, the camera moves to another teammate still in play. With
  none left the run ends on the server; nothing to do beyond waiting for `end_game`.
- The client sends no `move` while spectating.
- Spectate mode ends on `end_game` (result card) or a scene restart. A restart (reconnect
  mid-run) rebuilds to the card, not to spectating; `resetRun` forgets the watched delver, the
  camera follow, the Tab key, the card and the HUD pieces.

Placement, copy and colour follow `game-client/docs/design-guideline.md` and
`game-client/CONTEXT.md`. The card is the same component for both cases, differing in copy
and buttons, so slice 4 adds a button rather than a second card.

## Acceptance Criteria

- [ ] Dead with a teammate in play: card with grim copy and *Watch the delve*; the "delve
      goes on" notice is not shown.
- [ ] Escaped with a teammate in play: card with congratulatory copy and *Watch the delve*.
- [ ] Resolved with no teammate in play: no card (the run ends; result card as today).
- [ ] Until *Watch* is pressed the camera follows the delver's own body.
- [ ] Pressing *Watch* follows a teammate in play; HUD shows "Watching <name>" and the Tab hint.
- [ ] With two or more teammates in play, Tab cycles; the delver's own body is never watched.
- [ ] When the watched delver resolves, the camera moves to another teammate in play.
- [ ] On `end_game`, the card or spectate HUD is replaced by the result card.
- [ ] A scene restart brings a resolved delver back to the card with no leftover follow,
      listeners or HUD.
- [ ] Unit tests cover: card choice (dead / escaped / left-behind / nobody in play), watched
      delver selection and cycling, hand-over when the watched delver resolves, teardown.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-QPDKN §Requirements 1, 3, 4, 5, 6, 7, 8, 9, 11, 12; §User Stories 1, 3, 5, 6, 8–12, 18;
§Edge States "Resolving", "Spectating".

## TDD Approach

- RED: a pure selector (next to `delveNotice`) that, given a state, returns the card kind
  (`dead` / `escaped` / none) and the list of watchable teammates; a cycling function over
  that list that skips the delver's own id.
- GREEN: the selector and the cycle, then the scene wiring (card, camera follow, Tab, HUD).
