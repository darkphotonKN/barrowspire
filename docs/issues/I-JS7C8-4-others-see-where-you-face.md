---
id: I-JS7C8-4
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-2, I-JS7C8-3]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 4: the client sends its facing, and other players are drawn facing where they face (game-client)"
---
Implements FS-JS7C8 §E (R28, R29, R32, R34), §A (R6), §Acceptance Criteria "Facing" (client send and draw boxes)

**Lane: agent.** game-client only.

## What to Build

1. A small sender (beside the socket helpers) that sends `face {player_id, facing}`: once on the
   first state in a world (world switch, reconnect, handoff), then only when the local 8-way facing
   changes, at most once per 100 ms with a trailing send of the latest (R28). It sends nothing while
   a Shadow Shot hold is up (R29) and resumes on the next change after release.
2. `src/types/gameState.ts`: the player entry gains `facing?: Facing8`.
3. Other players in `BarrowspireScene`, `FieldScene` and `HubScene`: their animator's look is their
   `facing` from the latest state; with none, their movement as today (R34). With slice 3 that
   gives them `run` / `backpedal` once their sheet carries the clips.
4. The local player ignores the echo of its own `facing` (keeps the pointer's).

## Acceptance Criteria

- [ ] Turning the pointer across three facings inside 100 ms sends at most two `face` messages, the second the latest facing.
- [ ] Entering a world sends `face` once on the first state.
- [ ] No `face` is sent while a Shadow Shot hold is up; the first change after release is sent.
- [ ] Another player whose entry carries `facing: "w"` stands turned `w`; with no `facing`, their movement facing as today.
- [ ] The local player's figure never turns to its own echoed `facing`.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `tsc` and the lint are green.

## Blocked By

I-JS7C8-2 (the server must accept `face`), I-JS7C8-3 (the look in the clip choice)

## Spec Reference

FS-JS7C8 §E R28, R29, R32, R34, §A R6; Edge States "Mouse spinning", "World switch, reconnect,
handoff"; user stories 12–15, 25.

## Files it expects to touch

- `game-client/src/types/gameState.ts` (+ tests)
- `game-client/src/utils/` or `src/scenes/` (the face sender; + test)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts`, `HubScene.ts`, `fieldCombat.ts` (the hold gate)

## TDD Approach

- RED: the sender, fed facings at t = 0, 30, 60 ms, emits `face` at 0 and once more at 100 ms with
  the 60 ms facing.
- GREEN: the throttle with a trailing send.
