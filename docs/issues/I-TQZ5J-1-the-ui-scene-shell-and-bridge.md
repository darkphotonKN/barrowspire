---
id: I-TQZ5J-1
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J slice 1: the UI scene's shell, the UI bridge and the scene's lifecycle (nothing moves yet)"
---
Implements FS-TQZ5J §Requirements A (R1–R7), §Requirements B (R8–R12)

**Lane: AFK (agent).** game-client only. No behaviour or look change: the UI scene stands empty.

## What to Build

- `UIScene` (key `"UIScene"`) in the game's scene list after `FieldScene` and before
  `DisconnectNoticeScene` (R1).
- The UI bridge (name is this slice's to settle; FS-TQZ5J "Words"): one per game, made in
  `PhaserGame.tsx`, lent through the registry as `lendFullscreen` lends the frame's fullscreen,
  let go with the game (R8). Typed: the world's report (R9), the UI's state (R10), the requests
  (R11), and an `act` that is a `UiActWrapper` (R12). This slice carries the report's `world` and
  its left signal; each later slice adds the fields and requests it consumes.
- Each world scene reports its world on `create` and that it has left on shutdown (R3, R9); a
  few lines per world scene, nothing else in them changes.
- The lifecycle (R2–R5): the first world report launches the UI scene; a world switch never
  restarts it; with no world reported it sleeps (main menu, character creation, Return to menu);
  it wakes on the next world's report; `DisconnectNotice.holdWorlds` pauses it too; it is
  destroyed with the game.
- R6: nothing of its own beyond being in the list; a test shows its camera is fitted and re-fitted.
- R7: a test on the scene list that the UI scene stands above every world scene.

## Acceptance Criteria

- [ ] The FS's first five acceptance criteria (scene order, launched once and never restarted,
      asleep outside the worlds, paused under the notice, no scene calls another).
- [ ] Every world report and UI state is typed; the bridge has no `any`.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None. This slice may start now. It touches each world scene's `create` and shutdown by a few
lines only; if `feat/client-tower-music` or `feat/client-enlarged-map-labels-inside` merges to
main first, rebase onto it before review.

## Spec Reference

FS-TQZ5J §Requirements A (R1–R7), B (R8–R12); §Edge States (a world still loading its art, the
same world restarted, the disconnect notice during a switch, leaving /game); § Spike findings (a)
order, (c).

## TDD Approach

- RED: a `uiSceneLifecycle` test over a fake scene manager: the first world report launches
  `UIScene`; town → run → town → field never stops or restarts it; a left report with no world up
  sleeps it; the notice's `holdWorlds` pauses it; `PhaserGame`'s scene list has it after the
  three worlds and before the notice.
- GREEN: the bridge, the scene, the world reports, the notice's hold.
