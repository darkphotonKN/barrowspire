---
id: I-9K8EZ-2
status: open
implements: FS-9K8EZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-9K8EZ slice 2: the run's ESC menu with Fall where you stand"
---
Implements FS-9K8EZ §Requirements 1–8

**Author: agent**

## What to Build

An ESC menu inside the run (`src/scenes/BarrowspireScene.ts`), built like the hub's
(FS-G4VMQ: `openMenu`/`offerMenu`/`dialogueOption` in `HubScene.ts`, hit areas outside the
container, number keys, Enter for the first, Esc closes), with rows by the delver's state and
a confirm before dying.

- **Pure rule** `runMenuChoices({resolved, escaped})` next to `hubMenuChoices` (or in
  `ui/party.ts`): in play → *Fall where you stand* `[1]`, *Back* `[Esc]`; dead / left behind →
  *Leave the barrow* `[1]`, *Back*; escaped → *Back* only. Case-per-row tests.
- **ESC opens / closes** the menu; ESC was unbound in the run (commit 258da78). The controls
  panel (H) lists "ESC — Menu" again.
- **Fall where you stand** swaps the rows for a confirm: "The barrow keeps its dead. Fall
  here?" with *Fall* `[1]` / *Not yet* `[Esc]`. *Not yet* / Esc return to the run, nothing
  sent. *Fall* sends `forfeit_run` (`ActionType.ForfeitRun`, `{}`) once and disables itself
  (`fallPending`) until an error reply or the next state.
- **Leave the barrow** from the menu calls the same `leaveTheBarrow()` path and pending flag
  as the card's button (I-QPDKN-4), so there is one send.
- **Keyboard and pointer ownership** while open: no `move` (one `{0,0}` on the interrupting
  frame, as the hub does in `sendMovementIntent`), E/F/I/Q/H dropped, pointer attack and skill
  dropped. Closing resumes.
- **Yielding**: a state in which `current_player` is resolved, or `end_game`, takes the menu
  and confirm down (hook into `syncResolvedView` / `showGameEndOverlay` of I-QPDKN-2/-1). The
  dead card and the result overlay are never covered.
- **Refusal**: `socketManager.onError("forfeit_run", …)` → `fallPending = false`, *Fall*
  re-enabled, message as a passing notice (vellum, HUD band; add a small `notice()` to the run
  scene if none exists, like the hub's). `offError` in `resetRun`.
- `ActionType.ForfeitRun = "forfeit_run"`, `ActionMap.forfeit_run: Record<string, never>`.
- Teardown in `resetRun`: menu, confirm, flags, hit areas (destroyed with the container's
  `destroy` event as the hub does).
- Copy per `game-client/CONTEXT.md` (grim, terse; the row says death, never "forfeit" or
  "withdraw"); chrome per `game-client/docs/design-guideline.md` (popup band 2000, amber for
  the actionable row, the cancel register for Back / Not yet).

## Acceptance Criteria

- [ ] ESC opens the menu; ESC again or *Back* closes it; "ESC — Menu" is in the controls list.
- [ ] Rows by state match R2 (pure rule tested case-per-row).
- [ ] *Fall where you stand* shows the confirm; *Not yet* / Esc send nothing and close.
- [ ] *Fall* sends one `forfeit_run`; a second press before a reply/next state sends nothing.
- [ ] *Leave the barrow* from the menu sends `leave_run` through the card's path, once.
- [ ] With the menu open: no `move` after the one stop, E/F/I/Q/H and pointer attacks do
      nothing.
- [ ] A resolved `current_player` or `end_game` takes the menu/confirm down.
- [ ] An error reply re-enables *Fall* and shows a passing notice.
- [ ] `resetRun` forgets menu, confirm, flags; hit areas destroyed.
- [ ] `npx vitest run`, `npx tsc --noEmit -p .`, `npm run lint` pass.

## Blocked By

None. End to end against a live server waits on I-9K8EZ-1 (human lane); unit work mocks the
socket.

## Spec Reference

FS-9K8EZ §Requirements 1, 2, 3, 4, 5, 6, 7, 8; §User Stories 1–10; §Edge States "Menu".

## TDD Approach

- RED: `runMenuChoices` by state; then, with the `startedRun()` / stage harness in
  `BarrowspireScene.test.ts`: ESC opens, confirm flow, single send, yielding on a resolved
  state, teardown.
- GREEN: the rule, the menu (reuse the hub's option/hit-area shape), the confirm, the flags.
