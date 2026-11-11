---
id: I-PQ2TW-2
status: open
implements: FS-PQ2TW
blocked_by: []
labels: [ready-for-agent]
title: "FS-PQ2TW slice 2: an arrival is told from a return, once, at the world switch (game-client)"
---
Implements FS-PQ2TW §A (R5–R8); ADR-0075 Decisions 2, 4

**Author: agent.** game-client only. Nothing is drawn by this slice: it produces the one answer
(arrival or return) that slices 3 and 4 play on.

**Before building, check FS-PQ2TW "Open for the owner" O2.** R6 (the last place kept in the tab's
session storage) is this spec's own answer, not the owner's. If the coordinator has passed on a
different answer, build that and say so in the handoff.

## What to Build

1. A small pure module (suggested `src/components/arrival.ts`): keeps the last place (world type,
   session id, and field id for a field), in memory and in `sessionStorage` behind an injected
   store; `isArrival(payload)` is false only when the payload names the kept place; it then keeps
   the new one. Storage that is missing or throws falls back to memory.
2. `switchWorld` (`src/components/worldRouting.ts`) asks it and passes `arrival: boolean` in the
   scene's start data, beside `sessionID` and `field`. Note that `SocketManager.handleWorldEntered`
   overwrites `gameStore`'s world before the listener runs, so the kept place must be the
   module's own, not read back from the store.
3. The main menu forgets the kept place when "ENTER THE TOWN" is pressed, before `enter_hub` is
   sent (`MainMenuScene.ts`).
4. Each world scene's `init` accepts `arrival` and keeps it; nothing plays yet.

## Acceptance Criteria

- [ ] First `world_entered` of a page with nothing kept: an arrival.
- [ ] `world_entered` naming the kept world type, session id and field: a return, in memory (socket reconnect) and after the module is rebuilt over the same storage (page refresh).
- [ ] Hub → field → hub, hub → run → hub, and a hub with another session id (travel to a leader's town): each an arrival.
- [ ] Same field id on another session id: an arrival. Same session, world type run: a return.
- [ ] After the menu's forget, the same hub session is an arrival.
- [ ] Storage that throws on read or write: no error escapes; memory still tells a socket reconnect.
- [ ] `switchWorld` hands `arrival` to the scene it starts; no scene imports the module.
- [ ] Tests and lint green (`npx vitest run --maxWorkers=4 --minWorkers=1`).

## Blocked By

None

## Spec Reference

FS-PQ2TW §A R5–R8; Facts 3, 4; Edge States (session storage unavailable, a refresh that lands on
another server, a redirect back to the holding pod, two tabs).

## Files it expects to touch

`game-client/src/components/arrival.ts` (+ test, new), `src/components/worldRouting.ts` (+ test),
`src/components/PhaserGame.tsx`, `src/scenes/MainMenuScene.ts` (+ test), and the `init` of
`HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts`.

## TDD Approach

- RED: a table of place sequences and the arrival/return each `world_entered` should read as.
- GREEN: the module; then `switchWorld`'s start data.
