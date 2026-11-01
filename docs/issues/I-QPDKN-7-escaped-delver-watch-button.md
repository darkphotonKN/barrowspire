---
id: I-QPDKN-7
status: in-progress
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 7: an escaped delver gets a bottom-centre Watch the delve button, no card (game-client)"
---
Implements FS-QPDKN §Requirements 3, 12 (amended 2026-11-02, charter)

**Lane: agent (AFK).** Client only; built against the wire shape `current_player.escape ===
true` (FS-QPDKN R24). Live behaviour appears once I-QPDKN-6 lands; until then the escaped
delver's `current_player` is still null and nothing changes on screen.

## What to Build

Nick: "死亡有可以看 但成功逃離卻沒有可以觀戰的按鈕"; "單純出現觀看按鈕". Only the escaped
delver's view changes.

- **No card for the escaped.** An escaped delver (`current_player.escape === true`) with a
  teammate still in play gets no card: `resolvedCard` (`ui/party.ts`) and
  `syncResolvedView` (`BarrowspireScene.ts`) show, instead, one *Watch the delve* button at the
  **bottom centre** of the screen (placement and register per
  `game-client/docs/design-guideline.md`, HUD depth band). The `escaped` entry of `CARDS` goes
  or becomes the button's copy; the dead card is untouched.
- **Pressing it** enters the existing spectate: camera on a teammate in play, "Watching <name>"
  at the top, Tab cycles (R7–R9, R11). The button goes down when spectating starts.
- **No leave button** for an escaped delver, on screen or in the ESC menu (`runMenuChoices`
  unchanged). With **no** teammate in play, no button (the run ends; result card as today).
- **The "escaped successfully" line stays**, once (`checkPlayerEscapedState` already dedupes
  per id; it now fires for the delver themselves too).
- **The escaped delver's own body stays hidden.** Today it is hidden (with the escape effect)
  only in the `current_player === null` branch of the state update; once `current_player`
  arrives with `escape: true` that branch no longer runs. Hide it, and play the effect once,
  on `escape === true` as well, keeping the null branch.
- **Reconnect mid-run** (scene restart) brings an escaped delver back to the button, not to
  spectating, with no leftover follow, listeners or HUD (R12). `resetRun` forgets the button.
- **On `end_game`** the button (or spectate HUD) goes down for the result card.
- Tab while the button is still up: nothing.

## Acceptance Criteria

- [ ] Escaped (`escape: true`) with a teammate in play: no card, no leave button; one *Watch the
      delve* button at the bottom centre.
- [ ] Pressing it follows a teammate in play; "Watching <name>" shows at the top and Tab cycles;
      the button is gone.
- [ ] Escaped with no teammate in play: no button.
- [ ] The "escaped successfully" line shows once for the escaped delver.
- [ ] The escaped delver's own sprite, legs and name are hidden whether `current_player` is null
      or carries `escape: true`.
- [ ] A scene restart brings an escaped delver back to the button with no leftover follow,
      listeners or HUD; `end_game` replaces the button with the result card.
- [ ] Regression: the dead delver's card (grim copy, Watch + Leave, corner leave while
      spectating) and the left-behind-as-dead case are unchanged; the ESC menu still offers an
      escaped delver only Back.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-QPDKN §Requirements 1, 3, 12 (amendments 2026-11-02, charter defaults 3, 4, 5); §Acceptance
Criteria "Cards and spectating" (the superseded escaped-card line and the two added lines);
§Edge States "Spectating" (Tab while the button is up); §User Stories 5, 6.

## Files expected

- `game-client/src/ui/party.ts` and `game-client/src/ui/party.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` and `game-client/src/scenes/BarrowspireScene.test.ts`
  (existing escaped-card tests around `resolvedOnStage` / `leavingOnStage` are rewritten to the
  button)

## TDD Approach

- RED: in `party.test.ts`, an escaped player with a teammate in play yields the watch-only view
  (no card); in `BarrowspireScene.test.ts`, an escaped `current_player` puts one Watch button at
  the bottom centre and no card, pressing it starts spectating, and the own sprite is hidden.
- GREEN: the selector's escaped branch, the button in `syncResolvedView`, the hide on
  `escape === true`.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: escape with a teammate still in play → bottom-centre Watch the delve, no card; Tab cycles; a merc escaping mid-parry; the button's clearance from the chat window on a narrow canvas.
